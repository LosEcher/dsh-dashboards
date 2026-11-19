import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStrip, fmtUptime, hostFact, probeFact, schedulerFact, diskFact, netFact, STRIP_FACTS,
} from '../lib/summary.mjs'

test('fmtUptime：渲染成词，负值/非数一律 —（时钟回拨不得出现 -3s）', () => {
  assert.equal(fmtUptime(30_000), '30s')
  assert.equal(fmtUptime(27 * 60_000), '27m')
  assert.equal(fmtUptime(4 * 3_600_000 + 20 * 60_000), '4h20m')
  assert.equal(fmtUptime(2 * 86_400_000 + 3 * 3_600_000), '2d3h')
  assert.equal(fmtUptime(2 * 86_400_000), '2d')
  assert.equal(fmtUptime(-1), '—')
  assert.equal(fmtUptime(null), '—')
  assert.equal(fmtUptime('12'), '—')
})

// 夹具取自 2026-11-19 实测的 /dashboards/snapshot（字段裁剪，形状不改）
const HOST_OK = {
  available: true,
  ok: true,
  host: { pid: 99782, uptimeMs: 1_654_421 },
  daemon: { phase: 'healthy', restarts: 705 },
  turns: { running: 1 },
  pending: { count: 5 },
}

test('host：健康是绿、守护不健康是黄、ok=false 是红', () => {
  const ok = hostFact(HOST_OK)
  assert.equal(ok.state, 'done')
  assert.equal(ok.value, '27m')
  assert.match(ok.hint, /守护 healthy/)
  assert.match(ok.hint, /在跑 1/)
  assert.match(ok.hint, /待重载 5/)

  assert.equal(hostFact({ ...HOST_OK, daemon: { phase: 'degraded' } }).state, 'warning')
  assert.equal(hostFact({ ...HOST_OK, ok: false }).state, 'error')
  // 能力不可用 ≠ 宿主坏了：灰点 + —
  const off = hostFact({ available: false })
  assert.equal(off.state, 'idle')
  assert.equal(off.value, '—')
  assert.equal(hostFact(null), null)
})

test('probe：挂一个就红，只降级是黄，未启用是灰', () => {
  assert.equal(probeFact({ enabled: true, total: 4, ok: 4, degraded: 0, down: 0 }).state, 'done')
  assert.equal(probeFact({ enabled: true, total: 4, ok: 3, degraded: 1, down: 0 }).state, 'warning')
  const down = probeFact({ enabled: true, total: 4, ok: 2, degraded: 1, down: 1 })
  assert.equal(down.state, 'error')
  assert.equal(down.value, '2/4')
  assert.match(down.hint, /1 挂/)
  assert.equal(probeFact({ enabled: false }).state, 'idle')
  assert.equal(probeFact({ enabled: true }), null)
})

test('scheduler：真坏与降级分开染色（2/6 里含一个真坏 ⇒ 红）', () => {
  const rs = [
    { name: 'a', ok: true, degraded: false },
    { name: 'b', ok: true, degraded: false },
    { name: 'c', ok: false, degraded: true },
    { name: 'd', ok: false, degraded: false },
  ]
  const f = schedulerFact({ results: rs })
  assert.equal(f.state, 'error')
  assert.equal(f.value, '2/4')
  assert.match(f.hint, /坏 1/)
  assert.match(f.hint, /降级 1/)

  const soft = schedulerFact({ results: [{ ok: true }, { ok: false, degraded: true }] })
  assert.equal(soft.state, 'warning')
  assert.equal(schedulerFact({ results: [] }), null)
})

test('disk：critical 红、warn 黄、口径降级也黄、没数就 —', () => {
  const base = { disk: { effectiveUsedPct: 82.7, level: 'ok' } }
  assert.equal(diskFact(base).value, '82.7%')
  assert.equal(diskFact(base).state, 'done')
  assert.equal(diskFact({ disk: { effectiveUsedPct: 95, level: 'critical' } }).state, 'error')
  assert.equal(diskFact({ disk: { effectiveUsedPct: 90, level: 'warn' } }).state, 'warning')
  assert.equal(diskFact({ disk: { hardUsedPct: 93, level: 'ok', degraded: true } }).state, 'warning')
  const none = diskFact({ disk: { level: 'ok', degraded: true } })
  assert.equal(none.value, '—')
  assert.equal(none.state, 'idle')
})

test('net：ok 绿、degraded 黄、其它红；新鲜度不 ok 也降级成黄', () => {
  assert.equal(netFact({ state: 'ok', freshness: 'ok' }).state, 'done')
  assert.equal(netFact({ state: 'ok', freshness: 'stale' }).state, 'warning')
  assert.equal(netFact({ state: 'degraded' }).state, 'warning')
  assert.equal(netFact({ state: 'error' }).state, 'error')
  // 原始 state 词不被翻译藏起来
  assert.match(netFact({ state: 'degraded', freshness: 'ok' }).hint, /state=degraded/)
})

test('buildStrip：固定 5 条、顺序稳定、缺数据是 — + 灰（不是 0）', () => {
  const facts = buildStrip({})
  assert.deepEqual(facts.map((f) => f.key), STRIP_FACTS.map((f) => f.key))
  for (const f of facts) {
    assert.equal(f.value, '—')
    assert.equal(f.state, 'idle')
  }
  // 只有宿主有数据时，其余仍是 —，宿主是绿
  const partial = buildStrip({ 'host-restart': HOST_OK })
  assert.equal(partial[0].state, 'done')
  assert.equal(partial[1].value, '—')
  assert.deepEqual(buildStrip(null).map((f) => f.value), ['—', '—', '—', '—', '—'])
})
