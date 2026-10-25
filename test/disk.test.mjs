/**
 * dsh-dashboards — 磁盘口径单元测试（node:test，零依赖）。
 *
 * 锁住 2026-10-22「三口径」定稿的四条不变量：
 *   1. purgeable ≡ important − available（本机实测与 iStat Menus 的 Purgeable 逐字节吻合）；
 *   2. 缺 probe 时 purgeable/effective = **null**，不是 0（V2：缺值不许伪装成坏消息）；
 *   3. 告警不按百分比，按「两个缓冲见底」——含可清除口径下 93% 不是告警理由；
 *   4. important < available 的倒挂数据必须降级，不许算出负的 purgeable。
 *
 * 运行：node --test test/disk.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GIB_BYTES, gib, gb, formatGiB, dfHumanToBytes, parseDiskProbe, deriveDisk, crossCheck,
  judgeDiskAlert, decideAlert, diskTrendFromFree, formatDiskAlert, DISK_LEVEL_RANK, parseLocalSnapshots,
} from '../lib/disk.mjs'

const GIB = GIB_BYTES

// 2026-10-22 07:15 本机实测（macOS 27.0.1 / MBP18,1 / /System/Volumes/Data）
const REAL = { total: 494384795648, available: 36626059264, important: 92027461632, opportunistic: 75159920640 }
const REAL_LINE = '{"available":36626059264,"important":92027461632,"opportunistic":75159920640,"total":494384795648}'
const realProbe = parseDiskProbe(REAL_LINE).probe

// ── 单位与格式化 ────────────────────────────────────────────────────────
test('formatGiB: 缺值渲染 — 而不是 0.0 GiB（V2）', () => {
  assert.equal(formatGiB(null), '—')
  assert.equal(formatGiB(undefined), '—')
  assert.equal(formatGiB(NaN), '—')
  assert.equal(formatGiB(-1), '—')
  assert.equal(formatGiB(REAL.available), '34.1 GiB')
  assert.equal(formatGiB(REAL.available, 0), '34 GiB')
  assert.equal(gib(null), null)
  assert.equal(gb(REAL.total), 494.384795648)
})

test('dfHumanToBytes: 只认 df -h 的二进制单位，其它一律 null（不猜）', () => {
  assert.equal(dfHumanToBytes('34Gi'), 34 * GIB)
  assert.equal(dfHumanToBytes('460Gi'), 460 * GIB)
  assert.equal(dfHumanToBytes('512Mi'), 512 * 1024 ** 2)
  assert.equal(dfHumanToBytes('1.5Ti'), Math.round(1.5 * 1024 ** 4))
  assert.equal(dfHumanToBytes('93%'), null)
  assert.equal(dfHumanToBytes(''), null)
  assert.equal(dfHumanToBytes(null), null)
  // macOS 的 df -h 打 "34Gi"，GNU 的 df -h 打 "34G" —— 两边都是二进制单位，都收；
  // 但带 B 的十进制单位是**另一种单位**，不做换算猜测。
  assert.equal(dfHumanToBytes('34G'), 34 * GIB)
  assert.equal(dfHumanToBytes('34GB'), null)
})

// ── probe 解析 ──────────────────────────────────────────────────────────
test('parseDiskProbe: 本机真实输出可解析', () => {
  const r = parseDiskProbe(REAL_LINE)
  assert.deepEqual(r.probe, realProbe)
  assert.equal(r.probe.totalBytes, REAL.total)
})

test('parseDiskProbe: 坏输入是封闭枚举的 error，不是抛异常', () => {
  assert.equal(parseDiskProbe('').error, 'empty')
  assert.equal(parseDiskProbe('not json').error, 'bad-json')
  assert.equal(parseDiskProbe('null').error, 'bad-shape')
  assert.equal(parseDiskProbe('{"total":0,"available":1,"important":2}').error, 'zero-total')
  assert.equal(parseDiskProbe('{"total":10,"available":1}').error, 'missing-fields')
  // 负数是坏数据（不许当成 0 继续算）
  assert.equal(parseDiskProbe('{"total":10,"available":-5,"important":2}').error, 'missing-fields')
})

// ── 统一模型 ────────────────────────────────────────────────────────────
test('deriveDisk: purgeable ≡ important − available（与 iStat 的 Purgeable 同源）', () => {
  const d = deriveDisk({ probe: realProbe })
  assert.equal(d.source, 'nsurl')
  assert.equal(d.degraded, false)
  assert.deepEqual(d.reasons, [])
  assert.equal(d.purgeableBytes, 55401402368)
  assert.equal(d.purgeableBytes, d.effectiveBytes - d.availableBytes) // 不变量
  assert.equal(d.effectiveBytes, d.effectiveBytes)                     // effective === important
  assert.equal(d.effectiveBytes, REAL.important)
  assert.equal(d.hardUsedPct, 92.6)
  assert.equal(d.effectiveUsedPct, 81.4)
  // 两个百分比指的是同一块盘：差 11.2pp 全部来自可清除空间
  assert.equal(Math.round((d.hardUsedPct - d.effectiveUsedPct) * 10) / 10, 11.2)
})

test('deriveDisk: important < available 的倒挂必须降级，不许负 purgeable', () => {
  const d = deriveDisk({ probe: { totalBytes: 100 * GIB, availableBytes: 40 * GIB, importantBytes: 39 * GIB } })
  assert.equal(d.degraded, true)
  assert.ok(d.reasons.includes('important-lt-available'))
  assert.equal(d.purgeableBytes, 0)
  assert.equal(d.effectiveBytes, 40 * GIB)   // 夹到 available，不报成比硬可用还少
  assert.ok(d.effectiveUsedPct >= d.hardUsedPct - 0.05)
})

test('deriveDisk: 没有 probe 时 purgeable/effective 是 null 不是 0（V2 负向控制）', () => {
  const d = deriveDisk({ dfRow: { sizeBytes: 460 * GIB, availBytes: 34 * GIB } })
  assert.equal(d.source, 'df')
  assert.equal(d.degraded, true)
  assert.ok(d.reasons.includes('no-probe'))
  assert.equal(d.availableBytes, 34 * GIB)
  assert.equal(d.purgeableBytes, null)
  assert.equal(d.effectiveBytes, null)
  assert.equal(d.effectiveUsedPct, null)
  assert.notEqual(d.purgeableBytes, 0)
})

test('deriveDisk: 两个源都没有 → no-source，全部 null', () => {
  const d = deriveDisk({})
  assert.equal(d.source, null)
  assert.equal(d.degraded, true)
  assert.deepEqual(d.reasons, ['no-source'])
  for (const k of ['totalBytes', 'availableBytes', 'purgeableBytes', 'effectiveBytes', 'hardUsedPct', 'effectiveUsedPct']) {
    assert.equal(d[k], null, k)
  }
})

// ── 交叉校验 ────────────────────────────────────────────────────────────
test('crossCheck: df 与 probe 的硬可用在同一量级内', () => {
  const d = deriveDisk({ probe: realProbe })
  assert.equal(crossCheck(d, { availBytes: 34 * GIB }).ok, true)      // df -h 只到 1Gi 粒度
  assert.equal(crossCheck(d, { availBytes: 20 * GIB }).ok, false)     // 差 14 GiB ⇒ 降级
  assert.equal(crossCheck(d, {}).skipped, true)                       // 缺输入不是失败
})

// ── 告警判定 ────────────────────────────────────────────────────────────
const healthy = deriveDisk({ probe: realProbe })   // 34.1 GiB 硬可用 / 51.6 GiB 可清除

test('judgeDiskAlert: 今日实测状态不该告警（这正是旧 85% 规则误报的形态）', () => {
  const j = judgeDiskAlert({ snap: healthy, cfg: {} })
  assert.equal(j.level, 'ok')
  assert.deepEqual(j.reasons, [])
  // 负向对照：旧规则会响（含可清除口径 93% ≥ 85%），新规则不响
  assert.ok(healthy.hardUsedPct >= 85, '旧阈值在本机会命中')
})

test('judgeDiskAlert: 硬可用见底 ⇒ critical', () => {
  const j = judgeDiskAlert({ snap: { ...healthy, availableBytes: 12 * GIB }, cfg: {} })
  assert.equal(j.level, 'critical')
  assert.deepEqual(j.reasons, ['no-headroom'])
  assert.equal(j.levelRank, DISK_LEVEL_RANK.critical)
})

test('judgeDiskAlert: 可清除见底且硬可用不高 ⇒ warn；硬可用够高则不报', () => {
  const drained = judgeDiskAlert({ snap: { ...healthy, availableBytes: 25 * GIB, purgeableBytes: 1 * GIB }, cfg: {} })
  assert.equal(drained.level, 'warn')
  assert.deepEqual(drained.reasons, ['purge-buffer-drained'])

  const roomy = judgeDiskAlert({ snap: { ...healthy, availableBytes: 40 * GIB, purgeableBytes: 1 * GIB }, cfg: {} })
  assert.equal(roomy.level, 'ok')
})

test('judgeDiskAlert: 阈值可配（家庭配置能放宽/收紧）', () => {
  const snap = { ...healthy, availableBytes: 20 * GIB }
  assert.equal(judgeDiskAlert({ snap, cfg: { hardFreeGb: 15 } }).level, 'ok')
  assert.equal(judgeDiskAlert({ snap, cfg: { hardFreeGb: 25 } }).level, 'critical')
})

test('judgeDiskAlert: 负向控制——百分比好看但硬可用见底，仍必须告警', () => {
  // effectiveUsedPct 只有 60%（"看着不满"），但硬可用 8 GiB
  const snap = { ...healthy, availableBytes: 8 * GIB, effectiveBytes: 0.4 * healthy.totalBytes, effectiveUsedPct: 60 }
  const j = judgeDiskAlert({ snap, cfg: {} })
  assert.equal(j.level, 'critical')
  assert.ok(!j.reasons.includes('hard-used-pct'))
})

test('judgeDiskAlert: deprecated pctCeiling 只看硬占用，不看含可清除口径', () => {
  // 硬占用 92.6%、有效占用 81.4%：显式配 85 时命中（因为硬占用），配 95 时不命中
  assert.deepEqual(judgeDiskAlert({ snap: healthy, cfg: { pctCeiling: 85 } }).reasons, ['hard-used-pct'])
  assert.equal(judgeDiskAlert({ snap: healthy, cfg: { pctCeiling: 95 } }).level, 'ok')
})

test('judgeDiskAlert: 趋势外推 3 天内见底 ⇒ warn', () => {
  const trend = { hours: 24, refBytes: 40 * GIB, deltaBytes: -6 * GIB, perDayBytes: -6 * GIB, daysToFloor: 2.5 }
  const j = judgeDiskAlert({ snap: healthy, cfg: {}, trend })
  assert.equal(j.level, 'warn')
  assert.deepEqual(j.reasons, ['projected-full'])
})

test('judgeDiskAlert: 无数据 ⇒ unknown（不是 ok）', () => {
  const j = judgeDiskAlert({ snap: { availableBytes: null }, cfg: {} })
  assert.equal(j.level, 'unknown')
  assert.equal(j.levelRank, 0)
})

// ── 冷却与升级 ──────────────────────────────────────────────────────────
const T0 = 1_700_000_000_000
const warnJ = { level: 'warn', reasons: ['purge-buffer-drained'], levelRank: 1 }
const critJ = { level: 'critical', reasons: ['no-headroom'], levelRank: 2 }
const okJ = { level: 'ok', reasons: [], levelRank: 0 }

test('decideAlert: 首次告警发出，冷却窗口内同级不重复', () => {
  const s1 = decideAlert({}, warnJ, healthy, {}, T0)
  assert.equal(s1.emit, true)
  const s2 = decideAlert(s1.next, warnJ, healthy, {}, T0 + 60_000)
  assert.equal(s2.emit, false)
  assert.equal(s2.next.lastAlertAt, T0)
})

test('decideAlert: 等级升高或硬可用又少 5 GiB ⇒ 冷却内也升级推送', () => {
  const s1 = decideAlert({}, warnJ, healthy, {}, T0)
  const up = decideAlert(s1.next, critJ, { ...healthy, availableBytes: 10 * GIB }, {}, T0 + 60_000)
  assert.equal(up.emit, true)
  assert.equal(up.escalated, true)

  const worse = decideAlert(s1.next, warnJ, { ...healthy, availableBytes: healthy.availableBytes - 6 * GIB }, {}, T0 + 60_000)
  assert.equal(worse.emit, true)
})

test('decideAlert: 回到 ok 清状态（否则恢复后再恶化会被旧冷却吞掉）', () => {
  const s1 = decideAlert({}, critJ, healthy, {}, T0)
  const back = decideAlert(s1.next, okJ, healthy, {}, T0 + 120_000)
  assert.equal(back.emit, false)
  assert.equal(back.next.lastAlertAt, 0)
  assert.equal(back.next.lastLevelRank, 0)
  const again = decideAlert(back.next, critJ, healthy, {}, T0 + 180_000)
  assert.equal(again.emit, true)
})

// ── 趋势 ────────────────────────────────────────────────────────────────
test('diskTrendFromFree: 24h 少 6 GiB ⇒ 到 15 GiB 地板约 3.2 天', () => {
  const now = T0
  const samples = [{ t: now - 24 * 3600_000, availBytes: 40 * GIB }]
  const tr = diskTrendFromFree(samples, 34 * GIB, now, 15 * GIB)
  assert.equal(tr.hours, 24)
  assert.equal(tr.deltaBytes, -6 * GIB)
  assert.ok(Math.abs(tr.daysToFloor - 19 / 6) < 0.01)
})

test('diskTrendFromFree: 旧样本（无 availBytes）/ 窗口外 / 在增长 ⇒ null daysToFloor', () => {
  const now = T0
  assert.equal(diskTrendFromFree([{ t: now - 24 * 3600_000, pct: 90 }], 34 * GIB, now, 15 * GIB), null)
  assert.equal(diskTrendFromFree([{ t: now - 5 * 3600_000, availBytes: 40 * GIB }], 34 * GIB, now, 15 * GIB), null)
  const growing = diskTrendFromFree([{ t: now - 24 * 3600_000, availBytes: 30 * GIB }], 34 * GIB, now, 15 * GIB)
  assert.equal(growing.daysToFloor, null)
  assert.equal(growing.deltaBytes, 4 * GIB)
})

// ── 文案契约 ────────────────────────────────────────────────────────────
test('formatDiskAlert: 两个数都出现，且就地解释 92.6% / 81.4% 的差别', () => {
  const j = judgeDiskAlert({ snap: healthy, cfg: { pctCeiling: 85 } })
  const lines = formatDiskAlert({ snap: healthy, judgement: j })
  const text = lines.join('\n')
  assert.match(text, /硬可用 34\.1 GiB/)
  assert.match(text, /可清除 51\.6 GiB/)
  assert.match(text, /已用 81\.4%/)
  assert.doesNotMatch(text, /undefined|NaN|null/)
})

test('formatDiskAlert: 见底告警给下一步；趋势行用 GiB 而非 pp', () => {
  const snap = { ...healthy, availableBytes: 12 * GIB }
  const j = judgeDiskAlert({ snap, cfg: {} })
  const text = formatDiskAlert({
    snap, judgement: j,
    trend: { hours: 24, refBytes: 20 * GIB, deltaBytes: -8 * GIB, perDayBytes: -8 * GIB, daysToFloor: 0.4 },
  }).join('\n')
  assert.match(text, /磁盘余量见底/)
  assert.match(text, /24 小时 −8\.0 GiB/)
  assert.match(text, /tmutil listlocalsnapshots/)
})

test('parseLocalSnapshots：真实 tmutil 输出 → 计数 + 最新一条', () => {
  const text = [
    'Snapshots for disk /:',
    'com.apple.TimeMachine.2026-10-21-124811.local',
    'com.apple.TimeMachine.2026-10-22-054622.local',
    'com.apple.TimeMachine.2026-10-22-064618.local',
    '',
  ].join('\n')
  const r = parseLocalSnapshots(text)
  assert.equal(r.count, 3)
  // 最新 = 时间戳最大那条，不是"最后一行"（顺序不保证）
  assert.equal(r.latestName, 'com.apple.TimeMachine.2026-10-22-064618.local')
  assert.ok(Number.isFinite(Date.parse(r.latestAt)), 'latestAt 必须是可解析的 ISO')
})

test('parseLocalSnapshots：乱序输入也取时间最大的一条（负向控制：不许按行序取）', () => {
  const text = [
    'com.apple.TimeMachine.2026-10-22-064618.local',
    'com.apple.TimeMachine.2026-10-21-124811.local',
  ].join('\n')
  const r = parseLocalSnapshots(text)
  assert.equal(r.count, 2)
  assert.equal(r.latestName, 'com.apple.TimeMachine.2026-10-22-064618.local')
})

test('parseLocalSnapshots：无法识别 ⇒ count=0（"确实没有"），不是 null（"没跑成"）', () => {
  for (const bad of ['', 'Snapshots for disk /:', 'garbage', null, undefined]) {
    const r = parseLocalSnapshots(bad)
    assert.equal(r.count, 0, `输入 ${JSON.stringify(bad)} 必须得 0`)
    assert.equal(r.latestAt, null)
  }
})

test('parseLocalSnapshots：时间差按本地时间解释（跨日不乱）', () => {
  const r1 = parseLocalSnapshots('com.apple.TimeMachine.2026-10-21-234500.local')
  const r2 = parseLocalSnapshots('com.apple.TimeMachine.2026-10-22-003500.local')
  const d = Date.parse(r2.latestAt) - Date.parse(r1.latestAt)
  assert.equal(d, 50 * 60_000, '23:45 → 次日 00:35 应正好 50 分钟')
})
