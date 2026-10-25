/**
 * dsh-dashboards — lib/usage-crosscheck.mjs
 *
 * **同源第二实现**：独立地从 DSH 会话日志重算用量，然后**只输出一个 verdict**
 * （`agree` / `drift` / `unknown`）—— 不给成本数字、不写盘、不读第一实现的缓存。
 *
 * 为什么需要它（台账条目 `usage-second-implementation-crosscheck`）：
 *   `dsh-usage-aggregate.py` 自述曾发生**两次定价口径漂移**，其中一次让**成本静默恒为 0 达 3 天**
 *   （2026-09-12 起：站点把 flash 模型名改成 `deepseek-flash` 并降价，而实现的 key 只有旧名
 *   ⇒ 全部落进「未知模型」分支，成本算成 0，**没有报错**）。
 *   而 `collectUsageReconcile`（index.mjs）是 **dsh + los + quota 三源相加** ——
 *   三源同时错同一个方向时它会一致，**跨源 reconcile 在结构上抓不到同源口径漂移**。
 *   所以需要**同源的第二实现**：拿同一份原始日志、用**另一条**取模型的路径重算，
 *   与第一实现的输出对账。
 *
 * ── 独立性是硬要求（本模块的全部价值所在）────────────────────────────────
 *   ① **不 import 第一实现**（它是 Python，跨语言 import 本就不可能；本模块也不 shell 出它）。
 *   ② **不读它的缓存**（`usage-aggregate-cache.json`）—— 读缓存就等于读第一实现的输出，
 *      对账立刻退化成自证。
 *   ③ **取模型的路径必须与它不同**：第一实现用 `request/header` 的
 *      `data.header.config.{provider,model}` **有状态地向前携带**（一个 header 管到下一个 header）；
 *      本模块用**每条消息自己的** `data.message.source.{provider,model}`。
 *      ⇒ 会话中途换模型（fallback 供应商切换）时两者会**不一致**，这正是要对账出来的东西。
 *   ④ 定价代际**自带一份期望值**（`EXPECTED_PRICING_AS_OF`）：它与 Python 里的
 *      `PRICING_AS_OF` 是**两份独立的副本**，改价时只改一边 ⇒ verdict 必须是 `drift`。
 *      这是故意的：让"改价只改了一处"变成一个必须被看见的事件。
 *
 * 契约：`judge()` **永不抛**，任何算不出来的情况一律 `unknown` ——
 * **绝不能把 unknown 折成 agree**（那会让"没对上账"变成"对上了"）。
 *
 * ── ⚠️ 多帧 zstd（2026-10-16 实测，本模块第一版就栽在这里）────────────────
 *   DSH 的 `session.v4.jsonl.zstd` 是**追加式多帧**的：实测某个 4.08 MB 的文件里有
 *   **2,526 个 zstd 帧**，解压后 13.5 MB / 3,924 行。
 *   而 **Node 的 `zstdDecompressSync`（以及流式 `createZstdDecompress`）只解出第一帧**：
 *   同一个文件只返回 **223 字节 / 1 行** ⇒ 第二实现实际只读到 **0.0016%** 的数据，
 *   于是对活库跑出 2,692 vs 第一实现 6,279 的"漂移" —— **那 2.33× 的差全是本模块的 bug**，
 *   不是第一实现的漂移。
 *   ⇒ 默认解压器改用 **`zstd -dc` CLI**（能处理多帧）。
 *   ⇒ 并且加一条**绝不静默少算**的守卫：若输入里 zstd magic 出现 >1 次而当前解压器只能出第一帧，
 *     一律报 `unknown`，**不许**拿一个少算了的数据去判 drift/agree。
 */

/** 与第一实现**独立**维护的期望定价代际。改价时两边都要动，否则 verdict=drift（这是设计意图）。 */
import { spawnSync as nodeSpawnSync } from 'node:child_process'

export const EXPECTED_PRICING_AS_OF = '2026-09-10'

/** 北京时间某时刻 → epoch ms（与第一实现的 `_bj_ms` 同语义，但本模块自己算）。 */
export function bjMs(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute)
}

export const NEW_PRICE_FROM_MS = bjMs(2026, 9, 10, 12, 0)
export const PEAK_PRICING_SINCE_MS = bjMs(2026, 8, 17)

export const VERDICTS = ['agree', 'drift', 'unknown']

/**
 * 从**一次会话日志的文本**里独立聚合用量（每条消息按自己的 source 取模型）。
 * 纯函数，便于测试；坏行跳过而不是抛。
 */
