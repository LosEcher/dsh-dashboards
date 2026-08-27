/**
 * dsh-dashboards — 纯解析函数（零外部依赖，node:test 可直接 import）。
 *
 * 2026-08-19 从 index.mjs 抽出：让单元测试不依赖 @deepseek-ai/schemastery
 * 等运行时包。同时修复两项指标准确性 bug（见各函数注释）：
 *   - parseIostatCpu：按表头列名定位 us/sy/id（原 slice(-3) 在新版 macOS 取到 load average）
 *   - parseNetstatIb：只统计物理 en* 接口（原含 lo0 回环 + utun 隧道重复计数）
 */

/** 只统计物理以太/Wi-Fi 接口（en*）：排除 lo0（回环，DSH/los 全在 localhost）、
 * utun*（Tailscale/VPN 隧道，与物理接口重复计数）、awdl/llw/gif/stf/bridge/ap/fw/XHC 等。 */
const PHYSICAL_IFACE_RE = /^en\d+$/

export function parseLoadavg(text) {
  // macOS `sysctl -n vm.loadavg` 输出带花括号："{ 1.23 0.98 0.76 }"
  const m = text.trim().match(/\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  return m ? { load1: Number(m[1]), load5: Number(m[2]), load15: Number(m[3]) } : null
}

export function parseVmStat(text) {
  const pages = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^Pages\s+(\w+):\s+(\d+)\.?/)
    if (m) pages[m[1].toLowerCase()] = Number(m[2])
  }
  return pages
}

export function parseIostatCpu(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null
  // 列名行（第二行）精确定位 us/sy/id 列索引，避免依赖「load average 是否在数据行尾」：
  // 新版 macOS 两拍都带 load 列，旧版只有首拍带——按表头列名取列对两种输出都成立。
  //   新版: KB/t  tps  MB/s  us sy id   1m   5m   15m
  //   旧版: KB/t tps MB/s KB/t tps MB/s  us sy id   1m   5m   15m
  const header = lines.find((l) => /\bus\b/.test(l) && /\bsy\b/.test(l) && /\bid\b/.test(l)) ?? null
  if (!header) return null
  const hTokens = header.trim().split(/\s+/)
  const usIdx = hTokens.indexOf('us')
  const syIdx = hTokens.indexOf('sy')
  const idIdx = hTokens.indexOf('id')
  if (usIdx === -1 || syIdx === -1 || idIdx === -1) return null
  const dTokens = (lines[lines.length - 1] ?? '').trim().split(/\s+/)
  const us = Number(dTokens[usIdx])
  const sy = Number(dTokens[syIdx])
  const id = Number(dTokens[idIdx])
  if (![us, sy, id].every(Number.isFinite)) return null
  return { us, sy, id, usedPct: Math.round((us + sy) * 10) / 10 }
}

export function parseDf(text) {
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

export function parseNetstatIb(text) {
  const byIface = {}
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10 || !f[2]?.startsWith('<Link#')) continue
    const name = f[0]
    if (!PHYSICAL_IFACE_RE.test(name)) continue
    // 2026-08-19 修复（连带发现）：<Link#> 行可能无 Address 列——无地址 10 token、
    // 有地址 11 token，固定下标 f[6]/f[9] 在无地址行会错位（Ibytes↔Opkts、Obytes↔Coll
    // 互换，实测导致 outBps≈0、inBps 虚高）。尾列固定：Coll Obytes Oerrs Opkts Ibytes Ierrs Ipkts
    const ibytes = Number(f[f.length - 5] ?? 0)
    const obytes = Number(f[f.length - 2] ?? 0)
    byIface[name] = { ibytes, obytes }
  }
  return byIface
}

