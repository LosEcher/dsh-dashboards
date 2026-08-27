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
 *   GET /dashboards/probe-targets      探针目标（store 优先 → Config.probe.targets → DEFAULT_TARGETS）
 *   PUT /dashboards/probe-targets      保存探针目标（空数组 = 重置回默认；持久化 ~/.dsh/storages/dsh-dashboards/probe-targets.json）
 *   GET /dashboards/glances            Glances /api/4/all（可选后端，默认关）
 *   GET /dashboards/kuma               Uptime Kuma /api/v1/monitors（可选后端，默认关）
 *   GET /dashboards/feed/digests       feed 采集摘要报告（~/.dsh/scheduler-reports/feed/）
 *   GET  /dashboards/widgets           看板 widget 配置（host 侧存储）
 *   PUT  /dashboards/widgets           保存 widget 配置（校验 endpoint 白名单）
 *
 * 全部只读采集；token 只留 host 侧（los 双 token：Bearer 用量 + operator 节点）。
 */

import Schema from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'
import { parseLoadavg, parseVmStat, parseIostatCpu, parseDf, parseNetstatIb, parsePrometheus, parseKumaMetrics, fillGapPoints, historyPointChanged, shouldRefreshSlow, bucketKey, accumulateBucket, finalizeBucket, bucketFromRow, downsampleAnchored, HISTORY_METRICS } from './lib/parsers.mjs'

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
    /** 磁盘水位告警阈值 %（0=关闭；仅 /System/Volumes/Data 数据卷）。 */
    diskAlertPct: Schema.number(),
    /** 同一水位区间内的告警冷却 ms（防止每拍重复推送）。 */
    diskAlertCooldownMs: Schema.number(),
    /** 磁盘水位独立检查间隔 ms（不受看板 idle 门控，看板未打开也告警）。 */
    diskAlertCheckMs: Schema.number(),
    /** 慢变量降频间隔 ms（B2）：df 容量/进程数分钟级，按此间隔复用缓存，其余快变量每拍。 */
    slowCmdMs: Schema.number(),
    /** 变化门控写入（B1）：指标无实质变化时跳过磁盘 append（内存窗口仍保留全部点）。 */
    writeGate: Schema.boolean(),
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
  surgeRep: Schema.object({
    pollMs: Schema.number(),
    /** ai-node-reputation 状态文件（surge-auto，~/.local/state/surge-auto/ai-reputation-state.json）。 */
    stateFile: Schema.string(),
    /** 事件流（与 surge-health-watch 共用）。 */
    eventsFile: Schema.string(),
  }),
})

const HOME = process.env.DSH_HOME ?? `${homedir()}/.dsh`
const CRED_FILE = join(HOME, '.credentials.yaml')
const WIDGETS_FILE = join(HOME, 'storages/dsh-dashboards/widgets.json')
/** 探针目标 store：UI 编辑（PUT /dashboards/probe-targets）落盘于此，优先于 Config.probe.targets 与 DEFAULT_TARGETS。 */
const PROBE_FILE = join(HOME, 'storages/dsh-dashboards/probe-targets.json')
const DEFAULTS_DIR = join(HOME, 'storages/dsh-dashboards')
/** macOS 滚动趋势持久化（事件溯源风格 jsonl，追加写；重启不清零，2026-08-19）。 */
const HISTORY_FILE = join(HOME, 'storages/dsh-dashboards/history.jsonl')
/** B3 多分辨率聚合落盘：minute 桶（60s，7 天）与 hour 桶（3600s，90 天）。
 * raw 档保留 2h（historyPoints×pollMs≈1h，内存窗口）；长窗口读聚合档。 */
const HISTORY_MIN_FILE = join(HOME, 'storages/dsh-dashboards/history-min.jsonl')
const HISTORY_HOUR_FILE = join(HOME, 'storages/dsh-dashboards/history-hour.jsonl')
const AGG_MIN_MS = 60_000
const AGG_HOUR_MS = 3_600_000
const AGG_MIN_RETENTION_MS = 7 * 86_400_000
const AGG_HOUR_RETENTION_MS = 90 * 86_400_000
/** 聚合落盘节奏：minute 档每 5min 落盘一次、hour 档每 30min 一次（文件小，全量重写）。 */
const AGG_MIN_FLUSH_MS = 300_000
const AGG_HOUR_FLUSH_MS = 1_800_000
/** feed 采集摘要报告目录（scheduler job「多平台 feed 采集摘要」落盘：feed-digest-*.md 在 scheduler-reports 根目录；feed/ 子目录是原始 JSON，feed-profile/ 是画像）。 */
const FEED_DIR = join(HOME, 'scheduler-reports')

/** widget endpoint 白名单（防 PUT 注入任意路径）。 */
const ALLOWED_ENDPOINTS = new Set([
  '/dashboards/los/usage', '/dashboards/los/trends', '/dashboards/los/metrics', '/dashboards/los/nodes',
  '/dashboards/macos', '/dashboards/macos/history', '/dashboards/probe', '/dashboards/glances', '/dashboards/kuma',
  '/dashboards/feed/digests', '/dashboards/surge/ai-reputation', '/dashboards/ai-quota',
  '/dashboards/dsh/usage',
  '/dashboards/usage/reconcile',
])

/** Surge 节点信誉数据源（surge-auto ai-node-reputation 输出）。 */
const SURGE_STATE_FILE = join(homedir(), '.local/state/surge-auto/ai-reputation-state.json')
const SURGE_EVENTS_FILE = join(homedir(), '.local/state/surge-auto/health-watch-events.jsonl')
/** ai-node-reputation 状态 → 看板展示标签（client 侧同样维护一份 locale，这里只用于后端聚合兜底）。 */
const SURGE_STATUS_LABEL = {
  healthy: 'healthy', grok_403: 'grok_403', xai_blocked: 'xai_blocked',
  xai_banned: 'xai_banned', dead: 'dead', xai_partial: 'xai_partial',
}

/** 活动门控：超过此时长无 /dashboards 请求，后台轮询暂停（看板未打开时不空转采集）。 */
const IDLE_PAUSE_MS = 180_000
let lastActivityAt = Date.now()
function touchActivity() { lastActivityAt = Date.now() }
function isIdle() { return Date.now() - lastActivityAt > IDLE_PAUSE_MS }

const DEFAULT_TARGETS = [
  { name: 'dsh-web', url: 'http://127.0.0.1:3080' },
  { name: 'los-gateway', url: 'http://127.0.0.1:8080' },
  { name: 'los-otel', port: 4318 },
  // 示例目标（可经 /dashboards/probe-targets 编辑增删；本机服务默认，远程/内部服务按部署配置）
  { name: 'local-agent', port: 10086 },
]

