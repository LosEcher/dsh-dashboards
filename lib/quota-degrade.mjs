/**
 * dsh-dashboards — 「登录态过期」的降级透出（纯函数，无 IO，可单测）。
 *
 * 要解决的问题（2026-10-10 定位）：
 *   quota-axi 对「access token 过期」一律报 `auth_required`，且 `definitiveAuth`
 *   会**主动删掉自己缓存**（`kimi.js:268`）⇒ 没有 stale 兜底。于是
 *   **「token 过期但 refresh_token 尚在（本可自愈）」与「真的没登录」被渲染成完全
 *   相同的文案「需登录」** —— 这正是「需登录：kimi login」能反复假警报三次的根因。
 *
 * 本模块只做一件事：如果一个渠道这次报 `auth`，但我们**确实在近期读到过它的真实
 * 数据**，就把这次降级成 `stale` 并显示"最近一次读数 + 距今多久"，恢复命令仍留在
 * note 里。拿不到近期读数就**原样报 auth**（不许把"真没登录"伪装成"数据过期"）。
 *
 * 设计约束（与 lib/safety.mjs 同风格）：不 import 插件内模块、不读 HOME、不碰磁盘，
 * 因而可在任何 Node ≥18 下被单测直接驱动。
 */

/** 降级可用的最大数据年龄：超过它就不再"透出旧数据"，而是老实报需登录。
 *  取 24h 的理由：最紧的窗口是 5h/周级，超过一天的数字已没有决策价值，
 *  继续展示会把"真需要登录"长期掩盖。 */
export const AXI_DEGRADE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** 渠道里是否含"可供降级复用的真实读数"。窗口型看 windows；余额型看 amount。 */
function hasUsableReading(channel) {
  if (!channel || typeof channel !== 'object') return false
  if (Array.isArray(channel.windows) && channel.windows.length > 0) return true
  return channel.amount != null
}

/** 人类可读的年龄（用于 note，不用于排序）。 */
export function formatReadingAge(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} 小时`
  return `${Math.round(hours / 24)} 天`
}

/**
 * 把本次报 `auth` 的渠道降级为 `stale`（若近期有真实读数）。
 *
 * @param {Array<object>} channels 本次归一化后的渠道列表
 * @param {Map<string,{channel:object,at:number}>} lastGood 上一轮为止的"最近良好读数"
 * @param {number} nowMs 当前时刻（显式传入以便测试）
 * @param {Record<string,string>} [hints] provider → 恢复命令（如 kimi → 'kimi login'）
 * @returns {{channels: Array<object>, lastGood: Map<string,{channel:object,at:number}>}}
 *          返回**新的** Map，不修改入参（调用方直接换引用即可）。
 */
export function degradeAuthChannels(channels, lastGood, nowMs, hints = {}) {
  const previous = lastGood instanceof Map ? lastGood : new Map()
  const next = new Map(previous)
  const list = Array.isArray(channels) ? channels : []

  const out = list.map((channel) => {
    if (!channel || typeof channel !== 'object') return channel

    // 非 auth：只要含真实读数就记进"最近良好"，供后续降级复用。
    if (channel.health !== 'auth') {
      if (hasUsableReading(channel)) next.set(channel.id, { channel, at: nowMs })
      return channel
    }

    const prev = previous.get(channel.id)
    if (!prev || !hasUsableReading(prev.channel)) return channel
    const ageMs = nowMs - prev.at
    if (!Number.isFinite(ageMs) || ageMs > AXI_DEGRADE_MAX_AGE_MS) return channel

    const hint = hints[channel.id]
    return {
      ...prev.channel,
      // 保留 prev 的 windows / updatedAt（那是**数据**时间，正是要展示的年龄基准）
      health: 'stale',
      note: `登录态已过期，显示 ${formatReadingAge(ageMs)}前的读数`
        + (hint ? `；续期失败可重跑 ${hint}` : ''),
    }
  })

  return { channels: out, lastGood: next }
}
