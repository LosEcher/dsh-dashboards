/**
 * lib/safety.mjs — 看板「诚实与安全」原语（零依赖纯函数 + 少量 fs 助手）。
 *
 * 2026-09-19 借鉴 Infomarchy（nixfred.infomarchy）落地第一批加固，报告
 * dsfolder/INFOMARCHY-ANALYSIS-2026-09-19.md §4 P0。六项能力集中在此，
 * 便于单测（test/safety.test.mjs）且不把 index.mjs 再撑大：
 *
 *   1. plausibleTimestamp —— 脏时间（2099 年、负值、时钟回拨）不得进入聚合
 *   2. publishNetSample   —— 差分基线的样本时刻必须与字节数对应；最小 dt 守卫
 *   3. 原子写 + revision  —— read-merge-write，防两个写者互相覆盖（丢更新）
 *   4. capList / capText  —— 截断必须显式上报，绝不静默
 *   5. SNAPSHOT_VERSION   —— 缓存形状版本戳（形状变了旧缓存自动失效）
 *   6. EGRESS_FEATURES    —— 出网清单（每个外呼的用途/目标/凭据 + 逐项开关）
 *
 * 设计约束：本模块不 import 任何插件内模块，也不读 HOME（纯函数 + 显式路径），
 * 因此可在任何 Node ≥18 下被单测直接驱动。
 */

import { mkdirSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// ───────────────────────────────────────────────────────────── 1. 时间合理性

/** 下界：2000-01-01T00:00:00Z。早于此的时间戳视为脏数据（而非 1970 前的负值）。 */
export const PLAUSIBLE_MIN_MS = 946_684_800_000
/** 允许的未来偏移：只有 60s——覆盖轻微时钟偏移，挡掉 2099 这类错行。 */
export const PLAUSIBLE_FUTURE_SKEW_MS = 60_000

/**
 * 时间戳是否可信。Infomarchy 的原话：「一条 2099 年的记录曾同时被算进今天
 * 并排在所有真实任务之上」——脏时间不只会画错图，还会污染排序与当日聚合。
 *
 * @param {unknown} ts 候选时间戳（epoch ms）
 * @param {number} [now] 判定基准（默认 Date.now()）
 * @returns {boolean}
 */
export function plausibleTimestamp(ts, now = Date.now(), opts = {}) {
  const min = opts.minMs ?? PLAUSIBLE_MIN_MS
  const skew = opts.futureSkewMs ?? PLAUSIBLE_FUTURE_SKEW_MS
  const n = Number(ts)
  if (!Number.isFinite(n)) return false
  if (n < min) return false
  return n <= now + skew
}

/** 过滤不可信时间戳的行，并回报丢弃计数（丢弃必须可见，不静默）。 */
export function filterPlausible(rows, pick, now = Date.now()) {
  const list = Array.isArray(rows) ? rows : []
  const kept = []
  let dropped = 0
  for (const row of list) {
    if (plausibleTimestamp(pick(row), now)) kept.push(row)
    else dropped += 1
  }
  return { kept, dropped, total: list.length }
}

// ─────────────────────────────────────────────────── 2. 差分基线的正确性

/** 两次采样间隔的硬下限；低于此值不出速率（差值 / 极小 dt = 假尖峰）。 */
export const MIN_RATE_DT_MS = 1000

/**
 * 推进网络累计字节的差分基线，并算出速率。
 *
 * 关键在于「基线的样本时刻必须与它携带的字节数对应」。原实现把基线时刻写成
 * **函数返回时刻**（`prevNetAt = Date.now()`），而 netstat 的输出是**采样时刻**
 * 的快照；当一次采集超时后仍在后台跑完、与新一拍交叉完成时，谁最后返回谁覆盖
 * 基线，于是基线会变成「旧样本 + 新时刻」，下一拍用不匹配的 dt 去差分一个跨了
 * 更长时间窗口的差值 —— 速率虚高（Infomarchy 同款事故：两实例 tick 相隔 <1s）。
 *
 * 规则：
 *   - 首次采样：建立基线，不出速率
 *   - sampleAt 不前进（<= 基线）：**拒绝发布**且不改基线（过期/重复完成）
 *   - dt 过小（< minDtMs）：接受新基线但不出速率（宁可缺口，不出假尖峰）
 *   - 计数器回绕/重置（cur < prev）：该接口本轮计 0（不产出负值）
 *
 * @returns {{next: {at: number, ifaces: object}, rate: null | {inBps: number, outBps: number, dtMs: number}, reason: string}}
 */
export function publishNetSample(prev, sample, sampleAt, opts = {}) {
  const minDtMs = opts.minDtMs ?? MIN_RATE_DT_MS
  const at = Number(sampleAt)
  const ifaces = sample && typeof sample === 'object' ? sample : {}
  // 注意 Number(null) === 0：0 是有限数但不是合法的采样时刻，必须一并拒绝
  if (!Number.isFinite(at) || at <= 0) return { next: prev ?? null, rate: null, reason: 'bad-sample-time' }
  if (!prev || !Number.isFinite(prev.at) || !prev.ifaces) {
    return { next: { at, ifaces }, rate: null, reason: 'baseline' }
  }
  if (!(at > prev.at)) return { next: prev, rate: null, reason: 'stale-sample' }
  const dtMs = at - prev.at
  if (dtMs < minDtMs) return { next: { at, ifaces }, rate: null, reason: 'too-soon' }
  let inB = 0
  let outB = 0
  for (const [name, cur] of Object.entries(ifaces)) {
    const p = prev.ifaces[name]
    if (!p) continue
    if (Number(cur?.ibytes) >= Number(p.ibytes)) inB += Number(cur.ibytes) - Number(p.ibytes)
    if (Number(cur?.obytes) >= Number(p.obytes)) outB += Number(cur.obytes) - Number(p.obytes)
  }
  const dtSec = dtMs / 1000
  return {
    next: { at, ifaces },
    rate: { inBps: Math.round(inB / dtSec), outBps: Math.round(outB / dtSec), dtMs },
    reason: 'ok',
  }
}

// ─────────────────────────────────────── 3. 原子写 + revision（防丢更新）

/**
 * 读「信封式」store：`{revision, updatedAt, <key>: [...]}`，并兼容裸数组。
 * 缺失或损坏一律返回 exists:false（调用方回落默认值），绝不抛。
 */
export function readJsonEnvelope(file, key) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw[key])) {
      return {
        items: raw[key],
        revision: Number.isSafeInteger(raw.revision) ? raw.revision : 0,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        exists: true,
      }
    }
    // 兼容历史裸数组格式（无 revision ⇒ 视作 0）
    if (Array.isArray(raw)) return { items: raw, revision: 0, updatedAt: null, exists: true }
  } catch { /* 缺失/损坏 → 调用方回落 */ }
  return { items: null, revision: 0, updatedAt: null, exists: false }
}

