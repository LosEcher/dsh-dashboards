#!/usr/bin/env python3
"""DSH 本地会话 usage 聚合（纯派生投影，只读 ~/.dsh/sessions，零副作用）。

读取所有 workspace 的 session.jsonl.zstd（checksummed Zstandard frames），
从 request/header（provider/model）与 assistant/message（TokenUsage）事件
聚合 token 与估算成本。定价口径对齐 los model-profiles：DeepSeek 的
inputTokens 含 cache-read，付费 prompt = inputTokens - cacheReadTokens。

增量缓存（2026-09-01）：--cache FILE 时按 (mtime, size) 跳过未变 session
文件，复用其按小时粒度缓存的聚合桶（窗口过滤在合并期按小时做，边界
误差 ≤1h，对 7d 窗口可忽略）。全量扫描 ~18s CPU（542 文件/600MB）→
增量 <1s。不传 --cache 则每次全量扫描（测试/一次性精确运行）。
启发式兜底：每 24h（FULL_CALIBRATE_MS）自动全量重扫一次校准，
--force-full 可手动触发。

用法：
  python3 scripts/dsh-usage-aggregate.py [--from-ms N] [--to-ms N] [--sessions-root DIR] [--cache FILE]
输出 JSON，字段形状对齐 los.usage-summary（evidenceClass=dsh_sessions），
便于 P6 统一对账视图直接合并。
"""
import argparse
import glob
import json
import os
import sys

try:
    import zstandard
except ImportError:
    print(json.dumps({"error": "python zstandard 未安装：pip install zstandard"}, ensure_ascii=False), file=sys.stderr)
    sys.exit(2)

# (provider, model) -> (promptPer1M, completionPer1M, cacheHitPer1M)
# 数值复用 los packages/agent/src/model-profiles.ts（2026-08-22 核对）
# (provider, model) -> 定价（CNY 每百万 tokens，低谷价）
# 数值对齐 los packages/agent/src/model-profiles.ts（2026-08-23 同步）：
# DeepSeek 8/17 起峰谷定价（高峰=低谷×2，北京 9-12/14-18 工作日），
# 8/23 起周末全天低谷；cost 字段 USD = CNY ÷ cnyPerUsd（PBOC 中间价≈6.8）。
PRICING = {
    ("deepseek-official", "deepseek-v4-flash"): (1.5, 4.5, 0.05),
    ("deepseek", "deepseek-v4-flash"): (1.5, 4.5, 0.05),
    ("deepseek-official", "deepseek-v4-pro"): (4.5, 13.5, 0.15),
    ("deepseek", "deepseek-v4-pro"): (4.5, 13.5, 0.15),
    # 未知/未定价模型：cost 不计算（costUnknown 计数），tokens 仍计入
}

PEAK_MULTIPLIER = 2
CNY_PER_USD = 6.8
# 周末全天低谷规则自 2026-08-23 00:00（北京时间）起生效
WEEKEND_FLAT_SINCE_MS = int(__import__("datetime").datetime(2026, 8, 23, 0, 0,
    tzinfo=__import__("datetime").timezone(__import__("datetime").timedelta(hours=8))).timestamp() * 1000)

CACHE_VERSION = 2
HOUR_MS = 3_600_000
DAY_MS = 86_400_000
# 缓存保留 90 天小时桶（窗口最远 7d，余量充足）
CACHE_RETENTION_HOURS = 24 * 90
# 全量校准周期：增量缓存按 (mtime, size) 判定文件未变是启发式，内容变而
# mtime+size 未变（罕见）会漏；每 24h 强制一次全量重扫兜底，保证长期正确。
FULL_CALIBRATE_MS = 24 * 3600_000


def peak_multiplier_at(ts_ms):
    """DeepSeek 计费时段：工作日北京 09-12/14-18 高峰（×2）；8/23 起周末全天低谷。"""
    import datetime as _dt
    bj = _dt.datetime.fromtimestamp((ts_ms + 8 * 3600 * 1000) / 1000, _dt.timezone.utc)
    dow = bj.weekday()
    if dow >= 5:  # 周六(5)/周日(6)
        return 1 if ts_ms >= WEEKEND_FLAT_SINCE_MS else PEAK_MULTIPLIER if (9 <= bj.hour < 12 or 14 <= bj.hour < 18) else 1
    if 9 <= bj.hour < 12 or 14 <= bj.hour < 18:
        return PEAK_MULTIPLIER
    return 1


def cost_for(provider, model, prompt, completion, cache_read, ts_ms):
    rates = PRICING.get((provider, model))
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
    try:
        st = os.stat(path)
        return (st.st_mtime_ns, st.st_size)
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


def save_cache(path, cache, seen_paths, now_ms):
    if not path:
        return
    try:
        files = cache.get("files", {})
        # 删除本次未见（已被移除/轮转）的文件条目
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
    args = parser.parse_args()

    by_model = {}
    by_day = {}
    totals = new_bucket()
    scanned_sessions = 0
    cache_reused = 0

    cache = load_cache(args.cache)
    files_cache = cache["files"] if cache else None
    seen_paths = set()

    from_hour = args.from_ms // HOUR_MS
    to_hour = args.to_ms // HOUR_MS

    # 全量校准：--force-full 或距上次全量 > FULL_CALIBRATE_MS → 忽略缓存命中全部重扫
    now_ms = int(__import__("time").time() * 1000)
    full_due = files_cache is not None and (now_ms - (cache.get("lastFullScanMs") or 0)) > FULL_CALIBRATE_MS
    if args.force_full or full_due:
        if files_cache is not None:
            files_cache.clear()

    for path in sorted(glob.glob(os.path.join(args.sessions_root, "*", "*", "session.jsonl.zstd"))):
        seen_paths.add(path)
        key = stat_key(path)
        if key is None:
            continue
        reused = False
        if files_cache is not None:
            entry = files_cache.get(path)
            if entry and entry.get("mtimeNs") == key[0] and entry.get("size") == key[1]:
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
                files_cache[path] = {"mtimeNs": key[0], "size": key[1], "perHour": per_hour}
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

    if files_cache is not None:
        cache["lastFullScanMs"] = now_ms
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
        "scannedSessions": scanned_sessions + cache_reused,
        "cacheReusedSessions": cache_reused,
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
