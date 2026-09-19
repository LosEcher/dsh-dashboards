#!/usr/bin/env node
/**
 * scripts/observe-guardrails.mjs — P0 加固的观测取样器（零依赖）。
 *
 * 「先加固、再观察、结合数据决定下一轮」需要的是一个**机械**的数据面，而不是
 * 散文式的「看起来好了」。本脚本按固定节奏抓 /dashboards/status 与
 * /dashboards/egress，追加一行 JSONL，并打印紧凑摘要。
 *
 * 每行记录的是**加固项本身的状态**（不是业务指标）：
 *   - sanity[]       : 脏时间/畸形行丢弃计数（P0-4）——持续为 0 = 采集链路干净
 *   - stale/hasData  : 失败伪装新鲜是否已消除（P0-5）——stale=true 且 hasData=true
 *                      正是「有旧数据且最近一次失败」的诚实态
 *   - dataAgeMs      : 数据真实年龄（旧实现里失败后这个值会假性归零）
 *   - consecutiveFails / lastError : 哪些后端在失败、失败成串没有
 *   - egressDisabled : 被关掉的外呼（P0-6）
 *   - truncated      : feed/history 当前是否处于截断态（P0-1）
 *
 * 用法：
 *   node scripts/observe-guardrails.mjs --once
 *   node scripts/observe-guardrails.mjs --samples 12 --interval-sec 300 --label post-p0
 *   node scripts/observe-guardrails.mjs --summary        # 只汇总已有 JSONL
 *
 * 落盘：~/.dsh/storages/dsh-dashboards/observe/guardrails-<YYYYMMDD>.jsonl
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const OBSERVE_DIR = join(HOME, 'storages/dsh-dashboards/observe')
const BASE = process.env.DSH_DASH_BASE ?? 'http://127.0.0.1:3080'

/** 从 status/egress 响应折叠出一行观测（纯函数，便于单测）。 */
export function buildObservation(status, egress, { label = '', now = Date.now() } = {}) {
  const backends = status?.backends ?? {}
  const flat = []
  for (const [group, entry] of Object.entries(backends)) {
    if (!entry || typeof entry !== 'object') continue
    // los 是一组子后端；其余是单后端
    const isGroup = Object.values(entry).some((v) => v && typeof v === 'object' && 'hasData' in v)
    if (isGroup) {
      for (const [name, b] of Object.entries(entry)) {
        if (b && typeof b === 'object' && 'hasData' in b) flat.push(flatten(`${group}.${name}`, b))
      }
    } else if ('hasData' in entry) {
      flat.push(flatten(group, entry))
    }
  }
  return {
    ts: new Date(now).toISOString(),
    label,
    sanity: status?.sanity ?? null,
    egressDisabled: (egress?.features ?? []).filter((f) => !f.enabled).map((f) => f.id),
    egressTotal: (egress?.features ?? []).length,
    backends: flat,
    // 一眼可见的两个不健康信号（后续分析主要看这两个数）
    stales: flat.filter((b) => b.stale).map((b) => b.id),
    failing: flat.filter((b) => b.error).map((b) => b.id),
  }
}

function flatten(id, b) {
  return {
    id,
    hasData: !!b.hasData,
    stale: !!b.stale,
    ts: b.ts ?? null,
    attemptedAt: b.attemptedAt ?? null,
    error: b.error ?? null,
    dataAgeMs: b.stats?.dataAgeMs ?? null,
    consecutiveFails: b.stats?.consecutiveFails ?? null,
    refreshCount: b.stats?.refreshCount ?? null,
    failCount: b.stats?.failCount ?? null,
    snapshotV: b.stats?.v ?? null,
  }
}

