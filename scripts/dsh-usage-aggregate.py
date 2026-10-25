#!/usr/bin/env python3
"""DSH 本地会话 usage 聚合（纯派生投影，只读 ~/.dsh/sessions，零副作用）。

读取所有 workspace 的 session*.jsonl.zstd（v1/v3/v4 三种命名，checksummed
Zstandard frames），
从 request/header（provider/model）与 assistant/message（TokenUsage）事件
聚合 token 与估算成本。定价口径对齐 los model-profiles：DeepSeek 的
inputTokens 含 cache-read，付费 prompt = inputTokens - cacheReadTokens。

增量缓存（2026-09-01）：--cache FILE 时按 (mtime_ms, size) 跳过未变 session
文件，复用其按小时粒度缓存的聚合桶（窗口过滤在合并期按小时做，边界
误差 ≤1h，对 7d 窗口可忽略）。全量扫描 ~18s CPU（542 文件/600MB）→
增量 <1s。不传 --cache 则每次全量扫描（测试/一次性精确运行）。
启发式兜底：每 24h（FULL_CALIBRATE_MS）自动全量重扫一次校准，
--force-full 可手动触发。

2026-10-08 三处加固（修「DSH 消耗 7d」卡片 Command failed 长期故障）：
  1) 窗口预剪枝：session 日志 append-only ⇒ mtime 早于 --from-ms 的文件不含
     窗口内事件，直接跳过。本机 1114 文件/1090MB 中 820 文件/859MB 在 7d 窗口
     外 ⇒ 全量扫描 30s → 6s。--no-window-prune 可关闭（备份恢复保留了旧 mtime
     等场景）。
  2) 抗杀进度：扫描过程中每 CACHE_FLUSH_EVERY_FILES 个文件落盘一次，宿主硬超时
     SIGKILL 掉本进程也不丢已完成部分（原实现只在末尾写缓存 ⇒ 一旦超时就零进度，
     下一拍仍然全量 ⇒ 永久失败）。
  3) 轮转校准：自动 24h 校准不再 files_cache.clear() 一次性全量重扫（单拍超时
     ⇒ 缓存写不回 ⇒ lastFullScanMs 永不推进 ⇒ 每拍都超时的死亡螺旋），改为记录
     周期起点、把 at < 起点的条目当未命中，跨多拍有界收敛。

用法：
  python3 scripts/dsh-usage-aggregate.py [--from-ms N] [--to-ms N] [--sessions-root DIR] [--cache FILE] [--force-full] [--no-window-prune]
输出 JSON，字段形状对齐 los.usage-summary（evidenceClass=dsh_sessions），
便于 P6 统一对账视图直接合并。
"""
import argparse
import datetime
import glob
import json
import os
import sys
import time

try:
    import zstandard
except ImportError:
    print(json.dumps({"error": "python zstandard 未安装：pip install zstandard"}, ensure_ascii=False), file=sys.stderr)
    sys.exit(2)

# ── 定价（CNY 每百万 tokens，**空闲价**；高峰 = 空闲 × PEAK_MULTIPLIER）──────
# 真源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
# cost 字段 USD = CNY ÷ CNY_PER_USD（PBOC 中间价≈6.8；站点中英双页隐含汇率
# 6.667(flash 列)/6.818(pro 列) 并不自洽，严格对账请用 estimatedCostCny）。
#
# 2026-10-09 审计修正两处漂移（docs/audits/2026-10-09-billing-cost-audit.md）：
#   1) 站点 2026-09-10 12:00 起把 flash 模型名改为 `deepseek-flash` 并同步降价
#      （1.5/4.5/0.05 → 1.0/4.0/0.02）。旧名 `deepseek-v4-flash` 仍可调用，但被
#      路由到 V4.1-Flash 并按 Flash 单价计费 ⇒ 旧名视为同一 Flash 家族。
#      原实现 key 只有旧名 ⇒ 9/12 起全部落进「未知模型」分支，成本恒为 0。
#   2) 峰谷定价自 2026-08-17 00:00 才生效；高峰判定不含中国法定节假日。
#
# 价目按生效时间分代，用**事件时间**选表 —— 直接换表会让改价前的历史整段失真。
BJ_TZ = datetime.timezone(datetime.timedelta(hours=8))


