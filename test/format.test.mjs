/**
 * dsh-dashboards — 显示词表（lib/format.mjs）单元测试。
 *
 * 这里的断言**就是规格**：V1 新鲜度词化、V2 缺值与 0 分离、V5 空不等于通过。
 * 每条正向断言旁边尽量配一条"故意做错必须红"的负向控制 —— 例如把未来时间当负时长、
 * 把 checks:0 当 ok、把缺值当 0。没有负向控制的判据在本项目不算落地。
 *
 * 运行：node --test test/format.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ago, dash, pct, bytes, level, coverage, freshness, splitAge, VOCAB,
} from '../lib/format.mjs'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const NOW = 1_800_000_000_000

// ---------------------------------------------------------------- V1 新鲜度

test('ago: 没有时间戳 ⇒ 从未（不是 —，也不是 0）', () => {
  assert.equal(ago(null, NOW), '从未')
  assert.equal(ago(undefined, NOW), '从未')
  // 负向控制：null 不许被 Number() 变成 0 而显示"很久以前"
  assert.notEqual(ago(null, NOW), ago(0, NOW))
})

test('ago: 不足一分钟 ⇒ 刚刚', () => {
  assert.equal(ago(NOW - 20_000, NOW), '刚刚')
  assert.equal(ago(NOW, NOW), '刚刚')
})

test('ago: 未来时间夹到 0（绝不出现负时长）', () => {
  const out = ago(NOW + 5 * MINUTE, NOW)
  assert.equal(out, '刚刚')
  // 负向控制：任何输出里都不许出现减号
  assert.ok(!out.includes('-'), `未来时间渲染出了负号: ${out}`)
})

test('ago: 分钟 / 小时 / 天 三档', () => {
  assert.equal(ago(NOW - 90_000, NOW), '2 分钟前') // 1.5min ⇒ round 2
  assert.equal(ago(NOW - 45 * MINUTE, NOW), '45 分钟前')
  assert.equal(ago(NOW - 3 * HOUR, NOW), '3 小时前')
  assert.equal(ago(NOW - 50 * HOUR, NOW), '2 天前')
})

test('splitAge: 与旧 formatReadingAge 的档位逐档一致（委托后文案零变化）', () => {
  assert.deepEqual(splitAge(20_000), { n: 0, unit: '分钟' })
  assert.deepEqual(splitAge(45 * MINUTE), { n: 45, unit: '分钟' })
  assert.deepEqual(splitAge(3 * HOUR), { n: 3, unit: '小时' })
  assert.deepEqual(splitAge(50 * HOUR), { n: 2, unit: '天' })
  assert.deepEqual(splitAge(null), { n: null, unit: null })
})

// ------------------------------------------------------------ V2 缺值 vs 0

test('dash: null/NaN ⇒ —，0 ⇒ "0"（两者必须长得不一样）', () => {
  assert.equal(dash(null), '—')
  assert.equal(dash(undefined), '—')
  assert.equal(dash(Number.NaN), '—')
  assert.equal(dash(Number.POSITIVE_INFINITY), '—')
  assert.equal(dash(0), '0')
  // 负向控制：本用例的核心就是这两串**绝不能相等**
  assert.notEqual(dash(null), dash(0))
})

test('dash: 字符串走原样（工具输出/枚举），空串仍算缺值', () => {
  assert.equal(dash('offline'), 'offline')
  assert.equal(dash('   '), '—')
})

test('dash/pct: 数值格式化与单位，0 带单位也不丢', () => {
  assert.equal(dash(12.345, { digits: 1 }), '12.3')
  assert.equal(dash(0, { unit: '%' }), '0%')
  assert.equal(pct(null), '—')
  assert.equal(pct(0), '0%')
  assert.equal(pct(37.264, 1), '37.3%')
})

test('bytes: 缺值 —、0 是 "0 B"、量级换算', () => {
  assert.equal(bytes(null), '—')
  assert.equal(bytes(0), '0 B')
  assert.equal(bytes(512), '512 B')
  assert.equal(bytes(1024), '1.00 KB')
  assert.equal(bytes(1024 ** 3 * 1.5), '1.50 GB')
})

// --------------------------------------------------- V5 未知要计数 / 空≠通过

test('level: checks:0 ⇒ unknown（一条都没评估，绝不算通过）', () => {
  assert.equal(level({}), 'unknown')
  assert.equal(level({ checks: 0, errors: 0, warnings: 0 }), 'unknown')
  // 负向控制：这条断言就是防"全 na 被报成 pass"（verify-gate 2026-10-08 事故）
  assert.notEqual(level({ checks: 0 }), 'ok')
})

test('level: 未知优先于错误与警告（判不了 !== 好）', () => {
  assert.equal(level({ checks: 3, unknown: 1 }), 'unknown')
  assert.equal(level({ checks: 3, errors: 0, warnings: 2 }), 'degraded')
  assert.equal(level({ checks: 3, errors: 1 }), 'down')
  assert.equal(level({ checks: 3, errors: 0, warnings: 0 }), 'ok')
})

test('coverage: 分母未知 ⇒ unknown；有缺口 ⇒ partial 且缺口可枚举', () => {
  assert.equal(coverage({ ok: 0, total: 0 }).state, 'unknown')
  assert.equal(coverage({}).state, 'unknown')
  assert.equal(coverage({ ok: 3, total: 3 }).state, 'ok')
  const partial = coverage({ ok: 3, total: 5, gaps: ['node34', null, 'oracle-t'] })
  assert.equal(partial.state, 'partial')
  assert.equal(partial.text, '3/5')
  assert.deepEqual(partial.gaps, ['node34', 'oracle-t'], 'null 缺口要过滤掉')
})

test('coverage: ok===total 但显式给了 gaps ⇒ 仍是 partial（口径优先于算术）', () => {
  const res = coverage({ ok: 5, total: 5, gaps: ['silent'] })
  assert.equal(res.state, 'partial')
})

// ------------------------------------------------------------ 新鲜度分档

test('freshness: ok / stale / expired / unknown 四档，共用同一预算', () => {
  const budget = 5 * MINUTE
  assert.equal(freshness(null, NOW, budget), 'unknown')
  assert.equal(freshness(NOW - MINUTE, NOW, budget), 'ok')
  assert.equal(freshness(NOW - 10 * MINUTE, NOW, budget), 'stale')
  assert.equal(freshness(NOW - HOUR, NOW, budget), 'expired')
  // 负向控制：未来时间按最新处理，不落到 expired
  assert.equal(freshness(NOW + HOUR, NOW, budget), 'ok')
})

test('VOCAB: 缺值/从未/刚刚 三种"没有数"的说法彼此不同（不许合并成一个词）', () => {
  const words = [VOCAB.missing, VOCAB.never, VOCAB.justNow, VOCAB.unknown]
  assert.equal(new Set(words).size, words.length, `词表出现同义词: ${words.join(' / ')}`)
})
