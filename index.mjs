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
 *   GET /dashboards/macos/history      macOS 滚动短趋势（?window=1h|6h|24h|7d 选档聚合）
 *   GET /dashboards/macos/insights     macOS 趋势分析（growth/step/drift 检测，B8）
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
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'
import { parseLoadavg, parseVmStat, parseIostatCpu, parseDf, parseNetstatIb, parsePrometheus, parseKumaMetrics, fillGapPoints, historyPointChanged, shouldRefreshSlow, bucketKey, accumulateBucket, finalizeBucket, bucketFromRow, downsampleAnchored, HISTORY_METRICS, detectSustainedGrowth, detectStepChange, detectTrendDrift, z4proToRows } from './lib/parsers.mjs'
import { makePoller, startPoller, touchActivity, isIdle, sleep } from './lib/poller.mjs'
import { plausibleTimestamp, publishNetSample, readJsonEnvelope, saveEnvelopeReplace, capList, capText, egressEnabled, egressInventory } from './lib/safety.mjs'

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
  packyProbe: Schema.object({
    pollMs: Schema.number(),
    /** packy-probe.py 状态文件（~/.local/state/surge-auto/packy-probe-state.json）。 */
    stateFile: Schema.string(),
    /** 超过该时长（ms）的探测结果视为过期，卡片显示 stale。 */
    freshMs: Schema.number(),
  }),
  aiQuota: Schema.object({
    /** AI 额度整体刷新间隔 ms（余额 API 缓存 + quota-axi 本地采集，默认 5min）。 */
    pollMs: Schema.number(),
    /** 是否启用 quota-axi 订阅窗口采集（claude/codex/cursor/kimi/grok/copilot）。 */
    quotaAxiEnabled: Schema.boolean(),
    /** quota-axi provider 子集（默认全六家；只读本地登录态，未登录的返回 auth/unavailable）。 */
    quotaAxiProviders: Schema.array(Schema.string()),
    /** quota-axi 单次 spawn 硬超时 ms。 */
    quotaAxiTimeoutMs: Schema.number(),
    /** Grok 登录态自动续期（~/.grok/auth.json refresh_token → auth.x.ai，原子写回；默认开）。 */
    autoRefreshGrok: Schema.boolean(),
  }),
  /** 出网逐项开关（P0-6）：清单见 lib/safety.mjs:EGRESS_FEATURES，
   * 任一项置 false 即彻底不外呼（GET /dashboards/egress 可核对当前生效值）。 */
  egress: Schema.object({
    los: Schema.boolean(),
    quotaApis: Schema.boolean(),
    quotaAxi: Schema.boolean(),
    grokRefresh: Schema.boolean(),
    kuma: Schema.boolean(),
    glances: Schema.boolean(),
    probe: Schema.boolean(),
    z4pro: Schema.boolean(),
    diskAlert: Schema.boolean(),
  }),
})

const HOME = process.env.DSH_HOME ?? `${homedir()}/.dsh`
const CRED_FILE = join(HOME, '.credentials.yaml')
/** quota-axi 本地采集内核（npm 包，随插件 node_modules 安装；herdr-quota 同款 schema v5）。 */
const QUOTA_AXI_JS = join(fileURLToPath(new URL('.', import.meta.url)), 'node_modules/quota-axi/dist/bin/quota-axi.js')
/** 订阅窗口渠道全集（顺序即看板展示顺序）。 */
const QUOTA_AXI_PROVIDERS = ['codex', 'cursor', 'claude', 'kimi', 'grok', 'copilot']
/** 订阅渠道需登录时的恢复命令提示（供看板 note 展示，不执行）。 */
const QUOTA_AXI_SIGNIN_HINT = {
  claude: 'claude /login',
  codex: 'codex login',
  cursor: 'cursor-agent login',
  kimi: 'kimi login',
  grok: 'grok login --oauth',
  copilot: 'github-copilot-cli auth login',
}
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

/** ── P0-4 数据合理性观测 ───────────────────────────────────────────────
 * 不可信时间戳 / 畸形行被丢弃时必须**可数**：静默丢数据会让「图怎么变短了」
 * 无从解释（Infomarchy 原话：「一条 2099 年的记录曾同时被算进今天并排在所有
 * 真实任务之上」）。计数经 /dashboards/status 的 `sanity` 暴露。
 * 计满上限后不再增长（避免长时间运行后的无意义大数），但 dropped>0 永远可见。 */
const SANITY_COUNTER_MAX = 1_000_000
const sanityDropped = {
  historyMalformed: 0,
  historyImplausible: 0,
  historyLiveImplausible: 0,
  aggregateMalformed: 0,
  aggregateImplausible: 0,
  surgeEventsImplausible: 0,
}
function bumpSanity(key, by = 1) {
  sanityDropped[key] = Math.min(SANITY_COUNTER_MAX, (sanityDropped[key] ?? 0) + by)
}

/** 极空间 Z4Pro 健康巡检脚本（外部 CLI，零依赖 Node）。缺省指向 dsfolder 下的独立工具
 * （可经 Config.z4pro.script 覆盖）。与 feishu-push.sh 同为"HOME 下的外部脚本"模式：
 * 设备特定逻辑不进插件仓，插件只负责调度 + 展示形态适配（映射成 list widget 的 results）。 */
const Z4PRO_HEALTH_SCRIPT = join(HOME, 'syncfolder/project/dsfolder/scripts/z4pro-health.mjs')

/** widget endpoint 白名单（防 PUT 注入任意路径）。 */
const ALLOWED_ENDPOINTS = new Set([
  '/dashboards/los/usage', '/dashboards/los/trends', '/dashboards/los/metrics', '/dashboards/los/nodes',
  '/dashboards/macos', '/dashboards/macos/history', '/dashboards/macos/insights', '/dashboards/probe', '/dashboards/glances', '/dashboards/kuma',
  '/dashboards/feed/digests', '/dashboards/surge/ai-reputation', '/dashboards/surge/packy', '/dashboards/ai-quota',
  '/dashboards/dsh/usage',
  '/dashboards/usage/reconcile',
  '/dashboards/z4pro',
])

/** Surge 节点信誉数据源（surge-auto ai-node-reputation 输出）。 */
const SURGE_STATE_FILE = join(homedir(), '.local/state/surge-auto/ai-reputation-state.json')
const SURGE_EVENTS_FILE = join(homedir(), '.local/state/surge-auto/health-watch-events.jsonl')
/** PackyCode 端点可达性数据源（surge-auto scripts/packy-probe.py 输出）。 */
const PACKY_PROBE_FILE = join(homedir(), '.local/state/surge-auto/packy-probe-state.json')
/**
 * Fallback probe strength, used only when the state file does not say.
 *
 * The probe itself reports `authenticated` when it managed to load a Packy API
 * key (keychain `PACKYCODE_API_KEY`, or `~/.grok/config.toml`) and got HTTP 200
 * from `/v1/models`; that is the N5 "认证业务" bar. It reports
 * `unauthenticated` when no credential was available, which only proves network
 * reachability. Defaulting to the weaker claim means a missing or malformed
 * state file can never make the card look stronger than the evidence.
 */
