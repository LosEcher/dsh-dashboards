/**
 * lib/disk.mjs — 磁盘口径的单一实现（2026-10-22，纯函数、零依赖、无 IO）。
 *
 * ── 为什么需要这个模块 ─────────────────────────────────────────────────
 * macOS 上「可用空间」有三个都真、但含义完全不同的数（本机 2026-10-22 实测）：
 *
 *   statfs / df 的 avail           = 34.1 GiB  ← 硬可用：不回收任何东西就能写
 *   NSURL importantUsage           = 85.7 GiB  ← 含可清除；Finder / iStat 的「Free」
 *   purgeable = important − avail  = 51.6 GiB  ← 已占用但系统承诺可回收
 *
 * 三者相差 50 GiB，于是同一台机器上「iStat 说 91 GB 可用」与「看板说 93% 已满」
 * 长期并存；85% 水位阈值在含可清除口径下 10 天误报 54 次（FEISHU-MESSAGE-AUDIT）。
 *
 * ── 本模块定下的模型：每个量只有一个用途 ──────────────────────────────
 *   total      容器总量
 *   available  硬可用 —— 只用于「余量是否见底」告警
 *   purgeable  可清除 —— 只用于「系统还有没有东西可回收」告警
 *   effective  = available + purgeable（= important）—— 只用于「已用百分比」展示
 *
 * 三条纪律：
 *   1. **不要并列展示三个数**：并列会逼人做减法，等于又造一个「第四种口径」。
 *   2. **百分比不作主判据**：APFS 上 df 的 capacity 分母含快照钉住的块，会随
 *      Time Machine 保留策略漂移（同一时刻 93% vs 81.4% 都是真的，但只有后者能
 *      回答「我还剩多少空间可以写」）。
 *   3. **缺值就是 null，绝不填 0**：拿不到 purgeable 时写 0 会被读成「没有可
 *      清除空间」，从而把一个测量缺口伪装成一个坏消息（V2 不变量）。
 */

const GIB = 1024 ** 3

/** 1 GiB 的字节数（导出给调用方换算阈值，避免各处自己写 1024**3）。 */
export const GIB_BYTES = GIB

export function gib(bytes) {
  return Number.isFinite(bytes) && bytes >= 0 ? bytes / GIB : null
}

export function gb(bytes) {
  return Number.isFinite(bytes) && bytes >= 0 ? bytes / 1e9 : null
}

/** 字节 → "34.1 GiB"；null 渲染成 `—`（不是 "0.0 GiB"）。 */
export function formatGiB(bytes, digits = 1) {
  const g = gib(bytes)
  return g == null ? '—' : `${g.toFixed(digits)} GiB`
}

function pct1(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null
  return Math.round((part / total) * 1000) / 10
}

/**
 * `df -h` 的二进制单位（"34Gi" / "460Gi" / "1.2Ti" / "512Mi"）→ 字节。
 * 返回 null 表示解析不出（调用方据此跳过交叉校验，绝不猜）。
 */
export function dfHumanToBytes(text) {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^([0-9]+(?:\.[0-9]+)?)([KMGTPE])i?$/i)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const exp = 'KMGTPE'.indexOf(m[2].toUpperCase())
  if (exp < 0) return null
  return Math.round(n * 1024 ** (exp + 1))
}

/**
 * 解析 probe 输出（单行 JSON，四项字节数）。
 * 返回 { probe } 或 { error }（error 是封闭枚举，便于进 reasons/日志）。
 */
export function parseDiskProbe(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'empty' }
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    return { error: 'bad-json' }
  }
  if (!obj || typeof obj !== 'object') return { error: 'bad-shape' }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const totalBytes = num(obj.total)
  const availableBytes = num(obj.available)
  const importantBytes = num(obj.important)
  if (totalBytes == null || availableBytes == null || importantBytes == null) return { error: 'missing-fields' }
  if (totalBytes === 0) return { error: 'zero-total' }
  return { probe: { totalBytes, availableBytes, importantBytes, opportunisticBytes: num(obj.opportunistic) } }
}

/**
 * 统一模型推导：probe 优先，df 行降级。
 *
 * @param {object}   o
 * @param {object}   [o.probe]    parseDiskProbe 的 probe
 * @param {object}   [o.dfRow]    { sizeBytes, availBytes }（df 降级源，只有硬可用）
 * @param {string[]} [o.reasons]  上游已知的降级原因
 */
