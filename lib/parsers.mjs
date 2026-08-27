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

/* ── 多分辨率聚合（B3）+ 绝对时间锚定降采样（B5）──────────────────────
 * 借鉴 mac-performance-monitor：
 *   - B3 三档聚合（Database.swift）：raw(30s) → minute(60s 桶) → hour(3600s 桶)，
 *     每桶保留 min/avg/max + samples 数；查询按窗口自动选档
 *   - B5 绝对时间锚定降采样（HistoryDownsample.chartDownsampled）：桶宽 =
 *     span/maxCount，锚定 epoch（非数组索引）——追加/裁剪只改变最右桶，
 *     历史形状稳定；压力类指标（mem）取峰值而非平均，尖峰不丢失
 */

/** 参与聚合与降采样的指标键。 */
export const HISTORY_METRICS = ['load1', 'cpuUsedPct', 'memUsedPct', 'netInBps', 'netOutBps']

/** 绝对时间锚定桶键：桶起始时间戳（epoch 对齐，非数组索引）。 */
export function bucketKey(tsMs, widthMs) {
  return Math.floor(tsMs / widthMs) * widthMs
}

/**
 * 增量累加一个 raw 点到聚合桶状态（内存中维护，落盘时 finalize）。
 * 幂等由调用方保证（同一点不重复累加）。返回更新后的桶状态。
 * samples 记录总点数；每指标另计有效样本数（null/非有限值不污染 avg 分母）。
 */
export function accumulateBucket(acc, point) {
  if (!acc) {
    acc = { samples: 0, count: {}, min: {}, max: {}, sum: {} }
  }
  acc.samples += 1
  for (const key of HISTORY_METRICS) {
    const v = point[key]
    if (v == null || !Number.isFinite(v)) continue
    if (acc.min[key] === undefined || v < acc.min[key]) acc.min[key] = v
    if (acc.max[key] === undefined || v > acc.max[key]) acc.max[key] = v
    acc.sum[key] = (acc.sum[key] ?? 0) + v
    acc.count[key] = (acc.count[key] ?? 0) + 1
  }
  return acc
}

/**
 * 把桶状态 finalize 为落盘/查询行：{bucket, samples, load1:{min,avg,max}, ...}。
 * avg 用该指标的有效样本数（count）作分母；没有有效样本的指标输出 null 值
 * 对象（保持键结构稳定）。
 */
export function finalizeBucket(acc, bucketTs) {
  const row = { bucket: bucketTs, samples: acc?.samples ?? 0 }
  for (const key of HISTORY_METRICS) {
    const sum = acc?.sum?.[key]
    const n = acc?.count?.[key] ?? 0
    row[key] = {
      min: acc?.min?.[key] ?? null,
      avg: n > 0 && sum != null ? Math.round((sum / n) * 10) / 10 : null,
      max: acc?.max?.[key] ?? null,
      count: n,
    }
  }
  return row
}

/**
 * 从落盘聚合行恢复累加状态（重启后继续聚合，不重算历史）。
 * finalizeBucket 输出 avg；反向恢复 sum = avg×samples（整桶无损）。
 */
export function bucketFromRow(row) {
  if (!row || typeof row !== 'object') return null
  const acc = { samples: Number(row.samples) || 0, count: {}, min: {}, max: {}, sum: {} }
  for (const key of HISTORY_METRICS) {
    const v = row[key]
    if (!v || typeof v !== 'object') continue
    acc.min[key] = v.min ?? undefined
    acc.max[key] = v.max ?? undefined
    const n = Number(v.count) || 0
    acc.count[key] = n
    if (v.avg != null && n > 0) acc.sum[key] = v.avg * n
  }
  return acc
}

/**
 * 绝对时间锚定降采样（B5）：把点序列折叠到 ≈maxCount 个输出点。
 * 桶宽 = spanMs/maxCount，锚定 epoch；load1 取桶平均，memUsedPct 取桶峰值
 * （压力尖峰是趋势图存在的意义，不能被平均掉）。输出点带 bucket 起始时间。
 * 纯函数：同样的输入永远同样的输出（与数组长度/追加顺序无关，形状稳定）。
 */
export function downsampleAnchored(points, spanMs, maxCount = 120) {
  if (!Array.isArray(points) || points.length === 0) return []
  if (!(spanMs > 0) || !(maxCount > 0)) return points.map((p) => ({ ...p }))
  const width = Math.max(1, Math.floor(spanMs / maxCount))
  const buckets = new Map()
  for (const p of points) {
    const ts = new Date(p?.ts).getTime()
    if (!Number.isFinite(ts)) continue
    const key = bucketKey(ts, width)
    buckets.set(key, accumulateBucket(buckets.get(key), p))
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b)
  return keys.map((k) => {
    const f = finalizeBucket(buckets.get(k), k)
    return {
      ts: new Date(k).toISOString(),
      load1: f.load1.avg,
      memUsedPct: f.memUsedPct.max,
      cpuUsedPct: f.cpuUsedPct.avg,
      netInBps: f.netInBps.avg,
      netOutBps: f.netOutBps.avg,
      bucketSamples: f.samples,
    }
  })
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

/* ── 趋势分析（B8，借鉴 mac-performance-monitor Analysis/）─────────────
 * 三个检测器都是纯函数，输入 = 已降采样的历史点数组（{ts, load1, memUsedPct,
 * cpuUsedPct, ...}），输出 = 结构化 finding 或 null。适配系统级指标：
 *   - detectSustainedGrowth  → LeakDetector 语义：memUsedPct 持续爬升
 *   - detectStepChange       → ChangeDetector 语义：窗口均值阶跃（跳变）
 *   - detectTrendDrift       → ThermalDrift 语义：同条件对比（按天同小时）
 * 阈值保守，默认全部不触发（宁缺毋滥，镜像 mac 的 quiet-by-default）。
 */

/** 最小二乘线性回归：返回 {slope(每样本), rSquared} 或 null（样本不足/零方差）。 */
export function linearFit(points) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const n = xs.length
  if (n < 2) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  const slope = sxy / sxx
  const rSquared = (sxy * sxy) / (sxx * syy)
  return { slope, rSquared }
}

