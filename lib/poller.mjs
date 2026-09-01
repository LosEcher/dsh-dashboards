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
 * lastDurationMs/lastError/consecutiveFails，供 /plugins/<id>/status 排障。
 */

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
  let snapshot = { ts: null, data: null, error: null }
  let inFlight = null
  const stats = {
    id,
    refreshCount: 0,
    successCount: 0,
    failCount: 0,
    lastDurationMs: null,
    lastError: null,
    consecutiveFails: 0,
    lastRefreshAt: null,
  }
  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const started = Date.now()
      stats.refreshCount += 1
      try {
        const data = await Promise.race([
          collect(),
          sleep(timeoutMs).then(() => { throw new Error(`${id} 采集超时 ${timeoutMs}ms`) }),
        ])
        snapshot = { ts: new Date().toISOString(), data, error: null }
        stats.successCount += 1
        stats.consecutiveFails = 0
        stats.lastError = null
      } catch (e) {
        snapshot = { ...snapshot, ts: new Date().toISOString(), error: String(e) }
        stats.failCount += 1
        stats.consecutiveFails += 1
        stats.lastError = String(e)
      } finally {
        stats.lastDurationMs = Date.now() - started
        stats.lastRefreshAt = new Date().toISOString()
        inFlight = null
      }
    })()
    return inFlight
  }
  async function get(force = false) {
    const stale = !snapshot.ts || (snapshot.data === null && snapshot.error === null)
    const age = snapshot.ts ? Date.now() - new Date(snapshot.ts).getTime() : Infinity
    if (!(force || stale || age > intervalMs)) return snapshot
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