export function deriveDisk({ probe = null, dfRow = null, reasons = [] } = {}) {
  const out = {
    totalBytes: null,
    availableBytes: null,
    purgeableBytes: null,
    effectiveBytes: null,
    hardUsedPct: null,
    effectiveUsedPct: null,
    source: null,
    asOf: null,
    degraded: false,
    reasons: [...reasons],
  }
  if (probe) {
    out.source = 'nsurl'
    out.totalBytes = probe.totalBytes
    out.availableBytes = probe.availableBytes
    // ⚠️ important < available 是瞬时倒挂（实测出现过）：不允许算出负的 purgeable，
    //    也不允许把 effective 报得比 hard 还小——降级并把 effective 夹到 available。
    if (probe.importantBytes < probe.availableBytes) {
      out.degraded = true
      out.reasons.push('important-lt-available')
      out.effectiveBytes = probe.availableBytes
      out.purgeableBytes = 0
    } else {
      out.effectiveBytes = probe.importantBytes
      out.purgeableBytes = probe.importantBytes - probe.availableBytes
    }
  } else if (dfRow && Number.isFinite(dfRow.sizeBytes) && Number.isFinite(dfRow.availBytes)) {
    out.source = 'df'
    out.totalBytes = dfRow.sizeBytes
    out.availableBytes = dfRow.availBytes
    out.degraded = true
    out.reasons.push('no-probe')
  } else {
    out.degraded = true
    out.reasons.push('no-source')
    return out
  }
  out.hardUsedPct = pct1(out.totalBytes - out.availableBytes, out.totalBytes)
  out.effectiveUsedPct = out.effectiveBytes == null ? null : pct1(out.totalBytes - out.effectiveBytes, out.totalBytes)
  if (out.effectiveBytes == null) out.degraded = true
  return out
}

/**
 * 交叉校验：probe 的硬可用 vs df 的硬可用。
 * 两者独立来源，差太多说明 probe 读错卷或 df 读了别的挂载点 —— 此时**降级**而不是择一。
 * 容差 = max(3% of df, 1 GiB)（df -h 只有 1Gi 粒度，加上 APFS 元数据占用会小幅偏）。
 */
export function crossCheck(snap, dfRow) {
  const dfAvail = dfRow && Number.isFinite(dfRow.availBytes) ? dfRow.availBytes : null
  if (dfAvail == null || snap?.availableBytes == null) return { ok: true, skipped: true, reason: 'missing-input' }
  const tolerance = Math.max(dfAvail * 0.03, GIB)
  const delta = snap.availableBytes - dfAvail
  return { ok: Math.abs(delta) <= tolerance, deltaBytes: delta, toleranceBytes: Math.round(tolerance) }
}

export const DISK_LEVEL_RANK = { ok: 0, warn: 1, critical: 2 }

/**
 * 告警判定（纯函数）：按「两个缓冲是否见底」，不按百分比。
 *
 * 判据（任一成立）：
 *   - 硬可用 < hardFreeGb            ⇒ critical（真的必须动手清）
 *   - 可清除 < purgeableFloorGb 且 硬可用 < hardFreeGuardGb ⇒ warn（系统已无缓冲）
 *   - 24h 趋势外推 ≤ daysToFloor 天  ⇒ warn（还没撞墙，但方向明确）
 *   - 显式配置的 pctCeiling（deprecated）以 **hardUsedPct** 命中 ⇒ warn
 *
 * @param {object}  o
 * @param {object}  o.snap      deriveDisk 结果
 * @param {object}  o.cfg       { hardFreeGb, purgeableFloorGb, hardFreeGuardGb, pctCeiling, daysToFloor }
 * @param {object?} o.trend     diskTrendFromFree 结果
 */