/** Prometheus 文本 → 分组统计（los /metrics）。 */
export function parsePrometheus(text) {
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

/** Kuma 2.x：Prometheus /metrics → monitors（无旧版 /api/v1 REST，Basic auth 取 metrics） */
export function parseKumaMetrics(text) {
  const rows = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+)(?:\{([^}]*)\})?\s+(\S+)$/)
    if (!m) continue
    const name = m[1]
    const labels = {}
    if (m[2]) {
      for (const kv of m[2].split(',')) {
        const eq = kv.indexOf('=')
        if (eq === -1) continue
        labels[kv.slice(0, eq)] = kv.slice(eq + 1).replace(/^"|"$/g, '')
      }
    }
    const value = Number(m[3])
    // 只关心 monitor_* 指标；其它指标（process_*/nodejs_*/http_* 等）无 monitor 标签，跳过避免幻影行
    if (!name.startsWith('monitor_')) continue
    const id = labels.monitor_id ?? labels.monitor_name ?? '?'
    if (!rows[id]) {
      rows[id] = { id, name: labels.monitor_name ?? id, type: labels.monitor_type ?? null, status: null, latencyMs: null, uptime: null, certDays: null }
    }
    if (name === 'monitor_status') rows[id].status = value
    else if (name === 'monitor_response_time') rows[id].latencyMs = value
    else if (name === 'monitor_uptime_ratio' && labels.window === '30d') rows[id].uptime = value * 100
    else if (name === 'monitor_cert_days_remaining') rows[id].certDays = value
  }
  const STATUS = { 0: 'down', 1: 'up', 2: 'pending', 3: 'maintenance' }
  return Object.values(rows).map((r) => ({
    id: r.id, name: r.name, type: r.type,
    status: STATUS[r.status] ?? 'unknown',
    latency: r.latencyMs, uptime: r.uptime, certDays: r.certDays,
  }))
}

/* ── 变化门控（B1，借鉴 mac-performance-monitor SampleStore.lastWritten）──
 * 磁盘写入只在指标发生实质变化时发生：空闲期（负载/内存/网络几乎不动）
 * 不再每拍 append 一行，历史 jsonl 大幅瘦身；内存窗口仍保留全部点，
 * 曲线连续不受影响。容差按指标量纲给定：CPU/内存 0.5pp、load 0.05、
 * 网络 50KB/s —— 低于此的抖动视为"无变化"。
 */

/** 每个指标的变化容差；null 表示该指标不参与门控（如缺失值）。 */
export const HISTORY_WRITE_TOLERANCE = {
  load1: 0.05,
  cpuUsedPct: 0.5,
  memUsedPct: 0.5,
  netInBps: 50_000,
  netOutBps: 50_000,
}

/**
 * 两个历史点之间是否有实质变化（任一在容差内的指标超出即视为变化）。
 * - 双方均为 null/undefined 的指标不参与比较（视为未变）
 * - 一方有值一方缺失：视为变化（新数据源出现）
 * - 未变化返回 false（应跳过磁盘写入）
 */
export function historyPointChanged(a, b, tolerance = HISTORY_WRITE_TOLERANCE) {
  if (!a || !b) return true
  for (const [key, tol] of Object.entries(tolerance)) {
    if (tol == null) continue
    const va = a[key]
    const vb = b[key]
    if (va == null && vb == null) continue
    if (va == null || vb == null) return true
    if (Math.abs(va - vb) > tol) return true
  }
  return false
}

/** 慢变量降频（B2，借鉴 mac-performance-monitor batteryReadInterval/SMC slowInterval）：
 * 距上次执行 >= intervalMs 才重跑；首次（lastAtMs 为 0）总是执行。 */
export function shouldRefreshSlow(lastAtMs, nowMs, intervalMs) {
  if (!(intervalMs > 0)) return true
  if (!(lastAtMs > 0)) return true
  return nowMs - lastAtMs >= intervalMs
}

/**
 * 时间序列断档标注：相邻点间隔 > 2×sampleMs 视为断档，在中间插入 null 占位
 * （数量 = gap/sampleMs - 1，每段上限 maxNulls 防超长 idle 撑爆）。
 * client 侧把 null 当断点分段渲染，曲线在断档处断开而不是"直连跳变"。
 */
export function fillGapPoints(points, sampleMs, maxNulls = 90) {
  if (!Array.isArray(points) || points.length < 2 || !(sampleMs > 0)) return Array.isArray(points) ? [...points] : []
  const out = []
  for (let i = 0; i < points.length; i += 1) {
    out.push(points[i])
    const next = points[i + 1]
    if (!next) continue
    const cur = points[i]
    const a = new Date(cur?.ts).getTime()
    const b = new Date(next?.ts).getTime()
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const gap = b - a
    if (gap > sampleMs * 2) {
      const n = Math.min(Math.round(gap / sampleMs) - 1, maxNulls)
      for (let k = 0; k < n; k += 1) out.push(null)
    }
  }
  return out
}
