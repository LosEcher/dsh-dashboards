/**
 * dsh-dashboards — 多分辨率聚合（B3）+ 绝对时间锚定降采样（B5）纯函数单元测试。
 *
 * 借鉴 mac-performance-monitor：
 *   - B3 三档聚合（Database.swift Retention/HistoryDownsample）：raw(30s) →
 *     minute(60s 桶) → hour(3600s 桶)，每桶 min/avg/max + samples
 *   - B5 绝对时间锚定降采样（chartDownsampled）：桶宽=span/maxCount 锚定
 *     epoch，追加/裁剪只改变最右桶（形状稳定）；压力类取峰值
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bucketKey, accumulateBucket, finalizeBucket, bucketFromRow, downsampleAnchored,
  HISTORY_METRICS,
} from '../lib/parsers.mjs'

// ── bucketKey ───────────────────────────────────────────────────────────
test('bucketKey: 绝对时间锚定（epoch 对齐，非索引）', () => {
  // 2026-08-27T15:00:00Z = 1785337200000（分钟对齐）
  const base = 1785337200000
  assert.equal(bucketKey(base, 60_000), base)
  assert.equal(bucketKey(base + 30_000, 60_000), base)       // 桶内偏移归同桶
  assert.equal(bucketKey(base + 61_000, 60_000), base + 60_000) // 下一桶
  assert.equal(bucketKey(base, 3_600_000), Math.floor(base / 3_600_000) * 3_600_000)
})

// ── accumulateBucket / finalizeBucket ───────────────────────────────────
test('accumulate+finalize: min/avg/max/samples 正确', () => {
  const p1 = { load1: 1.0, cpuUsedPct: 10, memUsedPct: 50, netInBps: 1000, netOutBps: 500 }
  const p2 = { load1: 2.0, cpuUsedPct: 30, memUsedPct: 55, netInBps: 3000, netOutBps: 1500 }
  const p3 = { load1: 1.5, cpuUsedPct: 20, memUsedPct: 52, netInBps: 2000, netOutBps: 1000 }
  let acc = null
  for (const p of [p1, p2, p3]) acc = accumulateBucket(acc, p)
  const row = finalizeBucket(acc, 1000)
  assert.equal(row.bucket, 1000)
  assert.equal(row.samples, 3)
  assert.deepEqual(row.load1, { min: 1.0, avg: 1.5, max: 2.0, count: 3 })
  assert.deepEqual(row.memUsedPct, { min: 50, avg: 52.3, max: 55, count: 3 })
  assert.deepEqual(row.netInBps, { min: 1000, avg: 2000, max: 3000, count: 3 })
})

test('accumulate: null/非有限值跳过，不污染统计', () => {
  let acc = null
  acc = accumulateBucket(acc, { load1: 1.0, cpuUsedPct: null, memUsedPct: 50 })
  acc = accumulateBucket(acc, { load1: null, cpuUsedPct: 20, memUsedPct: 50 })
  const row = finalizeBucket(acc, 0)
  assert.equal(row.samples, 2)
  assert.deepEqual(row.load1, { min: 1.0, avg: 1.0, max: 1.0, count: 1 })   // 只有一条有效
  assert.deepEqual(row.cpuUsedPct, { min: 20, avg: 20, max: 20, count: 1 })
})

test('finalize: 空桶输出 null 值对象（键结构稳定）', () => {
  const row = finalizeBucket(null, 42)
  assert.equal(row.bucket, 42)
  assert.equal(row.samples, 0)
  for (const key of HISTORY_METRICS) {
    assert.deepEqual(row[key], { min: null, avg: null, max: null, count: 0 }, key)
  }
})

// ── bucketFromRow（重启恢复） ───────────────────────────────────────────
test('bucketFromRow: 从落盘行无损恢复（sum=avg×count）', () => {
  const row = finalizeBucket(
    accumulateBucket(accumulateBucket(null, { load1: 1.0, cpuUsedPct: 10, memUsedPct: 50, netInBps: 1000, netOutBps: 500 }), { load1: 3.0, cpuUsedPct: 30, memUsedPct: 60, netInBps: 3000, netOutBps: 1500 }),
    1000,
  )
  const acc = bucketFromRow(row)
  assert.equal(acc.samples, 2)
  // 恢复后继续累加，avg 应等于原 avg 与新点混合
  const again = finalizeBucket(accumulateBucket(acc, { load1: 2.0, cpuUsedPct: 20, memUsedPct: 55, netInBps: 2000, netOutBps: 1000 }), 1000)
  assert.equal(again.samples, 3)
  assert.equal(again.load1.avg, 2.0)   // (1+3+2)/3
  assert.deepEqual(again.memUsedPct, { min: 50, avg: 55, max: 60, count: 3 })
})

test('bucketFromRow: 非法输入 → null；空对象 → 空桶', () => {
  assert.equal(bucketFromRow(null), null)
  assert.equal(bucketFromRow('x'), null)
  const empty = bucketFromRow({})
  assert.equal(empty.samples, 0)
  assert.deepEqual(empty.min, {})
})

// ── downsampleAnchored（B5 绝对时间锚定） ──────────────────────────────
test('downsampleAnchored: 少于 maxCount 点时形状保持（桶数与输入一致）', () => {
  const pts = [
    { ts: '2026-08-27T15:00:00.000Z', load1: 1, memUsedPct: 50 },
    { ts: '2026-08-27T15:01:00.000Z', load1: 2, memUsedPct: 60 },
    { ts: '2026-08-27T15:02:00.000Z', load1: 1.5, memUsedPct: 55 },
  ]
  const out = downsampleAnchored(pts, 3 * 60_000, 120)
  assert.equal(out.length, 3)
  assert.equal(out[0].ts, pts[0].ts)
  assert.equal(out[2].load1, 1.5)
})

test('downsampleAnchored: mem 取峰值（尖峰不被平均掉）、load 取平均', () => {
  const base = 1785337200000 // 2026-08-27T15:00:00Z
  const mk = (i, load, mem) => ({ ts: new Date(base + i * 10_000).toISOString(), load1: load, memUsedPct: mem })
  // 60s 窗口、6 点、maxCount=2 → 桶宽 30s，两桶各 3 点
  const pts = [
    mk(0, 1.0, 50), mk(1, 2.0, 55), mk(2, 1.5, 90),   // 桶1（0-30s）mem 峰值 90
    mk(3, 3.0, 60), mk(4, 4.0, 70), mk(5, 5.0, 80),   // 桶2（30-60s）mem 峰值 80
  ]
  const out = downsampleAnchored(pts, 60_000, 2)
  assert.equal(out.length, 2)
  assert.equal(out[0].memUsedPct, 90)   // 峰值保留
  assert.equal(out[1].memUsedPct, 80)
  assert.ok(Math.abs(out[0].load1 - 1.5) < 1e-9)  // (1+2+1.5)/3
  assert.ok(Math.abs(out[1].load1 - 4.0) < 1e-9)  // (3+4+5)/3
})

test('downsampleAnchored: 绝对时间锚定——同一数据不同排列输出相同（形状稳定）', () => {
  const base = 1785337200000
  const mk = (i, load, mem) => ({ ts: new Date(base + i * 10_000).toISOString(), load1: load, memUsedPct: mem })
  const pts = [mk(0, 1, 50), mk(1, 2, 55), mk(2, 1.5, 90), mk(3, 3, 60), mk(4, 4, 70), mk(5, 5, 80)]
  // 追加一个更晚的点：只影响最右桶或新增桶，历史桶不变
  const extended = [...pts, mk(6, 6, 95)]
  const a = downsampleAnchored(pts, 70_000, 2)
  const b = downsampleAnchored(extended, 70_000, 2)
  // 前两桶的桶起始时间与 mem 峰值一致（第三桶新增不破坏前两桶）
  assert.equal(a[0].ts, b[0].ts)
  assert.equal(a[0].memUsedPct, b[0].memUsedPct)
  assert.equal(a[1].memUsedPct, b[1].memUsedPct)
})

test('downsampleAnchored: 空输入/非法参数', () => {
  assert.deepEqual(downsampleAnchored([], 60_000, 120), [])
  assert.deepEqual(downsampleAnchored(null, 60_000, 120), [])
  assert.equal(downsampleAnchored([{ ts: 'bad', load1: 1 }], 60_000, 120).length, 0)
})
