/**
 * 看板分组：把卡片按「回答哪个问题」收成 5 段。
 *
 * 为什么放在 lib 而不是组件里：**分组是契约**——某张卡被归到哪一段，直接决定
 * 首屏看到什么；写成纯函数才能被 test/ 咬住（在 JSX 里塞一个 map，只能靠肉眼）。
 *
 * 设计依据（2026-11-19 实测 25 张卡）：原来 CSS 多列把卡片**竖着填满再换列**，
 * 于是「第 9 张卡」可能排在「第 2 张卡」左边；而且 25 张一样重，首屏只能看到
 * 6–8 张。分组后第一段是「现在有没有事」，其余段默认收起。
 */

/** 段的顺序 = 阅读顺序（第一段永远展开，其余按需展开）。 */
export const GROUP_ORDER = ['status', 'fleet', 'cost', 'local', 'input']

/**
 * 卡片 id → 段。**新加内置卡必须在这里登记**，否则会走类型兜底（通常落在 status
 * 段），一段里混进不相关的卡比"漏登记就消失"好，但仍应在加卡时补上。
 */
const BY_ID = {
  // ① 状态与值班：回答「现在有没有事、要不要我动手」
  'host-restart': 'status',
  'svc-probe': 'status',
  'kuma-status': 'status',
  'health-panel': 'status',
  'scheduler-surfaces': 'status',
  'superagent': 'status',
  // ② 机队与网络：回答「机器/节点/线路现在什么状态」
  'z4pro-health': 'fleet',
  'los-nodes': 'fleet',
  'los-tasks': 'fleet',
  'los-latency': 'fleet',
  'surge-ai-rep': 'fleet',
  'surge-packy': 'fleet',
  'net-summary': 'fleet',
  'net-trend': 'fleet',
  'gate-reasons': 'fleet',
  // ③ 用量与花费：回答「花了多少、配额还剩多少」
  'los-usage': 'cost',
  'ai-quota': 'cost',
  'dsh-usage': 'cost',
  'usage-reconcile': 'cost',
  // ④ 本机资源：回答「这台机器自己够不够用」
  'mbp-load': 'local',
  'mbp-mem': 'local',
  'mbp-disk': 'local',
  // ⑤ 跨项目与外部输入：回答「别人/外面给了什么」
  'xproj-sessions': 'input',
  'xproj-pain': 'input',
  'feed-digests': 'input',
}

/** 未知 id 按 widget 类型兜底：宁可放进某一段，也不要凭空消失。 */
const BY_TYPE = {
  host: 'status',
  list: 'status',
  matrix: 'fleet',
  tasks: 'fleet',
  surge: 'fleet',
  packy: 'fleet',
  stat: 'cost',
  quota: 'cost',
  usage: 'cost',
  reconcile: 'cost',
  disk: 'local',
  chart: 'local',
  feed: 'input',
}

/** 兜底段：连类型都不认识时才用它（不丢卡）。 */
export const FALLBACK_GROUP = 'status'

/**
 * 一张卡属于哪一段。`widget` 只需要 {id, type}。
 * 三态优先级：显式 id → 类型 → 兜底。
 */
export function groupOf(widget) {
  const id = widget && typeof widget.id === 'string' ? widget.id : ''
  if (BY_ID[id]) return BY_ID[id]
  const type = widget && typeof widget.type === 'string' ? widget.type : ''
  if (BY_TYPE[type]) return BY_TYPE[type]
  return FALLBACK_GROUP
}

/**
 * 按段分组，**段内保持配置顺序**（store 里的顺序就是人定的顺序）。
 * 空段不返回——不渲染空标题。
 *
 * @param {Array<{id?: string, type?: string}>} widgets
 * @returns {Array<{key: string, items: Array}>}
 */
export function groupWidgets(widgets) {
  const buckets = new Map()
  for (const w of Array.isArray(widgets) ? widgets : []) {
    const key = groupOf(w)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(w)
  }
  const out = []
  for (const key of GROUP_ORDER) {
    const items = buckets.get(key)
    if (items && items.length > 0) out.push({ key, items })
  }
  // 理论上不会发生（groupOf 只会返回 GROUP_ORDER 里的值），但保留兜底：
  // 未知段有内容就追加在末尾，绝不静默丢卡。
  for (const [key, items] of buckets) {
    if (!GROUP_ORDER.includes(key) && items.length > 0) out.push({ key, items })
  }
  return out
}