export function parseSourceUsage(text, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER } = {}) {
  const byModel = new Map()
  let responses = 0
  let badLines = 0
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      badLines += 1
      continue
    }
    if (ev?.type !== 'assistant/message') continue
    const usage = ev?.data?.usage
    if (!usage) continue
    const t = Number(ev?.time ?? 0)
    if (!(t >= fromMs && t <= toMs)) continue
    // ⚠️ 与第一实现的关键差异：模型**取自这条消息自己**，不做 header 携带
    const src = ev?.data?.message?.source ?? {}
    const provider = src.provider ?? 'unknown'
    const model = src.model ?? 'unknown'
    const key = `${provider}\u0000${model}`
    const b = byModel.get(key) ?? { provider, model, modelResponseCount: 0, promptTokens: 0, completionTokens: 0, cacheReadTokens: 0 }
    b.modelResponseCount += 1
    b.promptTokens += Number(usage.inputTokens ?? 0) || 0
    b.completionTokens += Number(usage.outputTokens ?? 0) || 0
    b.cacheReadTokens += Number(usage.cacheReadTokens ?? 0) || 0
    byModel.set(key, b)
    responses += 1
  }
  return { byModel, responses, badLines }
}

/**
 * zstd magic（小端写入的 0xFD2FB528）。用来判断一个文件是否**多帧**。
 * ⚠️ 它也可能偶然出现在压缩数据里 ⇒ 只能用于"是不是可能有第二帧"的**保守判断**：
 * 见到 >1 次就要求用能处理多帧的解压器，见不到就认为单帧安全。
 */
/**
 * 默认解压器：**`zstd -dc` CLI**（多帧安全）。
 * Node 内置的 `zstdDecompressSync` 只解第一帧，**不能用于 DSH 的会话日志**。
 */
export function decompressWithCli(buf, { spawnSync } = {}) {
  // ⚠️ 必须用**静态 ESM import**：本文件是 `.mjs`，`require` 在这里是 undefined。
  //    第一版写成 `require('node:child_process')` —— 在 `node -e`（CJS 入口）下能跑通，
  //    所以活库实测是过的；但 `node --test`（纯 ESM 上下文）下当场 `require is not defined`。
  //    ⇒ **"在一种入口下跑通了"不等于"能跑"**；测试与实测的入口不同就会各看到一个真相。
  const run = spawnSync ?? ((cmd, args, opts) => nodeSpawnSync(cmd, args, opts))
  const r = run('zstd', ['-dc'], { input: buf, maxBuffer: 1 << 30 })
  if (r.error) throw new Error(`zstd CLI 不可用：${r.error.message}`)
  if (r.status !== 0) throw new Error(`zstd -dc 退出码 ${r.status}：${String(r.stderr ?? '').slice(0, 200)}`)
  return r.stdout
}

/** 默认 IO（可注入以便测试）。 */
async function defaultListLogs(root, readdir) {
  const out = []
  let projects
  try {
    projects = await readdir(root)
  } catch (error) {
    return { out, error: `sessions-root 不可读：${root}（${error?.message ?? error}）` }
  }
  for (const proj of projects) {
    let sessions
    try {
      sessions = await readdir(`${root}/${proj}`)
    } catch {
      continue
    }
    for (const s of sessions) {
      for (const name of ['session.v4.jsonl.zstd', 'session.jsonl.zstd', 'session.v4.jsonl']) {
        out.push({ project: proj, session: s, path: `${root}/${proj}/${s}/${name}` })
      }
    }
  }
  return { out, error: null }
}

/**
 * 独立扫描日志目录（**同源**：与第一实现同一个 `--sessions-root`）。
 * 不读第一实现的任何输出或缓存。
 */