const DEFAULT_WIDGETS = [
  { id: 'los-usage', type: 'stat', endpoint: '/dashboards/los/usage', title: 'LLM 用量 24h', refreshMs: 60000 },
  { id: 'los-nodes', type: 'matrix', endpoint: '/dashboards/los/nodes', title: '执行节点', refreshMs: 30000 },
  { id: 'los-latency', type: 'chart', endpoint: '/dashboards/los/trends', title: 'provider 延迟', refreshMs: 300000 },
  { id: 'mbp-load', type: 'chart', endpoint: '/dashboards/macos/history', title: '本机负载', refreshMs: 30000 },
  { id: 'mbp-mem', type: 'stat', endpoint: '/dashboards/macos', title: '本机内存', refreshMs: 30000 },
  { id: 'svc-probe', type: 'list', endpoint: '/dashboards/probe', title: '关键服务', refreshMs: 30000 },
  { id: 'kuma-status', type: 'list', endpoint: '/dashboards/kuma', title: '服务状态', refreshMs: 30000 },
  { id: 'feed-digests', type: 'feed', endpoint: '/dashboards/feed/digests', title: 'feed 采集摘要', refreshMs: 60000 },
  { id: 'surge-ai-rep', type: 'surge', endpoint: '/dashboards/surge/ai-reputation', title: 'Surge 节点信誉', refreshMs: 30000 },
  { id: 'ai-quota', type: 'quota', endpoint: '/dashboards/ai-quota', title: 'AI 额度', refreshMs: 60000 },
  { id: 'dsh-usage', type: 'usage', endpoint: '/dashboards/dsh/usage', title: 'DSH 消耗 7d', refreshMs: 120000 },
  { id: 'usage-reconcile', type: 'reconcile', endpoint: '/dashboards/usage/reconcile', title: '消耗对账', refreshMs: 120000 },
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
      // 30s：与 los 节点心跳（30-45s）同频，图表粒度足够；los 已含同源 load/内存快照
      pollMs: c.macos?.pollMs ?? 30000,
      historyPoints: c.macos?.historyPoints ?? 120,
      // 磁盘水位告警：>85% 触发，冷却 6h（同区间不重复推），检查间隔 5min
      diskAlertPct: c.macos?.diskAlertPct ?? 85,
      diskAlertCooldownMs: c.macos?.diskAlertCooldownMs ?? 6 * 3600_000,
      diskAlertCheckMs: c.macos?.diskAlertCheckMs ?? 300_000,
      // 慢变量降频（B2）：df/ps 分钟级，默认 5×pollMs（150s）复用缓存
      slowCmdMs: c.macos?.slowCmdMs ?? 150_000,
      // 变化门控写入（B1）：默认开
      writeGate: c.macos?.writeGate ?? true,
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
    surgeRep: {
      pollMs: c.surgeRep?.pollMs ?? 30000,
      stateFile: c.surgeRep?.stateFile ?? SURGE_STATE_FILE,
      eventsFile: c.surgeRep?.eventsFile ?? SURGE_EVENTS_FILE,
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
  const timer = setInterval(() => {
    // 活动门控：看板未打开（无 /dashboards 请求）时跳过本轮，零采集开销
    if (isIdle()) return
    void poller.refresh()
  }, intervalMs)
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
  // 显式 24h 窗口（与 widget 标题「LLM 用量 24h」一致）；los /usage/summary 缺省是 7 天，
  // 不传会把 7 天汇总当成 24h 展示（成本数字差 ~26 倍，2026-08-19 实测对拍）。
  const from = new Date(Date.now() - 24 * 3600_000).toISOString()
  const res = await losFetch(cfg, tokens, `/usage/summary?from=${encodeURIComponent(from)}`)
  const d = await res.json()
  return {
    // 透传 los 实际窗口（ISO 字符串），供对账视图标注口径（los 缺省 7d，本插件显式传 24h）
    from: d.from ?? null,
    to: d.to ?? null,
    totals: d.totals ?? null,
    byProviderModel: (d.byProviderModel ?? []).map((r) => ({
      provider: r.provider, model: r.model, calls: r.modelResponseCount,
      // los 行无 totalTokens/cacheHitRate 字段（只有 prompt/completion/hit/miss），2026-08-19 修正映射
      tokens: (r.promptTokens ?? 0) + (r.completionTokens ?? 0),
      costUsd: r.estimatedCostUsd ?? 0,
      cacheHitRate: (r.cacheHitTokens ?? 0) + (r.cacheMissTokens ?? 0) > 0
        ? (r.cacheHitTokens ?? 0) / ((r.cacheHitTokens ?? 0) + (r.cacheMissTokens ?? 0))
        : null,
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

/** ── macOS 原生探针（零安装，异步 execFile，绝不阻塞事件循环） ──────
 * 2026-08-16 修复：原 spawnSync 链在 SMB/NFS 挂载 stall 时会以 D 态子进程
 * 同步卡死事件循环（曾冻住协调重启的 force-exit 定时器 3.5 分钟）。
 * 现改异步 execFile + SIGKILL 硬上限 + 看门狗（withTimeout），单命令失败
 * 只降级该字段，不拖垮整次采集。
 */
const PROBE_CMD_TIMEOUT_MS = 3000
/** 单次采集整体硬上限（看门狗；超时记 error，下一拍重试）。 */
const PROBE_TOTAL_TIMEOUT_MS = 12000

function runExec(cmd, args, timeoutMs = PROBE_CMD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      windowsHide: true,
    }, (err, stdout) => {
      if (err) {
        // D 态子进程 SIGKILL 也可能被延迟到 I/O 返回——异步等待不会阻塞事件循环。
        resolve({ error: String(err.message ?? err.code ?? err).slice(0, 200) })
        return
      }
      resolve({ out: stdout })
    })
  })
}

/** 看门狗：整体超时兜底（无论底层卡多久，这里按时 reject，由 poller 记 error）。 */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms)
  })
  timer?.unref?.()
  return Promise.race([promise, timeout])
}

let prevNet = null
let prevNetAt = 0

/** 慢变量降频缓存（B2）：df 容量/ps 进程数分钟级变化，按 slowCmdMs 复用缓存，
 * 避免每拍重复 exec（df 可能卡挂载，ps 遍历 500+ 进程）。镜像
 * mac-performance-monitor 的 batteryReadInterval/SMC slowInterval 语义。 */
const slowCmdCache = { df: { at: 0, out: null }, ps: { at: 0, out: null } }

