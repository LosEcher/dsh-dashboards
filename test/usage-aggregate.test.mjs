/**
 * dsh-usage-aggregate.py 定价与语义自测：构造 zstd 压缩的 DSH session fixture，
 * 断言 token 聚合与 CNY/USD 成本（含峰谷/周末/汇率）。
 *
 * 运行：node --test test/usage-aggregate.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/dsh-usage-aggregate.py', import.meta.url))

/** Encode one event line (epoch ms timestamps). */
const line = (obj) => JSON.stringify(obj)

function makeFixture(sessions) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-usage-test-'))
  for (const [name, events] of Object.entries(sessions)) {
    const dir = join(root, 'ws', name)
    mkdirSync(dir, { recursive: true })
    const payload = events.map(line).join('\n') + '\n'
    const zstd = execFileSync('python3', ['-c', `
import sys, zstandard
sys.stdout.buffer.write(zstandard.ZstdCompressor().compress(sys.stdin.buffer.read()))
`], { input: payload, maxBuffer: 1 << 20 })
    writeFileSync(join(dir, 'session.jsonl.zstd'), zstd)
  }
  return root
}

function run(root) {
  const out = execFileSync('python3', [SCRIPT, '--sessions-root', root], { maxBuffer: 1 << 20 })
  return JSON.parse(out.toString())
}

test('aggregate prices DeepSeek usage with peak/off-peak, weekend and CNY conversion', () => {
  const s = (ts, input, cacheRead, output) => [
    { type: 'request/header', time: ts, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } } },
    { type: 'assistant/message', time: ts, data: { usage: { inputTokens: input, cacheReadTokens: cacheRead, outputTokens: output } } },
  ]
  const root = makeFixture({
    // 2026-08-17 Mon 23:00 Beijing — weekday off-peak
    a: s(1787036400000, 100_000, 800_000, 50_000),
    // 2026-08-17 Mon 10:00 Beijing — weekday peak (x2)
    b: s(1787004000000, 100_000, 800_000, 50_000),
    // 2026-08-22 Sat 10:00 Beijing — weekend BEFORE flat rule (8/23): still peak
    c: s(1787378400000, 100_000, 800_000, 50_000),
    // 2026-08-23 Sun 10:00 Beijing — weekend AFTER flat rule: off-peak
    d: s(1787464800000, 100_000, 800_000, 50_000),
  })
  try {
    const d = run(root)
    const t = d.totals
    assert.equal(t.modelResponseCount, 4)
    // prompt = net cache-miss input (no double subtraction)
    assert.equal(t.promptTokens, 400_000)
    assert.equal(t.cacheReadTokens, 3_200_000)
    assert.equal(t.completionTokens, 200_000)
    assert.equal(t.totalTokens, 3_800_000)
    // One event off-peak (x1), two peak (x2), one weekend-flat (x1):
    // per event base CNY = 0.1M*1.5 + 0.8M*0.05 + 0.05M*4.5 = 0.15+0.04+0.225 = 0.415
    // total CNY = 0.415 * (1 + 2 + 2 + 1) = 2.49
    assert.ok(Math.abs(t.estimatedCostCny - 2.49) < 0.001, `cny=${t.estimatedCostCny}`)
    assert.ok(Math.abs(t.estimatedCostUsd - 2.49 / 6.8) < 0.001, `usd=${t.estimatedCostUsd}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('aggregate skips unpriced routes but still counts tokens', () => {
  const ts = 1787036400000
  const root = makeFixture({
    x: [
      { type: 'request/header', time: ts, data: { header: { config: { provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free' } } } },
      { type: 'assistant/message', time: ts, data: { usage: { inputTokens: 1000, cacheReadTokens: 0, outputTokens: 500 } } },
    ],
  })
  try {
    const d = run(root)
    const t = d.totals
    assert.equal(t.modelResponseCount, 1)
    assert.equal(t.totalTokens, 1500)
    assert.equal(t.costUnknownCount, 1)
    assert.equal(t.estimatedCostUsd, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