def _bj_ms(year, month, day, hour=0, minute=0):
    """北京时间的某时刻 → epoch ms（价格纪元与节日判定统一走这里）。"""
    return int(datetime.datetime(year, month, day, hour, minute, tzinfo=BJ_TZ).timestamp() * 1000)


PEAK_MULTIPLIER = 2
CNY_PER_USD = 6.8

# 峰谷定价生效（8/17 00:00 北京）；此前无峰谷概念，一律 ×1
PEAK_PRICING_SINCE_MS = _bj_ms(2026, 8, 17)
# 周末全天低谷规则自 8/23 00:00（北京时间）起生效（此前周末仍按高峰时段计）
WEEKEND_FLAT_SINCE_MS = _bj_ms(2026, 8, 23)
# V4.1-Flash 新价与改名同步生效：2026-09-10 12:00（北京时间）
NEW_PRICE_FROM_MS = _bj_ms(2026, 9, 10, 12, 0)

# 定价表版本标记：随输出发布（pricingAsOf），改价时必须同步更新
PRICING_AS_OF = "2026-09-10"

# (生效起点 ms, (promptPer1M, completionPer1M, cacheHitPer1M))，按起点降序匹配
_FLASH_RATES = [
    (NEW_PRICE_FROM_MS, (1.0, 4.0, 0.02)),  # V4.1-Flash / deepseek-flash
    (0, (1.5, 4.5, 0.05)),                  # V4-Flash（8/17 版；8/17 前无独立真源，沿用近似）
]
_PRO_RATES = [
    (0, (4.5, 13.5, 0.15)),                 # 两代一致（9/10 更新日志：计费方式保持不变）
]
# provider 与模型家族登记表：新增模型名必须在此登记，否则成本静默归零
_DEEPSEEK_PROVIDERS = ("deepseek", "deepseek-official")
_FLASH_MODELS = ("deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp")
_PRO_MODELS = ("deepseek-v4-pro",)


def _holiday_dates():
    """2026 年中国法定节假日（国办发明电〔2025〕7号）。

    真源：https://www.gov.cn/gongbao/2025/issue_12406/202511/content_7048922.html
    高峰时段在这些日期全天空闲（站点价格页脚注 2）。
    """
    out = set()
    for start, end in (
        ((2026, 1, 1), (2026, 1, 3)),    # 元旦
        ((2026, 2, 15), (2026, 2, 23)),  # 春节
        ((2026, 4, 4), (2026, 4, 6)),    # 清明节
        ((2026, 5, 1), (2026, 5, 5)),    # 劳动节
        ((2026, 6, 19), (2026, 6, 21)),  # 端午节
        ((2026, 9, 25), (2026, 9, 27)),  # 中秋节
        ((2026, 10, 1), (2026, 10, 7)),  # 国庆节
    ):
        cur, last = datetime.date(*start), datetime.date(*end)
        while cur <= last:
            out.add(cur.isoformat())
            cur += datetime.timedelta(days=1)
    return frozenset(out)


CHINA_HOLIDAYS = _holiday_dates()

CACHE_VERSION = 4  # v4：定价表分代 + 节假日平谷（v3 缓存里存的是旧口径的已算好成本，必须丢弃）
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
# 缓存保留 90 天小时桶（窗口最远 7d，余量充足）
CACHE_RETENTION_HOURS = 24 * 90
# 全量校准周期：增量缓存按 (mtime, size) 判定文件未变是启发式，内容变而
# mtime+size 未变（罕见）会漏；每 24h 强制一次全量重扫兜底，保证长期正确。
FULL_CALIBRATE_MS = 24 * 3600_000
# 扫描过程中每 N 个文件落盘一次缓存：宿主（dsh-dashboards）用 execFile 硬超时
# 兜底，SIGKILL 时只在末尾写缓存会丢掉整拍进度 ⇒ 下一拍仍然全量 ⇒ 永久超时。
CACHE_FLUSH_EVERY_FILES = 64


