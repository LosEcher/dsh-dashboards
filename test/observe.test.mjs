/**
 * dsh-dashboards — scripts/observe-guardrails.mjs 纯函数单测。
 *
 * 观测器的价值在于「数据面可信」：如果 buildObservation 漏读 stale 或把分组后端
 * 拍平错，后续「结合数据决定下一轮」就会基于假数据做决定。这里锁住折叠与汇总语义。
 *
 * 运行：node --test test/observe.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildObservation, summarize } from '../scripts/observe-guardrails.mjs'

const status = {
  ts: '2026-09-19T14:00:00.000Z',
  sanity: { historyImplausible: 3, historyMalformed: 0, aggregateImplausible: 0 },
  egress: { disabled: ['kuma'], total: 9 },
  backends: {
    los: {
      usage: { ts: '2026-09-19T13:59:00.000Z', attemptedAt: '2026-09-19T13:59:30.000Z', stale: true, error: 'los 超时', hasData: true, stats: { v: 2, dataAgeMs: 60000, consecutiveFails: 2, refreshCount: 5, failCount: 2 } },
      trends: { ts: null, attemptedAt: '2026-09-19T13:59:30.000Z', stale: false, error: null, hasData: false, stats: { v: 2, dataAgeMs: null, consecutiveFails: 0, refreshCount: 1, failCount: 0 } },
    },
    macos: { ts: '2026-09-19T13:59:55.000Z', attemptedAt: '2026-09-19T13:59:55.000Z', stale: false, error: null, hasData: true, stats: { v: 2, dataAgeMs: 0, consecutiveFails: 0, refreshCount: 9, failCount: 0 } },
  },
}

test('buildObservation: 分组后端（los.*）与单后端（macos）都拍平成一行', () => {
  const row = buildObservation(status, { features: [{ id: 'los', enabled: true }, { id: 'kuma', enabled: false }] }, { label: 't', now: Date.UTC(2026, 8, 19, 14, 0, 0) })
  assert.deepEqual(row.backends.map((b) => b.id), ['los.usage', 'los.trends', 'macos'])
  assert.equal(row.backends[0].stale, true)
  assert.equal(row.backends[0].dataAgeMs, 60000)
  assert.equal(row.backends[0].consecutiveFails, 2)
  assert.equal(row.backends[0].snapshotV, 2)
})

test('buildObservation: stales / failing 是一眼可见的两个不健康信号', () => {
  const row = buildObservation(status, {}, { now: Date.UTC(2026, 8, 19, 14, 0, 0) })
  assert.deepEqual(row.stales, ['los.usage'])
  assert.deepEqual(row.failing, ['los.usage'])
  // 无数据但从未失败（尚未采集）不算 stale，也不算 failing
  assert.equal(row.backends.find((b) => b.id === 'los.trends').stale, false)
})

test('buildObservation: egressDisabled 只列关掉的项', () => {
  const row = buildObservation(status, { features: [{ id: 'los', enabled: true }, { id: 'kuma', enabled: false }, { id: 'diskAlert', enabled: false }] })
  assert.deepEqual(row.egressDisabled, ['kuma', 'diskAlert'])
  assert.equal(row.egressTotal, 3)
})

test('buildObservation: 畸形/空 status 不抛错（观测器本身不能成为故障源）', () => {
  for (const bad of [null, undefined, {}, { backends: null }, { backends: { los: null } }]) {
    const row = buildObservation(bad, null)
    assert.deepEqual(row.backends, [])
    assert.deepEqual(row.stales, [])
    assert.equal(row.sanity, null)
  }
  const noEgress = buildObservation(status, undefined)
  assert.deepEqual(noEgress.egressDisabled, [])
})

test('summarize: 逐后端统计 stale/失败样本数与峰值，sanity 取各键最大值', () => {
  const rows = [
    buildObservation(status, {}, { now: Date.UTC(2026, 8, 19, 14, 0, 0) }),
    buildObservation({ ...status, sanity: { historyImplausible: 7 }, backends: { los: { usage: { ...status.backends.los.usage, stale: false, error: null, stats: { v: 2, dataAgeMs: 5000, consecutiveFails: 0 } } } } }, {}, { now: Date.UTC(2026, 8, 19, 14, 5, 0) }),
  ]
  const s = summarize(rows)
  assert.equal(s.samples, 2)
  const usage = s.backends.find((b) => b.id === 'los.usage')
  assert.equal(usage.samples, 2)
  assert.equal(usage.staleSamples, 1)
  assert.equal(usage.errorSamples, 1)
  assert.equal(usage.maxConsecutiveFails, 2)
  assert.equal(usage.maxDataAgeMs, 60000)
  assert.equal(usage.lastError, 'los 超时')
  assert.equal(s.sanityMax.historyImplausible, 7)
  // 只在第一批出现的后端也计入（samples 少）
  assert.equal(s.backends.find((b) => b.id === 'los.trends').samples, 1)
})

test('summarize: 空输入安全（观察窗尚无数据时不能抛）', () => {
  const s = summarize([])
  assert.equal(s.samples, 0)
  assert.deepEqual(s.backends, [])
  assert.deepEqual(s.sanityMax, {})
})
