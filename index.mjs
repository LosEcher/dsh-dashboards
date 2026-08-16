/**
 * dsh-dashboards — host half: mounts read-only aggregation API on the DSH
 * webserver under /dashboards (same-origin 127.0.0.1:3080 loopback).
 *
 * Endpoints (all GET unless noted):
 *   GET /dashboards/status             backends 健康 + widget 数
 *   GET /dashboards/los/usage          los /usage/summary（LLM 用量/成本）
 *   GET /dashboards/los/trends         los /metrics/trends（延迟趋势）
 *   GET /dashboards/los/metrics        los /metrics（Prometheus → 任务统计）
 *   GET /dashboards/los/nodes          los /nodes（执行节点矩阵 + capacity 快照）
 *   GET /dashboards/macos              macOS 原生探针快照（loadavg/mem/disk/net/cpu）
 *   GET /dashboards/macos/history      macOS 滚动短趋势（内存缓冲）
 *   GET /dashboards/probe              端口/HTTP 服务探活
 *   GET /dashboards/glances            Glances /api/4/all（可选后端，默认关）
 *   GET /dashboards/kuma               Uptime Kuma /api/v1/monitors（可选后端，默认关）
 *   GET  /dashboards/widgets           看板 widget 配置（host 侧存储）
 *   PUT  /dashboards/widgets           保存 widget 配置（校验 endpoint 白名单）
 *
 * 全部只读采集；token 只留 host 侧（los 双 token：Bearer 用量 + operator 节点）。
 */

import Schema from '@deepseek-ai/schemastery'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createConnection } from 'node:net'

export const name = 'dsh-dashboards'
export const inject = ['webServer']

export const Config = Schema.object({
  /** los-gateway 基址（默认 127.0.0.1:8080）。 */
  losUrl: Schema.string(),
  /** los .env 文件路径；未显式给 operatorToken 时从中读取 LOS_OPERATOR_TOKEN。 */
  losEnvFile: Schema.string(),
  /** los 用量类 token（Authorization: Bearer；优先于环境变量与 credentials 文件）。 */
  losToken: Schema.string(),
  /** los operator token（x-los-operator-token；优先于 losEnvFile 与环境变量）。 */
  losOperatorToken: Schema.string(),
  /** los 轮询间隔 ms。 */
  losPollMs: Schema.number(),
  macos: Schema.object({
    enabled: Schema.boolean(),
    pollMs: Schema.number(),
    /** 滚动历史点数（短趋势）。 */
    historyPoints: Schema.number(),
  }),
  glances: Schema.object({
    enabled: Schema.boolean(),
    url: Schema.string(),
    pollMs: Schema.number(),
  }),
  kuma: Schema.object({
    enabled: Schema.boolean(),
    url: Schema.string(),
    token: Schema.string(),
    pollMs: Schema.number(),
  }),
  probe: Schema.object({
    pollMs: Schema.number(),
    targets: Schema.array(Schema.object({
      name: Schema.string(),
      url: Schema.string(),
      host: Schema.string(),
      port: Schema.number(),
    })),
  }),
})

const HOME = process.env.DSH_HOME ?? `${homedir()}/.dsh`
const CRED_FILE = join(HOME, '.credentials.yaml')
const WIDGETS_FILE = join(HOME, 'storages/dsh-dashboards/widgets.json')
const DEFAULTS_DIR = join(HOME, 'storages/dsh-dashboards')

/** widget endpoint 白名单（防 PUT 注入任意路径）。 */
const ALLOWED_ENDPOINTS = new Set([
  '/dashboards/los/usage', '/dashboards/los/trends', '/dashboards/los/metrics', '/dashboards/los/nodes',
  '/dashboards/macos', '/dashboards/macos/history', '/dashboards/probe', '/dashboards/glances', '/dashboards/kuma',
])

const DEFAULT_TARGETS = [
  { name: 'dsh-web', url: 'http://127.0.0.1:3080' },
  { name: 'los-gateway', url: 'http://127.0.0.1:8080' },
  { name: 'los-otel', port: 4318 },
  { name: 'wechat-bridge', port: 18013 },
  { name: 'kimi-bridge', port: 10086 },
  { name: 'herdr-web', port: 8777 },
  { name: 'node34-forgejo', url: 'http://100.68.106.96:8080' },
  { name: 'node34-kuma', url: 'http://100.68.106.96:3001' },
]