/** 汇总一批观测行（纯函数）。 */
export function summarize(rows) {
  const list = Array.isArray(rows) ? rows : []
  const perBackend = new Map()
  for (const row of list) {
    for (const b of row.backends ?? []) {
      const cur = perBackend.get(b.id) ?? { id: b.id, samples: 0, staleSamples: 0, errorSamples: 0, maxConsecutiveFails: 0, maxDataAgeMs: null, lastError: null }
      cur.samples += 1
      if (b.stale) cur.staleSamples += 1
      if (b.error) { cur.errorSamples += 1; cur.lastError = b.error }
      cur.maxConsecutiveFails = Math.max(cur.maxConsecutiveFails, Number(b.consecutiveFails) || 0)
      if (typeof b.dataAgeMs === 'number') cur.maxDataAgeMs = Math.max(cur.maxDataAgeMs ?? 0, b.dataAgeMs)
      perBackend.set(b.id, cur)
    }
  }
  const sanityKeys = new Set()
  for (const row of list) for (const k of Object.keys(row.sanity ?? {})) sanityKeys.add(k)
  const sanityMax = {}
  for (const k of sanityKeys) sanityMax[k] = Math.max(...list.map((r) => Number(r.sanity?.[k]) || 0), 0)
  return {
    samples: list.length,
    first: list[0]?.ts ?? null,
    last: list[list.length - 1]?.ts ?? null,
    backends: [...perBackend.values()].sort((a, b) => b.staleSamples - a.staleSamples || a.id.localeCompare(b.id)),
    sanityMax,
  }
}

const readDay = (file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

function loadRows({ days = 2 } = {}) {
  let files = []
  try { files = readdirSync(OBSERVE_DIR).filter((f) => /^guardrails-\d{8}\.jsonl$/.test(f)).sort().slice(-days) } catch { return [] }
  const rows = []
  for (const f of files) rows.push(...readDay(join(OBSERVE_DIR, f)))
  return rows
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  return res.json()
}

// 同一节奏间隔**不能 unref**：unref 的定时器在无其它 handle 时会让进程提前退出，
// 表现为「--samples 12 只写了 1 行」（静默截断，正是本轮要消灭的那类问题）。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function sample({ label }) {
  const [status, egress] = await Promise.all([fetchJson('/dashboards/status'), fetchJson('/dashboards/egress')])
  const row = buildObservation(status, egress, { label })
  mkdirSync(OBSERVE_DIR, { recursive: true })
  const file = join(OBSERVE_DIR, `guardrails-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`)
  appendFileSync(file, `${JSON.stringify(row)}\n`)
  return { row, file }
}

function printRow(row) {
  const bad = row.backends.filter((b) => b.stale || b.error)
  console.log(`[${row.ts}]${row.label ? ` ${row.label}` : ''} backends=${row.backends.length} ok=${row.backends.filter((b) => b.hasData && !b.error).length} stale=${row.stales.length} failing=${row.failing.length} egressOff=[${row.egressDisabled.join(',')}]`)
  for (const b of bad) console.log(`   ⚠ ${b.id}: stale=${b.stale} err=${b.error ?? '-'} dataAgeMs=${b.dataAgeMs ?? '-'} fails=${b.consecutiveFails ?? '-'}`)
  const dirty = Object.entries(row.sanity ?? {}).filter(([, v]) => Number(v) > 0)
  if (dirty.length) console.log(`   sanity(丢弃): ${dirty.map(([k, v]) => `${k}=${v}`).join(' ')}`)
}

async function main() {
  const argv = process.argv.slice(2)
  const has = (f) => argv.includes(f)
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }
  if (has('--summary')) {
    const rows = loadRows({ days: Number(val('--days', 2)) })
    console.log(JSON.stringify(summarize(rows), null, 2))
    return
  }
  const samples = Number(val('--samples', 1))
  const intervalSec = Number(val('--interval-sec', 60))
  const label = String(val('--label', ''))
  for (let i = 0; i < Math.max(1, samples); i += 1) {
    try {
      const { row, file } = await sample({ label })
      printRow(row)
      if (i === 0) console.log(`   → ${file}`)
    } catch (e) {
      console.error(`[${new Date().toISOString()}] 取样失败: ${e?.message ?? e}`)
    }
    if (i < samples - 1) await sleep(intervalSec * 1000)
  }
}

// 主入口判定：不用 import.meta.main（Bun / Node≥24.2 才有），按 argv[1] 与模块路径比对。
const isMain = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (isMain) await main()