/**
 * 原子写：临时文件（唯一名，避免并发互相截断）→ rename 替换。
 * 直接 writeFileSync 目标文件时，读到半个文件（崩溃/并发）会变成「损坏 → 回落
 * 默认」，把用户配置整体丢掉；rename 在同目录内是原子的。
 * @returns {boolean} 是否成功（失败不抛，调用方决定语义）
 */
export function writeJsonAtomic(file, value, opts = {}) {
  const mode = opts.mode ?? 0o600
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  try {
    mkdirSync(dirname(file), { recursive: true })
    const body = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
    writeFileSync(tmp, body, { mode })
    renameSync(tmp, file)
    return true
  } catch {
    try { rmSync(tmp, { force: true }) } catch { /* 尽力清理 */ }
    return false
  }
}

/**
 * revision 守卫的整体替换写。`expectedRevision` 为 null/undefined 时保持
 * 「最后写入者获胜」的旧语义，但 revision 仍递增（给下一次带上 revision 的
 * 写者一个可比的基准）。带 revision 且不匹配 ⇒ 冲突，不写盘并回当前值。
 */
export function saveEnvelopeReplace(file, key, items, expectedRevision = null) {
  const current = readJsonEnvelope(file, key)
  const currentRevision = current.exists ? current.revision : 0
  const expected = expectedRevision === null || expectedRevision === undefined ? null : Number(expectedRevision)
  if (expected !== null && (!Number.isSafeInteger(expected) || expected !== currentRevision)) {
    return { ok: false, conflict: true, revision: currentRevision, items: current.items, currentRevision }
  }
  const revision = currentRevision + 1
  const ok = writeJsonAtomic(file, { revision, updatedAt: new Date().toISOString(), [key]: items })
  if (!ok) return { ok: false, conflict: false, error: 'write-failed', revision: currentRevision, items: current.items }
  return { ok: true, conflict: false, revision, items }
}

