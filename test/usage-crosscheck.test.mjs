/**
 * usage-crosscheck.test.mjs — 同源第二实现 `lib/usage-crosscheck.mjs` 的对账测试。
 *
 * 台账条目：`duckdb-landing:dsplugins:usage-second-implementation-crosscheck`
 *
 * 这个测试要证明三件事，缺一不可：
 *   ① **能对上**：正常语料上 verdict=agree（否则第二实现只是永远喊狼来了）
 *   ② **能红**：定价代际错一代 / 模型口径不一致 ⇒ **drift**（不是 agree、也不是 unknown）
 *   ③ **算不出来时说 unknown**：源读不到、第一实现输出缺失 ⇒ **unknown**
 *      ——**绝不能折成 agree**（那会让"没对上账"伪装成"对上了"）
 *   外加 **独立性**：本模块不得 import 第一实现、不得读它的缓存。读缓存 = 读它的输出，
 *   对账立刻退化成自证。
 *
 * 语料是**合成**的（写进临时目录的 `.jsonl.zstd`），因此测试快、可复现、不依赖活库。
 * 第一实现是**真的跑**（python3 + 它的 CLI），不是桩 —— 桩会把"两边口径都我写的"这种
 * 假对账放过去。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

import {
  EXPECTED_PRICING_AS_OF,
  judge,
  parseSourceUsage,
  readSourceUsage,
} from '../lib/usage-crosscheck.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const AGG = join(REPO, 'scripts', 'dsh-usage-aggregate.py')
const MODULE = join(REPO, 'lib', 'usage-crosscheck.mjs')

const PROVIDER = 'deepseek-official'
const header = (seq, time, model) =>
  JSON.stringify({ type: 'request/header', seq, time, data: { header: { config: { provider: PROVIDER, model } } } })
const msg = (seq, time, model, i, o, c) =>
  JSON.stringify({
    type: 'assistant/message',
    seq,
    time,
    data: { turn: 1, step: 1, message: { role: 'assistant', source: { provider: PROVIDER, model }, content: [] }, usage: { inputTokens: i, outputTokens: o, cacheReadTokens: c } },
  })

/**
 * 造一个临时 sessions-root；写进 `<proj>/<sess>/session.v4.jsonl.zstd`。
 *
 * ⚠️ **默认写多帧**（把行切成若干块各压一帧再拼接）—— 因为真实日志就是追加式多帧的：
 * 实测一个 4.08 MB 的文件里有 **2,526 帧**。
 * 我第一版 fixture 写的是**单帧**，于是测试**永远走不到生产那条路径**，
 * 也就抓不到"Node 的 zstdDecompressSync 只解第一帧"这个 bug（它把第二实现读到的数据
 * 变成 0.0016%，对活库跑出 2.33× 的假漂移）。**fixture 与生产不同形 = 测试没有覆盖。**
 */
function makeRoot(linesBySession, { frames = 3 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'usage-xcheck-'))
  for (const [sess, lines] of Object.entries(linesBySession)) {
    const dir = join(root, '--proj--', sess)
    mkdirSync(dir, { recursive: true })
    const parts = []
    const n = Math.max(1, Math.min(frames, lines.length))
    const size = Math.ceil(lines.length / n)
    for (let i = 0; i < lines.length; i += size) {
      parts.push(zstdCompressSync(Buffer.from(lines.slice(i, i + size).join('\n') + '\n')))
    }
    writeFileSync(join(dir, 'session.v4.jsonl.zstd'), Buffer.concat(parts))
  }
  return root
}

/** 跑**真的**第一实现。 */
function runFirst(root) {
  const out = execFileSync('python3', [AGG, '--sessions-root', root, '--from-ms', '0', '--to-ms', '9999999999999'], {
    encoding: 'utf8',
    maxBuffer: 32 << 20,
  })
  return JSON.parse(out)
}

const T = (d, h) => Date.UTC(2026, 9, d, h, 0)