const DEFAULT_WIDGETS = [
  { id: 'los-usage', type: 'stat', endpoint: '/dashboards/los/usage', title: 'LLM 用量 24h', refreshMs: 60000 },
  { id: 'los-nodes', type: 'matrix', endpoint: '/dashboards/los/nodes', title: '执行节点', refreshMs: 30000 },
  { id: 'los-latency', type: 'chart', endpoint: '/dashboards/los/trends', title: 'provider 延迟', refreshMs: 300000 },
  { id: 'mbp-load', type: 'chart', endpoint: '/dashboards/macos/history', title: 'MBP 负载', refreshMs: 15000 },
  { id: 'mbp-mem', type: 'stat', endpoint: '/dashboards/macos', title: 'MBP 内存', refreshMs: 15000 },
  { id: 'svc-probe', type: 'list', endpoint: '/dashboards/probe', title: '关键服务', refreshMs: 30000 },
  { id: 'kuma-status', type: 'list', endpoint: '/dashboards/kuma', title: '服务状态 (Z4Nas)', refreshMs: 30000 },
]

/** ── 配置解析：defaulting happens here, never inline ─────────────────── */
function resolveConfig(config) {
  const c = config ?? {}
  const losUrl = c.losUrl ?? process.env.LOS_GATEWAY_URL ?? 'http://127.0.0.1:8080'
  const losEnvFile = c.losEnvFile ?? process.env.LOS_ENV_FILE ?? null
  return {
    losUrl,
    losEnvFile,
    losPollMs: c.losPollMs ?? 60000,
    macos: {
      enabled: c.macos?.enabled ?? true,
      pollMs: c.macos?.pollMs ?? 15000,
      historyPoints: c.macos?.historyPoints ?? 120,
    },
    glances: {
      enabled: c.glances?.enabled ?? false,
      url: c.glances?.url ?? 'http://127.0.0.1:61209',
      pollMs: c.glances?.pollMs ?? 10000,
    },
    kuma: {
      enabled: c.kuma?.enabled ?? false,
      url: c.kuma?.url ?? '',
      token: c.kuma?.token ?? null,
      pollMs: c.kuma?.pollMs ?? 30000,
    },
    probe: {
      pollMs: c.probe?.pollMs ?? 30000,
      targets: Array.isArray(c.probe?.targets) && c.probe.targets.length ? c.probe.targets : DEFAULT_TARGETS,
    },
  }
}

/** ── los token 解析链 ──────────────────────────────────────────────── */
function readEnvToken(names) {
  for (const n of names) {
    const v = process.env[n]
    if (v) return v.trim()
  }
  return null
}

function parseEnvFile(file, key) {
  if (!file) return null
  try {
    const text = readFileSync(file, 'utf8')
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (!m) return null
    return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return null
  }
}

