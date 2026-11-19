import test from 'node:test'
import assert from 'node:assert/strict'
import { GROUP_ORDER, groupOf, groupWidgets, FALLBACK_GROUP } from '../lib/groups.mjs'

test('已登记的内置卡落进对的段（抽查每段一张）', () => {
  assert.equal(groupOf({ id: 'host-restart', type: 'host' }), 'status')
  assert.equal(groupOf({ id: 'los-nodes', type: 'matrix' }), 'fleet')
  assert.equal(groupOf({ id: 'ai-quota', type: 'quota' }), 'cost')
  assert.equal(groupOf({ id: 'mbp-disk', type: 'disk' }), 'local')
  assert.equal(groupOf({ id: 'feed-digests', type: 'feed' }), 'input')
})

test('未知 id 按类型兜底（用户手写 store 里的自定义卡）', () => {
  assert.equal(groupOf({ id: 'my-own-card', type: 'matrix' }), 'fleet')
  assert.equal(groupOf({ id: 'my-own-card', type: 'disk' }), 'local')
})

test('连类型都不认识时落到兜底段（宁可混一段，也不凭空消失）', () => {
  assert.equal(groupOf({ id: 'x', type: 'unknown-type' }), FALLBACK_GROUP)
  assert.equal(groupOf({}), FALLBACK_GROUP)
  assert.equal(groupOf(null), FALLBACK_GROUP)
})

test('分组：段顺序固定、段内保持配置顺序、空段不返回', () => {
  const widgets = [
    { id: 'ai-quota', type: 'quota' },
    { id: 'host-restart', type: 'host' },
    { id: 'los-nodes', type: 'matrix' },
    { id: 'mbp-disk', type: 'disk' },
    { id: 'los-usage', type: 'stat' },
  ]
  const groups = groupWidgets(widgets)
  assert.deepEqual(groups.map((g) => g.key), ['status', 'fleet', 'cost', 'local'])
  // 段内顺序 = 传入顺序（ai-quota 在 los-usage 之前）
  assert.deepEqual(groups.find((g) => g.key === 'cost').items.map((w) => w.id), ['ai-quota', 'los-usage'])
  // 空段（input）不出现
  assert.equal(groups.some((g) => g.key === 'input'), false)
})

test('分组不丢卡：各段条目数之和等于输入长度', () => {
  const widgets = Array.from({ length: 25 }, (_, i) => ({
    id: i % 2 === 0 ? `known-${i}` : `unknown-${i}`,
    type: ['host', 'matrix', 'stat', 'disk', 'feed'][i % 5],
  }))
  const groups = groupWidgets(widgets)
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  assert.equal(total, 25)
  // 每个段 key 都在白名单里，且顺序与 GROUP_ORDER 一致
  const keys = groups.map((g) => g.key)
  assert.deepEqual(keys, GROUP_ORDER.filter((k) => keys.includes(k)))
})

test('非数组输入不炸（配置读坏时的防守）', () => {
  assert.deepEqual(groupWidgets(null), [])
  assert.deepEqual(groupWidgets(undefined), [])
  assert.deepEqual(groupWidgets({}), [])
})
