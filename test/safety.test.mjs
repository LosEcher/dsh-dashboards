/**
 * dsh-dashboards — lib/safety.mjs 单元测试（2026-09-19 借鉴 Infomarchy 第一批加固）。
 *
 * 每个能力按 Infomarchy 的四路用例矩阵取样本：
 *   成功 / 数据不可用（缺失） / 过期窗口（陈旧、回退） / 畸形数据
 *
 * 运行：node --test test/safety.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PLAUSIBLE_MIN_MS, MIN_RATE_DT_MS, SNAPSHOT_VERSION, EGRESS_FEATURES,
  plausibleTimestamp, filterPlausible, publishNetSample,
  readJsonEnvelope, writeJsonAtomic, saveEnvelopeReplace,
  capList, capText, cacheStampMatches, egressEnabled, egressInventory,
} from '../lib/safety.mjs'

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0) // 2026-09-19T12:00:00Z
const tmp = () => mkdtempSync(join(tmpdir(), 'dsh-dash-safety-'))

// ─────────────────────────────────────────────────────── plausibleTimestamp

test('plausibleTimestamp: 正常时间（刚过去 / 现在 / 容差内的未来）通过', () => {
  assert.equal(plausibleTimestamp(NOW - 1000, NOW), true)
  assert.equal(plausibleTimestamp(NOW, NOW), true)
  assert.equal(plausibleTimestamp(NOW + 59_000, NOW), true) // 容差内
  assert.equal(plausibleTimestamp(NOW + 60_000, NOW), true) // 边界含
})

test('plausibleTimestamp: 2099 年 / 未来超容差 / 1970 前被拒（Infomarchy 的 2099 事故）', () => {
  assert.equal(plausibleTimestamp(Date.UTC(2099, 0, 1), NOW), false)
  assert.equal(plausibleTimestamp(NOW + 60_001, NOW), false)
  assert.equal(plausibleTimestamp(PLAUSIBLE_MIN_MS - 1, NOW), false)
  assert.equal(plausibleTimestamp(0, NOW), false)
  assert.equal(plausibleTimestamp(-1, NOW), false)
})

test('plausibleTimestamp: 畸形输入（非数字 / NaN / null / 字符串垃圾 / 对象）一律拒绝', () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, 'not-a-date', {}, [], true]) {
    assert.equal(plausibleTimestamp(bad, NOW), false, `${String(bad)} 应被拒`)
  }
  // 数字字符串是合法输入（JSONL 里常见）
  assert.equal(plausibleTimestamp(String(NOW), NOW), true)
})

test('filterPlausible: 丢弃计数可见（不静默）', () => {
  const rows = [{ t: NOW }, { t: Date.UTC(2099, 0, 1) }, { t: null }, { t: NOW - 5000 }]
  const { kept, dropped, total } = filterPlausible(rows, (r) => r.t, NOW)
  assert.equal(total, 4)
  assert.equal(kept.length, 2)
  assert.equal(dropped, 2)
})

// ──────────────────────────────────────────────────────── publishNetSample

const ifaces = (i, o) => ({ en0: { ibytes: i, obytes: o } })

test('publishNetSample: 首次采样只建基线，不出速率', () => {
  const r = publishNetSample(null, ifaces(1000, 500), NOW)
  assert.equal(r.rate, null)
  assert.equal(r.reason, 'baseline')
  assert.deepEqual(r.next, { at: NOW, ifaces: ifaces(1000, 500) })
})

test('publishNetSample: 正常间隔算出速率', () => {
  const prev = { at: NOW, ifaces: ifaces(1000, 500) }
  const r = publishNetSample(prev, ifaces(4000, 1500), NOW + 30_000)
  assert.equal(r.reason, 'ok')
  assert.equal(r.rate.inBps, 100)   // (4000-1000)/30s
  assert.equal(r.rate.outBps, 33)   // (1500-500)/30s = 33.33 → 33
  assert.equal(r.rate.dtMs, 30_000)
})

test('publishNetSample: dt 过小不出速率（防 差值/极小dt 的假尖峰）', () => {
  const prev = { at: NOW, ifaces: ifaces(1000, 500) }
  const r = publishNetSample(prev, ifaces(2000, 600), NOW + MIN_RATE_DT_MS - 1)
  assert.equal(r.rate, null)
  assert.equal(r.reason, 'too-soon')
  // 但基线要前进，下一拍才能用正常 dt 继续
  assert.equal(r.next.at, NOW + MIN_RATE_DT_MS - 1)
})

test('publishNetSample: 过期发布被拒且不改基线（超时重叠的两拍交叉完成）', () => {
  // B 拍（样本 t+30）先落地成为基线；A 拍（样本 t+0，超时后姗姗来迟）不得覆盖它，
  // 否则基线=「旧样本+新时刻」，下一拍会虚高（Infomarchy 同款事故）。
  const prev = { at: NOW + 30_000, ifaces: ifaces(4000, 1500) }
  const r = publishNetSample(prev, ifaces(1000, 500), NOW)
  assert.equal(r.rate, null)
  assert.equal(r.reason, 'stale-sample')
  assert.deepEqual(r.next, prev) // 基线原封不动
  // 同一时刻重复发布同样被拒（幂等）
  assert.equal(publishNetSample(prev, ifaces(4000, 1500), NOW + 30_000).reason, 'stale-sample')
})

test('publishNetSample: 计数器回绕/接口重置不产出负值（该接口本轮计 0）', () => {
  const prev = { at: NOW, ifaces: ifaces(9000, 9000) }
  const r = publishNetSample(prev, ifaces(10, 10), NOW + 30_000)
  assert.equal(r.reason, 'ok')
  assert.equal(r.rate.inBps, 0)
  assert.equal(r.rate.outBps, 0)
})

test('publishNetSample: 新接口加入 / 旧接口消失都不影响其它接口求和', () => {
  const prev = { at: NOW, ifaces: { en0: { ibytes: 0, obytes: 0 } } }
  const cur = { en0: { ibytes: 300, obytes: 0 }, en1: { ibytes: 9999, obytes: 9999 } }
  const r = publishNetSample(prev, cur, NOW + 10_000)
  assert.equal(r.rate.inBps, 30) // 只算 en0（en1 无基线）
  // 下一拍 en1 有了基线，两个都算
  const r2 = publishNetSample(r.next, { en0: { ibytes: 600, obytes: 0 }, en1: { ibytes: 19999, obytes: 9999 } }, NOW + 20_000)
  assert.equal(r2.rate.inBps, 1030) // (300 + 10000)/10s
})

test('publishNetSample: 畸形样本时间（NaN/null）与畸形 ifaces 不抛错', () => {
  assert.equal(publishNetSample({ at: NOW, ifaces: {} }, {}, Number.NaN).reason, 'bad-sample-time')
  assert.equal(publishNetSample(null, null, null).reason, 'bad-sample-time')
  const r = publishNetSample({ at: NOW, ifaces: ifaces(0, 0) }, null, NOW + 5000)
  assert.equal(r.reason, 'ok')
  assert.equal(r.rate.inBps, 0)
})

// ─────────────────────────────────────────────── 原子写 + revision 防丢更新

test('readJsonEnvelope: 缺失 / 畸形 / 裸数组三种历史形态都安全', () => {
  const dir = tmp()
  try {
    const missing = readJsonEnvelope(join(dir, 'nope.json'), 'widgets')
    assert.equal(missing.exists, false)
    assert.equal(missing.revision, 0)

    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{ this is not json')
    assert.equal(readJsonEnvelope(bad, 'widgets').exists, false)

    const legacy = join(dir, 'legacy.json')
    writeFileSync(legacy, JSON.stringify([{ id: 'a' }]))
    const env = readJsonEnvelope(legacy, 'widgets')
    assert.equal(env.exists, true)
    assert.equal(env.revision, 0)
    assert.equal(env.items.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('writeJsonAtomic: 原子替换、权限 0600、不留临时文件', () => {
  const dir = tmp()
  try {
    const f = join(dir, 'sub', 'store.json')
    assert.equal(writeJsonAtomic(f, { revision: 1, widgets: [{ id: 'a' }] }), true)
    assert.equal(JSON.parse(readFileSync(f, 'utf8')).revision, 1)
    assert.equal(statSync(f).mode & 0o777, 0o600)
    // 覆盖写不残留 tmp
    assert.equal(writeJsonAtomic(f, { revision: 2, widgets: [] }), true)
    assert.deepEqual(readdirSync(join(dir, 'sub')), ['store.json'])
    // 字符串原样写入（jsonl 压缩场景）
    assert.equal(writeJsonAtomic(f, 'a\nb\n'), true)
    assert.equal(readFileSync(f, 'utf8'), 'a\nb\n')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('saveEnvelopeReplace: 成功递增 revision，无期望值时保持最后写入者获胜', () => {
  const dir = tmp()
  try {
    const f = join(dir, 'widgets.json')
    const r1 = saveEnvelopeReplace(f, 'widgets', [{ id: 'a' }], null)
    assert.equal(r1.ok, true)
    assert.equal(r1.revision, 1)
    const r2 = saveEnvelopeReplace(f, 'widgets', [{ id: 'b' }], null)
    assert.equal(r2.revision, 2)
    assert.deepEqual(readJsonEnvelope(f, 'widgets').items, [{ id: 'b' }])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('saveEnvelopeReplace: revision 匹配才写；不匹配 ⇒ 冲突且不落盘（这是防丢更新的关键）', () => {
  const dir = tmp()
  try {
    const f = join(dir, 'p.json')
    saveEnvelopeReplace(f, 'targets', [{ name: 'x' }], null)      // rev 1
    const good = saveEnvelopeReplace(f, 'targets', [{ name: 'y' }], 1)
    assert.equal(good.ok, true)
    assert.equal(good.revision, 2)

    // 另一写者仍持 rev 1（陈旧）→ 冲突，且磁盘保持 y
    const stale = saveEnvelopeReplace(f, 'targets', [{ name: 'z' }], 1)
    assert.equal(stale.ok, false)
    assert.equal(stale.conflict, true)
    assert.equal(stale.currentRevision, 2)
    assert.deepEqual(stale.items, [{ name: 'y' }])
    assert.deepEqual(readJsonEnvelope(f, 'targets').items, [{ name: 'y' }])

    // 畸形 revision（非整数）按冲突处理，不放行
    for (const bad of ['abc', 1.5, -1, {}]) {
      const r = saveEnvelopeReplace(f, 'targets', [{ name: 'w' }], bad)
      assert.equal(r.conflict, true, `revision=${String(bad)} 应冲突`)
    }
    // 空文件 + rev 0 = 合法的首次写
    const g = join(dir, 'fresh.json')
    assert.equal(saveEnvelopeReplace(g, 'targets', [{ name: 'a' }], 0).ok, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('saveEnvelopeReplace: 写盘失败回 ok:false 而不是假装成功', () => {
  const dir = tmp()
  try {
    // 目标路径的父级是文件 ⇒ mkdir/rename 必失败
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'x')
    const r = saveEnvelopeReplace(join(blocker, 'nested', 'p.json'), 'targets', [{ name: 'a' }], null)
    assert.equal(r.ok, false)
    assert.equal(r.error, 'write-failed')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ────────────────────────────────────────────────────────────── 截断上报

test('capList: 未超限 / 恰好等于上限 / 超限 三态，truncated 只在真截断时为真', () => {
  assert.deepEqual(capList([1, 2], 5), { items: [1, 2], available: 2, truncated: false })
  assert.deepEqual(capList([1, 2, 3], 3), { items: [1, 2, 3], available: 3, truncated: false })
  const over = capList([1, 2, 3, 4, 5], 3)
  assert.deepEqual(over.items, [1, 2, 3])
  assert.equal(over.available, 5)   // 截断前真实条数：看板能显示「3/5」
  assert.equal(over.truncated, true)
  // 畸形输入不抛
  const bad = capList(null, 3)
  assert.deepEqual(bad, { items: [], available: 0, truncated: false })
})

test('capText: 报出原始字数（不是静默 slice）', () => {
  assert.deepEqual(capText('abc', 10), { text: 'abc', totalChars: 3, truncated: false })
  const c = capText('abcdef', 2)
  assert.equal(c.text, 'ab')
  assert.equal(c.totalChars, 6)
  assert.equal(c.truncated, true)
  assert.equal(capText(null, 3).totalChars, 0)
})

test('cacheStampMatches: 版本/指纹双校验（形状升级后旧缓存必须失效）', () => {
  assert.equal(cacheStampMatches({ v: SNAPSHOT_VERSION }, { version: SNAPSHOT_VERSION }), true)
  assert.equal(cacheStampMatches({ v: SNAPSHOT_VERSION - 1 }, { version: SNAPSHOT_VERSION }), false)
  assert.equal(cacheStampMatches({ v: SNAPSHOT_VERSION, fingerprint: 'a' }, { version: SNAPSHOT_VERSION, fingerprint: 'b' }), false)
  assert.equal(cacheStampMatches({ v: SNAPSHOT_VERSION, fingerprint: 'a' }, { version: SNAPSHOT_VERSION, fingerprint: 'a' }), true)
  assert.equal(cacheStampMatches(null, { version: SNAPSHOT_VERSION }), false)
})

// ────────────────────────────────────────────────────────── 出网清单/开关

test('egressEnabled: 缺省放行；显式 false 关闭；未登记 id 不影响已登记项', () => {
  assert.equal(egressEnabled({}, 'los'), true)
  assert.equal(egressEnabled({ egress: {} }, 'los'), true)
  assert.equal(egressEnabled({ egress: { los: true } }, 'los'), true)
  assert.equal(egressEnabled({ egress: { los: false } }, 'los'), false)
  // 只关一项，其余不受影响
  const cfg = { egress: { los: false } }
  assert.equal(egressEnabled(cfg, 'probe'), true)
})

test('egressInventory: 清单条目齐全（出网清单是唯一真源，不得有调用点漏登记）', () => {
  const ids = EGRESS_FEATURES.map((f) => f.id).sort()
  assert.deepEqual(ids, ['diskAlert', 'glances', 'grokRefresh', 'kuma', 'los', 'probe', 'quotaApis', 'quotaAxi', 'z4pro'])
  for (const f of EGRESS_FEATURES) {
    assert.ok(f.label && f.target && f.purpose && f.auth, `${f.id} 缺说明字段`)
  }
  const inv = egressInventory({ egress: { kuma: false, diskAlert: false } })
  assert.equal(inv.length, EGRESS_FEATURES.length)
  assert.deepEqual(inv.filter((f) => !f.enabled).map((f) => f.id).sort(), ['diskAlert', 'kuma'])
})