// ────────────────────────────────────────────────── 4. 截断必须显式上报

/** 列表截断：回 {items, available, truncated}；available = 截断前的真实条数。 */
export function capList(value, max) {
  const items = Array.isArray(value) ? value : []
  const n = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : items.length
  return { items: items.slice(0, n), available: items.length, truncated: items.length > n }
}

/** 文本截断：回 {text, totalChars, truncated}；UI 可显示「已截断，N/M 字」。 */
export function capText(value, max) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  const n = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : text.length
  return { text: text.slice(0, n), totalChars: text.length, truncated: text.length > n }
}

/** 写入门控/去重用的稳定键（截断不影响语义：基于原文哈希语义的简化）。 */
export function truncatedNotice(capResult, kind = 'items') {
  if (!capResult?.truncated) return null
  return kind === 'chars'
    ? `已截断：显示 ${capResult.text.length}/${capResult.totalChars} 字`
    : `已截断：显示 ${capResult.items.length}/${capResult.available} 条`
}

// ──────────────────────────────────────────────── 5. 缓存形状版本戳

/**
 * poller 快照形状版本。**形状不兼容地变更时必须 +1**：旧缓存（尤其落盘后
 * 又被读回的）与新的读取代码形状不同却「看起来合法」，会被当成好数据一直
 * 提供——Infomarchy 的 TOPIC_CACHE_VERSION 就是为这类毒化缓存设的。
 */
export const SNAPSHOT_VERSION = 2

/** 缓存条目是否可用于当前读取器（版本 + 指纹双校验）。 */
export function cacheStampMatches(entry, { version, fingerprint } = {}) {
  if (!entry || typeof entry !== 'object') return false
  if (version !== undefined && entry.v !== version) return false
  if (fingerprint !== undefined && entry.fingerprint !== fingerprint) return false
  return true
}

// ─────────────────────────────────────────── 6. 出网清单与逐项开关

/**
 * 出网清单（唯一真源）。每一项都能被 `Config.egress.<id> = false` 单独关闭，
 * 并经 `GET /dashboards/egress` 暴露给运维面——「有哪些外呼、去哪、为什么、
 * 用什么凭据」必须可枚举，而不是散落在代码里靠 grep 回答。
 */
export const EGRESS_FEATURES = [
  { id: 'los', label: 'los 网关', target: 'Config.losUrl', purpose: '用量/趋势/指标/执行节点', auth: 'Bearer + x-los-operator-token' },
  { id: 'quotaApis', label: '额度余额 API', target: 'zenmux.ai / packyapi.com / api.deepseek.com / openrouter.ai', purpose: 'AI 额度余额', auth: '.credentials.yaml 各家 key' },
  { id: 'quotaAxi', label: '订阅窗口采集', target: '本机官方 CLI/App 登录态（first-party 端点）', purpose: '订阅窗口用量', auth: '本地 CLI 凭据（quota-axi 只读）' },
  { id: 'grokRefresh', label: 'Grok 续期', target: 'auth.x.ai/oauth2/token', purpose: '登录态自动续期', auth: '~/.grok/auth.json refresh_token' },
  { id: 'kuma', label: 'Uptime Kuma', target: 'Config.kuma.url/metrics', purpose: '监控状态', auth: 'API key (Basic)' },
  { id: 'glances', label: 'Glances', target: 'Config.glances.url/api/4/all', purpose: '系统指标', auth: '无' },
  { id: 'probe', label: '服务探活', target: '探针目标列表（可含外部 URL）', purpose: '端口/HTTP 探活', auth: '无' },
  { id: 'z4pro', label: '极空间巡检', target: 'ssh Config.z4pro.host（LAN）', purpose: '设备健康', auth: 'ssh key' },
  { id: 'diskAlert', label: '磁盘告警推送', target: '~/.dsh/scripts/feishu-push.sh（飞书 webhook）', purpose: '磁盘水位告警', auth: '飞书 tenant token' },
]

/** 某一项出网是否允许。缺省允许（清单即白名单，未登记的 id 不会出现在调用点）。 */
export function egressEnabled(cfg, id) {
  const table = cfg?.egress
  if (!table || typeof table !== 'object') return true
  return table[id] !== false
}

/** 供 /dashboards/egress 与 /status 展示：清单 × 当前开关。 */
export function egressInventory(cfg) {
  return EGRESS_FEATURES.map((f) => ({ ...f, enabled: egressEnabled(cfg, f.id) }))
}