test('① 能对上：正常语料 ⇒ agree', async () => {
  const root = makeRoot({
    s1: [
      header(1, T(15, 1), 'deepseek-flash'),
      msg(2, T(15, 1), 'deepseek-flash', 1000, 100, 5000),
      msg(3, T(15, 2), 'deepseek-flash', 2000, 200, 6000),
      header(4, T(15, 3), 'deepseek-v4-flash'),
      msg(5, T(15, 3), 'deepseek-v4-flash', 500, 50, 1000),
    ],
  })
  try {
    const first = runFirst(root)
    assert.equal(first.totals.modelResponseCount, 3, '第一实现应看到 3 条响应')
    assert.deepEqual(first.unpricedModels, [], '合成语料不应有未计价模型')
    // ⚠️ 必须 await 之后再进 finally：写成 `return promise` 时 finally 会**先删掉临时目录**，
    //    异步读盘就跑在已删除的目录上（实测 2026-10-16：source.responses 恒为 0）。
    const source = await readSourceUsage(root)
    assert.equal(source.responses, 3, '第二实现也应看到 3 条响应（同源）')
    const v = judge({ source, first })
    assert.equal(v.verdict, 'agree', `应 agree，实际 ${v.verdict}：${v.reasons.join(' | ')}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('② 能红（定价代际）：把 pricingAsOf 改错一代 ⇒ drift（不是 agree、也不是 unknown）', async () => {
  const root = makeRoot({ s1: [header(1, T(15, 1), 'deepseek-flash'), msg(2, T(15, 1), 'deepseek-flash', 10, 1, 0)] })
  try {
    const first = runFirst(root)
    const source = await readSourceUsage(root)
    assert.equal(judge({ source, first }).verdict, 'agree', '前提：原样应 agree')

    const stale = { ...first, pricingAsOf: '2026-08-17' } // 上一代
    const v = judge({ source, first: stale })
    assert.equal(v.verdict, 'drift', `定价代际错一代必须 drift，实际 ${v.verdict}`)
    assert.ok(v.reasons.some((r) => /定价代际不一致/.test(r)), `理由应指出代际：${v.reasons.join(' | ')}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('② 能红（模型口径）：会话中途换模型 ⇒ 两条取模型路径不一致 ⇒ drift', async () => {
  // header 说 flash，但这条消息自己的 source 说 pro（fallback 供应商切换的形状）。
  // 第一实现按 header 携带 ⇒ 记到 flash；第二实现按消息自己的 source ⇒ 记到 pro。
  const root = makeRoot({
    s1: [header(1, T(15, 1), 'deepseek-flash'), msg(2, T(15, 1), 'deepseek-flash', 100, 10, 0), msg(3, T(15, 2), 'deepseek-pro', 200, 20, 0)],
  })
  try {
    const first = runFirst(root)
    const source = await readSourceUsage(root)
    const v = judge({ source, first })
    assert.equal(v.verdict, 'drift', `两条路径取模型不一致时必须 drift，实际 ${v.verdict}：${v.reasons.join(' | ')}`)
    assert.ok(
      v.reasons.some((r) => /deepseek-flash|deepseek-pro/.test(r)),
      `理由应点名模型：${v.reasons.join(' | ')}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('③ 算不出来 ⇒ unknown（绝不折成 agree）', async () => {
  // (a) 源是空目录
  const empty = mkdtempSync(join(tmpdir(), 'usage-empty-'))
  try {
    const source = await readSourceUsage(empty)
    assert.equal(source.responses, 0)
    assert.equal(judge({ source, first: { byProviderModel: [], pricingAsOf: EXPECTED_PRICING_AS_OF } }).verdict, 'unknown', '空源必须 unknown')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
  // (b) 源不可读
  assert.equal(judge({ source: { ok: false, reason: 'x' }, first: {} }).verdict, 'unknown')
  // (c) 第一实现输出缺失
  const root = makeRoot({ s1: [header(1, T(15, 1), 'deepseek-flash'), msg(2, T(15, 1), 'deepseek-flash', 1, 1, 0)] })
  try {
    const source = await readSourceUsage(root)
    assert.equal(judge({ source, first: null }).verdict, 'unknown', '缺一半输入必须 unknown')
    assert.equal(judge({ source, first: { pricingAsOf: EXPECTED_PRICING_AS_OF } }).verdict, 'unknown', '缺 byProviderModel 必须 unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('独立性：不 import 第一实现、不读它的缓存（读缓存 = 自证）', () => {
  const raw = readFileSync(MODULE, 'utf8')
  // ⚠️ **先剥注释再查**：我第一版直接 grep 全文，结果被**本模块自己的 docstring** 判红
  //    —— 文档里写明"不得读 usage-aggregate-cache.json"这句话本身就含那个串。
  //    这是本会话反复出现的同一族缺陷（把"举例/讲解"当成"引用"）：判据要看**代码**，
  //    不是看文本里出现过什么词。
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(src.length > 0, '剥注释后不应为空（否则这个检查是空的）')
  assert.ok(!/usage-aggregate-cache/.test(src), '本模块的**代码**不得引用 usage-aggregate-cache（那等于读第一实现的输出）')
  assert.ok(!/dsh-usage-aggregate/.test(src), '本模块的代码不得引用第一实现的脚本路径')
  // ⚠️ **不能**笼统禁 `child_process`：本模块用它跑 `zstd -dc`（多帧解压），那是正当的 IO。
  //    禁的是"把第一实现当子进程调起来" —— 那才是把独立性丢掉。
  assert.ok(!/python/i.test(src), '本模块不得以任何方式调 python（第一实现是 Python 脚本）')
  assert.ok(!/execFileSync?\(|execSync\(/.test(src), '本模块不得用同步 exec 家族（唯一允许的是 zstd 的 spawnSync）')
  // 反向自证：剥注释**确实**起作用（原始文本里那两个串是存在的，只是都在注释里）
  assert.ok(/usage-aggregate-cache/.test(raw), '前提失效：原文里已无该串 ⇒ 这条检查不再有鉴别力，需要重看')
  // 取模型的路径必须与第一实现不同（它用 request/header 携带）
  assert.ok(/message\?\.source|message\.source/.test(src), '本模块的模型必须取自每条消息自己的 source')
  assert.ok(!/request\/header/.test(src), '本模块不得复制第一实现的 request/header 携带路径（否则就不独立了）')
})

test('独立性（行为）：缓存文件在场但源是空的 ⇒ 仍然 unknown', async () => {
  const root = mkdtempSync(join(tmpdir(), 'usage-cacheonly-'))
  try {
    // 放一个"看起来像第一实现缓存"的文件进去 —— 第二实现必须完全不看它
    writeFileSync(join(root, 'usage-aggregate-cache.json'), JSON.stringify({ totals: { estimatedCostUsd: 123.45 } }))
    const source = await readSourceUsage(root)
    assert.equal(source.responses, 0, '不能把缓存里的数字当成源里的响应')
    assert.equal(judge({ source, first: { byProviderModel: [], pricingAsOf: EXPECTED_PRICING_AS_OF } }).verdict, 'unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('parseSourceUsage 的边界：坏行跳过、窗口过滤、未知 source 标 unknown', () => {
  const text = [
    '{ not json',
    JSON.stringify({ type: 'assistant/message', time: T(15, 1), data: { usage: { inputTokens: 5 } } }), // 无 source
    JSON.stringify({ type: 'assistant/message', time: T(15, 5), data: { message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 7, outputTokens: 1, cacheReadTokens: 2 } } }),
  ].join('\n')
  const all = parseSourceUsage(text)
  assert.equal(all.badLines, 1)
  assert.equal(all.responses, 2)
  const w = parseSourceUsage(text, { fromMs: T(15, 3), toMs: T(15, 9) })
  assert.equal(w.responses, 1, '窗口外的消息不应计入')
  assert.equal(w.byModel.get('p\u0000m').promptTokens, 7)
  assert.ok(all.byModel.has('unknown\u0000unknown'), '缺 source 必须显式标成 unknown，不能静默丢掉')
})

test('多帧 zstd：必须解出全部帧（只解第一帧的解压器不许静默少算）', async () => {
  // 5 行切成 3 帧 ⇒ 只解第一帧会拿到 2 行（而不是 5 行）
  const lines = [header(1, T(15, 1), 'deepseek-flash'), msg(2, T(15, 1), 'deepseek-flash', 10, 1, 0), msg(3, T(15, 2), 'deepseek-flash', 20, 2, 0), msg(4, T(15, 3), 'deepseek-flash', 30, 3, 0), msg(5, T(15, 4), 'deepseek-flash', 40, 4, 0)]
  const root = makeRoot({ s1: lines }, { frames: 3 })
  try {
    // 默认解压器（zstd CLI）必须拿到全部 4 条响应
    const ok = await readSourceUsage(root)
    assert.equal(ok.ok, true, `默认解压器应成功：${ok.reason}`)
    assert.equal(ok.responses, 4, `多帧必须全解（期望 4 条响应），实际 ${ok.responses}`)

    // 模拟"只支持单帧"的解压器（Node 内置 zstdDecompressSync 就是这个行为）
    const { zstdCompressSync: _c, zstdDecompressSync } = await import('node:zlib')
    const guarded = await readSourceUsage(root, {
      io: { decompress: async (buf) => zstdDecompressSync(buf), singleFrameOnly: true },
    })
    assert.equal(guarded.ok, false, '多帧文件 + 单帧解压器必须**拒绝给数字**，而不是静默少算')
    assert.match(guarded.reason ?? '', /多帧/)
    assert.equal(guarded.responses, 0)
    // 关键：judge 拿到这个结果必须是 unknown，**不能**是 drift ——
    // 否则"我自己少算了"会被报成"第一实现漂移了"（实测就是这么发生的）
    assert.equal(judge({ source: guarded, first: { byProviderModel: [], pricingAsOf: EXPECTED_PRICING_AS_OF } }).verdict, 'unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/**
 * 只解**第一帧**的解压器（确定性注入，用来给"多帧守卫"做负向控制）。
 *
 * ⚠️ 为什么不用 `node:zlib` 的 `zstdDecompressSync` 当"单帧坏解压器"：
 *   它曾经只解第一帧（那正是当年发现 bug 的路径），但 **Node v26.12.1 实测已会解全部帧**
 *   （3 帧拼起来的 buffer ⇒ 返回 `"a\nb\nc\n"`）。于是原写法在换版本后**前提失效**——
 *   测试便红在"这条对照不再有鉴别力"上。那是测试在诚实地指真因，但控制项不该依赖运行环境：
 *   **要注入的是"bug 的形状"，不是某个库在某个版本的行为**。
 */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
function firstFrameOnly(buf) {
  const at = []
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === ZSTD_MAGIC[0] && buf[i + 1] === ZSTD_MAGIC[1] && buf[i + 2] === ZSTD_MAGIC[2] && buf[i + 3] === ZSTD_MAGIC[3]) at.push(i)
  }
  if (at.length === 0) throw new Error('fixture 不是 zstd')
  const end = at.length > 1 ? at[1] : buf.length
  return zstdDecompressSync(buf.subarray(at[0], end))
}

test('多帧 + 单帧解压器的对照：若不设守卫会得到明显偏小的数（证明守卫有鉴别力）', async () => {
  const lines = [header(1, T(15, 1), 'deepseek-flash'), msg(2, T(15, 1), 'deepseek-flash', 10, 1, 0), msg(3, T(15, 2), 'deepseek-flash', 20, 2, 0), msg(4, T(15, 3), 'deepseek-flash', 30, 3, 0)]
  const root = makeRoot({ s1: lines }, { frames: 3 })
  try {
    // 不设 singleFrameOnly ⇒ 守卫不生效，就会拿到少算的数（这正是 bug 的形状）
    const naive = await readSourceUsage(root, { io: { decompress: async (buf) => firstFrameOnly(buf) } })
    assert.ok(
      naive.responses < 3,
      `前提失效：确定性单帧解压器在这份多帧 fixture 上没有得到偏小的数（${naive.responses}）⇒ 对照失去鉴别力`,
    )
    const good = await readSourceUsage(root)
    assert.equal(good.responses, 3, '正常路径应为 3')
    assert.ok(naive.responses < good.responses, `单帧=${naive.responses} 必须小于全解=${good.responses}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