const PACKY_PROBE_KIND = 'unauthenticated'
/** ai-node-reputation 状态 → 看板展示标签（client 侧同样维护一份 locale，这里只用于后端聚合兜底）。 */
const SURGE_STATUS_LABEL = {
  healthy: 'healthy', grok_403: 'grok_403', xai_blocked: 'xai_blocked',
  xai_banned: 'xai_banned', dead: 'dead', xai_partial: 'xai_partial',
}

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
  { id: 'surge-packy', type: 'packy', endpoint: '/dashboards/surge/packy', title: 'PackyCode 出口', refreshMs: 60000 },
  { id: 'ai-quota', type: 'quota', endpoint: '/dashboards/ai-quota', title: 'AI 额度', refreshMs: 60000 },
  { id: 'dsh-usage', type: 'usage', endpoint: '/dashboards/dsh/usage', title: 'DSH 消耗 7d', refreshMs: 120000 },
  { id: 'usage-reconcile', type: 'reconcile', endpoint: '/dashboards/usage/reconcile', title: '消耗对账', refreshMs: 120000 },
  // 极空间 Z4Pro 设备健康（复用 list widget 渲染，客户端无需新增 widget 类型）
  // 120s 节奏：SSH + smartctl 全量采集约 3-6s，且盘/池是慢变量
  { id: 'z4pro-health', type: 'list', endpoint: '/dashboards/z4pro', title: '极空间 Z4Pro', refreshMs: 120000 },
]

/** /dashboards/snapshot 单 widget 最坏等待（2026-09-01 per-widget deadline；
 * 超时回当前快照+deadlineExceeded 标记，双保险于 poller 的 freshWaitCapMs）。 */
const SNAPSHOT_WIDGET_DEADLINE_MS = 3000

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
    packyProbe: {
      pollMs: c.packyProbe?.pollMs ?? 60000,
      stateFile: c.packyProbe?.stateFile ?? PACKY_PROBE_FILE,
      // 探针由 external 调度（建议 ≥15min）；60min 之后的结果不再当实时状态。
      freshMs: c.packyProbe?.freshMs ?? 3_600_000,
    },
    aiQuota: {
      pollMs: c.aiQuota?.pollMs ?? 300_000,
      quotaAxiEnabled: c.aiQuota?.quotaAxiEnabled ?? true,
      quotaAxiProviders: Array.isArray(c.aiQuota?.quotaAxiProviders) && c.aiQuota.quotaAxiProviders.length
        ? c.aiQuota.quotaAxiProviders
        : [...QUOTA_AXI_PROVIDERS],
      quotaAxiTimeoutMs: c.aiQuota?.quotaAxiTimeoutMs ?? 15000,
      autoRefreshGrok: c.aiQuota?.autoRefreshGrok ?? true,
    },
    z4pro: {
      // 默认开：脚本只读采集（ssh + smartctl + virsh），无副作用；脚本缺失时降级为错误提示
      enabled: c.z4pro?.enabled ?? true,
      script: c.z4pro?.script ?? Z4PRO_HEALTH_SCRIPT,
      // 120s：SSH 往返 + 6 盘 SMART + virsh 约 3-6s，且盘/池/VM 是慢变量
      pollMs: c.z4pro?.pollMs ?? 120_000,
      // 采集本身有 45s 内部超时；给 60s 硬上限兜底（与 probe 的 D 态防护同理）
      timeoutMs: c.z4pro?.timeoutMs ?? 60_000,
      host: c.z4pro?.host ?? 'z4pro',
    },
    // 出网清单开关（P0-6）：未配置 = 全开（保持既有行为）；显式 false 即关闭该项外呼。
    // 关闭只停「外呼」，不影响读本机文件的采集（feed/history/surge/dsh-usage 照常）。
    egress: {
      los: c.egress?.los ?? true,
      quotaApis: c.egress?.quotaApis ?? true,
      quotaAxi: c.egress?.quotaAxi ?? true,
      grokRefresh: c.egress?.grokRefresh ?? true,
      kuma: c.egress?.kuma ?? true,
      glances: c.egress?.glances ?? true,
      probe: c.egress?.probe ?? true,
      z4pro: c.egress?.z4pro ?? true,
      diskAlert: c.egress?.diskAlert ?? true,
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

/** ── los 采集（双 token 回退） ───────────────────────────────────────
 * 2026-09-01 修复错误归因：原实现在 attempt 失败后直接 fallthrough 并
 * 抛「需 token」——token 已配置但请求超时（AbortSignal.timeout 8s）时
 * 报错信息误导（把 TimeoutError 吞成「未配置 token」）。现保留真实错误。
 */
async function losFetch(cfg, tokens, path, { operator = false } = {}) {
  // P0-6：出网开关在**最靠近 socket 的地方**再判一次（调用点判断只是省事，
  // 真正的拦断面在这里）——关闭后不可能有任何代码路径绕过它发出请求。
  if (!egressEnabled(cfg, 'los')) throw new Error(`los 出网已关闭（Config.egress.los=false）: ${path}`)
  const url = `${cfg.losUrl}${path}`
  let lastErr = null
  const tried = []
  const attempt = async (label, headers) => {
    tried.push(label)
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`los ${path} HTTP ${res.status}`)
      return res
    } catch (e) {
      lastErr = e
      throw e
    }
  }
  const missing = (what) => new Error(`los ${path} 需 ${what}（Config / credentials / env 未配置）`)
  const failed = () => new Error(`los ${path} 请求失败: ${lastErr?.message ?? lastErr}（已尝试 ${tried.join('/')}）`)
  if (operator) {
    if (tokens.operatorToken) {
      try { return await attempt('operator', { 'x-los-operator-token': tokens.operatorToken }) } catch { /* fallthrough */ }
    }
    throw tried.length ? failed() : missing('operator token')
  }
  if (tokens.authToken) {
    try { return await attempt('bearer', { Authorization: `Bearer ${tokens.authToken}` }) } catch { /* fallthrough */ }
  }
  if (tokens.operatorToken) {
    try { return await attempt('operator', { 'x-los-operator-token': tokens.operatorToken }) } catch { /* fallthrough */ }
  }
  throw tried.length ? failed() : missing('token（Config.losToken / credentials / losEnvFile）')
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
 * 现改异步 execFile + SIGKILL 硬上限；整体看门狗由轮询基座 timeoutMs 兜底
 * （单命令失败只降级该字段，不拖垮整次采集）。
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

  // 网络速率（累计字节差分）：**基线的样本时刻必须与它携带的字节数对应**。
  // 旧实现在这里写 `prevNetAt = Date.now()`（函数返回时刻），而 netstat 输出是
  // 采样时刻的快照；采集超时后仍在后台跑完、与新一拍交叉完成时，后返回者覆盖
  // 基线 ⇒ 基线=「旧样本 + 新时刻」，下一拍用不匹配的 dt 差分更长时间窗口的
  // 差值 → 速率虚高。现交由 publishNetSample 统一守卫（样本时刻 + 最小 dt +
  // 过期发布拒绝），并把 reason 随快照下发（不可用时要说明原因，而不是静默 null）。
  const netSampleAt = Date.now()
  const netStep = publishNetSample(prevNet, ifaces, netSampleAt)
  prevNet = netStep.next
  prevNetAt = netStep.next?.at ?? netSampleAt
  const netInBps = netStep.rate?.inBps ?? null
  const netOutBps = netStep.rate?.outBps ?? null
  const netRateReason = netStep.rate ? 'ok' : netStep.reason

  return {
    host: hostname(),
    platform: 'darwin',
    cpuModel: model.out?.trim() ?? null,
    cores: ncpu.out ? Number(ncpu.out.trim()) : null,
    loadavg,
    cpu,
    memory: { totalMb: memTotalMb, freeMb, availMb, usedPct: memUsedPct },
    disks,
    net: { inBps: netInBps, outBps: netOutBps, ifaces: Object.fromEntries(Object.entries(ifaces).slice(0, 8)), rateReason: netRateReason },
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
  // P0-6：探针目标是用户可编辑列表（可含外部 URL），逐项关闭的唯一开关。
  if (!egressEnabled(cfg, 'probe')) {
    return { enabled: false, reason: '探活出网已关闭（Config.egress.probe=false）', total: 0, ok: 0, degraded: 0, down: 0, results: [] }
  }
  const targets = loadProbeTargets(cfg)
  const results = await Promise.all(targets.map((t) => probeOne(t)))
  const ok = results.filter((r) => r.ok).length
  const degraded = results.filter((r) => r.degraded).length
  return { enabled: true, total: results.length, ok, degraded, down: results.length - ok - degraded, results }
}

