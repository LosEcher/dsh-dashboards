/**
 * 看板顶部「一句话状态条」的取数逻辑（纯函数、零依赖）。
 *
 * 目的：25 张卡平铺时，想知道「现在有没有事」必须从头读到尾。状态条把 5 个系统面
 * 各压成「一个词 + 一个数」，首屏就能判断要不要动手。
 *
 * 三条与全仓一致的显示纪律（dsfolder/AGENTS.md §7）：
 *   V1 新鲜度/时长**渲染成词**（`27m` / `4h20m` / `2d3h`），不渲染裸毫秒，未来时间夹到 0；
 *   V2 **缺值渲染 `—`**，绝不渲染成 0（读不到 ≠ 是零）；
 *   V3 空态与故障态是两句话：`—` + "未就绪"（idle 点）≠ `0/4`（红点）。
 *
 * 状态词表只在这里产出（'done' | 'warning' | 'error' | 'idle'），组件只负责画点。
 */

const MISSING = '—'

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 有限数字才算数；其它一律 null（→ 渲染成 —）。 */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * 时长渲染成词。负值/非数一律 `—`（时钟回拨不得显示 `-3s`）。
 * @param {unknown} ms
 */
export function fmtUptime(ms) {
  const v = num(ms)
  if (v === null || v < 0) return MISSING
  const s = Math.floor(v / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, '0')}m`
  const d = Math.floor(h / 24)
  return h % 24 === 0 ? `${d}d` : `${d}d${h % 24}h`
}

/** ① 宿主：守护进程健康 + 已运行多久 + 几个会话在跑 + 有几个文件等着重载。 */
export function hostFact(d) {
  if (!isObj(d)) return null
  if (d.available === false) {
    return { value: MISSING, hint: '重启能力不可用', state: 'idle' }
  }
  const daemon = isObj(d.daemon) ? d.daemon : null
  const phase = daemon && typeof daemon.phase === 'string' ? daemon.phase : ''
  const running = num(d.turns && d.turns.running)
  const pending = num(d.pending && d.pending.count)
  const hint = []
  if (phase) hint.push(`守护 ${phase}`)
  if (running !== null) hint.push(`在跑 ${running}`)
  if (pending) hint.push(`待重载 ${pending}`)
  if (d.ok !== true) {
    return { value: '没就绪', hint: hint.join(' · ') || (typeof d.error === 'string' ? d.error : ''), state: 'error' }
  }
  const up = d.host ? d.host.uptimeMs : null
  const degraded = phase !== '' && phase !== 'healthy'
  return { value: fmtUptime(up), hint: hint.join(' · '), state: degraded ? 'warning' : 'done' }
}

/** ② 关键服务：ok/total，挂一个就红，只有降级就黄。 */
export function probeFact(d) {
  if (!isObj(d)) return null
  if (d.enabled === false) return { value: MISSING, hint: '探活未启用', state: 'idle' }
  const total = num(d.total)
  if (total === null) return null
  const ok = num(d.ok) ?? 0
  const degraded = num(d.degraded) ?? 0
  const down = num(d.down) ?? 0
  const state = down > 0 ? 'error' : degraded > 0 ? 'warning' : 'done'
  const hint = down > 0 || degraded > 0 ? `${down} 挂 · ${degraded} 降级` : '全部正常'
  return { value: `${ok}/${total}`, hint, state }
}

/** ③ 调度面：六个面里几个是好的；`degraded` 是"降级但没坏"，与"真坏"分开染色。 */
export function schedulerFact(d) {
  if (!isObj(d)) return null
  const rs = Array.isArray(d.results) ? d.results.filter(isObj) : null
  if (!rs || rs.length === 0) return null
  const ok = rs.filter((r) => r.ok === true).length
  const hard = rs.filter((r) => r.ok === false && r.degraded !== true).length
  const soft = rs.filter((r) => r.ok === false && r.degraded === true).length
  const state = hard > 0 ? 'error' : soft > 0 ? 'warning' : 'done'
  const hint = hard > 0 || soft > 0 ? `坏 ${hard} · 降级 ${soft}` : '都正常'
  return { value: `${ok}/${rs.length}`, hint, state }
}

/** ④ 磁盘：口径是「已用（含可清除）」——与磁盘卡同一份快照，不另算一套。 */
export function diskFact(d) {
  if (!isObj(d)) return null
  const disk = isObj(d.disk) ? d.disk : null
  if (!disk) return null
  const pct = num(disk.effectiveUsedPct) ?? num(disk.hardUsedPct)
  if (pct === null) return { value: MISSING, hint: '磁盘口径未就绪', state: 'idle' }
  const level = typeof disk.level === 'string' ? disk.level : ''
  const state = level === 'critical' ? 'error' : level === 'warn' || disk.degraded === true ? 'warning' : 'done'
  const hint = disk.degraded === true ? '口径降级' : level === 'ok' ? '已用（含可清除）' : `水位 ${level}`
  return { value: `${pct.toFixed(1)}%`, hint, state }
}

/** ⑤ 网络观测：三态词 + 新鲜度；原始 state 词进 hint，不因为翻译而隐藏服务端的说法。 */
export function netFact(d) {
  if (!isObj(d)) return null
  const raw = typeof d.state === 'string' ? d.state : ''
  if (!raw) return { value: MISSING, hint: '网络观测未就绪', state: 'idle' }
  const label = raw === 'ok' ? '正常' : raw === 'degraded' ? '降级' : raw === 'error' ? '异常' : raw
  const fresh = typeof d.freshness === 'string' ? d.freshness : ''
  const stale = fresh !== '' && fresh !== 'ok'
  const state = raw === 'ok' ? (stale ? 'warning' : 'done') : raw === 'degraded' ? 'warning' : 'error'
  const hint = [`state=${raw}`, fresh ? `新鲜度 ${fresh}` : ''].filter(Boolean).join(' · ')
  return { value: label, hint, state }
}

/**
 * 状态条的组成：**顺序即阅读顺序**，key 也是 locale 里的键（`strip.<key>`）。
 * `of` 是提供数据的内置 widget id —— 用户把那张卡删了就显示 `—`（不假装有数据）。
 */
export const STRIP_FACTS = [
  { key: 'host', of: 'host-restart', compute: hostFact },
  { key: 'probe', of: 'svc-probe', compute: probeFact },
  { key: 'scheduler', of: 'scheduler-surfaces', compute: schedulerFact },
  { key: 'disk', of: 'mbp-disk', compute: diskFact },
  { key: 'net', of: 'net-summary', compute: netFact },
]

/**
 * 生成状态条事实。
 * @param {Record<string, unknown>} dataById widget id → 该卡的 data（缺失即未就绪）
 * @returns {Array<{key: string, value: string, hint: string, state: string}>}
 */
export function buildStrip(dataById) {
  const src = isObj(dataById) ? dataById : {}
  return STRIP_FACTS.map(({ key, of, compute }) => {
    const fact = compute(src[of])
    if (!fact) {
      return { key, value: MISSING, hint: '数据未就绪', state: 'idle' }
    }
    return { key, value: fact.value, hint: fact.hint, state: fact.state }
  })
}
