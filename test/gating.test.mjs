/**
 * dsh-dashboards — 变化门控（B1）+ 慢变量降频（B2）纯函数单元测试。
 *
 * 借鉴 mac-performance-monitor：
 *   - B1 change-gated writes（SampleStore.lastWritten）：指标无实质变化时跳过
 *     磁盘写入，空闲期历史 jsonl 不再每拍膨胀
 *   - B2 slow-variable throttling（batteryReadInterval / SMC slowInterval）：
 *     分钟级变量（df 容量/ps 进程数）按间隔复用缓存，快变量保持每拍
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  historyPointChanged, shouldRefreshSlow, HISTORY_WRITE_TOLERANCE,
} from '../lib/parsers.mjs'

// ── historyPointChanged ─────────────────────────────────────────────────
test('historyPointChanged: 全同 → false（应跳过写入）', () => {
  const a = { load1: 1.2, cpuUsedPct: 10, memUsedPct: 55.5, netInBps: 1000, netOutBps: 500 }
  const b = { ...a }
  assert.equal(historyPointChanged(a, b), false)
})

test('historyPointChanged: 任一指标超容差 → true', () => {
  const a = { load1: 1.2, cpuUsedPct: 10, memUsedPct: 55.5, netInBps: 1000, netOutBps: 500 }
  // CPU 超 0.5pp 容差
  assert.equal(historyPointChanged(a, { ...a, cpuUsedPct: 11 }), true)
  // load 超 0.05 容差
  assert.equal(historyPointChanged(a, { ...a, load1: 1.4 }), true)
  // 网络超 50KB/s 容差
  assert.equal(historyPointChanged(a, { ...a, netInBps: 100000 }), true)
})

test('historyPointChanged: 容差内抖动 → false', () => {
  const a = { load1: 1.2, cpuUsedPct: 10, memUsedPct: 55.5, netInBps: 1000, netOutBps: 500 }
  assert.equal(historyPointChanged(a, { ...a, cpuUsedPct: 10.3, load1: 1.22, memUsedPct: 55.7 }), false)
})

test('historyPointChanged: 一方有值一方缺失 → true（新数据源出现）', () => {
  const a = { load1: 1.2, cpuUsedPct: null, memUsedPct: 55.5 }
  const b = { load1: 1.2, cpuUsedPct: 12, memUsedPct: 55.5 }
  assert.equal(historyPointChanged(a, b), true)
})

test('historyPointChanged: 双方均 null → 该指标不参与', () => {
  const a = { load1: null, cpuUsedPct: 10, memUsedPct: null }
  const b = { load1: null, cpuUsedPct: 10.2, memUsedPct: null }
  assert.equal(historyPointChanged(a, b), false)
})

test('historyPointChanged: 空对象/null 输入 → true（保守写）', () => {
  assert.equal(historyPointChanged(null, { load1: 1 }), true)
  assert.equal(historyPointChanged({}, {}), false)
  assert.equal(historyPointChanged(undefined, undefined), true)
})

test('historyPointChanged: 自定义容差生效', () => {
  const a = { cpuUsedPct: 10 }
  const tol = { cpuUsedPct: 5 }
  assert.equal(historyPointChanged(a, { ...a, cpuUsedPct: 12 }, tol), false)
  assert.equal(historyPointChanged(a, { ...a, cpuUsedPct: 16 }, tol), true)
})

test('HISTORY_WRITE_TOLERANCE: 默认容差齐全（门控指标白名单）', () => {
  for (const key of ['load1', 'cpuUsedPct', 'memUsedPct', 'netInBps', 'netOutBps']) {
    assert.ok(key in HISTORY_WRITE_TOLERANCE, `缺容差: ${key}`)
  }
})

// ── shouldRefreshSlow ───────────────────────────────────────────────────
test('shouldRefreshSlow: 首次（lastAt=0）总是执行', () => {
  assert.equal(shouldRefreshSlow(0, Date.now(), 150_000), true)
})

test('shouldRefreshSlow: 未到间隔 → false（复用缓存）', () => {
  const now = Date.now()
  assert.equal(shouldRefreshSlow(now - 30_000, now, 150_000), false)
})

test('shouldRefreshSlow: 到达/超过间隔 → true', () => {
  const now = Date.now()
  assert.equal(shouldRefreshSlow(now - 150_000, now, 150_000), true)
  assert.equal(shouldRefreshSlow(now - 300_000, now, 150_000), true)
})

test('shouldRefreshSlow: intervalMs 非正数 → 总是执行', () => {
  assert.equal(shouldRefreshSlow(Date.now() - 1000, Date.now(), 0), true)
  assert.equal(shouldRefreshSlow(Date.now() - 1000, Date.now(), -5), true)
})