/** ── 极空间 Z4Pro 设备健康（外部脚本 + list widget 形态适配） ────────
 * 脚本契约：`node z4pro-health.mjs --json` 输出
 *   { verdict: 'ok'|'warning'|'critical', summary: {...}, findings: [{level,key,msg}] }
 * 退出码 0/1/2 表达 verdict —— 但 runExec 在非零退出时会丢弃 stdout，
 * 故用 `bash -c 'node "$0" --json || true'` 包一层，保证任何 verdict 都能取到 JSON。
 *
 * 输出适配成 ListCard 的 results[{name,ok,degraded,detail}]：
 * 这里刻意输出"固定检查清单"而非直接映射 findings，让列表头部的
 * `x/y up` 具备"y 项检查中 x 项通过"的确定语义（findings 只用于补充异常行）。
 */
async function collectZ4Pro(cfg) {
  const c = cfg.z4pro
  if (!c.enabled) return { enabled: false, reason: 'z4pro 未启用（Config.z4pro.enabled）' }
  if (!existsSync(c.script)) {
    return { enabled: true, error: `z4pro 巡检脚本不存在: ${c.script}` }
  }
  const exec = await runExec('bash', ['-c', 'node "$0" --json 2>/dev/null || true', c.script], c.timeoutMs)
  if (exec.error) return { enabled: true, error: `z4pro 巡检执行失败: ${exec.error}` }
  let payload
  try {
    payload = JSON.parse(exec.out)
  } catch (e) {
    return { enabled: true, error: `z4pro 巡检输出非 JSON: ${String(e?.message ?? e).slice(0, 140)}` }
  }

  // 形态适配交给纯函数（lib/parsers.mjs:z4proToRows，带单测）——
  // 本函数只负责 IO（spawn/超时/降级）与 JSON 解析，保持可测性。
  return { enabled: true, ...z4proToRows(payload) }
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
  let all = []
  try {
    all = readdirSync(FEED_DIR)
      .filter((f) => /^feed-digest-\d{8}-\d{4}\.md$/.test(f))
      .sort()
      .reverse()
  } catch {
    return { dir: FEED_DIR, count: 0, available: 0, truncated: false, digests: [], error: 'feed 报告目录不可读（尚无 job 产出？）' }
  }
  // P0-1：截断必须显式上报（available=截断前真实条数），客户端显示「显示 N/M 条」。
  // 旧实现直接 slice 后把 count 当成总数，看板上「5 份」无法区分「只有 5 份」与
  // 「有 23 份只给看 5 份」。
  const capped = capList(all, FEED_MAX_DIGESTS)
  const digests = capped.items.map((file) => {
    let text = ''
    try {
      text = readFileSync(join(FEED_DIR, file), 'utf8').replace(/^\uFEFF/, '')
    } catch {
      text = ''
    }
    const first = (text.split('\n')[0] ?? '').trim()
    const title = first.startsWith('#') ? first.replace(/^#+\s*/, '') : (first || file)
    const body = capText(text, FEED_MAX_TEXT)
    return {
      file,
      at: parseFeedTimestamp(file),
      title: title.slice(0, 120),
      titleTruncated: title.length > 120,
      lines: text.split('\n').filter((l) => l.trim()).length,
      size: text.length,
      text: body.text,
      textTotalChars: body.totalChars,
      textTruncated: body.truncated,
    }
  })
  return {
    dir: FEED_DIR,
    count: digests.length,
    available: capped.available,
    truncated: capped.truncated,
    limits: { digests: FEED_MAX_DIGESTS, textChars: FEED_MAX_TEXT },
    digests,
  }
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

  // 事件流尾部（source=ai-node-reputation，最多 8 条）。
  // P0-1：统计「匹配到多少条」再截断，让看板能区分「只有 3 条」与「有 40 条只给看 8 条」；
  // P0-4：时间戳不可信的事件丢弃并计数（脏时间会污染排序与「最近事件」语义）。
  const recentEvents = []
  let matched = 0
  let implausible = 0
  try {
    const lines = readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const e = JSON.parse(lines[i])
        if (e.source === 'ai-node-reputation') {
          matched += 1
          // e.ts 是 ISO 串，而 plausibleTimestamp 内部走 Number(ts) —— 对 ISO 得 NaN，
          // 于是**每一条**事件都被判成不可信：实测线上 eventsAvailable==eventsImplausible==4479、
          // recentEvents 恒为空（"最近事件"整块从未显示过）。必须先 parse 成毫秒再判。
          const tsMs = typeof e.ts === 'string' ? Date.parse(e.ts) : NaN
          if (!Number.isFinite(tsMs) || !plausibleTimestamp(tsMs)) { implausible += 1; continue }
          if (recentEvents.length < 8) {
            recentEvents.push({ ts: e.ts, type: e.type, node: e.node ?? null, reason: e.reason ?? null })
          }
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
    eventsAvailable: matched,
    // 截断只统计「可信事件」中被裁掉的（不可信事件单列 eventsImplausible，不混算）
    eventsTruncated: (matched - implausible) > recentEvents.length,
    eventsImplausible: implausible,
    error: stateErr,
  }
}

/** ── PackyCode 端点可达性（type 'packy'，/dashboards/surge/packy） ────────
 *
 * 这个卡片存在的原因：Surge 的 `fallback`/`url-test` 只问"请求是否完成"，而被 WAF
 * 拒绝的成员答得很快 —— 一个 403 的节点能在延迟 urltest 里胜出，fallback 也会一直
 * 当它健康。能区分"可达(200/401)"与"被拦(403)"的信号在两个代理里都表达不出来：
 * Surge 组的 `url=` 无认证也无状态类策略；sing-box 的 urltest 直接拒绝 `headers`
 * 字段（1.14.2 报 `json: unknown field "headers"`）。所以探针在代理之外跑
 * （surge-auto scripts/packy-probe.py），卡片只读它的结论。
 *
 * 诚实边界：probeKind 固定为 unauthenticated —— 见 PACKY_PROBE_KIND 注释。
 */
function collectPackyProbe(cfg) {
  let state = null
  let error = null
  try {
    state = JSON.parse(readFileSync(cfg.packyProbe.stateFile, 'utf8'))
  } catch {
    error = `探测状态文件缺失（先运行 surge-auto scripts/packy-probe.py）: ${cfg.packyProbe.stateFile}`
  }

  const capturedAt = state?.capturedAt ?? null
  // plausibleTimestamp 收的是**数字**时间戳（内部 Number(ts)），而 packy-probe.py 写的是
  // ISO 串；直接传字符串会 NaN ⇒ 永远判成不可信 ⇒ stale 恒 true。先 parse 再判。
  const capturedMs = typeof capturedAt === 'string' ? Date.parse(capturedAt) : NaN
  const plausible = Number.isFinite(capturedMs) && plausibleTimestamp(capturedMs)
  const ageMs = plausible ? Date.now() - capturedMs : null
  // 时间戳不可信或缺失一律按 stale 处理：宁可显示"结果过期"，也不能把旧探测当实时。
  const stale = ageMs == null || ageMs > cfg.packyProbe.freshMs

  return {
    updatedAt: capturedAt,
    ageMs,
    stale,
    probeUrl: state?.probeUrl ?? null,
    // probeKind comes from the probe itself -- it is the only party that knows
    // whether it actually sent a credential. Unknown/missing state falls back to
    // "unauthenticated"; never the other way round, because claiming
    // business-level on no evidence is exactly the failure this field prevents.
    probeKind: typeof state?.probeKind === 'string' && state.probeKind
      ? state.probeKind
      : PACKY_PROBE_KIND,
    keySource: state?.keySource ?? null,
    samples: state?.samples ?? null,
    okCount: state?.okCount ?? 0,
    standbyCandidates: Array.isArray(state?.standbyCandidates) ? state.standbyCandidates : [],
    results: Array.isArray(state?.results) ? state.results : [],
    error,
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
      // 文件超长 → 压缩只保留最近 maxPoints 行（30s/点 ≈ 2 天/1200 行后触发）。
      // P0-3：整文件替换走原子写（tmp→rename），避免压缩途中崩溃留下半截文件，
      // 下次启动把整个历史当成损坏而清零。
      const keep = lines.slice(-maxPoints)
      mkdirSync(DEFAULTS_DIR, { recursive: true })
      writeJsonAtomic(HISTORY_FILE, keep.join('\n') + '\n')
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
    if (!p || typeof p.ts !== 'string') { bumpSanity('historyMalformed'); return null }
    // P0-4：脏时间（2099 / 1970 前 / 非数字）不得进入窗口切片与聚合桶
    if (!plausibleTimestamp(new Date(p.ts).getTime())) { bumpSanity('historyImplausible'); return null }
    return p
  } catch { bumpSanity('historyMalformed') /* 坏行跳过 */ }
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
  let lines = []
  try {
    lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return new Map()
  }
  const buckets = new Map()
  // 逐行容错：原实现把整个 for 包在一个 try 里，**一行畸形就让整份聚合归零**
  // （而且是静默的）。聚合是长窗口（7d/90d）的唯一来源，不能因一行坏数据全丢。
  for (const line of lines) {
    let row
    try {
      row = JSON.parse(line)
    } catch { bumpSanity('aggregateMalformed'); continue }
    if (!row || typeof row.bucket !== 'number') { bumpSanity('aggregateMalformed'); continue }
    // P0-4：桶时间同样过合理性边界（未来桶会被 aggregatesToPoints 当成"当前窗口"）
    if (!plausibleTimestamp(row.bucket)) { bumpSanity('aggregateImplausible'); continue }
    buckets.set(row.bucket, bucketFromRow(row))
  }
  return buckets
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
    // P0-3：全量重写走原子写——半截文件会让长窗口历史整体失效
    writeJsonAtomic(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
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

/** ── AI 额度（多渠道统一视图）────────────────────────────────────────
 * 三类数据源：
 *  - 余额 API（官方直连）：ZenMux PAYG、Packy（NewAPI）、DeepSeek、OpenRouter
 *  - 订阅窗口（quota-axi 本地采集内核：只读官方 CLI/App 登录态 + first-party 端点，
 *    herdr-quota 同款 schema v5）：codex/cursor/claude/kimi/grok/copilot
 *  - 站内/控制台型（kimi 会员、NVIDIA build 等）无公开 API，不做自动采集。
 * 输出 { zenmux, packy } 为 legacy 字段（对账卡消费），channels[] 为统一列表。
 * 凭据 ~/.dsh/.credentials.yaml；quota-axi 装在插件本地 node_modules。
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

function isoNow() { return new Date().toISOString() }

function roundPct(used, max) {
  if (!Number(max) || !Number.isFinite(Number(used))) return 0
  return Math.max(0, Math.min(100, Math.round((Number(used) / Number(max)) * 100)))
}

/** 统一渠道条目（client QuotaCard 按此渲染）。 */
function makeChannel(id, label, extra = {}) {
  return {
    id, label,
    kind: 'balance',            // balance | window | hybrid
    plan: null, currency: null, amount: null, amountLabel: null,
    meta: null, windows: [],    // [{ scope,label,used,max,usedPercent,resetsAt,unit }]
    health: 'live',             // live | stale | auth | unavailable
    note: null, updatedAt: isoNow(),
    ...extra,
  }
}

function windowRow(scope, label, w, unit = null) {
  return {
    scope, label,
    used: Number(w?.used ?? 0),
    max: Number(w?.max ?? 0),
    usedPercent: w?.usedPercent ?? roundPct(w?.used, w?.max),
    resetsAt: w?.resetsAt ?? null,
    unit,
  }
}

/** ZenMux：PAYG 余额 + 订阅窗口（5h/7d/月）。失败抛错由调用方记录。 */
async function collectZenmux(mgmtKey) {
  const [balance, sub] = await Promise.all([
    fetch('https://zenmux.ai/api/v1/management/payg/balance', { headers: { Authorization: `Bearer ${mgmtKey}` }, signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
    fetch('https://zenmux.ai/api/v1/management/subscription/detail', { headers: { Authorization: `Bearer ${mgmtKey}` }, signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
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
  const data = {
    paygBalanceUsd: Number(b.total_credits ?? 0),
    plan: s.plan?.tier ?? null,
    planAmountUsd: Number(s.plan?.amount_usd ?? 0),
    accountStatus: s.account_status ?? null,
    quotas: { h5: windowOf(q5), d7: windowOf(q7), month: windowOf(qm) },
  }
  const channel = makeChannel('zenmux', 'ZenMux', {
    kind: 'hybrid',
    plan: data.plan,
    currency: 'USD', amount: data.paygBalanceUsd, amountLabel: 'PAYG',
    meta: data.accountStatus && data.accountStatus !== 'healthy' ? `账户 ${data.accountStatus}` : null,
    windows: [
      windowRow('5h', '5h', data.quotas.h5, 'flows'),
      windowRow('7d', '7d', data.quotas.d7, 'flows'),
      windowRow('month', '月', data.quotas.month, 'flows'),
    ].filter((w) => w.max > 0),
  })
  return { data, channel }
}

/** Packy（NewAPI）：/api/user/self，quota÷500000=USD。双主机互为后备（官方文档写 www.packyapi.ai）。 */
async function tryPackyHost(host, token, userId) {
  const res = await fetch(`https://${host}/api/user/self`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'New-Api-User': userId,
      'User-Agent': 'cc-switch/1.0',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { throw new Error('Cloudflare bot 防护拦截（非 JSON 响应）') }
  if (!body?.success) throw new Error(String(body?.message ?? `HTTP ${res.status}`))
  return body.data ?? {}
}

async function collectPacky(token, userId) {
  const hosts = ['www.packyapi.com', 'www.packyapi.ai']
  let lastErr = null
  for (const host of hosts) {
    try {
      const d = await tryPackyHost(host, token, userId)
      const remainingUsd = Number(d.quota ?? 0) / 500000
      const usedUsd = Number(d.used_quota ?? 0) / 500000
      const totalUsd = remainingUsd + usedUsd
      const data = { remainingUsd, usedUsd, totalUsd, requestCount: d.request_count ?? null, group: d.group ?? null }
      const channel = makeChannel('packy', 'PackyCode', {
        kind: 'balance',
        plan: d.group ?? null,
        currency: 'USD', amount: remainingUsd, amountLabel: '剩余',
        meta: data.requestCount != null ? `累计请求 ${data.requestCount}` : null,
        windows: [windowRow('total', '总额', { used: usedUsd, max: totalUsd, usedPercent: roundPct(usedUsd, totalUsd) }, 'USD')].filter((w) => w.max > 0),
      })
      return { data, channel }
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(lastErr?.message ?? '双主机均查询失败')
}

/** DeepSeek 开放平台余额（官方 GET /user/balance）。 */
async function collectDeepseek(apiKey) {
  const res = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  const bi = Array.isArray(body?.balance_infos) ? body.balance_infos[0] : null
  if (!bi) throw new Error('响应缺少 balance_infos')
  const currency = bi.currency ?? 'CNY'
  const total = Number(bi.total_balance ?? 0)
  const topped = Number(bi.topped_up_balance ?? 0)
  const granted = Number(bi.granted_balance ?? 0)
  return makeChannel('deepseek', 'DeepSeek', {
    kind: 'balance',
    plan: null, currency, amount: total, amountLabel: '余额',
    meta: `充值 ${topped.toFixed(2)} · 赠送 ${granted.toFixed(2)}`,
  })
}

/** OpenRouter：GET /api/v1/auth/key（credits 字段仅非免费档存在）。 */
async function collectOpenrouter(apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  const d = body?.data ?? {}
  const credits = d.credits != null ? Number(d.credits) : null
  const usage = Number(d.usage ?? 0)
  const freeTier = !!d.is_free_tier
  const limit = d.limit != null ? Number(d.limit) : null
  return makeChannel('openrouter', 'OpenRouter', {
    kind: 'balance',
    plan: freeTier ? 'free tier' : (limit != null ? `限额 $${limit.toFixed(2)}` : null),
    currency: 'USD',
    amount: credits,
    amountLabel: credits != null ? '余额' : null,
    meta: `已用 $${usage.toFixed(3)}`,
    note: credits == null && freeTier ? '免费档：无预存余额，按用量限额计' : null,
  })
}

function axHealth(stateStatus) {
  if (stateStatus === 'fresh') return 'live'
  if (stateStatus === 'stale') return 'stale'
  if (stateStatus === 'auth_required' || stateStatus === 'auth') return 'auth'
  return 'unavailable'
}

/** quota-axi provider 记录 → 统一渠道条目（schema v5；只读归一化，绝不读凭据）。 */
function quotaAxiChannel(p) {
  const st = p?.state ?? {}
  const wins = (Array.isArray(p?.windows) ? p.windows : [])
    .map((w) => ({
      scope: w.id ?? w.label ?? 'window',
      label: w.label ?? w.id ?? 'window',
      used: null, max: null,
      usedPercent: w.percentUsed != null ? Math.round(w.percentUsed) : null,
      percentRemaining: w.percentRemaining != null ? Math.round(w.percentRemaining) : null,
      resetsAt: w.resetsAt ? new Date(w.resetsAt).getTime() : null,
      unit: p?.credits?.unit ?? null,
    }))
  const health = axHealth(st.status)
  const hint = QUOTA_AXI_SIGNIN_HINT[p.provider]
  return makeChannel(p.provider, p.label ?? p.provider, {
    kind: wins.length ? 'window' : 'balance',
    plan: p.plan ?? null,
    currency: null, amount: null, amountLabel: null,
    meta: p.credits?.unlimited ? '无限用量' : null,
    windows: wins,
    health,
    note: health === 'auth' && hint ? `需登录：${hint}` : (st.status === 'unavailable' ? '额度暂不可读' : null),
    updatedAt: st.refreshedAt ?? null,
  })
}

/** Grok 官方 CLI 登录态文件（~/…/home/.grok/auth.json；放行 homedir() 非 .dsh）。 */
const GROK_AUTH_FILE = join(homedir(), '.grok', 'auth.json')

/** Grok 登录态自动续期：key 距过期 <1h 时用 refresh_token 换新并原子写回
 * （OIDC refresh，Grok CLI/OpenTokenUsage 同款；失败静默，token 不落日志）。
 * Kimi 由其官方 CLI 自行续期（实测 usage 端点自愈），无需本插件处理。 */
async function refreshGrokIfNeeded(cfg) {
  if (!cfg.aiQuota?.autoRefreshGrok) return
  if (!egressEnabled(cfg, 'grokRefresh')) return // P0-6：续期是唯一会**写凭据文件**的外呼，单独可关
  try {
    const auth = JSON.parse(readFileSync(GROK_AUTH_FILE, 'utf8'))
    const entry = Object.entries(auth).find(([, v]) => v && typeof v === 'object' && v.refresh_token && v.oidc_client_id)
    if (!entry) return
    const [, rec] = entry
    const expMs = rec.expires_at ? new Date(rec.expires_at).getTime() : NaN
    if (Number.isFinite(expMs) && Date.now() < expMs - 3600_000) return // 仍有效
    const res = await fetch('https://auth.x.ai/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: rec.refresh_token,
        client_id: rec.oidc_client_id,
      }).toString(),
      signal: AbortSignal.timeout(12000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.access_token) return
    const updated = {
      ...rec,
      key: body.access_token,
      expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
    }
    if (body.refresh_token) updated.refresh_token = body.refresh_token
    const tmp = GROK_AUTH_FILE + '.refresh-tmp'
    writeFileSync(tmp, JSON.stringify({ ...auth, [entry[0]]: updated }, null, 2) + '\n', { mode: 0o600 })
    renameSync(tmp, GROK_AUTH_FILE)
  } catch { /* 续期失败/文件不可读：静默，保留上次状态，下次采样再试 */ }
}

/** 订阅窗口渠道：spawn quota-axi（本机官方 CLI/App 登录态直连，1-3s）。 */
async function collectQuotaAxi(cfg) {
  if (!cfg.aiQuota.quotaAxiEnabled) return { channels: [], errors: [] }
  if (!egressEnabled(cfg, 'quotaAxi')) return { channels: [], errors: [], disabled: '订阅窗口采集已关闭（Config.egress.quotaAxi=false）' }
  if (!existsSync(QUOTA_AXI_JS)) {
    return { channels: [], errors: ['quota-axi: 未安装（到插件目录执行 npm install quota-axi@0.1.29）'] }
  }
  const providers = (cfg.aiQuota.quotaAxiProviders ?? QUOTA_AXI_PROVIDERS).filter((p) => QUOTA_AXI_PROVIDERS.includes(p))
  if (!providers.length) return { channels: [], errors: [] }
  if (providers.includes('grok')) await refreshGrokIfNeeded(cfg)
  const args = ['--json', '--full']
  if (providers.length < QUOTA_AXI_PROVIDERS.length) args.push('--provider', providers.join(','))
  const res = await runExec(process.execPath, [QUOTA_AXI_JS, ...args], cfg.aiQuota.quotaAxiTimeoutMs)
  if (res.error) return { channels: [], errors: [`quota-axi: ${res.error}`] }
  let parsed
  try {
    parsed = JSON.parse(res.out)
  } catch {
    return { channels: [], errors: ['quota-axi: 输出非 JSON（schema 版本不兼容？）'] }
  }
  const list = Array.isArray(parsed?.providers) ? parsed.providers : []
  return { channels: list.map(quotaAxiChannel), errors: [] }
}

/** AI 额度总采集（legacy zenmux/packy 字段保留给对账卡；channels 为统一视图）。 */
async function collectAiQuota(cfg) {
  const out = { generatedAt: isoNow(), zenmux: null, packy: null, channels: [], errors: [] }
  // P0-6：余额 API 是「带凭据出网」的一组，整体可关；关闭后订阅窗口（另一项
  // 开关）仍可独立工作，看板显示明确原因而不是空卡片。
  const apisOn = egressEnabled(cfg, 'quotaApis')
  if (!apisOn) out.errors.push('余额 API 出网已关闭（Config.egress.quotaApis=false）')
  const mgmtKey = apisOn ? readCredential('ZENMUX_MANAGEMENT_API_KEY') : null
  if (mgmtKey) {
    const r = await collectZenmux(mgmtKey).catch((e) => ({ error: e?.message ?? e }))
    if (r.error) out.errors.push(`zenmux: ${r.error}`)
    else { out.zenmux = r.data; out.channels.push(r.channel) }
  }
  const now = Date.now()
  if (!apisOn) {
    // 关闭时跳过 packy/deepseek/openrouter
  } else if (packyRetryAtMs && now < packyRetryAtMs) {
    out.errors.push(`packy: 上次查询被限流，${Math.ceil((packyRetryAtMs - now) / 60000)} 分钟后自动重试`)
  } else {
    const packyToken = readCredential('PACKY_SYSTEM_TOKEN')
    const packyUserId = readCredential('PACKY_USER_ID')
    if (packyToken && packyUserId) {
      const r = await collectPacky(packyToken, packyUserId).catch((e) => {
        packyRetryAtMs = Date.now() + 5 * 60_000
        return { error: `${e?.message ?? e}（5 分钟后重试）` }
      })
      if (r.error) out.errors.push(`packy: ${r.error}`)
      else { out.packy = r.data; out.channels.push(r.channel) }
    }
  }
  // 官方余额 API（有 key 才查；缺 key 不出错不打扰）
  const dsKey = apisOn ? readCredential('DEEPSEEK_API_KEY') : null
  if (dsKey) {
    const r = await collectDeepseek(dsKey).catch((e) => ({ error: e?.message ?? e }))
    if (r.error) out.errors.push(`deepseek: ${r.error}`)
    else out.channels.push(r)
  }
  const orKey = apisOn ? readCredential('OPENROUTER_API_KEY') : null
  if (orKey) {
    const r = await collectOpenrouter(orKey).catch((e) => ({ error: e?.message ?? e }))
    if (r.error) out.errors.push(`openrouter: ${r.error}`)
    else out.channels.push(r)
  }
  // 订阅窗口渠道（provider 级 auth/unavailable 走 channel health，不进 errors）
  const ax = await collectQuotaAxi(cfg)
  out.channels.push(...ax.channels)
  out.errors.push(...ax.errors)
  return out
}

/** ── DSH 本地会话 usage 聚合（P5：只读 ~/.dsh/sessions 派生投影，无副作用） ──
 * 调 scripts/dsh-usage-aggregate.py（python3 + zstandard），窗口=最近 7 天，
 * 输出形状对齐 los.usage-summary（evidenceClass=dsh_sessions），供统一对账。
 */
const DSH_USAGE_SCRIPT = fileURLToPath(new URL('./scripts/dsh-usage-aggregate.py', import.meta.url))
const DSH_USAGE_TIMEOUT_MS = 20000
/** 聚合增量缓存（脚本按 mtime+size 跳过未变 session 文件，2026-09-01）。 */
const DSH_USAGE_CACHE = join(HOME, 'storages/dsh-dashboards/usage-aggregate-cache.json')

async function collectDshUsage() {
  const fromMs = Date.now() - 7 * 86400_000
  const { out, error } = await runExec('python3', [DSH_USAGE_SCRIPT, '--from-ms', String(fromMs), '--cache', DSH_USAGE_CACHE], DSH_USAGE_TIMEOUT_MS)
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

/** ── widget 配置存取 ────────────────────────────────────────────────
 * P0-3（2026-09-19）：store 带 revision + 原子写。
 * 原实现每次 PUT 都用 writeFileSync 整文件重写且无版本：两个写者（例如两个页面
 * 同时保存、或「改探针目标」与「移除 widget」几乎同时）会互相覆盖——后写者基于
 * 自己读到的旧列表重建，前者的改动静默消失（Infomarchy TODO 里同款缺陷，
 * 他们的结论是「read-merge-write + revision」）。 */
function loadWidgetStore() {
  const env = readJsonEnvelope(WIDGETS_FILE, 'widgets')
  if (env.exists && Array.isArray(env.items)) {
    return { widgets: env.items, revision: env.revision, updatedAt: env.updatedAt, exists: true }
  }
  return { widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })), revision: env.revision, updatedAt: env.updatedAt, exists: false }
}

function loadWidgets() {
  return loadWidgetStore().widgets
}

function saveWidgets(widgets, expectedRevision = null) {
  const cleaned = (Array.isArray(widgets) ? widgets : [])
    .filter((w) => w && typeof w.id === 'string' && ALLOWED_ENDPOINTS.has(w.endpoint))
    .map((w) => ({
      id: w.id, type: w.type ?? 'stat', endpoint: w.endpoint,
      title: String(w.title ?? w.id), refreshMs: Number(w.refreshMs ?? 30000),
    }))
  const res = saveEnvelopeReplace(WIDGETS_FILE, 'widgets', cleaned, expectedRevision)
  return { ...res, widgets: res.ok ? cleaned : (res.items ?? loadWidgets()) }
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

function loadProbeStore() {
  const env = readJsonEnvelope(PROBE_FILE, 'targets')
  if (env.exists && Array.isArray(env.items)) {
    const targets = env.items.map(sanitizeTarget).filter(Boolean)
    if (targets.length) return { targets, revision: env.revision, updatedAt: env.updatedAt, exists: true }
  }
  return { targets: null, revision: env.revision, updatedAt: env.updatedAt, exists: env.exists }
}

function loadProbeTargets(cfg) {
  const store = loadProbeStore()
  if (store.targets) return store.targets
  if (Array.isArray(cfg.probe?.targets) && cfg.probe.targets.length) {
    return cfg.probe.targets.map(sanitizeTarget).filter(Boolean)
  }
  return DEFAULT_TARGETS.map((t) => ({ ...t }))
}

function saveProbeTargets(targets, expectedRevision = null) {
  const cleaned = (Array.isArray(targets) ? targets : []).map(sanitizeTarget).filter(Boolean)
  // revision 守卫先于写：冲突时不删也不写，回当前值让调用方决定
  const current = loadProbeStore()
  const expected = expectedRevision === null || expectedRevision === undefined ? null : Number(expectedRevision)
  if (expected !== null && (!Number.isSafeInteger(expected) || expected !== current.revision)) {
    return { ok: false, conflict: true, revision: current.revision, targets: current.targets, currentRevision: current.revision }
  }
  if (!cleaned.length) {
    // 空列表 = 重置回默认（删除 store，回落 Config.probe.targets / DEFAULT_TARGETS）
    try { rmSync(PROBE_FILE, { force: true }) } catch { /* ignore */ }
    return { ok: true, conflict: false, reset: true, revision: 0, targets: [] }
  }
  const res = saveEnvelopeReplace(PROBE_FILE, 'targets', cleaned, null)
  return { ...res, targets: res.ok ? cleaned : (res.items ?? []) }
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
  // 声明式 DataSource（lib/poller.mjs 基座）：统一 stale-while-revalidate /
  // 超时兜底 / stats 观测；collect 闭包捕获 cfg/tokens。
  const losUsage = makePoller({ id: 'los-usage', collect: () => collectLosUsage(cfg, tokens), intervalMs: cfg.losPollMs })
  const losTrends = makePoller({ id: 'los-trends', collect: () => collectLosTrends(cfg, tokens), intervalMs: Math.max(cfg.losPollMs, 120000) })
  const losMetrics = makePoller({ id: 'los-metrics', collect: () => collectLosMetrics(cfg, tokens), intervalMs: Math.max(cfg.losPollMs, 120000) })
  const losNodes = makePoller({ id: 'los-nodes', collect: () => collectLosNodes(cfg, tokens), intervalMs: Math.max(cfg.losPollMs, 90000) })
  // 看门狗：单次采集整体 12s 硬上限（基座 timeoutMs 兜底），df/iostat 卡挂载也只降级该拍
  const macos = makePoller({ id: 'macos', collect: () => collectMacos(cfg), intervalMs: cfg.macos.pollMs, timeoutMs: PROBE_TOTAL_TIMEOUT_MS })
  const probe = makePoller({ id: 'probe', collect: () => collectProbe(cfg), intervalMs: cfg.probe.pollMs })
  const glances = makePoller({
    id: 'glances',
    intervalMs: cfg.glances.pollMs,
    collect: async () => {
      if (!cfg.glances.enabled) return { enabled: false, reason: 'glances 未启用（Config.glances.enabled）' }
      if (!egressEnabled(cfg, 'glances')) return { enabled: false, reason: 'glances 出网已关闭（Config.egress.glances=false）' }
      const res = await fetch(`${cfg.glances.url}/api/4/all`, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) return { enabled: true, error: `glances HTTP ${res.status}` }
      const d = await res.json()
      return { enabled: true, cpu: d.cpu ?? null, mem: d.mem ?? null, load: d.load ?? null, fs: d.fs ?? [], net: d.net ?? null }
    },
  })
  const kuma = makePoller({
    id: 'kuma',
    intervalMs: cfg.kuma.pollMs,
    collect: async () => {
      if (!cfg.kuma.enabled) return { enabled: false, reason: 'kuma 未启用（Config.kuma.enabled；配置 url+token 后启用）' }
      if (!egressEnabled(cfg, 'kuma')) return { enabled: false, reason: 'kuma 出网已关闭（Config.egress.kuma=false）' }
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
    },
  })
  // feed 摘要（读本机报告文件，成本低；60s 节奏 + 快照缓存即可）
  const feedDigests = makePoller({ id: 'feed', collect: collectFeedDigests, intervalMs: 60000 })
  // 极空间 Z4Pro 设备健康（SSH 采集：负载/内存/6 盘 SMART/池/VM/VNC/frp；120s 节奏）
  // 采集全程只读；脚本缺失或 SSH 不通时降级为 error 展示，不影响其它 widget
  const z4pro = makePoller({
    id: 'z4pro',
    collect: () => collectZ4Pro(cfg),
    intervalMs: cfg.z4pro.pollMs,
    timeoutMs: cfg.z4pro.timeoutMs,
  })
  // Surge AI 节点信誉（读本机 state 文件 + 事件流，成本低）
  const surgeRep = makePoller({ id: 'surge-rep', collect: () => collectSurgeRep(cfg), intervalMs: cfg.surgeRep.pollMs })
  const packyProbe = makePoller({ id: 'packy-probe', collect: () => collectPackyProbe(cfg), intervalMs: cfg.packyProbe.pollMs })
  // AI 额度（多渠道：余额 API + quota-axi 订阅窗口；5min 节奏，独立于 los）
  // timeoutMs 放宽到 30s：quota-axi spawn（15s 上限）+ Grok 自动续期（最多 12s）
  const aiQuota = makePoller({ id: 'ai-quota', collect: () => collectAiQuota(cfg), intervalMs: cfg.aiQuota.pollMs, timeoutMs: 30_000 })
  // DSH 本地会话 usage 聚合（P5：只读 ~/.dsh/sessions 派生投影，无副作用）
  // 2026-09-01：15min 节奏（原 120s——7 天窗口聚合全量扫 ~18s CPU，120s 轮询 ≈15% 核
  // 常驻占用且是冷开 /dashboards/snapshot 的主阻塞源；增量缓存后单次 <1s，
  // 15min 节奏对「7d 消耗」展示无感知差异）。timeoutMs 覆盖脚本内部 20s 上限。
  const dshUsage = makePoller({ id: 'dsh-usage', collect: collectDshUsage, intervalMs: 15 * 60_000, timeoutMs: 25_000 })
  // 统一消耗对账（P6：DSH + los + 配额 三源合并；5min——los/ai 各自 60s 已足够新）
  const usageReconcile = makePoller({ id: 'usage-reconcile', collect: () => collectUsageReconcile(dshUsage, losUsage, aiQuota), intervalMs: 5 * 60_000 })

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
    // P0-4：写入侧同样过合理性边界。采样时刻本身出错（NTP 跳变/时钟回拨）时
    // 不进内存窗口、不进聚合桶、不落盘——否则一个脏点会永久污染 7d/90d 长窗口。
    const tsMs = new Date(snap.ts).getTime()
    if (!plausibleTimestamp(tsMs)) { bumpSanity('historyLiveImplausible'); return }
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
    const minKey = bucketKey(tsMs, AGG_MIN_MS)
    minBuckets.set(minKey, accumulateBucket(minBuckets.get(minKey), point))
    const hourKey = bucketKey(tsMs, AGG_HOUR_MS)
    hourBuckets.set(hourKey, accumulateBucket(hourBuckets.get(hourKey), point))
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
      // P0-1：raw 档固定切最近 60 点——把「窗口里共有多少点」一并告知，
      // 客户端才能区分「1h 只有 60 点」与「有 300 点只画了 60 点」。
      const raw = history.slice(-60)
      if (windowArg === '1h') {
        return {
          ts: new Date().toISOString(),
          data: {
            points: fillGapPoints(raw, cfg.macos.pollMs),
            sampleMs: cfg.macos.pollMs,
            windowStart: raw[0]?.ts ?? null,
            windowEnd: raw[raw.length - 1]?.ts ?? null,
            pointsAvailable: history.length,
            pointsTruncated: history.length > raw.length,
            pointLimit: 60,
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
          // 聚合桶是首过降采样（绝对时间锚定），这里再降到 ≤120 点：两段都要可见
          pointsAvailable: pts.length,
          pointsTruncated: pts.length > downsampled.length,
          pointLimit: 120,
        },
        error: null,
      }
    },
  }
  // B8: 趋势分析端点（基于聚合历史运行检测器；纯函数，读时计算）
  // 借鉴 mac-performance-monitor Analysis/：LeakDetector / ChangeDetector /
  // ThermalDrift 的阈值保守语义（宁缺毋滥）。窗口越大越可信：growth/drift
  // 用 7d hour 聚合，step 用 24h minute 聚合。
  const insightsPoller = {
    get: async () => {
      pushHistory(macos.snapshot())
      const hourPts = aggregatesToPoints(hourBuckets, 7 * 86_400_000)
      const minPts = aggregatesToPoints(minBuckets, 24 * 3600_000)
      const findings = []
      const growth = detectSustainedGrowth(hourPts)
      if (growth) findings.push(growth)
      const drift = detectTrendDrift(hourPts)
      if (drift) findings.push(drift)
      const step = detectStepChange(minPts)
      if (step) findings.push({ kind: 'step', ...step })
      return {
        ts: new Date().toISOString(),
        data: {
          findings,
          sampleBasis: { hourPoints: hourPts.length, minutePoints: minPts.length },
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
    '/dashboards/macos/insights': insightsPoller,
    '/dashboards/probe': probe,
    '/dashboards/glances': glances,
    '/dashboards/kuma': kuma,
    '/dashboards/feed/digests': feedDigests,
    '/dashboards/surge/ai-reputation': surgeRep,
    '/dashboards/surge/packy': packyProbe,
    '/dashboards/ai-quota': aiQuota,
    '/dashboards/dsh/usage': dshUsage,
    '/dashboards/usage/reconcile': usageReconcile,
    '/dashboards/z4pro': z4pro,
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
    startPoller(packyProbe, cfg.packyProbe.pollMs),
    startPoller(aiQuota, cfg.aiQuota.pollMs),
    startPoller(dshUsage, 15 * 60_000),
    startPoller(usageReconcile, 5 * 60_000),
    startPoller(z4pro, cfg.z4pro.pollMs),
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
        // P0-6：推送走飞书 webhook（本插件唯一的「往外部发内容」路径），单独可关。
        // 关闭时仍记 lastAlertAt（冷却照走），只跳过推送本身。
        if (egressEnabled(cfg, 'diskAlert')) {
          execFile('bash', [join(HOME, 'scripts/feishu-push.sh'), text], { timeout: 20000 }, (err) => {
            if (err) ctx.logger.warn?.(`[dsh-dashboards] 磁盘告警推送失败: ${err.message}`)
          })
        } else {
          ctx.logger.info?.(`[dsh-dashboards] 磁盘告警推送已关闭（Config.egress.diskAlert=false），跳过: ${disk.capacity}`)
        }
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
      // stats（2026-09-01 轮询基座观测）：刷新次数/成败/最近耗时/最近错误/连续失败
      const stats = p.stats?.() ?? null
      // P0-5：把「数据时间」与「尝试时间」分开暴露，并显式给出 stale——
      // 失败后数据仍在但已过期，运维面必须一眼看出来（而不是靠 ts 猜）。
      return {
        ts: snap.ts,
        attemptedAt: snap.attemptedAt ?? null,
        stale: !!snap.stale,
        error: snap.error ?? null,
        hasData: snap.data !== null,
        stats,
      }
    }
    return {
      ts: new Date().toISOString(),
      // P0-4 观测：脏数据丢弃计数（全 0 = 采集链路干净）
      sanity: { ...sanityDropped },
      // P0-6 观测：出网清单与开关状态（哪些外呼被关掉了）
      egress: { disabled: egressInventory(cfg).filter((f) => !f.enabled).map((f) => f.id), total: egressInventory(cfg).length },
      backends: {
        los: { usage: s(losUsage), trends: s(losTrends), metrics: s(losMetrics), nodes: s(losNodes) },
        macos: { ...s(macos), enabled: cfg.macos.enabled },
        probe: s(probe),
        glances: { enabled: cfg.glances.enabled, ...s(glances) },
        kuma: { enabled: cfg.kuma.enabled, ...s(kuma) },
        feed: s(feedDigests),
        surgeRep: s(surgeRep),
        packyProbe: s(packyProbe),
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
        // 2026-09-01 per-widget deadline：单个后端再慢（get 的 freshWaitCapMs 兜底之外）
        // 也不拖全量——超时回该 poller 当前快照并标记 deadlineExceeded（数据可能旧）。
        if (method === 'GET' && path === '/dashboards/snapshot') {
          const widgets = loadWidgets()
          const boundedGet = async (p) => {
            const snap = await Promise.race([
              p.get(),
              sleep(SNAPSHOT_WIDGET_DEADLINE_MS).then(() => ({ ...p.snapshot(), deadlineExceeded: true })),
            ])
            return snap
          }
          const items = await Promise.all(widgets.map(async (w) => {
            const p = pollerByEndpoint[w.endpoint]
            if (!p) {
              return { id: w.id, type: w.type, endpoint: w.endpoint, title: w.title, refreshMs: w.refreshMs, snap: { ts: null, data: null, error: `未知 endpoint ${w.endpoint}` } }
            }
            const snap = await boundedGet(p)
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
        if (method === 'GET' && path === '/dashboards/macos/insights') {
          sendJson(res, 200, await insightsPoller.get())
          return
        }
        if (method === 'GET' && path === '/dashboards/probe') { sendJson(res, 200, await probe.get()); return }
        if (method === 'GET' && path === '/dashboards/probe-targets') {
          const store = loadProbeStore()
          const targets = loadProbeTargets(cfg)
          const source = store.exists
            ? 'store'
            : (Array.isArray(cfg.probe?.targets) && cfg.probe.targets.length ? 'config' : 'default')
          sendJson(res, 200, { ts: new Date().toISOString(), targets, source, revision: store.revision })
          return
        }
        if (method === 'PUT' && path === '/dashboards/probe-targets') {
          const body = await readJsonBody(req)
          // revision 可选：带上即启用『乐观并发』（不匹配回 409 + 当前值），
          // 不带保持旧的最后写入者获胜语义（老客户端不受影响）。
          const saved = saveProbeTargets(body.targets, body.revision)
          if (saved.conflict) {
            sendJson(res, 409, { ok: false, error: 'revision 冲突（store 已被其他写者更新）', revision: saved.revision, currentRevision: saved.currentRevision, targets: saved.targets })
            return
          }
          if (!saved.ok) {
            sendJson(res, 500, { ok: false, error: saved.error ?? '写入失败', revision: saved.revision })
            return
          }
          await probe.refresh()
          sendJson(res, 200, { ok: true, targets: saved.targets, revision: saved.revision, reset: !!saved.reset, snap: probe.snapshot() })
          return
        }
        if (method === 'GET' && path === '/dashboards/glances') { sendJson(res, 200, await glances.get()); return }
        if (method === 'GET' && path === '/dashboards/kuma') { sendJson(res, 200, await kuma.get()); return }
        if (method === 'GET' && path === '/dashboards/feed/digests') { sendJson(res, 200, await feedDigests.get()); return }
        if (method === 'GET' && path === '/dashboards/surge/ai-reputation') { sendJson(res, 200, await surgeRep.get()); return }
        if (method === 'GET' && path === '/dashboards/surge/packy') { sendJson(res, 200, await packyProbe.get()); return }
        if (method === 'GET' && path === '/dashboards/ai-quota') { sendJson(res, 200, await aiQuota.get()); return }
        if (method === 'GET' && path === '/dashboards/dsh/usage') { sendJson(res, 200, await dshUsage.get()); return }
        if (method === 'GET' && path === '/dashboards/usage/reconcile') { sendJson(res, 200, await usageReconcile.get()); return }
        if (method === 'GET' && path === '/dashboards/z4pro') { sendJson(res, 200, await z4pro.get()); return }
        if (method === 'GET' && path === '/dashboards/widgets') {
          const store = loadWidgetStore()
          sendJson(res, 200, { ts: new Date().toISOString(), widgets: store.widgets, revision: store.revision, source: store.exists ? 'store' : 'default' })
          return
        }
        if (method === 'PUT' && path === '/dashboards/widgets') {
          const body = await readJsonBody(req)
          const widgets = Array.isArray(body.widgets) ? body.widgets : (Array.isArray(body) ? body : [])
          const saved = saveWidgets(widgets, body.revision)
          if (saved.conflict) {
            sendJson(res, 409, { ok: false, error: 'revision 冲突（widget 配置已被其他写者更新）', revision: saved.revision, currentRevision: saved.currentRevision, widgets: saved.widgets })
            return
          }
          if (!saved.ok) {
            sendJson(res, 500, { ok: false, error: saved.error ?? '写入失败', revision: saved.revision })
            return
          }
          sendJson(res, 200, { ok: true, widgets: saved.widgets, revision: saved.revision })
          return
        }
        // 出网清单（P0-6）：有哪些外呼、去哪、为什么、用什么凭据、当前是否开启
        if (method === 'GET' && path === '/dashboards/egress') {
          sendJson(res, 200, { ts: new Date().toISOString(), features: egressInventory(cfg) })
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
