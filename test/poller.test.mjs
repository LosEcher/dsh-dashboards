/**
 * dsh-dashboards — lib/poller.mjs 轮询基座单元测试。
 *
 * 锁死核心语义（2026-09-01 结构化重构后轮询逻辑独立可测）：
 *   - stale-while-revalidate：过期/无数据时 get() 最多等 freshWaitCapMs，
 *     慢采集不阻塞（冷开首帧不被 18s 级后端拖死）
 *   - force=true 完整等待（PUT 保存等显式刷新）
 *   - single-flight：并发刷新只触发一次 collect
 *   - timeoutMs 兜底：collect 永不返回 → 记 error
 *   - stats 观测：refreshCount/success/fail/lastDurationMs/lastError/consecutiveFails
 *   - 活动门控 startPoller：idle 跳过周期刷新，touchActivity 后恢复
 *
 * 运行：node --test test/poller.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makePoller, startPoller, touchActivity, isIdleSince } from '../lib/poller.mjs'

/** 可控 promise：手动 resolve/reject，用于模拟慢/挂起/失败的 collect。 */
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('get: 新鲜快照直接返回，不触发 collect', async () => {
  let calls = 0
  const p = makePoller({ id: 't', collect: async () => { calls += 1; return { v: 1 } }, intervalMs: 60000 })
  const s1 = await p.get()
  assert.equal(s1.data.v, 1)
  assert.equal(calls, 1)
  const s2 = await p.get() // 新鲜 → 立即回快照
  assert.equal(s2.data.v, 1)
  assert.equal(calls, 1)
})

test('get: 过期 + 慢 collect → ≤cap 返回旧快照（stale-while-revalidate）', async () => {
  let calls = 0
  let gate = null
  const p = makePoller({
    id: 't', intervalMs: 10, freshWaitCapMs: 80,
    collect: async () => {
      calls += 1
      if (calls === 1) return { v: 1 }
      gate = deferred()
      return gate.promise // 第二次调用挂起
    },
  })
  await p.get() // 首次：真数据 v1
  await sleep(40) // 过期（interval 10ms）
  const started = Date.now()
  const s = await p.get() // 第二次：collect 挂起，应 ≤cap 回旧快照
  const elapsed = Date.now() - started
  assert.equal(s.data.v, 1, '慢采集下应返回旧快照而非阻塞')
  assert.ok(elapsed < 300, `应受 cap 限制而非等挂起 collect（elapsed=${elapsed}ms）`)
  assert.equal(calls, 2, '后台刷新已触发')
})

test('get: force=true 完整等待新数据', async () => {
  const gate = deferred()
  const p = makePoller({ id: 't', intervalMs: 60000, collect: async () => gate.promise })
  const started = Date.now()
  const pending = p.get(true)
  await sleep(60)
  gate.resolve({ v: 2 })
  const s = await pending
  assert.equal(s.data.v, 2)
  assert.ok(Date.now() - started >= 50, 'force 应等 collect 完成')
})

test('refresh: single-flight，并发只触发一次 collect', async () => {
  let calls = 0
  let resolveAll = null
  const p = makePoller({
    id: 't', intervalMs: 60000, freshWaitCapMs: 500,
    collect: async () => { calls += 1; return new Promise((r) => { resolveAll = r }) },
  })
  const [r1, r2] = [p.refresh(), p.refresh()]
  await sleep(30)
  resolveAll({ v: 1 })
  await Promise.all([r1, r2])
  assert.equal(calls, 1, '并发刷新应去重为一次 collect')
})

test('失败: collect reject → snapshot.error + stats.fail/consecutiveFails 累积，成功后归零', async () => {
  let mode = 'fail'
  const p = makePoller({
    id: 't', intervalMs: 60000,
    collect: async () => {
      if (mode === 'fail') throw new Error('boom')
      return { v: 1 }
    },
  })
  await p.refresh()
  let s = p.snapshot()
  assert.ok(s.error.includes('boom'))
  let st = p.stats()
  assert.equal(st.failCount, 1)
  assert.equal(st.consecutiveFails, 1)
  assert.equal(st.successCount, 0)
  await p.refresh()
  await p.refresh() // 再失败两次
  st = p.stats()
  assert.equal(st.consecutiveFails, 3)
  assert.equal(st.lastError, 'Error: boom')
  mode = 'ok'
  await p.refresh()
  st = p.stats()
  s = p.snapshot()
  assert.equal(s.error, null)
  assert.equal(s.data.v, 1)
  assert.equal(st.successCount, 1)
  assert.equal(st.consecutiveFails, 0)
  assert.equal(st.lastError, null)
  assert.ok(st.lastDurationMs != null && st.lastDurationMs >= 0)
  assert.equal(st.refreshCount, 4)
})

test('timeoutMs 兜底: collect 永不返回 → 记「采集超时」error', async () => {
  const p = makePoller({ id: 't', intervalMs: 60000, timeoutMs: 50, collect: async () => new Promise(() => {}) })
  const started = Date.now()
  await p.refresh()
  const s = p.snapshot()
  assert.ok(s.error.includes('采集超时 50ms'))
  assert.ok(Date.now() - started >= 40)
})

test('活动门控: idle 跳过周期刷新，touchActivity 后恢复', async () => {
  touchActivity() // 重置共享活动时间戳
  let calls = 0
  const p = makePoller({ id: 't', intervalMs: 20, collect: async () => { calls += 1; return {} } })
  const timer = startPoller(p, 20, { idleMs: 120 })
  try {
    await sleep(350) // 启动首刷 + idle 窗口内的 tick（20s×6=120ms 内），之后全跳过
    const before = calls
    assert.ok(before >= 1, '启动应首刷')
    await sleep(200) // 仍在 idle → 不再增长
    const after = calls
    assert.ok(after <= before + 1, `idle 期间不应持续刷新（before=${before} after=${after}）`)
    touchActivity()
    await sleep(80) // 恢复活动 → 下一个 tick 刷新
    assert.ok(calls > after, `touch 后应恢复刷新（after=${after} calls=${calls}）`)
  } finally {
    clearInterval(timer)
  }
})

test('isIdleSince: 纯判定', () => {
  assert.equal(isIdleSince(1000, 1000, 100), false)
  assert.equal(isIdleSince(1100, 1000, 100), false) // 恰好等于不算 idle
  assert.equal(isIdleSince(1101, 1000, 100), true)
})
