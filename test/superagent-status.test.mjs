/**
 * /dashboards/superagent 的三态与分桶（只呈现，不判定）。
 *
 * 锁住四条：
 *   ① 快照不存在 ⇒ degraded + **不说"无异常"**（要给出下一步）
 *   ② 快照坏 ⇒ degraded 且点名解析原因
 *   ③ 正常快照 ⇒ 维护期/可派/在跑/需你处理 各一行；actionable 条目被点名
 *   ④ 需你处理 > 0 只到 warn（要人出手 ≠ 系统故障），且不得因为 0 而报 fail
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectSuperagentStatus } from '../index.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'superagent-card-'))
const write = (d, name, content) => { const p = join(d, name); writeFileSync(p, content); return p }

test('① 快照不存在 ⇒ degraded，并给出下一步（不是"无异常"）', async () => {
  const d = dir()
  const s = await collectSuperagentStatus(join(d, 'status.json'))
  assert.equal(s.results.length, 0)
  assert.match(s.degraded.reasons[0], /还没有快照/)
  assert.match(s.degraded.reasons[0], /superagent-tick/, '必须给出下一步，而不是只说没有')
  assert.equal(s.resultsFallback[0].degraded, true)
})

test('② 快照不可解析 ⇒ degraded 且点名原因', async () => {
  const d = dir()
  const p = write(d, 'status.json', '{broken')
  const s = await collectSuperagentStatus(p)
  assert.match(s.degraded.reasons[0], /不可解析/)
})

test('③ 正常快照 ⇒ 六行基础行 + actionable 条目被点名', async () => {
  const d = dir()
  const p = write(d, 'status.json', JSON.stringify({
    at: '2026-11-01T11:21:38.033Z',
    maintenance: { state: 'idle', blocksDispatch: false, reason: 'no-request' },
    counts: { cards: 9, ready: 0, running: 0, actionable: 1, stale: 2 },
    actionable: [{ id: 'T9', why: '连续失败 2 次（dispatch-lost）' }],
    running: [{ id: 'T7', verdict: 'progress', reason: 'result-signal-changed', quietMin: 3 }],
    stale: [{ id: 'T1' }, { id: 'T3' }],
    ledgerIssue: null,
  }))
  const s = await collectSuperagentStatus(p)
  const names = s.results.map((r) => r.name)
  for (const n of ['快照新鲜度', '维护期', '可派', '在跑', '需你处理', '历史遗留']) assert.ok(names.includes(n), n)
  assert.equal(s.state, 'needs-you')
  assert.ok(names.includes('✋ T9'), 'actionable 必须点名，不能只给个数')
  assert.ok(names.includes('⏳ T7'))
  assert.match(s.results.find((r) => r.name === '✋ T9').detail, /连续失败 2 次/)
})

test('④ 维护期拦截派发 ⇒ warn；台账坏 ⇒ degraded（两条独立判据）', async () => {
  const d = dir()
  const p = write(d, 'status.json', JSON.stringify({
    at: '2026-11-01T11:21:38.033Z',
    maintenance: { state: 'scheduled', blocksDispatch: true, reason: 'scheduled:120s' },
    counts: { cards: 9, ready: 0, running: 0, actionable: 0, stale: 0 },
    actionable: [], running: [], stale: [],
    ledgerIssue: '台账第 12 行不是合法 JSON',
  }))
  const s = await collectSuperagentStatus(p)
  const maint = s.results.find((r) => r.name === '维护期')
  assert.match(maint.detail, /scheduled（拦截派发）/)
  assert.equal(maint.degraded, true)
  assert.match(s.degraded.reasons[0], /第 12 行/)
  assert.equal(s.state, 'ok', '台账坏是另一条判据（degraded），不改变分桶结论')
})

test('⑤ 计数全 0 ⇒ 如实 0，且"需你处理"是 pass 不是 fail', async () => {
  const d = dir()
  const p = write(d, 'status.json', JSON.stringify({
    at: '2026-11-01T11:21:38.033Z',
    maintenance: { state: 'idle', blocksDispatch: false, reason: 'no-request' },
    counts: { cards: 0, ready: 0, running: 0, actionable: 0, stale: 0 },
    actionable: [], running: [], stale: [], ledgerIssue: null,
  }))
  const s = await collectSuperagentStatus(p)
  const act = s.results.find((r) => r.name === '需你处理')
  assert.equal(act.ok, true, '0 张需处理不是坏消息')
  assert.match(act.detail, /0 张/)
})
