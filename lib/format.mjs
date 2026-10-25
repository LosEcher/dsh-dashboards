/**
 * dsh-dashboards — 显示词表（**唯一实现**，纯函数、无 IO、无 import）。
 *
 * 为什么单独一层：本项目反复踩同一类坑 —— 状态词长在模型/采集层，于是同一个事实
 * 在不同地方被翻译成不同说法，最后长出"卡片绿灯、告警照发"（2026-10-22 实证）。
 * 本模块只回答一件事：**一个事实该显示成什么词**。像素由控件层负责。
 *
 * 四条不变量（与 dsfolder/MONITOR-OBSERVABILITY-DISPLAY-DESIGN-2026-10-25.md 的 V1/V2/V5/V6 对齐）：
 *   V1 新鲜度渲染成词（`从未 / 刚刚 / N 分钟前`），不渲染裸时间戳；未来时间夹到 0，不出负数。
 *   V2 缺值渲染 `—`，与 `0` 严格分离（"0% 已用"与"读不到"必须长得不一样）。
 *   V5 未知要计数：`level()` / `coverage()` 都有 `unknown` 态，**空不等于通过**。
 *   V6 一个数字只给一种写法（`dash()` 是所有数值的唯一出口）。
 *
 * 设计约束（与 lib/quota-degrade.mjs 同风格）：不读 HOME、不碰磁盘、不 import 插件内
 * 其他模块，因而能在任何 Node ≥18 下被 `node --test` 直接驱动。
 */

/** 数值统一出口：null/undefined/NaN/Infinity → `—`；0 → `'0'`；其余按 digits 保留小数。 */
export function dash(value, { digits = null, unit = '' } = {}) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.trim() === '' ? '—' : value
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return `${0}${unit}`
  const text = digits === null ? String(n) : n.toFixed(digits)
  return `${text}${unit}`
}

/** 百分比：`pct(0) === '0%'`，`pct(null) === '—'`（不许把缺值画成 0%）。 */
export function pct(value, digits = 0) {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 把"年龄毫秒"拆成 { n, unit }，供 `ago()` 加 `前`、旧接口 `formatReadingAge()` 不加。
 * 与旧实现的档位**逐档一致**（分钟 / 小时 / 天，`Math.round`），因此委托后文案零变化。
 */
export function splitAge(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) {
    return { n: null, unit: null }
  }
  const minutes = Math.max(0, Math.round(Number(ms) / MINUTE))
  if (minutes < 60) return { n: minutes, unit: '分钟' }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { n: hours, unit: '小时' }
  return { n: Math.round(hours / 24), unit: '天' }
}

/**
 * V1 的实现：新鲜度渲染成词。
 *   - 没有时间戳 ⇒ `从未`（不是 `—`：`—` 表"有字段但缺值"，`从未` 表"这事没发生过"）
 *   - 不足 1 分钟（含未来时间/时钟回拨）⇒ `刚刚`，**绝不出现 `-3s`**
 *   - 其余 `N 分钟前 / N 小时前 / N 天前`
 */
export function ago(atMs, nowMs = Date.now()) {
  if (atMs === null || atMs === undefined) return '从未'
  const ms = Number(nowMs) - Number(atMs)
  if (!Number.isFinite(ms)) return '从未'
  if (ms < 0) return '刚刚' // 时钟回拨/未来时间：夹到 0，不显示负时长
  if (ms < MINUTE) return '刚刚'
  const { n, unit } = splitAge(ms)
  return `${n} ${unit}前`
}

/**
 * 新鲜度分档（只给判定，不给文案）：用于 `level()` 与告警共用同一判据。
 * budgetMs 之后算 stale；3× budget 之后算 expired；没有 ts ⇒ unknown。
 */
export function freshness(atMs, nowMs = Date.now(), budgetMs = 5 * MINUTE) {
  if (atMs === null || atMs === undefined) return 'unknown'
  const age = Number(nowMs) - Number(atMs)
  if (!Number.isFinite(age) || age < 0) return 'ok' // 未来时间按最新处理（夹到 0）
  if (age <= budgetMs) return 'ok'
  if (age <= budgetMs * 3) return 'stale'
  return 'expired'
}

/**
 * V5 的实现：把信号折成四态之一，**空集合返回 unknown 而不是 ok**。
 *
 * @param {{checks?: number, errors?: number, warnings?: number, unknown?: number}} signals
 * @returns {'ok'|'degraded'|'down'|'unknown'}
 *
 * 判据顺序：unknown 优先（判不了 !== 好）> errors（down）> warnings（degraded）> 有 check 才 ok。
 * 注意：`checks` 是**已评估**的条数；`checks:0` 表示"一条都没评估"，绝不算通过
 * （对应 verify-gate 把"全 na"报成 pass 的那次事故）。
 */
export function level(signals = {}) {
  const checks = Number(signals.checks ?? 0)
  const errors = Number(signals.errors ?? 0)
  const warnings = Number(signals.warnings ?? 0)
  const unknown = Number(signals.unknown ?? 0)
  if (!Number.isFinite(checks) || checks <= 0) return 'unknown'
  if (unknown > 0) return 'unknown'
  if (errors > 0) return 'down'
  if (warnings > 0) return 'degraded'
  return 'ok'
}

/**
 * 覆盖率（V4/V5）：**采不到 ≠ 采到 0**。
 *   - total 为 0/缺省 ⇒ `unknown`（不知道分母，不能算好）
 *   - ok === total ⇒ `ok`
 *   - ok < total ⇒ `partial`（缺口必须能说出来）
 * 返回 { state, text, gaps }：text 是给人类的一句，state 给判定/告警用。
 */
export function coverage({ ok, total, gaps = [] } = {}) {
  const okN = Number(ok)
  const totalN = Number(total)
  if (!Number.isFinite(okN) || !Number.isFinite(totalN) || totalN <= 0) {
    return { state: 'unknown', text: '—', gaps: [] }
  }
  const list = Array.isArray(gaps) ? gaps.filter((g) => g !== null && g !== undefined) : []
  if (okN >= totalN && list.length === 0) {
    return { state: 'ok', text: `${okN}/${totalN}`, gaps: [] }
  }
  return { state: 'partial', text: `${okN}/${totalN}`, gaps: list }
}

/** 字节 → 人类可读；缺值 `—`、0 就是 `0 B`（不做 1024 进制以下的取整猜测）。 */
export function bytes(value) {
  if (value === null || value === undefined) return '—'
  let n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2
  return `${n.toFixed(digits)} ${units[i]}`
}

/** 词表自证：渲染层只许用这里产出的词（门禁用；不做词法扫描，只给白名单）。 */
export const VOCAB = Object.freeze({
  missing: '—',
  never: '从未',
  justNow: '刚刚',
  unknown: '未知',
})