export function judgeDiskAlert({ snap, cfg = {}, trend = null, now = Date.now() } = {}) {
  if (!snap || snap.availableBytes == null) return { level: 'unknown', reasons: ['no-data'], levelRank: 0 }
  const hardFloor = (Number.isFinite(cfg.hardFreeGb) ? cfg.hardFreeGb : 15) * GIB
  const purgeFloor = (Number.isFinite(cfg.purgeableFloorGb) ? cfg.purgeableFloorGb : 2) * GIB
  const guard = (Number.isFinite(cfg.hardFreeGuardGb) ? cfg.hardFreeGuardGb : 30) * GIB
  const daysLimit = Number.isFinite(cfg.daysToFloor) ? cfg.daysToFloor : 3
  const reasons = []
  let level = 'ok'

  if (snap.availableBytes < hardFloor) {
    level = 'critical'
    reasons.push('no-headroom')
  } else if (snap.purgeableBytes != null && snap.purgeableBytes < purgeFloor && snap.availableBytes < guard) {
    level = 'warn'
    reasons.push('purge-buffer-drained')
  }

  // deprecated 天花板：只按硬占用判（按含可清除的 capacity 判就是历史上那 54 次误报）
  if (level === 'ok' && Number.isFinite(cfg.pctCeiling) && cfg.pctCeiling > 0
      && snap.hardUsedPct != null && snap.hardUsedPct >= cfg.pctCeiling) {
    level = 'warn'
    reasons.push('hard-used-pct')
  }

  if (level === 'ok' && trend && Number.isFinite(trend.daysToFloor) && trend.daysToFloor <= daysLimit) {
    level = 'warn'
    reasons.push('projected-full')
  }

  void now
  return { level, reasons, levelRank: DISK_LEVEL_RANK[level] ?? 0 }
}

/**
 * 冷却 + 升级（纯函数）。升级 = 等级升高，或硬可用又少了 escalateGb（默认 5 GiB）。
 * 恢复到 ok 时清状态，否则「恢复正常后再恶化」会被上一次的冷却吞掉。
 */
export function decideAlert(state = {}, judgement, snap, cfg = {}, now = Date.now()) {
  const cooldownMs = Number.isFinite(cfg.cooldownMs) ? cfg.cooldownMs : 6 * 3600_000
  const stepBytes = (Number.isFinite(cfg.escalateGb) ? cfg.escalateGb : 5) * GIB
  const lastAt = Number.isFinite(state.lastAlertAt) ? state.lastAlertAt : 0
  const inCooldown = now - lastAt < cooldownMs
  const escalated = (judgement.levelRank ?? 0) > (state.lastLevelRank ?? 0)
    || (Number.isFinite(state.lastAvailBytes) && snap.availableBytes <= state.lastAvailBytes - stepBytes)
  const actionable = judgement.level === 'warn' || judgement.level === 'critical'
  const emit = actionable && (!inCooldown || escalated)
  const kept = emit
    ? { lastAlertAt: now, lastLevelRank: judgement.levelRank ?? 0, lastAvailBytes: snap.availableBytes }
    : { lastAlertAt: lastAt, lastLevelRank: state.lastLevelRank ?? 0, lastAvailBytes: state.lastAvailBytes ?? null }
  const next = judgement.level === 'ok'
    ? { lastAlertAt: 0, lastLevelRank: 0, lastAvailBytes: null }
    : kept
  return { emit, escalated, next }
}

/**
 * 硬可用的 24h 趋势（字节）。样本点 {t, availBytes}（旧样本没有 availBytes 会被跳过）。
 * deltaBytes < 0 = 在减少；daysToFloor 只在「确实在减少」且给了地板时有意义。
 */
export function diskTrendFromFree(samples, availableBytes, now, hardFloorBytes) {
  if (!Array.isArray(samples) || !Number.isFinite(availableBytes)) return null
  let best = null
  for (const s of samples) {
    if (!s || !Number.isFinite(s.t) || !Number.isFinite(s.availBytes)) continue
    const hours = (now - s.t) / 3600_000
    if (hours < 18 || hours > 30) continue
    if (!best || Math.abs(hours - 24) < Math.abs(best.hours - 24)) best = { hours, refBytes: s.availBytes }
  }
  if (!best) return null
  const deltaBytes = availableBytes - best.refBytes
  const perDayBytes = deltaBytes / (best.hours / 24)
  const daysToFloor = perDayBytes < 0 && Number.isFinite(hardFloorBytes)
    ? Math.max(0, (availableBytes - hardFloorBytes) / -perDayBytes)
    : null
  return { hours: Math.round(best.hours), refBytes: best.refBytes, deltaBytes, perDayBytes, daysToFloor }
}