def peak_multiplier_at(ts_ms):
    """DeepSeek 峰谷判定（北京时间）。

    高峰 = 周一至周五、**非法定节假日**、09-12/14-18；其余（含周末与节假日
    全天）空闲。峰谷定价自 2026-08-17 00:00 生效；周末全天空闲自 2026-08-23
    00:00 生效（该日之前周末仍按高峰时段计）。
    """
    if ts_ms < PEAK_PRICING_SINCE_MS:
        return 1
    bj = datetime.datetime.fromtimestamp(ts_ms / 1000, BJ_TZ)
    if bj.strftime("%Y-%m-%d") in CHINA_HOLIDAYS:
        return 1
    in_peak_hours = 9 <= bj.hour < 12 or 14 <= bj.hour < 18
    if bj.weekday() >= 5 and ts_ms >= WEEKEND_FLAT_SINCE_MS:  # 周六/周日
        return 1
    return PEAK_MULTIPLIER if in_peak_hours else 1


def rates_for(provider, model, ts_ms):
    """按 (provider, model) 与**事件时间**取单价；未定价返回 None。

    未定价 ⇒ cost_for 返回 None ⇒ 只累加 costUnknownCount。调用方据此把
    模型名汇总进 unpricedModels，让「下一个未登记的新模型名」可见而非静默归零。
    """
    if provider not in _DEEPSEEK_PROVIDERS:
        return None
    if model in _PRO_MODELS:
        table = _PRO_RATES
    elif model in _FLASH_MODELS:
        table = _FLASH_RATES
    else:
        return None
    for from_ms, rates in table:
        if ts_ms >= from_ms:
            return rates
    return table[-1][1]


def cost_for(provider, model, prompt, completion, cache_read, ts_ms):
    rates = rates_for(provider, model, ts_ms)
    if not rates:
        return None, None, None
    prompt_rate, completion_rate, cache_rate = rates
    peak = peak_multiplier_at(ts_ms)
    prompt_cost_cny = prompt / 1e6 * prompt_rate * peak
    completion_cost_cny = completion / 1e6 * completion_rate * peak
    cache_cost_cny = cache_read / 1e6 * cache_rate * peak
    total_cny = prompt_cost_cny + completion_cost_cny + cache_cost_cny
    savings_cny = cache_read / 1e6 * (prompt_rate - cache_rate) * peak
    return total_cny / CNY_PER_USD, savings_cny / CNY_PER_USD, total_cny


def decompress_frames(path):
    with open(path, "rb") as handle:
        data = handle.read()
    dctx = zstandard.ZstdDecompressor()
    with dctx.stream_reader(data, read_across_frames=True) as reader:
        return reader.read().decode("utf-8", "replace")


def new_bucket():
    return {
        "modelResponseCount": 0,
        "promptTokens": 0,
        "completionTokens": 0,
        "cacheReadTokens": 0,
        "estimatedCostUsd": 0.0,
        "estimatedCostCny": 0.0,
        "cacheSavingsUsd": 0.0,
        "costUnknownCount": 0,
    }


def merge_into(target, source, cost, savings, cost_cny):
    """按事件合并（scan_file 内单事件调用）：计数 +1，成本按事件重算。"""
    target["modelResponseCount"] += 1
    target["promptTokens"] += source["promptTokens"]
    target["completionTokens"] += source["completionTokens"]
    target["cacheReadTokens"] += source["cacheReadTokens"]
    if cost is None:
        target["costUnknownCount"] += 1
    else:
        target["estimatedCostUsd"] += cost
        target["estimatedCostCny"] += cost_cny
        target["cacheSavingsUsd"] += savings


def merge_bucket(target, source):
    """按桶合并（缓存/窗口合并期调用）：全字段累加，成本已算好。"""
    for k in new_bucket():
        target[k] += source[k]


