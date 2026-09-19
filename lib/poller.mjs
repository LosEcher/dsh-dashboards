/**
 * lib/poller.mjs — 轮询缓存基座。
 *
 * 把「采集频率/缓存新鲜度/并发节流/超时兜底/观测统计/活动门控」从业务
 * collector 解耦成单一可复用机制（2026-09-01 结构化重构，替代 index.mjs
 * 内联的 makePoller/startPoller/活动门控）。
 *
 * 声明式数据源（DataSource）：
 *   {
 *     id: string,                    // 观测标识（stats / 错误信息）
 *     collect: () => Promise<data>,  // 业务采集函数，可抛错
 *     intervalMs: number,            // 新鲜度间隔
 *     timeoutMs?: number,            // 单次刷新硬超时兜底（collect 自带更早超时则先抛）
 *     freshWaitCapMs?: number,       // get() 最多等多久拿新数据（stale-while-revalidate）
 *   }
 *
 * get() 语义：新鲜 → 立即回快照；过期/无数据 → 后台刷新 + 最多等
 * freshWaitCapMs，超时回「此刻最新快照」（可能旧，绝不阻塞长采集）；
 * force=true 完整等待（显式刷新场景）。与旧「阻塞式 get」对比：冷开首帧
 * 不再被最慢后端拖死（曾 18s > client 10s 超时 → TimeoutError），根因见
 * dsfolder/DSH-DASHBOARDS-LOAD-OPTIMIZATION-ANALYSIS-2026-09-01.md。
 *
 * stats 观测：每次刷新记录 refreshCount/successCount/failCount/
 * lastDurationMs/lastError/consecutiveFails/dataAgeMs，供 /plugins/<id>/status 排障。
 *
 * 2026-09-19（借鉴 Infomarchy 第一批加固）：
 *   - 每条快照带形状版本戳 v（lib/safety.mjs:SNAPSHOT_VERSION），形状不兼容
 *     变更时旧缓存须失效而不是被当成合法数据继续供应；
 *   - 失败**不再伪装新鲜**：ts/dataTs 只在成功时推进，失败只推进 attemptedAt
 *     并置 stale，避免「失败后既不复试、又把旧数据当刚采的」双重失真。
 */

import { SNAPSHOT_VERSION } from './safety.mjs'

const DEFAULT_FRESH_CAP_MS = 2500
const DEFAULT_TIMEOUT_MS = 12000

/** 活动门控：超过此时长无 get/touch 活动，周期刷新暂停（看板未打开零采集）。 */
const IDLE_PAUSE_MS = 180_000

// 启动即视为 idle：看板未打开（无 /dashboards 请求）前零采集——首个请求
// touchActivity() 后才开始轮询（真·零开销；boot 不触发 13 数据源首刷风暴）。
let lastActivityAt = Date.now() - IDLE_PAUSE_MS - 1

/** 任意 /dashboards 请求 = 活动信号（续命后台轮询）。 */
export function touchActivity() {
  lastActivityAt = Date.now()
}

/** 测试专用：重置为「启动即 idle」状态（模块级活动时间戳跨测试共享，需隔离）。 */
export function _resetActivityForTest() {
  lastActivityAt = Date.now() - IDLE_PAUSE_MS - 1
}

/** 纯判定（可注入 now，便于测试）。 */
export function isIdleSince(now, lastTouchAt, idleMs) {
  return now - lastTouchAt > idleMs
}

export function isIdle(now = Date.now()) {
  return isIdleSince(now, lastActivityAt, IDLE_PAUSE_MS)
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // unref：挂起的刷新/超时定时器不 holding 事件循环（daemon 退出/测试收尾不被拖住）
    timer.unref?.()
  })
}

/** 供宿主侧（snapshot per-widget deadline 等）复用同一 sleep 语义。 */
export { sleep }

