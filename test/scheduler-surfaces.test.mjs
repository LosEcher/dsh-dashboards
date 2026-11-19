/**
 * scheduler-surfaces 的测试：6 行 × 正控/负控。
 *
 * 关键负控（设计确认单 §10.4 要求）：
 *   ① registry 计数漂移 ⇒ launchd 行必须黄（不是绿）
 *   ② active 且 scheduledAt 过期 ⇒ 原生 schedule 行必须黄
 *   ③ backlog gate=1 ⇒ 未落地补丁行必须不 ok
 *   ④ 台账末行坏/缺 ⇒ rust 门禁行必须"判不了"，**不得**当 0（否则红门禁会显示成绿）
 *   ⑤ 治理快照超期 ⇒ 治理行必须"判不了"（不许拿旧数字当今天）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSchedulerSurfaces, ACTIVE_OVERDUE_MS, GOVERNANCE_STALE_MS } from '../lib/scheduler-surfaces.mjs'

const NOW = Date.parse('2026-11-19T21:00:00+08:00')
const ok = (data) => ({ ok: true, data })
const bad = (error) => ({ ok: false, error })

const baseInputs = () => ({
  now: NOW,
  jobs: ok([{ name: 'a', enabled: true }, { name: 'b', enabled: true }]),
  registry: ok({ count: 2, jobs: [{}, {}] }),
  schedule: ok({ tables: { tasks: { t1: { status: 'active', record: { scheduledAt: '2026-11-19T20:30:00+08:00' } } } } }),
  nightlyPending: ok({ backlog: { gate: false, pending: 0, landed: 3, unjudged: 0 } }),
  verdicts: ok([{ ts: '2026-11-19T07:40:00Z', gate_rc: 0, routeguard_rc: 0, merged_rc: 0 }]),
  governance: ok({ asOf: new Date(NOW - 3600e3).toISOString(), closedRate: 1, counts: { newlyOpened: 1, newlyClosed: 1, overdue: 0, open: 0, accepted: 1, claimed: 0 } }),
})

const row = (snap, name) => snap.results.find((r) => r.name === name)

test('正控：六个面全绿时 6/6，且明细含真实数字', () => {
  const snap = buildSchedulerSurfaces(baseInputs())
  assert.equal(snap.total, 6)
  assert.equal(snap.ok, 6)
  assert.match(row(snap, 'launchd').detail, /2 个，清单与实际一致/)
  assert.match(row(snap, 'rust 门禁').detail, /merged_rc=0/)
})

test('负控①：registry 计数漂移 ⇒ launchd 黄', () => {
  const i = baseInputs(); i.registry = ok({ count: 5, jobs: [{}, {}] })
  const r = row(buildSchedulerSurfaces(i), 'launchd')
  assert.equal(r.ok, false)
  assert.equal(r.degraded, true)
  assert.match(r.detail, /清单 5 ≠ 实际 2/)
})

test('负控②：active 且已过期 >2h ⇒ 原生 schedule 黄；未过期不黄', () => {
  const stale = baseInputs()
  stale.schedule = ok({ tables: { tasks: { t1: { status: 'active', record: { scheduledAt: new Date(NOW - ACTIVE_OVERDUE_MS - 60e3).toISOString() } } } } })
  assert.equal(row(buildSchedulerSurfaces(stale), '原生 schedule').degraded, true)

  const fresh = baseInputs()
  fresh.schedule = ok({ tables: { tasks: { t1: { status: 'active', record: { scheduledAt: new Date(NOW - 60e3).toISOString() } } } } })
  assert.equal(row(buildSchedulerSurfaces(fresh), '原生 schedule').ok, true)
})

test('负控③：backlog gate=1 ⇒ 未落地补丁行不 ok 且写明闸门', () => {
  const i = baseInputs(); i.nightlyPending = ok({ backlog: { gate: true, pending: 3, landed: 5, unjudged: 0 } })
  const r = row(buildSchedulerSurfaces(i), '未落地补丁')
  assert.equal(r.ok, false)
  assert.match(r.detail, /积压闸门/)
})

test('负控④：门禁台账缺行/坏行 ⇒ 判不了，不得显示成绿', () => {
  const missing = baseInputs(); missing.verdicts = ok([])
  const a = row(buildSchedulerSurfaces(missing), 'rust 门禁')
  assert.equal(a.ok, false, '没有台账必须判不了')
  assert.match(a.detail, /判不了/)

  const broken = baseInputs(); broken.verdicts = bad('bad-json')
  assert.match(row(buildSchedulerSurfaces(broken), 'rust 门禁').detail, /判不了/)
})

test('负控⑤：治理快照超期 ⇒ 判不了（不许拿旧数字当今天）', () => {
  const i = baseInputs()
  i.governance = ok({ asOf: new Date(NOW - GOVERNANCE_STALE_MS - 3600e3).toISOString(), closedRate: 1, counts: { newlyOpened: 0, newlyClosed: 0, overdue: 0, open: 0, accepted: 0, claimed: 0 } })
  const r = row(buildSchedulerSurfaces(i), '治理案件')
  assert.equal(r.ok, false)
  assert.match(r.detail, /快照过期/)
})

test('负控⑥：源文件读不到 ⇒ 每行都判不了（不是 0 也不是绿）', () => {
  const snap = buildSchedulerSurfaces({ now: NOW })
  assert.equal(snap.ok, 0)
  for (const r of snap.results) {
    assert.equal(r.ok, false)
    assert.match(r.detail, /判不了/)
  }
})

test('负控⑦：dsh-scheduler 有作业被关着 ⇒ 黄并点名', () => {
  const i = baseInputs(); i.jobs = ok([{ name: 'live', enabled: true }, { name: 'migrated', enabled: false }])
  const r = row(buildSchedulerSurfaces(i), 'dsh-scheduler')
  assert.equal(r.degraded, true)
  assert.match(r.detail, /关着 1 个：migrated/)
})