def scan_file(path):
    """全量扫描单文件 → {hour: {"totals": bucket, "models": {(p,m): bucket}}}。"""
    text = decompress_frames(path)
    per_hour = {}
    current = ("unknown", "unknown")
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except Exception:
            continue
        event_type = event.get("type")
        if event_type == "request/header":
            config = event.get("data", {}).get("header", {}).get("config", {})
            current = (config.get("provider") or "unknown", config.get("model") or "unknown")
        elif event_type == "assistant/message":
            usage = event.get("data", {}).get("usage")
            if not usage:
                continue
            event_time = event.get("time") or 0
            provider, model = current
            input_tokens = int(usage.get("inputTokens") or 0)
            cache_read = int(usage.get("cacheReadTokens") or 0)
            completion = int(usage.get("outputTokens") or 0)
            # DSH 的 inputTokens 已是净缓存未命中（llm-deepseek 适配器扣除
            # cacheRead 后上报），勿再减 cache_read——旧实现二次扣除会把
            # prompt 截断为 0，系统性低估成本（2026-08-23 修正）。
            prompt = input_tokens
            cost, savings, cost_cny = cost_for(provider, model, prompt, completion, cache_read, event_time)
            row = {"promptTokens": prompt, "completionTokens": completion, "cacheReadTokens": cache_read}
            hour = event_time // HOUR_MS
            hour_entry = per_hour.setdefault(hour, {"totals": new_bucket(), "models": {}})
            merge_into(hour_entry["totals"], row, cost, savings, cost_cny)
            # 字符串 key（"provider\u0000model"）保证 JSON 往返一致（tuple 会被转成数组字符串）
            model_key = provider + "\u0000" + model
            model_bucket = hour_entry["models"].setdefault(model_key, new_bucket())
            merge_into(model_bucket, row, cost, savings, cost_cny)
    return per_hour


