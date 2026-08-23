#!/usr/bin/env python3
"""DSH 本地会话 usage 聚合（纯派生投影，只读 ~/.dsh/sessions，零副作用）。

读取所有 workspace 的 session.jsonl.zstd（checksummed Zstandard frames），
从 request/header（provider/model）与 assistant/message（TokenUsage）事件
聚合 token 与估算成本。定价口径对齐 los model-profiles：DeepSeek 的
inputTokens 含 cache-read，付费 prompt = inputTokens - cacheReadTokens。

用法：
  python3 scripts/dsh-usage-aggregate.py [--from-ms N] [--to-ms N] [--sessions-root DIR]
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-ms", type=int, default=0)
    parser.add_argument("--to-ms", type=int, default=2**63 - 1)
    parser.add_argument("--sessions-root", default=os.path.expanduser("~/.dsh/sessions"))
    args = parser.parse_args()

    by_model = {}
    by_day = {}
    totals = new_bucket()
    scanned_sessions = 0

    for path in sorted(glob.glob(os.path.join(args.sessions_root, "*", "*", "session.jsonl.zstd"))):
        try:
            text = decompress_frames(path)
        except Exception:
            continue
        scanned_sessions += 1
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
                if event_time < args.from_ms or event_time > args.to_ms:
                    continue
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
                merge_into(totals, row, cost, savings, cost_cny)
                model_bucket = by_model.setdefault((provider, model), new_bucket())
                merge_into(model_bucket, row, cost, savings, cost_cny)
                day = event_time // 86400000
                day_bucket = by_day.setdefault(day, new_bucket())
                merge_into(day_bucket, row, cost, savings, cost_cny)

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
        "scannedSessions": scanned_sessions,
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