async function collectMacos(cfg) {
  // 慢变量降频判定的基准时间（网络差分用函数内后面的 now；这里是降频用）
  const slowNow = Date.now()
  // 各命令并行执行：总耗时 = max(单命令) 而非累加；df 卡住不影响 load/mem/cpu。
  const slowMs = cfg.macos.slowCmdMs
  const dfDue = shouldRefreshSlow(slowCmdCache.df.at, slowNow, slowMs)
  const psDue = shouldRefreshSlow(slowCmdCache.ps.at, slowNow, slowMs)
  const [load, memsize, ncpu, model, pagesize, vmstat, iostat, dfRes, netstat, psRes] = await Promise.all([
    runExec('sysctl', ['-n', 'vm.loadavg']),
    runExec('sysctl', ['-n', 'hw.memsize']),
    runExec('sysctl', ['-n', 'hw.ncpu']),
    runExec('sysctl', ['-n', 'hw.model']),
    runExec('sysctl', ['-n', 'hw.pagesize']),
    runExec('vm_stat'),
    runExec('iostat', ['-c', '2', '-w', '1']),
    dfDue ? runExec('df', ['-h', '/', '/System/Volumes/Data']) : Promise.resolve(slowCmdCache.df.out ?? { out: null }),
    runExec('netstat', ['-ib']),
    psDue ? runExec('ps', ['-ax', '-o', 'pid=']) : Promise.resolve(slowCmdCache.ps.out ?? { out: null }),
  ])
  // 慢变量只在真正重跑时更新缓存（失败保留旧值，避免缓存被 error 污染）
  if (dfDue && dfRes?.out) { slowCmdCache.df = { at: slowNow, out: dfRes } }
  if (psDue && psRes?.out) { slowCmdCache.ps = { at: slowNow, out: psRes } }
  const df = dfRes
  const ps = psRes

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
    host: hostname(),
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

/** ── 服务探活 ────────────────────────────────────────────────────────
 * 2026-08-19 P2：状态三分——ok(<400) / degraded(4xx) / down(≥500 或不可达)；
 * HEAD 405（方法不允许）自动降级 GET 复测（服务在但 HEAD 未实现）。
 */
async function tryProbe(url, method) {
  try {
    return await fetch(url, { method, signal: AbortSignal.timeout(3000) })
  } catch {
    return null
  }
}

async function probeOne(target) {
  const started = Date.now()
  if (target.url) {
    const head = await tryProbe(target.url, 'HEAD')
    const res = head?.status === 405 ? await tryProbe(target.url, 'GET') : head
    if (!res) return { name: target.name, ok: false, degraded: false, detail: 'unreachable', latencyMs: Date.now() - started }
    const status = res.status
    return {
      name: target.name,
      ok: status < 400,
      degraded: status >= 400 && status < 500,
      detail: `HTTP ${status}`,
      latencyMs: Date.now() - started,
    }
  }
  if (target.port) {
    const host = target.host ?? '127.0.0.1'
    return await new Promise((resolve) => {
      const sock = createConnection({ host, port: target.port })
      const timer = setTimeout(() => {
        sock.destroy()
        resolve({ name: target.name, ok: false, degraded: false, detail: 'timeout', latencyMs: Date.now() - started })
      }, 3000)
      sock.once('connect', () => {
        clearTimeout(timer)
        sock.end()
        resolve({ name: target.name, ok: true, degraded: false, detail: 'tcp ok', latencyMs: Date.now() - started })
      })
      sock.once('error', (e) => {
        clearTimeout(timer)
        resolve({ name: target.name, ok: false, degraded: false, detail: String(e.code ?? e.message).slice(0, 60), latencyMs: Date.now() - started })
      })
    })
  }
  return { name: target.name, ok: false, degraded: false, detail: 'no url/port' }
}

async function collectProbe(cfg) {
  const targets = loadProbeTargets(cfg)
  const results = await Promise.all(targets.map((t) => probeOne(t)))
  const ok = results.filter((r) => r.ok).length
  const degraded = results.filter((r) => r.degraded).length
  return { total: results.length, ok, degraded, down: results.length - ok - degraded, results }
}

/** ── feed 采集摘要报告（scheduler 落盘文件，只读，零持久化） ──────────
 * 读 ~/.dsh/scheduler-reports/feed/feed-digest-*.md 最新 N 份。
 * 文件名即时间戳（feed-digest-YYYYMMDD-HHMM.md，本地时区）；正文截断返回，
 * 卡片展开显示。目录缺失/无产出时降级为空列表 + 提示（不报错）。
 */
const FEED_MAX_DIGESTS = 5
const FEED_MAX_TEXT = 8000

function parseFeedTimestamp(file) {
  const m = String(file).match(/^feed-digest-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.md$/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  // 无时区 ISO：浏览器端按本地时区解析，与文件名（本地时间）一致
  return `${y}-${mo}-${d}T${h}:${mi}:00`
}

function collectFeedDigests() {
  let files = []
  try {
    files = readdirSync(FEED_DIR)
      .filter((f) => /^feed-digest-\d{8}-\d{4}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, FEED_MAX_DIGESTS)
  } catch {
    return { dir: FEED_DIR, count: 0, digests: [], error: 'feed 报告目录不可读（尚无 job 产出？）' }
  }
  const digests = files.map((file) => {
    let text = ''
    try {
      text = readFileSync(join(FEED_DIR, file), 'utf8').replace(/^\uFEFF/, '')
    } catch {
      text = ''
    }
    const first = (text.split('\n')[0] ?? '').trim()
    const title = first.startsWith('#') ? first.replace(/^#+\s*/, '') : (first || file)
    return {
      file,
      at: parseFeedTimestamp(file),
      title: title.slice(0, 120),
      lines: text.split('\n').filter((l) => l.trim()).length,
      size: text.length,
      text: text.slice(0, FEED_MAX_TEXT),
    }
  })
  return { dir: FEED_DIR, count: digests.length, digests }
}

/** ── Surge AI 节点信誉（surge-auto ai-node-reputation 派生展示） ───── */
function collectSurgeRep(cfg) {
  const stateFile = cfg.surgeRep.stateFile
  const eventsFile = cfg.surgeRep.eventsFile
  let state = null
  let stateErr = null
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    stateErr = `状态文件缺失（先运行 ai-node-reputation.mjs run）: ${stateFile}`
  }

  // 事件流尾部（source=ai-node-reputation，最多 8 条）
  const recentEvents = []
  try {
    const lines = readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0 && recentEvents.length < 8; i -= 1) {
      try {
        const e = JSON.parse(lines[i])
        if (e.source === 'ai-node-reputation') {
          recentEvents.push({ ts: e.ts, type: e.type, node: e.node ?? null, reason: e.reason ?? null })
        }
      } catch { /* 忽略坏行 */ }
    }
  } catch { /* 事件文件缺失 → 空列表 */ }

  const report = state?.lastReport ?? null
  const nodes = []
  const summary = { healthy: 0, grok_403: 0, xai_blocked: 0, xai_banned: 0, dead: 0, xai_partial: 0, quarantined: 0 }
  if (report?.probeResults) {
    for (const [name, r] of Object.entries(report.probeResults)) {
      const ai = r.ai ?? {}
      const control = r.control ?? {}
      const ctrlEntry = Object.values(control)[0] ?? null
      const q = state.quarantined?.[name] ?? null
      const status = r.status in summary ? r.status : 'xai_partial'
      summary[status] += 1
      if (q) summary.quarantined += 1
      nodes.push({
        name,
        status,
        xai: ai['api.x.ai'] ?? null,
        grok: ai['grok.com'] ?? null,
        openai: ai['api.openai.com'] ?? null,
        ctrl: ctrlEntry,
        quarantined: !!q,
        quarantineSince: q?.since ?? null,
        cooldownUntil: q?.cooldownUntil ?? null,
        reason: q?.reason ?? null,
      })
    }
    nodes.sort((a, b) => {
      const order = { dead: 0, xai_banned: 1, xai_blocked: 2, grok_403: 3, xai_partial: 4, healthy: 5 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name)
    })
  }

  return {
    updatedAt: state?.lastRunAt ?? null,
    lastApplyAt: state?.lastApplyAt ?? null,
    summary,
    nodes,
    recentEvents,
    error: stateErr,
  }
}

/** ── macOS 趋势持久化（history.jsonl，事件溯源风格） ─────────────────
 * 追加写一行/点；启动加载最近 maxPoints 点（重启不清零，2026-08-19 P2）。
 * 磁盘错误一律静默降级：采集链路不因持久化失败中断。
 */
function loadHistoryFromDisk(maxPoints) {
  try {
    const lines = readFileSync(HISTORY_FILE, 'utf8').trim().split('\n').filter(Boolean)
    if (lines.length > maxPoints * 3) {
      // 文件超长 → 压缩只保留最近 maxPoints 行（30s/点 ≈ 2 天/1200 行后触发）
      const keep = lines.slice(-maxPoints)
      mkdirSync(DEFAULTS_DIR, { recursive: true })
      writeFileSync(HISTORY_FILE, keep.join('\n') + '\n')
      return keep.map(parseHistoryLine).filter(Boolean)
    }
    const from = Math.max(0, lines.length - maxPoints)
    return lines.slice(from).map(parseHistoryLine).filter(Boolean)
  } catch {
    return []
  }
}

function parseHistoryLine(line) {
  try {
    const p = JSON.parse(line)
    if (p && typeof p.ts === 'string') return p
  } catch { /* 坏行跳过 */ }
  return null
}

function appendHistoryToDisk(point) {
  try {
    appendFileSync(HISTORY_FILE, JSON.stringify(point) + '\n')
  } catch { /* 忽略 */ }
}

/** ── B3 多分辨率聚合读写（history-min/hour.jsonl） ────────────────────
 * 内存 Map 直接存累加状态（accumulateBucket 输出），落盘/查询时才 finalize。
 * 每行 = finalizeBucket 输出（{bucket, samples, <metric>:{min,avg,max,count}}）。
 * 全量重写 + 按保留窗口裁剪（文件小：7d×1440 桶 + 90d×24 桶 ≈ 万级行）。
 * 启动加载最近桶继续聚合（bucketFromRow 无损恢复 sum/count）。 */
function loadAggregates(file) {
  try {
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
    const buckets = new Map()
    for (const line of lines) {
      const row = JSON.parse(line)
      if (row && typeof row.bucket === 'number') buckets.set(row.bucket, bucketFromRow(row))
    }
    return buckets
  } catch {
    return new Map()
  }
}

function saveAggregates(file, buckets, retentionMs) {
  try {
    const now = Date.now()
    const rows = []
    for (const [bucket, acc] of buckets) {
      if (now - bucket > retentionMs) continue
      rows.push(finalizeBucket(acc, bucket))
    }
    rows.sort((a, b) => a.bucket - b.bucket)
    mkdirSync(DEFAULTS_DIR, { recursive: true })
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  } catch { /* 忽略 */ }
}

/** 折叠聚合桶 Map 为查询点序列（截断窗口后升序返回）。 */
function aggregatesToPoints(buckets, windowMs) {
  const now = Date.now()
  const from = now - windowMs
  const keys = [...buckets.keys()].filter((k) => k >= from).sort((a, b) => a - b)
  return keys.map((k) => {
    const r = finalizeBucket(buckets.get(k), k)
    return {
      ts: new Date(k).toISOString(),
      load1: r.load1?.avg ?? null,
      memUsedPct: r.memUsedPct?.max ?? null,
      cpuUsedPct: r.cpuUsedPct?.avg ?? null,
      netInBps: r.netInBps?.avg ?? null,
      netOutBps: r.netOutBps?.avg ?? null,
      bucketSamples: r.samples ?? 0,
    }
  })
}

/** ── AI 额度（ZenMux PAYG/订阅 + Packy 余额）────────────────────────
 * 数据源：
 *   ZenMux management API（ZENMUX_MANAGEMENT_API_KEY，~/.dsh/.credentials.yaml）
 *     GET https://zenmux.ai/api/v1/management/payg/balance
 *     GET https://zenmux.ai/api/v1/management/subscription/detail
 *   Packy NewAPI（PACKY_SYSTEM_TOKEN + PACKY_USER_ID，同上文件）
 *     GET https://www.packyapi.com/api/user/self  (New-Api-User 头)
 */
function readCredential(name) {
  try {
    const text = readFileSync(join(HOME, '.credentials.yaml'), 'utf8')
    const m = text.match(new RegExp(`^${name}:\\s*(\\S+)\\s*$`, 'm'))
    if (m) return m[1]
  } catch { /* ignore */ }
  return process.env[name] ?? null
}

/** Packy 查询被 Cloudflare bot 防护/网络错误后的重试节流（ms 时间戳；借鉴 Orca retryAtMs）。 */
let packyRetryAtMs = 0

async function collectAiQuota() {
  const out = { zenmux: null, packy: null, errors: [] }
  const mgmtKey = readCredential('ZENMUX_MANAGEMENT_API_KEY')
  if (mgmtKey) {
    try {
      const [balance, sub] = await Promise.all([
        fetch('https://zenmux.ai/api/v1/management/payg/balance', { headers: { Authorization: `Bearer ${mgmtKey}` } }).then((r) => r.json()),
        fetch('https://zenmux.ai/api/v1/management/subscription/detail', { headers: { Authorization: `Bearer ${mgmtKey}` } }).then((r) => r.json()),
      ])
      const b = balance?.data ?? {}
      const s = sub?.data ?? {}
      const q5 = s.quota_5_hour ?? {}
      const q7 = s.quota_7_day ?? {}
      const qm = s.quota_monthly ?? {}
      const windowOf = (q) => ({
        used: q.used_flows ?? 0,
        max: q.max_flows ?? 0,
        usedUsd: Number(q.used_value_usd ?? 0),
        maxUsd: Number(q.max_value_usd ?? 0),
        usedPercent: q.max_flows ? Math.round(((q.used_flows ?? 0) / q.max_flows) * 100) : 0,
        resetsAt: typeof q.resets_at === 'number' ? q.resets_at : null,
      })
      out.zenmux = {
        paygBalanceUsd: Number(b.total_credits ?? 0),
        plan: s.plan?.tier ?? null,
        planAmountUsd: Number(s.plan?.amount_usd ?? 0),
        accountStatus: s.account_status ?? null,
        quotas: { h5: windowOf(q5), d7: windowOf(q7), month: windowOf(qm) },
      }
    } catch (e) {
      out.errors.push(`zenmux: ${e?.message ?? e}`)
    }
  } else {
    out.errors.push('zenmux: ZENMUX_MANAGEMENT_API_KEY 未配置')
  }

  const now = Date.now()
  if (packyRetryAtMs && now < packyRetryAtMs) {
    out.errors.push(`packy: 上次查询被限流，${Math.ceil((packyRetryAtMs - now) / 60000)} 分钟后自动重试`)
  } else {
    const packyToken = readCredential('PACKY_SYSTEM_TOKEN')
    const packyUserId = readCredential('PACKY_USER_ID')
    if (packyToken && packyUserId) {
      try {
        const res = await fetch('https://www.packyapi.com/api/user/self', {
          headers: {
            Authorization: `Bearer ${packyToken}`,
            'New-Api-User': packyUserId,
            'User-Agent': 'cc-switch/1.0',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        })
        const text = await res.text()
        let body
        try {
          body = JSON.parse(text)
        } catch {
          // Cloudflare bot 挑战页或非 JSON 响应
          packyRetryAtMs = Date.now() + 10 * 60_000
          out.errors.push('packy: 查询被服务端拦截（Cloudflare bot 防护），10 分钟后自动重试')
          return out
        }
        if (!body?.success) {
          out.errors.push(`packy: ${body?.message ?? res.status}`)
        } else {
          const d = body.data ?? {}
          out.packy = {
            remainingUsd: Number(d.quota ?? 0) / 500000,
            usedUsd: Number(d.used_quota ?? 0) / 500000,
            totalUsd: (Number(d.quota ?? 0) + Number(d.used_quota ?? 0)) / 500000,
            requestCount: d.request_count ?? null,
            group: d.group ?? null,
          }
        }
      } catch (e) {
        packyRetryAtMs = Date.now() + 5 * 60_000
        out.errors.push(`packy: ${e?.message ?? e}（5 分钟后重试）`)
      }
    } else {
      out.errors.push('packy: PACKY_SYSTEM_TOKEN / PACKY_USER_ID 未配置')
    }
  }
  return out
}

/** ── DSH 本地会话 usage 聚合（P5：只读 ~/.dsh/sessions 派生投影，无副作用） ──
 * 调 scripts/dsh-usage-aggregate.py（python3 + zstandard），窗口=最近 7 天，
 * 输出形状对齐 los.usage-summary（evidenceClass=dsh_sessions），供统一对账。
 */
const DSH_USAGE_SCRIPT = fileURLToPath(new URL('./scripts/dsh-usage-aggregate.py', import.meta.url))
const DSH_USAGE_TIMEOUT_MS = 20000

async function collectDshUsage() {
  const fromMs = Date.now() - 7 * 86400_000
  const { out, error } = await runExec('python3', [DSH_USAGE_SCRIPT, '--from-ms', String(fromMs)], DSH_USAGE_TIMEOUT_MS)
  // 成功直接返回聚合对象（平铺），失败 throw 交给 poller 记 snapshot.error——
  // 与 collectLosUsage 等其它 collector 一致。旧实现返回 {data, error} 会被
  // poller 再包一层（snapshot.data.data），导致客户端与对账读 .totals 全部
  // undefined →「DSH 消耗 7d」与「DSH sessions」永远显示无数据（2026-08-23 定位）。
  if (error) throw new Error(`dsh-usage: ${error}`)
  try {
    const parsed = JSON.parse(out)
    if (parsed.error) throw new Error(`dsh-usage: ${parsed.error}`)
    return parsed
  } catch (e) {
    throw new Error(`dsh-usage parse: ${e?.message ?? e}`)
  }
}

/** ── 统一消耗对账（P6）：DSH sessions + los runtime + 配额 三源合并 ──
 * 纯函数；poller 实例由 apply 闭包传入（collectDshUsage 等可模块级定义，
 * 因为它们不依赖 apply 内的 poller）。
 */
async function collectUsageReconcile(dshUsageRef, losUsageRef, aiQuotaRef) {
  const [dshSnap, losSnap, quotaSnap] = await Promise.all([
    dshUsageRef.get(), losUsageRef.get(), aiQuotaRef.get(),
  ])
  const dsh = dshSnap.data
  const los = losSnap.data
  const quota = quotaSnap.data
  const errors = []
  if (dshSnap.error) errors.push(`dsh: ${dshSnap.error}`)
  if (losSnap.error) errors.push(`los: ${losSnap.error}`)
  if (quotaSnap.error) errors.push(`quota: ${quotaSnap.error}`)
  const combined = {
    modelResponseCount: (dsh?.totals?.modelResponseCount ?? 0) + (los?.totals?.modelResponseCount ?? 0),
    totalTokens: (dsh?.totals?.totalTokens ?? 0) + (los?.totals?.totalTokens ?? 0),
    estimatedCostUsd: round2((dsh?.totals?.estimatedCostUsd ?? 0) + (los?.totals?.estimatedCostUsd ?? 0)),
    cacheSavingsUsd: round2((dsh?.totals?.cacheSavingsUsd ?? 0) + (los?.totals?.cacheSavingsUsd ?? 0)),
  }
  return {
    evidenceClass: 'usage_reconcile',
    generatedAt: Date.now(),
    // 窗口元信息：DSH 聚合窗口（epoch ms，脚本输出）与 los 网关窗口（ISO 字符串）。
    // 两者窗口不同（DSH 7d、los 24h），combined 是跨窗口近似相加，UI 必须标注。
    windows: {
      dsh: { from: dsh?.from ?? null, to: dsh?.to ?? null },
      los: { from: los?.from ?? null, to: los?.to ?? null },
    },
    sources: {
      dshSessions: dsh,
      losRuntime: los,
      quotas: quota,
    },
    combined,
    errors,
  }
}
function round2(n) { return Math.round(n * 100) / 100 }

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

/** ── 探针目标配置存取（UI 可编辑；store 优先于 Config.probe.targets 与 DEFAULT_TARGETS） ── */
function sanitizeTarget(t) {
  if (!t || typeof t !== 'object') return null
  const name = String(t.name ?? '').trim()
  const url = t.url ? String(t.url).trim() : ''
  const port = Number(t.port)
  const host = (t.host ? String(t.host).trim() : '') || '127.0.0.1'
  if (!name) return null
  if (url) return { name, url }
  if (Number.isInteger(port) && port > 0 && port <= 65535) return { name, host, port }
  return null
}

function loadProbeTargets(cfg) {
  try {
    const raw = JSON.parse(readFileSync(PROBE_FILE, 'utf8'))
    if (Array.isArray(raw.targets)) {
      const targets = raw.targets.map(sanitizeTarget).filter(Boolean)
      if (targets.length) return targets
    }
  } catch { /* 缺失/损坏 → 下一级 */ }
  if (Array.isArray(cfg.probe?.targets) && cfg.probe.targets.length) {
    return cfg.probe.targets.map(sanitizeTarget).filter(Boolean)
  }
  return DEFAULT_TARGETS.map((t) => ({ ...t }))
}

function saveProbeTargets(targets) {
  const cleaned = (Array.isArray(targets) ? targets : []).map(sanitizeTarget).filter(Boolean)
  if (!cleaned.length) {
    // 空列表 = 重置回默认（删除 store，回落 Config.probe.targets / DEFAULT_TARGETS）
    try { rmSync(PROBE_FILE, { force: true }) } catch { /* ignore */ }
    return []
  }
  mkdirSync(DEFAULTS_DIR, { recursive: true })
  writeFileSync(PROBE_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), targets: cleaned }, null, 2) + '\n')
  return cleaned
}

