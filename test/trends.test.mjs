/**
 * dsh-dashboards — 趋势分析检测器（B8）纯函数单元测试。
 *
 * 借鉴 mac-performance-monitor Analysis/：
 *   - detectSustainedGrowth → LeakDetector（持续爬升，R²+最小时长防误报）
 *   - detectStepChange      → ChangeDetector（窗口均值阶跃）
 *   - detectTrendDrift      → ThermalDrift（同条件漂移，前后半对比）
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  linearFit, detectSustainedGrowth, detectStepChange, detectTrendDrift,
} from '../lib/parsers.mjs'

// ── linearFit ───────────────────────────────────────────────────────────
test('linearFit: 完美线性 → slope/rSquared=1', () => {
  const pts = [0, 1, 2, 3, 4].map((x) => ({ x, y: x * 2 + 1 }))
  const fit = linearFit(pts)
  assert.equal(fit.slope, 2)
  assert.ok(fit.rSquared > 0.999)
})

test('linearFit: 样本不足/零方差 → null', () => {
  assert.equal(linearFit([{ x: 0, y: 1 }]), null)
  assert.equal(linearFit([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]), null) // 零方差
})

// ── detectSustainedGrowth ───────────────────────────────────────────────
function hourSeries(baseTs, values) {
  return values.map((v, i) => ({ ts: new Date(baseTs + i * 3600_000).toISOString(), memUsedPct: v }))
}
const T0 = Date.parse('2026-08-25T00:00:00Z')

test('growth: 持续爬升超过阈值 → finding', () => {
  // 8h 内 50→70 稳定爬升
  const pts = hourSeries(T0, [50, 53, 56, 59, 62, 65, 68, 70])
  const r = detectSustainedGrowth(pts)
  assert.ok(r, '应检测到增长')
  assert.equal(r.kind, 'growth')
  assert.ok(r.totalDeltaPct >= 18, `总增幅 ${r.totalDeltaPct}`)
  assert.ok(r.rSquared > 0.9, `R² ${r.rSquared}`)
})

test('growth: 波动非趋势（R² 低）→ null', () => {
  const pts = hourSeries(T0, [50, 55, 48, 58, 47, 60, 49, 56])
  const r = detectSustainedGrowth(pts)
  assert.equal(r, null)
})

test('growth: 跨度不足（<2h）→ null（防启动期误报）', () => {
  const pts = [50, 55, 60].map((v, i) => ({ ts: new Date(T0 + i * 1800_000).toISOString(), memUsedPct: v }))
  assert.equal(detectSustainedGrowth(pts), null)
})

test('growth: 增幅不足 → null', () => {
  const pts = hourSeries(T0, [50, 50.3, 50.6, 50.9, 51.2, 51.5, 51.8, 52])
  assert.equal(detectSustainedGrowth(pts), null)
})

// ── detectStepChange ────────────────────────────────────────────────────
test('step: 明显阶跃 → finding（before/after 均值差）', () => {
  const pts = hourSeries(T0, [50, 51, 50, 52, 70, 71, 69, 72, 71])
  const r = detectStepChange(pts)
  assert.ok(r, '应检测到阶跃')
  assert.ok(Math.abs(r.deltaPct - 19) < 2, `delta ${r.deltaPct}`)
  assert.ok(r.at, '带时间戳')
})

test('step: 平滑序列无阶跃 → null', () => {
  const pts = hourSeries(T0, [50, 52, 54, 56, 58, 60, 62])
  assert.equal(detectStepChange(pts), null)
})

test('step: 样本不足 → null', () => {
  assert.equal(detectStepChange(hourSeries(T0, [50, 51, 52])), null)
})

// ── detectTrendDrift ────────────────────────────────────────────────────
test('drift: 后半较前半显著抬升 → finding', () => {
  const pts = hourSeries(T0, [45, 46, 47, 48, 49, 60, 62, 61, 63, 64])
  const r = detectTrendDrift(pts, { minSamples: 8 })
  assert.ok(r, '应检测到漂移')
  assert.ok(r.driftPct >= 10, `drift ${r.driftPct}`)
})

test('drift: 平稳序列 → null', () => {
  const pts = hourSeries(T0, [50, 51, 50, 52, 51, 50, 52, 51, 50, 52])
  assert.equal(detectTrendDrift(pts, { minSamples: 8 }), null)
})

test('drift: 样本不足 → null', () => {
  assert.equal(detectTrendDrift(hourSeries(T0, [50, 51])), null)
})