/**
 * B8a 持续增长检测（LeakDetector 适配系统级）：memUsedPct 在窗口内持续爬升。
 * 防误报：最小时长（样本跨度）+ 最小 R²（须是稳定趋势，非单次跳变）+
 * 最小总增幅（噪声地板）。窗口越长越可信（镜像 20min 最小时长语义）。
 */
export function detectSustainedGrowth(points, opts = {}) {
  const {
    key = 'memUsedPct',
    minSpanMs = 2 * 3600_000,   // 至少 2h 跨度
    minRSquared = 0.8,
    minDelta = 3,               // 至少爬升 3pp
    minSamples = 6,
  } = opts
  if (!Array.isArray(points) || points.length < minSamples) return null
  const series = []
  for (const p of points) {
    const v = p?.[key]
    const ts = new Date(p?.ts).getTime()
    if (v == null || !Number.isFinite(ts)) continue
    series.push({ x: ts, y: v })
  }
  if (series.length < minSamples) return null
  const span = series[series.length - 1].x - series[0].x
  if (span < minSpanMs) return null
  const fit = linearFit(series)
  if (!fit || fit.rSquared < minRSquared) return null
  // slope 单位：pp/ms → 总增幅
  const totalDelta = fit.slope * span
  if (totalDelta < minDelta) return null
  return {
    kind: 'growth',
    key,
    slopePerHour: (fit.slope * 3600_000 * 100) / 100, // pp/hour
    totalDeltaPct: Math.round(totalDelta * 10) / 10,
    rSquared: Math.round(fit.rSquared * 100) / 100,
    spanMinutes: Math.round(span / 60_000),
  }
}

/**
 * B8b 阶跃检测（ChangeDetector 适配）：窗口均值差异最大处。
 * before/after 各 window 个样本的均值差 ≥ minJump 即视为一次跳变。
 */
export function detectStepChange(points, opts = {}) {
  const {
    key = 'memUsedPct',
    window = 3,
    minJump = 8,               // 至少 8pp 跳变
  } = opts
  if (!Array.isArray(points) || points.length < window * 2 + 1) return null
  const series = []
  for (const p of points) {
    const v = p?.[key]
    if (v == null) continue
    series.push({ ts: p.ts, y: v })
  }
  if (series.length < window * 2 + 1) return null
  let best = null
  let bestMag = 0
  for (let i = window; i <= series.length - window; i += 1) {
    const before = series.slice(i - window, i)
    const after = series.slice(i, i + window)
    const meanB = before.reduce((a, b) => a + b.y, 0) / before.length
    const meanA = after.reduce((a, b) => a + b.y, 0) / after.length
    const mag = Math.abs(meanA - meanB)
    if (mag >= minJump && mag > bestMag) {
      bestMag = mag
      best = { at: series[i].ts, beforeMean: meanB, afterMean: meanA, deltaPct: Math.round((meanA - meanB) * 10) / 10 }
    }
  }
  return best
}

/**
 * B8c 同条件漂移检测（ThermalDrift 语义适配）：对比「今天某小时段」与
 * 「历史同期（过去 N 天同一小时窗）」的 memUsedPct 中位数，判断是否存在
 * 系统性抬升。输入必须带 ts。返回较历史基线的抬升幅度（pp）或 null。
 * 简化版：对比窗口前半 vs 后半（无需按天分组，适合 24h-7d 数据）。
 */
export function detectTrendDrift(points, opts = {}) {
  const {
    key = 'memUsedPct',
    minSamples = 12,
    minDriftPct = 5,           // 后半较前半抬升 ≥5pp 才报
  } = opts
  if (!Array.isArray(points) || points.length < minSamples) return null
  const series = points.map((p) => p?.[key]).filter((v) => v != null)
  if (series.length < minSamples) return null
  const half = Math.floor(series.length / 2)
  const first = series.slice(0, half)
  const second = series.slice(half)
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const m1 = median(first)
  const m2 = median(second)
  const drift = m2 - m1
  if (drift < minDriftPct) return null
  return {
    kind: 'drift',
    key,
    driftPct: Math.round(drift * 10) / 10,
    firstHalfMedian: m1,
    secondHalfMedian: m2,
    samples: series.length,
  }
}