/** 创建轮询器：单飞刷新 + 快照缓存 + stale-while-revalidate + stats。 */
export function makePoller(source) {
  const { id, collect, intervalMs } = source
  const freshCapMs = source.freshWaitCapMs ?? DEFAULT_FRESH_CAP_MS
  const timeoutMs = source.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // 快照形状（v=缓存形状版本戳；见 lib/safety.mjs SNAPSHOT_VERSION 注释）：
  //   ts          最近一次**成功**采集的时刻（= 数据的真实年龄基准，不再被失败推进）
  //   attemptedAt 最近一次尝试的时刻（新鲜度/重试门控用它，失败也推进）
  //   dataTs      同 ts（显式命名，供 UI 区分「数据时间」与「尝试时间」）
  //   stale       最近一次尝试失败且仍有旧数据 ⇒ 数据是旧的（必须可见）
  //
  // 2026-09-19 修复（借鉴 Infomarchy 的 checkedAt / 失败不得当成功缓存）：
  // 原实现在失败分支也写 `ts = now`，于是失败后 age≈0 ⇒ get() 认为「新鲜」，
  // 既不会按 intervalMs 重试，又把过期数据当成刚刚采集的呈现给看板。
  let snapshot = { v: SNAPSHOT_VERSION, ts: null, attemptedAt: null, dataTs: null, data: null, error: null, stale: false }
  let lastAttemptMs = 0
  let inFlight = null
  const stats = {
    id,
    v: SNAPSHOT_VERSION,
    refreshCount: 0,
    successCount: 0,
    failCount: 0,
    lastDurationMs: null,
    lastError: null,
    consecutiveFails: 0,
    lastRefreshAt: null,
    /** 最近一次成功采集到现在的毫秒数（数据真实年龄；无数据为 null）。 */
    dataAgeMs: null,
  }
  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const started = Date.now()
      lastAttemptMs = started
      stats.refreshCount += 1
      try {
        const data = await Promise.race([
          collect(),
          sleep(timeoutMs).then(() => { throw new Error(`${id} 采集超时 ${timeoutMs}ms`) }),
        ])
        const okAt = new Date().toISOString()
        snapshot = { v: SNAPSHOT_VERSION, ts: okAt, attemptedAt: okAt, dataTs: okAt, data, error: null, stale: false }
        stats.successCount += 1
        stats.consecutiveFails = 0
        stats.lastError = null
        stats.dataAgeMs = 0
      } catch (e) {
        // 关键：**不推进 ts/dataTs**。失败只记尝试时刻与错误，并标记 stale，
        // 让 UI/对账看到「这份数据是旧的」，同时由 lastAttemptMs 保证下一轮
        // intervalMs 后会重试（而不是靠伪新鲜度把重试推迟一整轮）。
        snapshot = {
          ...snapshot,
          v: SNAPSHOT_VERSION,
          attemptedAt: new Date().toISOString(),
          error: String(e),
          stale: snapshot.data !== null,
        }
        stats.failCount += 1
        stats.consecutiveFails += 1
        stats.lastError = String(e)
      } finally {
        stats.lastDurationMs = Date.now() - started
        stats.lastRefreshAt = new Date().toISOString()
        stats.dataAgeMs = snapshot.dataTs ? Date.now() - new Date(snapshot.dataTs).getTime() : null
        inFlight = null
      }
    })()
    return inFlight
  }
  async function get(force = false) {
    // 无数据 ⇒ 必须尝试；否则按「距上次尝试」判断是否到期（失败也计入，
    // 于是失败后会照常重试，而不是被伪装的 ts 压住不发）。
    const noData = snapshot.data === null
    const due = force || noData || (Date.now() - lastAttemptMs > intervalMs)
    if (!due) return snapshot
    if (force) {
      await refresh()
      return snapshot
    }
    // 非阻塞路径：后台刷新 + 最多等 cap 拿新数据；超时即回旧快照
    const settling = refresh()
    return Promise.race([
      settling.then(() => snapshot),
      sleep(freshCapMs).then(() => snapshot),
    ])
  }
  return { get, refresh, snapshot: () => snapshot, stats: () => stats }
}

/** 周期刷新 + 活动门控（idleMs 可注入测试）。
 * 2026-09-01 惰性首刷：默认启动不刷——第一个非 idle tick 或首次 get() 才采集，
 * 消除插件启动时的「13 数据源全量风暴」（曾含 18s 聚合/外网额度请求，违背
 * 看板未打开零开销的设计意图）。需要启动即热的场景传 immediate: true。 */
export function startPoller(poller, intervalMs, { idleMs = IDLE_PAUSE_MS, immediate = false } = {}) {
  if (immediate) void poller.refresh()
  const timer = setInterval(() => {
    if (isIdleSince(Date.now(), lastActivityAt, idleMs)) return
    void poller.refresh()
  }, intervalMs)
  timer.unref?.()
  return timer
}