/**
 * 告警文案（纯函数，便于断言契约）。三行封顶：
 *   1. 一句话说清「哪个缓冲见底 + 现在的两个数」
 *   2. 把 93% 的困惑就地解释掉（含可清除 / 不含可清除）
 *   3. 趋势或下一步
 */
export function formatDiskAlert({ snap, judgement, trend = null, pctTrend = null }) {
  const avail = formatGiB(snap.availableBytes)
  const purge = snap.purgeableBytes == null ? '—' : formatGiB(snap.purgeableBytes)
  const head = (() => {
    switch (judgement.reasons[0]) {
      case 'no-headroom':
        return `🟡 磁盘余量见底：硬可用 ${avail}（可清除 ${purge}）`
      case 'purge-buffer-drained':
        return `🟡 磁盘缓冲见底：硬可用 ${avail}、可清除仅 ${purge}（系统已无东西可回收）`
      case 'projected-full':
        return `🟡 磁盘约 ${(trend?.daysToFloor ?? 0).toFixed(1)} 天后见底：硬可用 ${avail}（可清除 ${purge}）`
      case 'hard-used-pct':
        return `🟡 磁盘硬占用 ${snap.hardUsedPct ?? '—'}%：硬可用 ${avail}（可清除 ${purge}）`
      default:
        return `🟡 磁盘注意：硬可用 ${avail}（可清除 ${purge}）`
    }
  })()
  const lines = [head]
  if (snap.effectiveUsedPct != null) {
    lines.push(`· 已用 ${snap.effectiveUsedPct}%（含可清除）；不回收任何东西时只有 ${avail} 可写`)
  }
  if (trend && Number.isFinite(trend.deltaBytes)) {
    const sign = trend.deltaBytes > 0 ? '+' : '−'
    const abs = formatGiB(Math.abs(trend.deltaBytes))
    const tail = Number.isFinite(trend.daysToFloor) ? `，按此速度约 ${trend.daysToFloor.toFixed(1)} 天到阈值` : ''
    lines.push(`· ${trend.hours} 小时 ${sign}${abs}（${formatGiB(trend.refBytes)} → ${avail}）${tail}`)
  } else if (pctTrend && Number.isFinite(pctTrend.delta)) {
    const sign = pctTrend.delta > 0 ? '+' : ''
    lines.push(`· ${pctTrend.hours} 小时 ${sign}${pctTrend.delta}pp（${pctTrend.refPct}% → ${snap.effectiveUsedPct ?? '—'}%）`)
  } else {
    lines.push('· 采样不足 24 小时，本次只报当前水位')
  }
  if (judgement.reasons[0] === 'no-headroom' || judgement.reasons[0] === 'purge-buffer-drained') {
    lines.push('→ Time Machine 本地快照常占十几到几十 GiB：tmutil listlocalsnapshots /')
  }
  return lines
}

/**
 * 解析 `tmutil listlocalsnapshots /` 的输出（purgeable 的来源归因，**展示用**）。
 *
 * 行形如 `com.apple.TimeMachine.2026-10-22-064618.local`（**本地时间**、秒精度，无时区）。
 * 返回 {count, latestAt, latestName}；解析不出任何一行时 count=0（不是 null —— 调用方
 * 用 count=null 表示"命令没跑成",两者语义不同：0 = 确实没有本地快照）。
 * latestAt 为 ISO（按本地时间构造后转 UTC），客户端按本地时区格式化。
 *
 * ⚠️ 这里**不做任何判据**：快照多少不影响告警（告警只看字节地板），它只回答
 * "可清除的那 51 GiB 是哪来的"。
 */
export function parseLocalSnapshots(text) {
  const stamps = []
  for (const line of String(text ?? '').split('\n')) {
    const m = /^com\.apple\.TimeMachine\.(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.local$/.exec(line.trim())
    if (!m) continue
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    if (!Number.isFinite(t.getTime())) continue
    stamps.push({ at: t.getTime(), iso: t.toISOString(), name: line.trim() })
  }
  if (!stamps.length) return { count: 0, latestAt: null, latestName: null }
  const latest = stamps.reduce((a, b) => (b.at > a.at ? b : a))
  return { count: stamps.length, latestAt: latest.iso, latestName: latest.name }
}
