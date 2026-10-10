/**
 * dsh-dashboards — 登录态过期降级（lib/quota-degrade.mjs）单元测试。
 *
 * 核心断言是**不许把"真没登录"伪装成"数据过期"**：只有确实在近期读到过真实
 * 数据时才降级，否则必须原样报 auth。这条是 2026-10-10「需登录：kimi login」
 * 反复假警报的成因反面，故用负向控制锁住。
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  degradeAuthChannels, formatReadingAge, AXI_DEGRADE_MAX_AGE_MS,
} from '../lib/quota-degrade.mjs'

const HOUR = 3600_000
const NOW = 1_800_000_000_000
const HINTS = { kimi: 'kimi login', grok: 'grok login --oauth' }

const liveKimi = (at = NOW) => ({
  id: 'kimi', label: 'Kimi', health: 'live', updatedAt: new Date(at).toISOString(),
  windows: [{ scope: 'week', label: 'week', usedPercent: 12 }],
})
const authKimi = () => ({ id: 'kimi', label: 'Kimi', health: 'auth', windows: [], updatedAt: null })

test('degradeAuthChannels: auth + 近期有真实读数 → 降级为 stale 并保留数据', () => {
  const lastGood = new Map([['kimi', { channel: liveKimi(NOW - 2 * HOUR), at: NOW - 2 * HOUR }]])
  const { channels } = degradeAuthChannels([authKimi()], lastGood, NOW, HINTS)
  assert.equal(channels[0].health, 'stale')
  assert.equal(channels[0].windows.length, 1, '必须保留上次的真实窗口数据')
  assert.equal(channels[0].windows[0].usedPercent, 12)
  assert.match(channels[0].note, /2 小时前/)
  assert.match(channels[0].note, /kimi login/, '恢复命令不能丢')
})

test('degradeAuthChannels: auth 但从未读到过 → 原样报 auth（不许伪装成数据过期）', () => {
  const { channels } = degradeAuthChannels([authKimi()], new Map(), NOW, HINTS)
  assert.equal(channels[0].health, 'auth', '没有真实读数就必须老实报需登录')
  assert.equal(channels[0].note, undefined)
})

test('degradeAuthChannels: 读数超过封顶年龄 → 原样报 auth', () => {
  const old = NOW - AXI_DEGRADE_MAX_AGE_MS - 1
  const lastGood = new Map([['kimi', { channel: liveKimi(old), at: old }]])
  const { channels } = degradeAuthChannels([authKimi()], lastGood, NOW, HINTS)
  assert.equal(channels[0].health, 'auth')
})

test('degradeAuthChannels: 恰好等于封顶年龄 → 仍可降级（边界闭区间）', () => {
  const edge = NOW - AXI_DEGRADE_MAX_AGE_MS
  const lastGood = new Map([['kimi', { channel: liveKimi(edge), at: edge }]])
  const { channels } = degradeAuthChannels([authKimi()], lastGood, NOW, HINTS)
  assert.equal(channels[0].health, 'stale')
})

test('degradeAuthChannels: live 渠道被记为"最近良好"，供下一轮降级复用', () => {
  const { lastGood } = degradeAuthChannels([liveKimi()], new Map(), NOW, HINTS)
  assert.ok(lastGood.has('kimi'))
  assert.equal(lastGood.get('kimi').at, NOW)
  // 下一轮 kimi 转 auth ⇒ 用上一轮的数据降级
  const next = degradeAuthChannels([authKimi()], lastGood, NOW + 5 * 60_000, HINTS)
  assert.equal(next.channels[0].health, 'stale')
  assert.match(next.channels[0].note, /5 分钟前/)
})

test('degradeAuthChannels: 无可用读数的渠道（空 windows / amount=null）不进"最近良好"', () => {
  const empty = { id: 'cursor', health: 'live', windows: [], amount: null }
  const { lastGood } = degradeAuthChannels([empty], new Map(), NOW, HINTS)
  assert.equal(lastGood.has('cursor'), false, '空读数若被记下，下一轮会降级出一张空卡片')
})

test('degradeAuthChannels: 余额型（amount）也算可用读数', () => {
  const bal = { id: 'deepseek', health: 'live', windows: [], amount: 350.32 }
  const { lastGood } = degradeAuthChannels([bal], new Map(), NOW, HINTS)
  assert.ok(lastGood.has('deepseek'))
})

test('degradeAuthChannels: 纯函数——不修改传入的 lastGood，返回新 Map', () => {
  const lastGood = new Map([['kimi', { channel: liveKimi(NOW - HOUR), at: NOW - HOUR }]])
  const out = degradeAuthChannels([liveKimi()], lastGood, NOW, HINTS)
  assert.notEqual(out.lastGood, lastGood, '必须返回新 Map 引用')
  assert.equal(lastGood.size, 1)
  assert.equal(lastGood.get('kimi').at, NOW - HOUR, '入参 Map 不得被就地改写')
})

test('degradeAuthChannels: 防御——null / 非数组 / 非对象条目不抛错', () => {
  assert.deepEqual(degradeAuthChannels(null, null, NOW).channels, [])
  assert.deepEqual(degradeAuthChannels(undefined, undefined, NOW).channels, [])
  assert.deepEqual(degradeAuthChannels([null, 42], new Map(), NOW).channels, [null, 42])
})

test('formatReadingAge: 分钟 / 小时 / 天 三档', () => {
  assert.equal(formatReadingAge(20_000), '0 分钟') // 20s ⇒ 0.33min
  assert.equal(formatReadingAge(45 * 60_000), '45 分钟')
  assert.equal(formatReadingAge(3 * HOUR), '3 小时')
  assert.equal(formatReadingAge(50 * HOUR), '2 天')
})