def stat_key(path):
    """(mtime_ms, size) —— 变更判定键。

    2026-10-08：由 st_mtime_ns 改为毫秒。ns 值 ~1.8e18 超过 JS
    Number.MAX_SAFE_INTEGER（9.0e15），任何 JS/JSON 工具往返一次缓存文件都会
    被 double 舍入 ⇒ mtime 永不相等 ⇒ 增量缓存整体失效（每拍全量）。
    毫秒 + size 的判别力对 append-only session 日志足够（同毫秒内等长重写才会
    漏判，且 24h 校准兜底）。
    """
    try:
        st = os.stat(path)
        return (st.st_mtime_ns // 1_000_000, st.st_size)
    except OSError:
        return None


def load_cache(path):
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            c = json.load(fh)
        if c.get("version") != CACHE_VERSION or not isinstance(c.get("files"), dict):
            return {"version": CACHE_VERSION, "files": {}}
        return c
    except Exception:
        return {"version": CACHE_VERSION, "files": {}}


def save_cache(path, cache, seen_paths, now_ms, prune=True):
    """原子写缓存。

    prune=True：删除本次未见（已被移除/轮转）的文件条目。**渐进落盘时必须传
    prune=False** —— 扫描中途 seen_paths 只覆盖已遍历部分，按它裁剪会把后面尚未
    遍历到的有效条目全删掉（缓存自毁）。
    """
    if not path:
        return
    try:
        files = cache.get("files", {})
        if prune:
            for p in list(files):
                if p not in seen_paths:
                    del files[p]
        # 裁剪过旧小时桶（90 天）
        cutoff = now_ms // HOUR_MS - CACHE_RETENTION_HOURS
        for entry in files.values():
            per_hour = entry.get("perHour", {})
            for h in [k for k in per_hour if int(k) < cutoff]:
                del per_hour[h]
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-ms", type=int, default=0)
    parser.add_argument("--to-ms", type=int, default=2**63 - 1)
    parser.add_argument("--sessions-root", default=os.path.expanduser("~/.dsh/sessions"))
    parser.add_argument("--cache", default=None, help="增量缓存文件路径（缺省=每次全量扫描）")
    parser.add_argument("--force-full", action="store_true", help="忽略缓存命中，强制全量重扫（校准/手动精确运行）")
    parser.add_argument("--no-window-prune", action="store_true",
                        help="关闭 mtime 窗口预剪枝（缺省：--from-ms>0 时跳过 mtime 早于窗口起点的文件）")
    args = parser.parse_args()

    by_model = {}
    by_day = {}
    totals = new_bucket()
    unpriced_models = set()
    scanned_sessions = 0
    cache_reused = 0
    pruned_files = 0
    pruned_bytes = 0
    flushed = 0

    cache = load_cache(args.cache)
    files_cache = cache["files"] if cache else None
    seen_paths = set()

    from_hour = args.from_ms // HOUR_MS
    to_hour = args.to_ms // HOUR_MS

    # 窗口预剪枝开关：--from-ms 0 = 无下界（测试/一次性全量），不能剪。
    prune_window = args.from_ms > 0 and not args.no_window_prune

    now_ms = int(time.time() * 1000)
    # 本轮「校准周期起点」：非 None 时，缓存里 at < 起点的条目视为未命中需重扫。
    calibrate_started = None
    if files_cache is not None:
        full_due = (now_ms - (cache.get("lastFullScanMs") or 0)) > FULL_CALIBRATE_MS
        if args.force_full:
            files_cache.clear()
            calibrate_started = now_ms
        elif full_due:
            # 轮转校准（2026-10-08 重写）：原实现 clear() 一次性全量重扫，单拍
            # 30s > 宿主 20s 硬超时 ⇒ 被 SIGKILL ⇒ 缓存写不回去 ⇒ lastFullScanMs
            # 永不推进 ⇒ 此后每一拍都超时（DSH 消耗 7d 卡片长期 Command failed）。
            # 现在只记周期起点、按 at 判定未命中，跨多拍收敛；配合渐进落盘，
            # 即使中途被杀，下一拍接着扫剩下的。
            calibrate_started = cache.get("calibrateStartedMs") or now_ms
            cache["calibrateStartedMs"] = calibrate_started

    # 会话日志有三种命名（harness 迁移遗留）：session.jsonl.zstd（v1）、
    # session.v3.jsonl.zstd、session.v4.jsonl.zstd。2026-10-05 实证：只匹配
    # session.jsonl.zstd 会让聚合对 v3+ 会话全盲 —— 症状是看板冻结在 v3 切换日
    # （maxHour=2026-09-11）且成本少算约 4×，而脚本本身"跑成功"。
    for path in sorted(glob.glob(os.path.join(args.sessions_root, "*", "*", "session*.jsonl.zstd"))):
        key = stat_key(path)
        if key is None:
            continue
        # 窗口预剪枝（2026-10-08）：append-only 日志 ⇒ mtime 早于窗口起点的文件
        # 不可能含窗口内事件。本机实测 1114 文件/1090MB 中 820 文件/859MB 在 7d
        # 窗口外 ⇒ 全量扫描 30s → 6s（这也是 24h 校准撞 20s 硬超时的根因）。
        # 剪掉的文件不进 seen_paths ⇒ 其旧缓存条目在最终落盘时被裁掉。
        if prune_window and key[0] < args.from_ms:
            pruned_files += 1
            pruned_bytes += key[1]
            continue
        seen_paths.add(path)
        reused = False
        per_hour = None
        if files_cache is not None:
            entry = files_cache.get(path)
            if entry is not None:
                in_cycle = calibrate_started is None or (entry.get("at") or 0) >= calibrate_started
                if in_cycle and entry.get("mtimeMs") == key[0] and entry.get("size") == key[1]:
                    per_hour = entry.get("perHour", {})
                    cache_reused += 1
                    reused = True
        if not reused:
            try:
                per_hour = scan_file(path)
            except Exception:
                if files_cache is not None:
                    files_cache.pop(path, None)
                continue
            scanned_sessions += 1
            if files_cache is not None:
                files_cache[path] = {"mtimeMs": key[0], "size": key[1], "at": now_ms, "perHour": per_hour}
                flushed += 1
                if flushed >= CACHE_FLUSH_EVERY_FILES:
                    # 渐进落盘（prune=False：seen_paths 此刻还不完整）
                    flushed = 0
                    save_cache(args.cache, cache, seen_paths, now_ms, prune=False)
        # 窗口过滤（小时粒度）→ 合并进 totals / by_model / by_day
        for hour_str, hour_entry in per_hour.items():
            hour = int(hour_str)
            if hour < from_hour or hour > to_hour:
                continue
            merge_bucket(totals, hour_entry["totals"])
            day = hour // 24
            merge_bucket(by_day.setdefault(day, new_bucket()), hour_entry["totals"])
            for model_key, mb in hour_entry["models"].items():
                provider, _, model = model_key.partition("\u0000")
                merge_bucket(by_model.setdefault((provider, model), new_bucket()), mb)
                # 未计价路由的模型名单独汇总（防「新模型名静默归零」复发：
                # 成本归零时界面必须能直接说出是哪个 provider/model 没登记）
                if mb["costUnknownCount"]:
                    unpriced_models.add(provider + "/" + model)

    if files_cache is not None:
        # 校准周期完成判定：保留条目全部在本周期内重扫过 ⇒ 记一次全量校准完成，
        # 24h 计时重新开始。普通增量拍**不再**推进 lastFullScanMs（原实现每拍都
        # 推进 ⇒ 24h 校准永不触发，启发式兜底形同虚设）。
        if calibrate_started is not None and all(
                (e.get("at") or 0) >= calibrate_started for e in files_cache.values()):
            cache["lastFullScanMs"] = now_ms
            cache["calibrateStartedMs"] = None
        save_cache(args.cache, cache, seen_paths, now_ms)

    def finish(bucket):
        # cacheHitRate 口径与 los usage-summary 对齐：cacheRead/(cacheRead+净 miss 输入)
        cache_denom = bucket["promptTokens"] + bucket["cacheReadTokens"]
        return {
            "modelResponseCount": bucket["modelResponseCount"],
            "promptTokens": bucket["promptTokens"],
            "completionTokens": bucket["completionTokens"],
            "cacheReadTokens": bucket["cacheReadTokens"],
            "totalTokens": bucket["promptTokens"] + bucket["completionTokens"] + bucket["cacheReadTokens"],
            "estimatedCostUsd": round(bucket["estimatedCostUsd"], 6),
            "estimatedCostCny": round(bucket["estimatedCostCny"], 6),
            "cacheSavingsUsd": round(bucket["cacheSavingsUsd"], 6),
            "cacheHitRate": round(bucket["cacheReadTokens"] / cache_denom, 6) if cache_denom > 0 else None,
            "costUnknownCount": bucket["costUnknownCount"],
        }

    result = {
        "evidenceClass": "dsh_sessions",
        "from": args.from_ms,
        "to": args.to_ms,
        # 定价表版本：改价后此处必须变化（漂移审计用；与 costUnknownCount 一起看）
        "pricingAsOf": PRICING_AS_OF,
        # 未计价路由的模型名（空数组 = 全部定价命中）
        "unpricedModels": sorted(unpriced_models),
        "scannedSessions": scanned_sessions + cache_reused,
        "cacheReusedSessions": cache_reused,
        # 可观测性：窗口预剪枝规模与校准状态（排查「数字为何变小/是否在重扫」用）
        "windowPrunedFiles": pruned_files,
        "windowPrunedBytes": pruned_bytes,
        "calibrating": calibrate_started is not None,
        "totals": finish(totals),
        "byProviderModel": [
            {"provider": provider, "model": model, **finish(bucket)}
            for (provider, model), bucket in sorted(by_model.items())
        ],
        "byDay": [
            {"day": day, "modelResponseCount": bucket["modelResponseCount"],
             "promptTokens": bucket["promptTokens"], "completionTokens": bucket["completionTokens"],
             "cacheReadTokens": bucket["cacheReadTokens"],
             "estimatedCostUsd": round(bucket["estimatedCostUsd"], 6),
             "estimatedCostCny": round(bucket["estimatedCostCny"], 6)}
            for day, bucket in sorted(by_day.items())
        ],
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