function parseCredentials(file, key) {
  try {
    const text = readFileSync(file, 'utf8')
    const m = text.match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\n]+)`, 'm'))
    if (!m) return null
    return m[1].trim()
  } catch {
    return null
  }
}

function resolveTokens(cfg) {
  const authToken = cfg.losToken
    ?? readEnvToken(['LOS_AUTH_TOKEN'])
    ?? parseCredentials(CRED_FILE, 'LOS_AUTH_TOKEN')
  const operatorToken = cfg.losOperatorToken
    ?? readEnvToken(['LOS_OPERATOR_TOKEN'])
    ?? parseEnvFile(cfg.losEnvFile, 'LOS_OPERATOR_TOKEN')
    ?? parseCredentials(CRED_FILE, 'LOS_OPERATOR_TOKEN')
  return { authToken, operatorToken }
}

/** ── 轮询缓存（single-flight，每后端独立节奏） ─────────────────────── */
function makePoller(fn, intervalMs) {
  let snapshot = { ts: null, data: null, error: null }
  let inFlight = null
  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const data = await fn()
        snapshot = { ts: new Date().toISOString(), data, error: null }
      } catch (e) {
        snapshot = { ...snapshot, ts: new Date().toISOString(), error: String(e) }
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }
  async function get(force = false) {
    const stale = !snapshot.ts || (snapshot.data === null && snapshot.error === null)
    if (force || stale || Date.now() - new Date(snapshot.ts).getTime() > intervalMs) {
      await refresh()
    }
    return snapshot
  }
  return { get, refresh, snapshot: () => snapshot }
}

function startPoller(poller, intervalMs) {
  void poller.refresh()
  const timer = setInterval(() => void poller.refresh(), intervalMs)
  timer.unref?.()
  return timer
}

/** ── los 采集（双 token 回退） ─────────────────────────────────────── */
async function losFetch(cfg, tokens, path, { operator = false } = {}) {
  const url = `${cfg.losUrl}${path}`
  const attempt = async (headers) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`los ${path} HTTP ${res.status}`)
    return res
  }
  if (operator) {
    if (tokens.operatorToken) {
      try { return await attempt({ 'x-los-operator-token': tokens.operatorToken }) } catch (e) { /* fallthrough */ }
    }
    throw new Error(`los ${path} 需 operator token（Config.losOperatorToken / losEnvFile / LOS_OPERATOR_TOKEN）`)
  }
  if (tokens.authToken) {
    try { return await attempt({ Authorization: `Bearer ${tokens.authToken}` }) } catch (e) { /* fallthrough */ }
  }
  if (tokens.operatorToken) {
    try { return await attempt({ 'x-los-operator-token': tokens.operatorToken }) } catch (e) { /* fallthrough */ }
  }
  throw new Error(`los ${path} 需 token（Config.losToken / credentials / losEnvFile）`)
}

async function collectLosUsage(cfg, tokens) {
  const res = await losFetch(cfg, tokens, '/usage/summary')
  const d = await res.json()
  return {
    totals: d.totals ?? null,
    byProviderModel: (d.byProviderModel ?? []).map((r) => ({
      provider: r.provider, model: r.model, calls: r.modelResponseCount,
      tokens: r.totalTokens ?? 0, costUsd: r.estimatedCostUsd ?? 0,
      cacheHitRate: r.cacheHitRate ?? null,
    })),
    callTelemetry: (d.callTelemetry ?? []).map((r) => ({
      provider: r.provider, model: r.model, callCount: r.callCount,
      errorCount: r.errorCount, avgDurationMs: r.avgDurationMs,
    })),
  }
}

async function collectLosTrends(cfg, tokens) {
  const res = await losFetch(cfg, tokens, '/metrics/trends')
  const d = await res.json()
  return {
    from: d.from, to: d.to,
    series: (d.series ?? []).map((s) => ({
      provider: s.provider, model: s.model,
      points: (s.points ?? []).map((p) => ({
        day: p.day, callCount: p.callCount ?? 0, errorCount: p.errorCount ?? 0,
        avgDurationMs: p.avgDurationMs ?? null, p95DurationMs: p.p95DurationMs ?? null,
      })),
    })),
  }
}

/** Prometheus 文本 → 分组统计（los /metrics）。 */
function parsePrometheus(text) {
  const out = { taskRuns: {}, runEvals: {}, toolErrors: null, modelCost: null, providerCalls: {}, providerErrors: {}, providerDurationMs: {}, cacheHit: null, cacheMiss: null, raw: 0 }
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(\w+)(?:\{([^}]*)\})?\s+(\S+)$/)
    if (!m) continue
    const name = m[1]
    const labels = {}
    if (m[2]) {
      for (const kv of m[2].split(',')) {
        const [k, v] = kv.split('=')
        if (k) labels[k] = (v ?? '').replace(/^"|"$/g, '')
      }
    }
    const value = Number(m[3])
    out.raw += 1
    if (name === 'los_task_runs_total') out.taskRuns[labels.status ?? '?'] = value
    else if (name === 'los_run_evals_total') out.runEvals[labels.success ?? '?'] = value
    else if (name === 'los_tool_errors_total') out.toolErrors = value
    else if (name === 'los_model_cost_total') out.modelCost = value
    else if (name === 'los_provider_calls_total') out.providerCalls[labels.provider ?? '?'] = value
    else if (name === 'los_provider_errors_total') out.providerErrors[labels.provider ?? '?'] = value
    else if (name === 'los_provider_duration_milliseconds') out.providerDurationMs[labels.provider ?? '?'] = value
    else if (name === 'los_cache_hit_tokens_total') out.cacheHit = value
    else if (name === 'los_cache_miss_tokens_total') out.cacheMiss = value
  }
  return out
}

async function collectLosMetrics(cfg, tokens) {
  const res = await losFetch(cfg, tokens, '/metrics')
  return parsePrometheus(await res.text())
}

async function collectLosNodes(cfg, tokens) {
  const res = await losFetch(cfg, tokens, '/nodes', { operator: true })
  const nodes = await res.json()
  if (!Array.isArray(nodes)) return { error: 'los /nodes 返回非数组' }
  return nodes.map((n) => ({
    nodeId: n.nodeId, hostLabel: n.hostLabel ?? null, status: n.status ?? 'unknown',
    version: n.version ?? null, rolloutState: n.rolloutState ?? null,
    connectModes: n.connectModes ?? [],
    capacity: n.capacity ?? null,
    lastHeartbeatAt: n.lastHeartbeatAt ?? null,
    heartbeatAgeSec: n.lastHeartbeatAt
      ? Math.max(0, Math.round((Date.now() - new Date(n.lastHeartbeatAt).getTime()) / 1000))
      : null,
  }))
}

/** ── macOS 原生探针（零安装，spawnSync 系统命令） ──────────────────── */
function runSync(cmd, args, timeoutMs = 4000) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
    if (r.error) return { error: String(r.error) }
    if (r.status !== 0) return { error: (r.stderr || `exit ${r.status}`).slice(0, 200) }
    return { out: r.stdout }
  } catch (e) {
    return { error: String(e) }
  }
}

function parseLoadavg(text) {
  // macOS `sysctl -n vm.loadavg` 输出带花括号："{ 1.23 0.98 0.76 }"
  const m = text.trim().match(/\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  return m ? { load1: Number(m[1]), load5: Number(m[2]), load15: Number(m[3]) } : null
}

function parseVmStat(text) {
  const pages = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^Pages\s+(\w+):\s+(\d+)\.?/)
    if (m) pages[m[1].toLowerCase()] = Number(m[2])
  }
  return pages
}

function parseIostatCpu(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1] ?? ''
  const nums = last.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 3) return null
  const [us, sy, id] = nums.slice(-3)
  return { us, sy, id, usedPct: Math.round((us + sy) * 10) / 10 }
}

function parseDf(text) {
  const rows = []
  for (const line of text.trim().split('\n').slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 9) continue
    rows.push({
      fs: f[0], size: f[1], used: f[2], avail: f[3], capacity: f[4], mount: f.slice(8).join(' '),
    })
  }
  return rows
}

function parseNetstatIb(text) {
  const byIface = {}
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10 || !f[2]?.startsWith('<Link#')) continue
    const name = f[0]
    const ibytes = Number(f[6] ?? 0)
    const obytes = Number(f[9] ?? 0)
    byIface[name] = { ibytes, obytes }
  }
  return byIface
}

let prevNet = null
let prevNetAt = 0

function collectMacos(cfg) {
  const load = runSync('sysctl', ['-n', 'vm.loadavg'])
  const memsize = runSync('sysctl', ['-n', 'hw.memsize'])
  const ncpu = runSync('sysctl', ['-n', 'hw.ncpu'])
  const model = runSync('sysctl', ['-n', 'hw.model'])
  const pagesize = runSync('sysctl', ['-n', 'hw.pagesize'])
  const vmstat = runSync('vm_stat')
  const iostat = runSync('iostat', ['-c', '2', '-w', '1'])
  const df = runSync('df', ['-h', '/', '/System/Volumes/Data'])
  const netstat = runSync('netstat', ['-ib'])
  const ps = runSync('ps', ['-ax', '-o', 'pid='])

  const loadavg = load.out ? parseLoadavg(load.out) : null
  const pages = vmstat.out ? parseVmStat(vmstat.out) : {}
  const pageSize = pagesize.out ? Number(pagesize.out.trim()) : 16384
  const memTotalMb = memsize.out ? Math.round(Number(memsize.out.trim()) / 1024 / 1024) : null
  // macOS vm_stat 的 free 页仅指「真空闲」；可用内存应计入 inactive/speculative/purgeable
  // （可回收缓存），否则 usedPct 会误报 ~98%。los 的 memoryAvailableMb（host_statistics）
  // 与此口径一致，可用作交叉校验。
  const reclaimable = (pages.inactive ?? 0) + (pages.speculative ?? 0) + (pages.purgeable ?? 0)
  const freeMb = pages.free != null ? Math.round((pages.free * pageSize) / 1024 / 1024) : null
  const availMb = pages.free != null ? Math.round(((pages.free + reclaimable) * pageSize) / 1024 / 1024) : null
  const memUsedPct = memTotalMb && availMb != null ? Math.round(((memTotalMb - availMb) / memTotalMb) * 1000) / 10 : null
  const cpu = iostat.out ? parseIostatCpu(iostat.out) : null
  const disks = df.out ? parseDf(df.out) : []
  const ifaces = netstat.out ? parseNetstatIb(netstat.out) : {}
  const processCount = ps.out ? ps.out.trim().split('\n').filter(Boolean).length : null

  // 网络速率（累计字节差分）
  const now = Date.now()
  let netInBps = null
  let netOutBps = null
  if (prevNet && now > prevNetAt) {
    const dt = (now - prevNetAt) / 1000
    let inB = 0
    let outB = 0
    for (const [name, cur] of Object.entries(ifaces)) {
      const prev = prevNet[name]
      if (!prev) continue
      if (cur.ibytes >= prev.ibytes) inB += cur.ibytes - prev.ibytes
      if (cur.obytes >= prev.obytes) outB += cur.obytes - prev.obytes
    }
    netInBps = Math.round(inB / dt)
    netOutBps = Math.round(outB / dt)
  }
  prevNet = ifaces
  prevNetAt = now

  return {
    host: 'mbp',
    platform: 'darwin',
    cpuModel: model.out?.trim() ?? null,
    cores: ncpu.out ? Number(ncpu.out.trim()) : null,
    loadavg,
    cpu,
    memory: { totalMb: memTotalMb, freeMb, availMb, usedPct: memUsedPct },
    disks,
    net: { inBps: netInBps, outBps: netOutBps, ifaces: Object.fromEntries(Object.entries(ifaces).slice(0, 8)) },
    processCount,
  }
}

/** ── 服务探活 ──────────────────────────────────────────────────────── */
async function probeOne(target) {
  const started = Date.now()
  if (target.url) {
    try {
      const res = await fetch(target.url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
      return { name: target.name, ok: res.status < 500, detail: `HTTP ${res.status}`, latencyMs: Date.now() - started }
    } catch (e) {
      try {
        const res = await fetch(target.url, { method: 'GET', signal: AbortSignal.timeout(3000) })
        return { name: target.name, ok: res.status < 500, detail: `HTTP ${res.status}`, latencyMs: Date.now() - started }
      } catch {
        return { name: target.name, ok: false, detail: 'unreachable', latencyMs: Date.now() - started }
      }
    }
  }
  if (target.port) {
    const host = target.host ?? '127.0.0.1'
    return await new Promise((resolve) => {
      const sock = createConnection({ host, port: target.port })
      const timer = setTimeout(() => {
        sock.destroy()
        resolve({ name: target.name, ok: false, detail: 'timeout', latencyMs: Date.now() - started })
      }, 3000)
      sock.once('connect', () => {
        clearTimeout(timer)
        sock.end()
        resolve({ name: target.name, ok: true, detail: 'tcp ok', latencyMs: Date.now() - started })
      })
      sock.once('error', (e) => {
        clearTimeout(timer)
        resolve({ name: target.name, ok: false, detail: String(e.code ?? e.message).slice(0, 60), latencyMs: Date.now() - started })
      })
    })
  }
  return { name: target.name, ok: false, detail: 'no url/port' }
}

async function collectProbe(cfg) {
  const results = await Promise.all(cfg.probe.targets.map((t) => probeOne(t)))
  const ok = results.filter((r) => r.ok).length
  return { total: results.length, ok, down: results.length - ok, results }
}

/** ── widget 配置存取 ──────────────────────────────────────────────── */
function loadWidgets() {
  try {
    const raw = JSON.parse(readFileSync(WIDGETS_FILE, 'utf8'))
    if (Array.isArray(raw.widgets)) return raw.widgets
    if (Array.isArray(raw)) return raw
  } catch { /* 缺失/损坏 → 默认 */ }
  return DEFAULT_WIDGETS.map((w) => ({ ...w }))
}

function saveWidgets(widgets) {
  const cleaned = widgets
    .filter((w) => w && typeof w.id === 'string' && ALLOWED_ENDPOINTS.has(w.endpoint))
    .map((w) => ({
      id: w.id, type: w.type ?? 'stat', endpoint: w.endpoint,
      title: String(w.title ?? w.id), refreshMs: Number(w.refreshMs ?? 30000),
    }))
  mkdirSync(DEFAULTS_DIR, { recursive: true })
  writeFileSync(WIDGETS_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), widgets: cleaned }, null, 2) + '\n')
  return cleaned
}

function sendJson(res, status, json) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(json))
}

/** ── 插件主体 ─────────────────────────────────────────────────────── */
export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  const tokens = resolveTokens(cfg)

  // 各后端轮询器（los 按子路径各自缓存；macos/probe/glances/kuma 各一）
  const losUsage = makePoller(() => collectLosUsage(cfg, tokens), cfg.losPollMs)
  const losTrends = makePoller(() => collectLosTrends(cfg, tokens), Math.max(cfg.losPollMs, 120000))
  const losMetrics = makePoller(() => collectLosMetrics(cfg, tokens), Math.max(cfg.losPollMs, 120000))
  const losNodes = makePoller(() => collectLosNodes(cfg, tokens), Math.max(cfg.losPollMs, 30000))
  const macos = makePoller(() => collectMacos(cfg), cfg.macos.pollMs)
  const probe = makePoller(() => collectProbe(cfg), cfg.probe.pollMs)
  const glances = makePoller(async () => {
    if (!cfg.glances.enabled) return { enabled: false, reason: 'glances 未启用（Config.glances.enabled）' }
    const res = await fetch(`${cfg.glances.url}/api/4/all`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { enabled: true, error: `glances HTTP ${res.status}` }
    const d = await res.json()
    return { enabled: true, cpu: d.cpu ?? null, mem: d.mem ?? null, load: d.load ?? null, fs: d.fs ?? [], net: d.net ?? null }
  }, cfg.glances.pollMs)
  const kuma = makePoller(async () => {
    if (!cfg.kuma.enabled) return { enabled: false, reason: 'kuma 未启用（Config.kuma.enabled；Z4Nas 排查完成后配置 url+token）' }
    if (!cfg.kuma.url || !cfg.kuma.token) return { enabled: true, error: 'kuma 缺 url/token' }
    const res = await fetch(`${cfg.kuma.url.replace(/\/+$/, '')}/api/v1/monitors`, {
      headers: { Authorization: `Bearer ${cfg.kuma.token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { enabled: true, error: `kuma /api/v1/monitors HTTP ${res.status}` }
    const d = await res.json()
    const monitors = (d.monitors ?? []).map((m) => ({
      id: m.id, name: m.name, active: !!m.active,
      status: (m.active && (m.status === 1 || m.status === 'up')) ? 'up' : ((m.active && m.status === 0) ? 'down' : 'inactive'),
      latency: m.latency ?? null, uptime: m.uptime ?? null,
    }))
    return { enabled: true, monitors }
  }, cfg.kuma.pollMs)

  // macOS 滚动短趋势（内存缓冲）
  const history = []
  const pushHistory = (snap) => {
    const d = snap?.data
    if (!d) return
    history.push({
      ts: snap.ts,
      load1: d.loadavg?.load1 ?? null,
      cpuUsedPct: d.cpu?.usedPct ?? null,
      memUsedPct: d.memory?.usedPct ?? null,
      netInBps: d.net?.inBps ?? null,
      netOutBps: d.net?.outBps ?? null,
    })
    if (history.length > cfg.macos.historyPoints) history.shift()
  }
  const macosTimer = setInterval(() => pushHistory(macos.snapshot()), 2000)
  macosTimer.unref?.()

  const timers = [
    startPoller(losUsage, cfg.losPollMs),
    startPoller(losTrends, Math.max(cfg.losPollMs, 120000)),
    startPoller(losMetrics, Math.max(cfg.losPollMs, 120000)),
    startPoller(losNodes, Math.max(cfg.losPollMs, 30000)),
    startPoller(macos, cfg.macos.pollMs),
    startPoller(probe, cfg.probe.pollMs),
    startPoller(glances, cfg.glances.pollMs),
    startPoller(kuma, cfg.kuma.pollMs),
  ]

  ctx.webServer.register({
    kind: 'prefix',
    path: '/dashboards',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const method = req.method ?? 'GET'
      const path = url.pathname
      try {
        if (method === 'GET' && path === '/dashboards/status') {
          const s = (p) => {
            const snap = p.snapshot()
            return { ts: snap.ts, error: snap.error ?? null, hasData: snap.data !== null }
          }
          sendJson(res, 200, {
            ts: new Date().toISOString(),
            backends: {
              los: { usage: s(losUsage), trends: s(losTrends), metrics: s(losMetrics), nodes: s(losNodes) },
              macos: { ...s(macos), enabled: cfg.macos.enabled },
              probe: s(probe),
              glances: { enabled: cfg.glances.enabled, ...s(glances) },
              kuma: { enabled: cfg.kuma.enabled, ...s(kuma) },
            },
            widgets: loadWidgets().length,
          })
          return
        }
        if (method === 'GET' && path === '/dashboards/los/usage') { sendJson(res, 200, await losUsage.get()); return }
        if (method === 'GET' && path === '/dashboards/los/trends') { sendJson(res, 200, await losTrends.get()); return }
        if (method === 'GET' && path === '/dashboards/los/metrics') { sendJson(res, 200, await losMetrics.get()); return }
        if (method === 'GET' && path === '/dashboards/los/nodes') { sendJson(res, 200, await losNodes.get()); return }
        if (method === 'GET' && path === '/dashboards/macos') { const s = await macos.get(); if (cfg.macos.enabled && !s.data) await macos.refresh(); sendJson(res, 200, s); return }
        if (method === 'GET' && path === '/dashboards/macos/history') {
          pushHistory(macos.snapshot())
          sendJson(res, 200, { ts: new Date().toISOString(), points: history.slice(-60) })
          return
        }
        if (method === 'GET' && path === '/dashboards/probe') { sendJson(res, 200, await probe.get()); return }
        if (method === 'GET' && path === '/dashboards/glances') { sendJson(res, 200, await glances.get()); return }
        if (method === 'GET' && path === '/dashboards/kuma') { sendJson(res, 200, await kuma.get()); return }
        if (method === 'GET' && path === '/dashboards/widgets') {
          sendJson(res, 200, { ts: new Date().toISOString(), widgets: loadWidgets() })
          return
        }
        if (method === 'PUT' && path === '/dashboards/widgets') {
          let body = {}
          try {
            const raw = await new Promise((resolve, reject) => {
              let acc = ''
              req.on('data', (chunk) => { acc += chunk })
              req.on('end', () => resolve(acc))
              req.on('error', reject)
            })
            body = raw ? JSON.parse(raw) : {}
          } catch { /* body 解析失败 → 空 */ }
          const widgets = Array.isArray(body.widgets) ? body.widgets : (Array.isArray(body) ? body : [])
          sendJson(res, 200, { ok: true, widgets: saveWidgets(widgets) })
          return
        }
        sendJson(res, 404, { error: 'not found', path })
      } catch (e) {
        sendJson(res, 500, { error: String(e) })
      }
    },
  })

  ctx.on('dispose', () => {
    for (const t of timers) clearInterval(t)
    clearInterval(macosTimer)
  })

  ctx.logger.info(`[dsh-dashboards] API mounted at /dashboards (los=${cfg.losUrl} macos=${cfg.macos.enabled} kuma=${cfg.kuma.enabled} glances=${cfg.glances.enabled})`)
}