/** 读请求 JSON body（失败 → 空对象，与 widgets PUT 同语义）。 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let acc = ''
    req.on('data', (chunk) => { acc += chunk })
    req.on('end', () => {
      try { resolve(acc ? JSON.parse(acc) : {}) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, json) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(json))
}

/** 插件版本（/plugins/<id>/status 约定用；读 package.json，失败返回 null）。 */
function readPluginVersion() {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? null
  } catch {
    return null
  }
}

/** ── 插件主体 ─────────────────────────────────────────────────────── */
export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  const tokens = resolveTokens(cfg)

  // 各后端轮询器（los 按子路径各自缓存；macos/probe/glances/kuma 各一）
  const losUsage = makePoller(() => collectLosUsage(cfg, tokens), cfg.losPollMs)
  const losTrends = makePoller(() => collectLosTrends(cfg, tokens), Math.max(cfg.losPollMs, 120000))
  const losMetrics = makePoller(() => collectLosMetrics(cfg, tokens), Math.max(cfg.losPollMs, 120000))
  const losNodes = makePoller(() => collectLosNodes(cfg, tokens), Math.max(cfg.losPollMs, 90000))
  // 看门狗：单次采集整体 12s 硬上限，df/iostat 卡挂载也只降级该拍，不拖住 get()。
  const macos = makePoller(() => withTimeout(collectMacos(cfg), PROBE_TOTAL_TIMEOUT_MS, 'macos 探针'), cfg.macos.pollMs)
  const probe = makePoller(() => collectProbe(cfg), cfg.probe.pollMs)
  const glances = makePoller(async () => {
    if (!cfg.glances.enabled) return { enabled: false, reason: 'glances 未启用（Config.glances.enabled）' }
    const res = await fetch(`${cfg.glances.url}/api/4/all`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { enabled: true, error: `glances HTTP ${res.status}` }
    const d = await res.json()
    return { enabled: true, cpu: d.cpu ?? null, mem: d.mem ?? null, load: d.load ?? null, fs: d.fs ?? [], net: d.net ?? null }
  }, cfg.glances.pollMs)
  const kuma = makePoller(async () => {
    if (!cfg.kuma.enabled) return { enabled: false, reason: 'kuma 未启用（Config.kuma.enabled；配置 url+token 后启用）' }
    if (!cfg.kuma.url || !cfg.kuma.token) return { enabled: true, error: 'kuma 缺 url/token' }
    // Kuma 2.x 无 /api/v1 REST；唯一鉴权数据端点 = /metrics（Prometheus 文本）。
    // API key 以 Basic auth 密码传入（username 任意，kuma apiAuthorizer 取 password）。
    const auth = `Basic ${Buffer.from(`apikey:${cfg.kuma.token}`).toString('base64')}`
    const res = await fetch(`${cfg.kuma.url.replace(/\/+$/, '')}/metrics`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { enabled: true, error: `kuma /metrics HTTP ${res.status}` }
    return { enabled: true, monitors: parseKumaMetrics(await res.text()) }
  }, cfg.kuma.pollMs)
  // feed 摘要（读本机报告文件，成本低；60s 节奏 + 快照缓存即可）
  const feedDigests = makePoller(collectFeedDigests, 60000)
  // Surge AI 节点信誉（读本机 state 文件 + 事件流，成本低）
  const surgeRep = makePoller(() => collectSurgeRep(cfg), cfg.surgeRep.pollMs)
  // AI 额度（ZenMux + Packy；60s 刷新，独立于 los 节奏）
  const aiQuota = makePoller(collectAiQuota, 60000)
  // DSH 本地会话 usage 聚合（P5：只读 ~/.dsh/sessions 派生投影，无副作用）
  const dshUsage = makePoller(collectDshUsage, 120000)
  // 统一消耗对账（P6：DSH + los + 配额 三源合并）
  const usageReconcile = makePoller(() => collectUsageReconcile(dshUsage, losUsage, aiQuota), 120000)

  // ── macOS 滚动短趋势（持久化 jsonl + 内存窗口；按 ts 去重，30s 采样节奏 → 120 点 = 1h 窗口）
  // 2026-08-19 P2：重启从磁盘加载（不因插件重启清零）；断档由 fillGapPoints 标注。
  // 2026-08-27 B1：变化门控写入——指标无实质变化（HISTORY_WRITE_TOLERANCE 容差内）时
  //   跳过磁盘 append（内存窗口仍保留全部点，曲线连续）；镜像 mac-performance-monitor
  //   SampleStore.lastWritten 的 change-gated inserts（~94% 空闲拍不再写行）。
  // 2026-08-27 B3：push 时同步累加 minute/hour 聚合桶（内存 Map + 周期落盘），
  //   history 端点按 ?window= 选档（1h raw / 6h-24h minute / 7d hour）。
  const history = loadHistoryFromDisk(cfg.macos.historyPoints)
  const minBuckets = loadAggregates(HISTORY_MIN_FILE)
  const hourBuckets = loadAggregates(HISTORY_HOUR_FILE)
  let lastAggFlushAt = Date.now()
  let lastWrittenPoint = null
  const pushHistory = (snap) => {
    const d = snap?.data
    if (!d) return
    if (history.length && history[history.length - 1].ts === snap.ts) return
    const point = {
      ts: snap.ts,
      load1: d.loadavg?.load1 ?? null,
      cpuUsedPct: d.cpu?.usedPct ?? null,
      memUsedPct: d.memory?.usedPct ?? null,
      netInBps: d.net?.inBps ?? null,
      netOutBps: d.net?.outBps ?? null,
    }
    history.push(point)
    // B3：同步累加聚合桶（raw 点 → minute/hour；bucket 幂等由时间锚定保证）
    const tsMs = new Date(point.ts).getTime()
    if (Number.isFinite(tsMs)) {
      const minKey = bucketKey(tsMs, AGG_MIN_MS)
      minBuckets.set(minKey, accumulateBucket(minBuckets.get(minKey), point))
      const hourKey = bucketKey(tsMs, AGG_HOUR_MS)
      hourBuckets.set(hourKey, accumulateBucket(hourBuckets.get(hourKey), point))
    }
    if (cfg.macos.writeGate) {
      // 门控：与上次实际写入磁盘的点无实质变化 → 只留内存窗口，跳过磁盘写
      if (lastWrittenPoint === null || historyPointChanged(lastWrittenPoint, point)) {
        appendHistoryToDisk(point)
        lastWrittenPoint = point
      }
    } else {
      appendHistoryToDisk(point)
      lastWrittenPoint = point
    }
    if (history.length > cfg.macos.historyPoints) history.shift()
  }
  // 聚合桶周期落盘（minute 5min / hour 30min；全量重写 + 保留窗口裁剪）
  const flushAggregates = () => {
    const now = Date.now()
    if (now - lastAggFlushAt >= AGG_MIN_FLUSH_MS) {
      saveAggregates(HISTORY_MIN_FILE, minBuckets, AGG_MIN_RETENTION_MS)
      saveAggregates(HISTORY_HOUR_FILE, hourBuckets, AGG_HOUR_RETENTION_MS)
      lastAggFlushAt = now
    }
  }
  const macosTimer = setInterval(() => {
    if (isIdle()) return
    pushHistory(macos.snapshot())
    flushAggregates()
  }, 3000)
  macosTimer.unref?.()
  // history 端点（非 makePoller；聚合端点同构快照；gap 填充 + 窗口元信息）
  // ?window=1h（默认，raw）| 6h | 24h | 7d（minute/hour 聚合 + 绝对时间锚定降采样 B5）
  const historyPoller = {
    get: async (searchParams) => {
      pushHistory(macos.snapshot())
      const windowArg = searchParams?.get?.('window') ?? '1h'
      const raw = history.slice(-60)
      if (windowArg === '1h') {
        return {
          ts: new Date().toISOString(),
          data: {
            points: fillGapPoints(raw, cfg.macos.pollMs),
            sampleMs: cfg.macos.pollMs,
            windowStart: raw[0]?.ts ?? null,
            windowEnd: raw[raw.length - 1]?.ts ?? null,
          },
          error: null,
        }
      }
      // 长窗口：选档聚合 → 绝对时间锚定降采样到 ≤120 点（B5：mem 取峰值保尖峰）
      const WINDOWS = {
        '6h': { ms: 6 * 3600_000, buckets: minBuckets, sampleMs: AGG_MIN_MS },
        '24h': { ms: 24 * 3600_000, buckets: minBuckets, sampleMs: AGG_MIN_MS },
        '7d': { ms: 7 * 86_400_000, buckets: hourBuckets, sampleMs: AGG_HOUR_MS },
      }
      const win = WINDOWS[windowArg] ?? WINDOWS['24h']
      const pts = aggregatesToPoints(win.buckets, win.ms)
      const downsampled = downsampleAnchored(pts, win.ms, 120)
      return {
        ts: new Date().toISOString(),
        data: {
          points: fillGapPoints(downsampled, win.sampleMs * 2),
          sampleMs: win.sampleMs,
          granularity: win.sampleMs === AGG_MIN_MS ? 'minute' : 'hour',
          windowStart: pts[0]?.ts ?? null,
          windowEnd: pts[pts.length - 1]?.ts ?? null,
        },
        error: null,
      }
    },
  }
  // endpoint → poller 映射（/dashboards/snapshot 聚合用）
  const pollerByEndpoint = {
    '/dashboards/los/usage': losUsage,
    '/dashboards/los/trends': losTrends,
    '/dashboards/los/metrics': losMetrics,
    '/dashboards/los/nodes': losNodes,
    '/dashboards/macos': macos,
    '/dashboards/macos/history': historyPoller,
    '/dashboards/probe': probe,
    '/dashboards/glances': glances,
    '/dashboards/kuma': kuma,
    '/dashboards/feed/digests': feedDigests,
    '/dashboards/surge/ai-reputation': surgeRep,
    '/dashboards/ai-quota': aiQuota,
    '/dashboards/dsh/usage': dshUsage,
    '/dashboards/usage/reconcile': usageReconcile,
  }

  const timers = [
    startPoller(losUsage, cfg.losPollMs),
    startPoller(losTrends, Math.max(cfg.losPollMs, 120000)),
    startPoller(losMetrics, Math.max(cfg.losPollMs, 120000)),
    startPoller(losNodes, Math.max(cfg.losPollMs, 90000)),
    startPoller(macos, cfg.macos.pollMs),
    startPoller(probe, cfg.probe.pollMs),
    startPoller(glances, cfg.glances.pollMs),
    startPoller(kuma, cfg.kuma.pollMs),
    startPoller(feedDigests, 60000),
    startPoller(surgeRep, cfg.surgeRep.pollMs),
    startPoller(aiQuota, 60000),
    startPoller(dshUsage, 120000),
    startPoller(usageReconcile, 120000),
  ]

  // ── 磁盘水位告警（独立于看板 idle 门控：看板未打开也持续检查，主动推飞书） ──
  // 状态：{ lastAlertAt, lastAlertPct } —— 冷却期内同水位区间不重复推；水位再升
  // 3pp 跨档也触发（避免高水位下完全静默）；显著回落（< 阈值-3）复位冷却。
  const diskAlertState = { lastAlertAt: 0, lastAlertPct: 0 }
  async function checkDiskAlert() {
    const threshold = cfg.macos.diskAlertPct
    if (!cfg.macos.enabled || !threshold || threshold <= 0) return
    const df = await runExec('df', ['-h', '/System/Volumes/Data'])
    if (df.error || !df.out) return
    const disk = parseDf(df.out).find((d) => d.mount === '/System/Volumes/Data')
    if (!disk) return
    const pct = parseInt(String(disk.capacity).replace('%', ''), 10)
    if (!Number.isFinite(pct)) return
    const now = Date.now()
    if (pct >= threshold) {
      const inCooldown = now - diskAlertState.lastAlertAt < cfg.macos.diskAlertCooldownMs
      const escalated = pct >= diskAlertState.lastAlertPct + 3
      if (!inCooldown || escalated) {
        diskAlertState.lastAlertAt = now
        diskAlertState.lastAlertPct = pct
        const text = `[磁盘告警] ${disk.mount} 已用 ${disk.capacity}（${disk.used}/${disk.size}，剩余 ${disk.avail}）。建议运行 mole clean 或 CleanMyMac 清理。`
        execFile('bash', [join(HOME, 'scripts/feishu-push.sh'), text], { timeout: 20000 }, (err) => {
          if (err) ctx.logger.warn?.(`[dsh-dashboards] 磁盘告警推送失败: ${err.message}`)
        })
        ctx.logger.info?.(`[dsh-dashboards] 磁盘水位告警: ${disk.mount} ${disk.capacity}（阈值 ${threshold}%）`)
      }
    } else if (pct < threshold - 3) {
      diskAlertState.lastAlertAt = 0
      diskAlertState.lastAlertPct = 0
    }
  }
  const diskAlertTimer = setInterval(() => { void checkDiskAlert() }, cfg.macos.diskAlertCheckMs)
  diskAlertTimer.unref?.()
  timers.push(diskAlertTimer)

  // /plugins/<id>/status 统一约定（2026-08-23）：内部状态只读折叠（exact 独立路由）
  const dashStatus = () => {
    const s = (p) => {
      const snap = p.snapshot()
      return { ts: snap.ts, error: snap.error ?? null, hasData: snap.data !== null }
    }
    return {
      ts: new Date().toISOString(),
      backends: {
        los: { usage: s(losUsage), trends: s(losTrends), metrics: s(losMetrics), nodes: s(losNodes) },
        macos: { ...s(macos), enabled: cfg.macos.enabled },
        probe: s(probe),
        glances: { enabled: cfg.glances.enabled, ...s(glances) },
        kuma: { enabled: cfg.kuma.enabled, ...s(kuma) },
        feed: s(feedDigests),
        surgeRep: s(surgeRep),
        dsh: { usage: s(dshUsage), reconcile: s(usageReconcile) },
      },
      widgets: loadWidgets().length,
    }
  }
  ctx.webServer.register({
    kind: 'exact',
    path: '/plugins/dsh-dashboards/status',
    handler: (_req, res) => {
      const status = dashStatus()
      const backends = status.backends ?? {}
      const healthy = (b) => (b && b.error === null && b.hasData) ? 1 : 0
      sendJson(res, 200, {
        ok: true,
        plugin: 'dsh-dashboards',
        version: readPluginVersion(),
        counts: {
          widgets: status.widgets ?? 0,
          backendsOk: healthy(backends.probe) + healthy(backends.macos) + healthy(backends.los?.usage),
        },
        lastError: null,
        detail: { backends, widgets: status.widgets ?? 0 },
      })
    },
  })

  ctx.webServer.register({
    kind: 'prefix',
    path: '/dashboards',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const method = req.method ?? 'GET'
      const path = url.pathname
      // 任何 /dashboards 请求 = 活动信号（活动门控据此续命后台轮询）
      touchActivity()
      try {
        // 聚合快照：一次请求返回全部 widget 的配置+数据（client 单 ticker 15s 拉一次，往返 7→1）
        if (method === 'GET' && path === '/dashboards/snapshot') {
          const widgets = loadWidgets()
          const items = await Promise.all(widgets.map(async (w) => {
            const p = pollerByEndpoint[w.endpoint]
            if (!p) {
              return { id: w.id, type: w.type, endpoint: w.endpoint, title: w.title, refreshMs: w.refreshMs, snap: { ts: null, data: null, error: `未知 endpoint ${w.endpoint}` } }
            }
            const snap = await p.get()
            return { id: w.id, type: w.type, endpoint: w.endpoint, title: w.title, refreshMs: w.refreshMs, snap }
          }))
          sendJson(res, 200, { ts: new Date().toISOString(), widgets: items })
          return
        }
        if (method === 'GET' && path === '/dashboards/status') {
          sendJson(res, 200, dashStatus())
          return
        }
        if (method === 'GET' && path === '/dashboards/los/usage') { sendJson(res, 200, await losUsage.get()); return }
        if (method === 'GET' && path === '/dashboards/los/trends') { sendJson(res, 200, await losTrends.get()); return }
        if (method === 'GET' && path === '/dashboards/los/metrics') { sendJson(res, 200, await losMetrics.get()); return }
        if (method === 'GET' && path === '/dashboards/los/nodes') { sendJson(res, 200, await losNodes.get()); return }
        if (method === 'GET' && path === '/dashboards/macos') { const s = await macos.get(); if (cfg.macos.enabled && !s.data) await macos.refresh(); sendJson(res, 200, s); return }
        if (method === 'GET' && path === '/dashboards/macos/history') {
          // 统一走 historyPoller（含 gap 填充 + sampleMs/window 元信息，与 snapshot 聚合同构）
          sendJson(res, 200, await historyPoller.get(url.searchParams))
          return
        }
        if (method === 'GET' && path === '/dashboards/probe') { sendJson(res, 200, await probe.get()); return }
        if (method === 'GET' && path === '/dashboards/probe-targets') {
          const targets = loadProbeTargets(cfg)
          const source = existsSync(PROBE_FILE)
            ? 'store'
            : (Array.isArray(cfg.probe?.targets) && cfg.probe.targets.length ? 'config' : 'default')
          sendJson(res, 200, { ts: new Date().toISOString(), targets, source })
          return
        }
        if (method === 'PUT' && path === '/dashboards/probe-targets') {
          const body = await readJsonBody(req)
          const targets = saveProbeTargets(body.targets)
          await probe.refresh()
          sendJson(res, 200, { ok: true, targets, snap: probe.snapshot() })
          return
        }
        if (method === 'GET' && path === '/dashboards/glances') { sendJson(res, 200, await glances.get()); return }
        if (method === 'GET' && path === '/dashboards/kuma') { sendJson(res, 200, await kuma.get()); return }
        if (method === 'GET' && path === '/dashboards/feed/digests') { sendJson(res, 200, await feedDigests.get()); return }
        if (method === 'GET' && path === '/dashboards/surge/ai-reputation') { sendJson(res, 200, await surgeRep.get()); return }
        if (method === 'GET' && path === '/dashboards/ai-quota') { sendJson(res, 200, await aiQuota.get()); return }
        if (method === 'GET' && path === '/dashboards/dsh/usage') { sendJson(res, 200, await dshUsage.get()); return }
        if (method === 'GET' && path === '/dashboards/usage/reconcile') { sendJson(res, 200, await usageReconcile.get()); return }
        if (method === 'GET' && path === '/dashboards/widgets') {
          sendJson(res, 200, { ts: new Date().toISOString(), widgets: loadWidgets() })
          return
        }
        if (method === 'PUT' && path === '/dashboards/widgets') {
          const body = await readJsonBody(req)
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