export async function readSourceUsage(root, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER, io = {} } = {}) {
  const readdir = io.readdir ?? ((p) => import('node:fs/promises').then((m) => m.readdir(p)))
  const readFile = io.readFile ?? ((p) => import('node:fs/promises').then((m) => m.readFile(p)))
  const decompress = io.decompress ?? ((buf) => decompressWithCli(buf))
  /**
   * 当前解压器是否**只解第一帧**（用于多帧守卫）。
   *
   * 这条守卫**不能因为 Node 变聪明了就删**：2026-10-25 实测 Node **v26.12.1** 的
   * `zstdDecompressSync` 已会解全部帧（3 帧拼接 ⇒ 返回 `"a\nb\nc\n"`），而更早的版本
   * 只解第一帧。也就是说"解压器会不会截断"取决于**跑在哪个 Node / 哪种外部实现**上
   * （真实日志是追加式多帧的，实测单文件 2,526 帧）。守卫的职责是：**见到多帧就要求
   * 调用方显式声明自己的解压器能力**，声明不了就判 unknown —— 而不是赌环境。
   * 对应负向控制见 test/usage-crosscheck.test.mjs「多帧 + 单帧解压器的对照」（用**确定性
   * 注入**的第一帧解压器，不复用 Node 内建行为）。
   */
  const singleFrame = io.singleFrameOnly === true

  const { out: candidates, error } = await defaultListLogs(root, readdir)
  if (error) return { ok: false, reason: error, byModel: new Map(), responses: 0, files: 0 }

  const agg = new Map()
  let responses = 0
  let files = 0
  let badLines = 0
  let unreadable = 0
  let multiFrameError = null
  for (const c of candidates) {
    let buf
    try {
      buf = await readFile(c.path)
    } catch {
      continue // 这个候选名不存在是正常的（三个候选名里只有一个存在）
    }
    let text
    try {
      text = c.path.endsWith('.zstd') ? String(await decompress(buf)) : String(buf)
    } catch (error) {
      unreadable += 1
      if (!multiFrameError) multiFrameError = `解压失败：${c.session}（${error?.message ?? error}）`
      continue
    }
    // ⚠️ **绝不静默少算**：多帧文件若被只解第一帧的解压器处理，结果会小几个数量级，
    //    而那种"少算"会被 judge 误判成 drift（实测就是这么发生的）。
    //    见到多个 magic 且解压器只支持单帧 ⇒ 直接判 unknown，不给数字。
    if (c.path.endsWith('.zstd') && singleFrame) {
      let n = 0
      for (let i = 0; i + 4 <= buf.length; i++) {
        if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) n++
        if (n > 1) break
      }
      if (n > 1) {
        return { ok: false, reason: `多帧 zstd（${c.session}）：当前注入的解压器只支持单帧，拒绝给出一个少算的结果`, byModel: new Map(), responses: 0, files: 0 }
      }
    }
    files += 1
    const one = parseSourceUsage(text, { fromMs, toMs })
    responses += one.responses
    badLines += one.badLines
    for (const [k, v] of one.byModel) {
      const b = agg.get(k) ?? { provider: v.provider, model: v.model, modelResponseCount: 0, promptTokens: 0, completionTokens: 0, cacheReadTokens: 0 }
      b.modelResponseCount += v.modelResponseCount
      b.promptTokens += v.promptTokens
      b.completionTokens += v.completionTokens
      b.cacheReadTokens += v.cacheReadTokens
      agg.set(k, b)
    }
  }
  if (multiFrameError && responses === 0) {
    return { ok: false, reason: multiFrameError, byModel: new Map(), responses: 0, files, badLines, unreadable }
  }
  return { ok: true, byModel: agg, responses, files, badLines, unreadable, reason: multiFrameError }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * 出 verdict。**永不抛**；任何不确定一律 `unknown`。
 *
 * @param {{source: object, first: object|null, expectedAsOf?: string, tolerance?: number}} input
 */
export function judge({ source, first, expectedAsOf = EXPECTED_PRICING_AS_OF, tolerance = 0 } = {}) {
  const reasons = []
  const unknown = (why) => ({ verdict: 'unknown', reasons: [why] })

  if (!source || source.ok !== true) return unknown(`第二实现读不到源：${source?.reason ?? '未提供 source'}`)
  if (!first || typeof first !== 'object') return unknown('拿不到第一实现的输出（拒绝在缺一半输入时给 agree）')
  if (!Array.isArray(first.byProviderModel)) return unknown('第一实现输出里没有 byProviderModel（契约变了？）')
  if (!(source.responses > 0)) return unknown('窗口内源里没有可解析的 usage 事件（可能窗口错、或日志形态变了）')

  // ① 定价代际：与**独立维护的**期望值比对
  if (first.pricingAsOf !== expectedAsOf) {
    reasons.push(`定价代际不一致：第一实现=${first.pricingAsOf ?? '(缺)'} 期望=${expectedAsOf}`)
  }

  // ② 未计价路由：这是"成本静默为 0"那次事故的直接征兆
  if (Array.isArray(first.unpricedModels) && first.unpricedModels.length > 0) {
    reasons.push(`第一实现报了未计价模型：${first.unpricedModels.join(',')}（成本会静默偏低）`)
  }

  // ③ 逐模型对账（模型集 + 计数 + token）
  const firstMap = new Map()
  for (const r of first.byProviderModel) {
    firstMap.set(`${r.provider}\u0000${r.model}`, r)
    if (num(r.costUnknownCount) > 0) {
      reasons.push(`${r.provider}/${r.model} 有 ${r.costUnknownCount} 条未计价响应（costUnknownCount>0）`)
    }
  }
  for (const [k, s] of source.byModel) {
    const f = firstMap.get(k)
    const label = `${s.provider}/${s.model}`
    if (!f) {
      reasons.push(`第二实现在源里看到 ${label}（${s.modelResponseCount} 条），第一实现的 byProviderModel 里没有`)
      continue
    }
    const fields = [
      ['modelResponseCount', s.modelResponseCount, f.modelResponseCount],
      ['promptTokens', s.promptTokens, f.promptTokens],
      ['completionTokens', s.completionTokens, f.completionTokens],
      ['cacheReadTokens', s.cacheReadTokens, f.cacheReadTokens],
    ]
    for (const [name, sv, fv] of fields) {
      const a = num(sv)
      const b = num(fv)
      if (a === null || b === null) {
        reasons.push(`${label}.${name} 有一侧不是数字（第二实现=${sv} 第一实现=${fv}）`)
      } else if (Math.abs(a - b) > tolerance) {
        reasons.push(`${label}.${name} 不一致：第二实现=${a} 第一实现=${b}`)
      }
    }
    firstMap.delete(k)
  }
  for (const [, f] of firstMap) {
    reasons.push(`第一实现报了 ${f.provider}/${f.model}，但第二实现在同一份源里没看到它`)
  }

  return reasons.length ? { verdict: 'drift', reasons } : { verdict: 'agree', reasons: [] }
}
