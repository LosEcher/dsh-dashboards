/**
 * dsh-dashboards — '看板' tab view: widget grid driven by host-side
 * widget config (GET /dashboards/widgets). Each widget fetches its own
 * backend endpoint on its own refresh cadence.
 *
 * Theme-aware: only --dsw-alias-* design tokens (light/dark safe).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MarkdownText, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DashboardView.module.css'

export interface WidgetConfig {
  id: string
  type: 'stat' | 'matrix' | 'chart' | 'list' | 'feed' | 'surge'
  endpoint: string
  title: string
  refreshMs: number
}

/** 服务探活目标（host 侧 store 可编辑，PUT /dashboards/probe-targets）。 */
export interface ProbeTarget {
  name: string
  url?: string
  host?: string
  port?: number
}

interface Snapshot<T = unknown> {
  ts?: string
  data?: T | null
  error?: string | null
}

const fmtUsd = (v: number | null | undefined): string => {
  if (v == null) return '—'
  if (v >= 100) return `$${v.toFixed(0)}`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toFixed(3)}`
}
const fmtTokens = (v: number | null | undefined): string => {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
  return String(v)
}
const fmtDur = (ms: number | null | undefined): string => {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}
const pct = (v: number | null | undefined): string => (v == null ? '—' : `${v.toFixed(1)}%`)

/** ── 渲染器 ──────────────────────────────────────────────────────── */

function StatCard({ data, t }: { data: unknown; t: (k: string) => string }) {
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as {
    totals?: { estimatedCostUsd?: number; totalTokens?: number; cacheHitRate?: number | null; modelResponseCount?: number; sessionCount?: number; cacheSavingsUsd?: number }
    memory?: { totalMb?: number | null; freeMb?: number | null; availMb?: number | null; usedPct?: number | null }
    loadavg?: { load1?: number; load5?: number; load15?: number } | null
    cpu?: { usedPct?: number | null } | null
    net?: { inBps?: number | null; outBps?: number | null }
    processCount?: number | null
    byProviderModel?: { provider?: string; model?: string; costUsd?: number; calls?: number; cacheHitRate?: number | null }[]
  }
  if (d.totals) {
    const tot = d.totals
    return (
      <div>
        <div className={css.pillRow}>
          <span className={`${css.pill} ${css.pillDim}`}>{t('col.cost')} {fmtUsd(tot.estimatedCostUsd)}</span>
          <span className={`${css.pill} ${css.pillDim}`}>{t('col.tokens')} {fmtTokens(tot.totalTokens)}</span>
          <span className={`${css.pill} ${css.pillDim}`}>{t('col.cache')} {tot.cacheHitRate != null ? `${(tot.cacheHitRate * 100).toFixed(1)}%` : '—'}</span>
          <span className={`${css.pill} ${css.pillDim}`}>{t('col.calls')} {tot.modelResponseCount ?? '—'}</span>
          <span className={`${css.pill} ${css.pillDim}`}>{t('col.sessions')} {tot.sessionCount ?? '—'}</span>
          {tot.cacheSavingsUsd != null && <span className={css.pill}>缓存节省 {fmtUsd(tot.cacheSavingsUsd)}</span>}
        </div>
        {(d.byProviderModel ?? []).length > 0 && (
          <table className={css.table}>
            <thead>
              <tr><th>{t('col.model')}</th><th className={css.num}>{t('col.calls')}</th><th className={css.num}>{t('col.cost')}</th></tr>
            </thead>
            <tbody>
              {(d.byProviderModel ?? []).slice(0, 6).map((r, i) => (
                <tr key={i}>
                  <td>{r.model ?? r.provider ?? '—'}</td>
                  <td className={css.num}>{r.calls ?? '—'}</td>
                  <td className={css.num}>{fmtUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }
  if (d.memory) {
    const mem = d.memory
    const load = d.loadavg
    return (
      <div className={css.pillRow}>
        <span className={`${css.pill} ${css.pillDim}`}>内存 {pct(mem.usedPct)}</span>
        <span className={`${css.pill} ${css.pillDim}`}>可用 {mem.availMb != null ? `${(mem.availMb / 1024).toFixed(1)}G` : '—'}/{mem.totalMb != null ? `${(mem.totalMb / 1024).toFixed(0)}G` : '—'}</span>
        <span className={`${css.pill} ${css.pillDim}`}>load {load?.load1 != null ? load.load1.toFixed(2) : '—'} / {load?.load5 != null ? load.load5.toFixed(2) : '—'}</span>
        <span className={`${css.pill} ${css.pillDim}`}>CPU {pct(d.cpu?.usedPct)}</span>
        <span className={`${css.pill} ${css.pillDim}`}>进程 {d.processCount ?? '—'}</span>
        <span className={`${css.pill} ${css.pillDim}`}>↓{d.net?.inBps != null ? `${(d.net.inBps / 1024).toFixed(0)}K` : '—'} ↑{d.net?.outBps != null ? `${(d.net.outBps / 1024).toFixed(0)}K` : '—'}</span>
      </div>
    )
  }
  return <p className={css.muted}>{t('noData')}</p>
}

interface NodeRow {
  nodeId?: string; hostLabel?: string | null; status?: string
  rolloutState?: string | null
  capacity?: { cpuCores?: number; cpuLoad1m?: number; memoryTotalMb?: number; memoryAvailableMb?: number; platform?: string; arch?: string } | null
  heartbeatAgeSec?: number | null
  connectModes?: string[]
}

function NodeMatrix({ data, t }: { data: unknown; t: (k: string) => string }) {
  const rows = (data as NodeRow[] | null) ?? []
  if (!rows.length) return <p className={css.muted}>{t('noData')}</p>
  const dot = (s: string): StateDotState => (s === 'online' ? 'done' : s === 'offline' ? 'error' : 'warning')
  return (
    <table className={css.table}>
      <thead>
        <tr>
          <th>{t('col.node')}</th><th>{t('col.status')}</th><th className={css.num}>{t('col.loadCore')}</th>
          <th className={css.num}>{t('col.mem')}</th><th>{t('col.platform')}</th><th className={css.num}>{t('col.heartbeat')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.nodeId}>
            <td className={css.wrap}>
              <span className={css.mono}>{n.nodeId}</span>
              {n.hostLabel ? <span className={`${css.muted} ${css.hostSub}`}>{n.hostLabel}</span> : null}
            </td>
            <td>
              <span className={css.rowDot}><StateDot state={dot(n.status ?? '?')} size={8} /></span>
              <span className={n.status === 'online' ? css.okText : n.status === 'offline' ? css.errText : css.warnText}>{n.status ?? '?'}</span>
            </td>
            <td className={css.num}>
              {n.capacity?.cpuLoad1m != null
                ? `${(n.capacity.cpuLoad1m / Math.max(n.capacity?.cpuCores ?? 1, 1)).toFixed(2)}${n.capacity?.cpuCores ? `/${n.capacity.cpuCores}c` : ''}`
                : '—'}
            </td>
            <td className={css.num}>
              {n.capacity?.memoryAvailableMb != null ? `${(n.capacity.memoryAvailableMb / 1024).toFixed(1)}G` : '—'}
              {n.capacity?.memoryTotalMb != null ? `/${(n.capacity.memoryTotalMb / 1024).toFixed(0)}G` : ''}
            </td>
            <td>{n.capacity?.platform ?? '—'}{n.capacity?.arch ? ` ${n.capacity.arch}` : ''}</td>
            <td className={css.num}>{n.heartbeatAgeSec != null ? `${n.heartbeatAgeSec}s` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sparkline({ series }: { series: { name: string; color: string; unit?: 'ms' | 'raw'; values: (number | null)[] }[] }) {
  const W = 300
  const H = 56
  const P = 3
  const fmt = (v: number, unit?: 'ms' | 'raw') => (unit === 'ms' ? fmtDur(v) : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(1))
  const paths = series.map((s) => {
    const vals = s.values
    const nums = vals.filter((v): v is number => v != null)
    if (!nums.length) return null
    const max = Math.max(...nums, 1e-6)
    const min = Math.min(...nums, 0)
    const range = max - min || 1
    // 按原始索引定位 x（含 null 断档占位）；null 断开曲线 → 分段渲染，段间不直连
    const segments: string[] = []
    let cur: string[] = []
    vals.forEach((v, i) => {
      if (v == null) {
        if (cur.length) { segments.push(cur.join(' ')); cur = [] }
        return
      }
      const x = P + (i / Math.max(vals.length - 1, 1)) * (W - P * 2)
      const y = H - P - ((v - min) / range) * (H - P * 2)
      cur.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    })
    if (cur.length) segments.push(cur.join(' '))
    return {
      name: s.name,
      color: s.color,
      unit: s.unit,
      last: nums[nums.length - 1],
      segments,
    }
  })
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="sparkline">
        {paths.filter((p): p is NonNullable<typeof p> => p !== null).map((p, i) => (
          <g key={i}>
            {p.segments.map((pts, j) => (
              <polyline key={j} points={pts} fill="none" stroke={p.color} strokeWidth="1.6" strokeLinejoin="round" />
            ))}
          </g>
        ))}
      </svg>
      <div className={css.legend}>
        {paths.filter((p): p is NonNullable<typeof p> => p !== null).map((p, i) => (
          <span key={i} className={css.legendItem}>
            <span className={css.legendDot} style={{ background: p.color }} />
            {p.name} {p.last != null ? fmt(p.last, p.unit) : '—'}
          </span>
        ))}
      </div>
    </div>
  )
}

/** ── Surge 节点信誉（type 'surge'，后端 /dashboards/surge/ai-reputation） ── */

interface SurgeProbe { code: string; ms: number }
interface SurgeNodeRow {
  name: string
  status: string
  xai?: SurgeProbe | null
  grok?: SurgeProbe | null
  openai?: SurgeProbe | null
  ctrl?: SurgeProbe | null
  quarantined: boolean
  quarantineSince?: string | null
  cooldownUntil?: string | null
  reason?: string | null
}
interface SurgeRepData {
  updatedAt?: string | null
  lastApplyAt?: string | null
  summary?: Record<string, number>
  nodes: SurgeNodeRow[]
  recentEvents?: { ts: string; type: string; node: string | null; reason: string | null }[]
  error?: string | null
}

const fmtAgo = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return '—'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s 前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function SurgeNodeTable({ data, t }: { data: unknown; t: (k: string) => string }) {
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as SurgeRepData
  const summary = d.summary ?? {}
  const quarantinedCount = summary.quarantined ?? 0
  const dot = (s: string): StateDotState => {
    if (s === 'healthy') return 'done'
    if (s === 'grok_403' || s === 'xai_partial') return 'warning'
    return 'error' // xai_blocked / xai_banned / dead
  }
  const textCls = (s: string) => (
    s === 'healthy' ? css.okText
      : s === 'grok_403' || s === 'xai_partial' ? css.warnText
        : css.errText
  )
  const codeCls = (c: string | null | undefined) => (
    c === '401' || c === '200' || c === '204' ? css.okText
      : c === '403' ? css.warnText
        : c === '000' ? css.errText
          : css.muted
  )
  const statusLabel = (s: string) => t(`surge.st.${s}`) || s
  const eventCls = (type: string) => (
    type.includes('recover') ? css.okText
      : type.startsWith('quarantine') ? css.warnText
        : css.muted
  )
  const pill = (label: string, n: number | undefined, warn: boolean) => (
    <span className={`${css.pill} ${warn ? css.pillWarn : css.pill}`}>{label} {n ?? 0}</span>
  )
  return (
    <div>
      <div className={css.pillRow}>
        {pill(t('surge.st.healthy'), summary.healthy, false)}
        {pill(t('surge.st.grok_403'), summary.grok_403, true)}
        {pill(t('surge.st.xai_blocked'), summary.xai_blocked, true)}
        {pill(t('surge.st.xai_banned'), summary.xai_banned, true)}
        {pill(t('surge.st.dead'), summary.dead, true)}
        {pill(t('surge.quarantined'), quarantinedCount, quarantinedCount > 0)}
      </div>
      {d.error && !d.nodes.length ? <p className={css.muted}>{d.error}</p> : null}
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t('col.node')}</th><th>{t('col.status')}</th><th>{t('surge.col.probe')}</th>
            <th className={css.num}>{t('col.latency')}</th><th>{t('surge.col.q')}</th>
          </tr>
        </thead>
        <tbody>
          {d.nodes.map((n) => (
            <tr key={n.name}>
              <td>
                <span className={css.mono}>{n.name}</span>
                {n.quarantined ? <span className={`${css.muted} ${css.hostSub}`}>{t('surge.isolated')}</span> : null}
              </td>
              <td>
                <span className={css.rowDot}><StateDot state={dot(n.status)} size={8} /></span>
                <span className={textCls(n.status)}>{statusLabel(n.status)}</span>
              </td>
              <td>
                <span className={css.mono}>
                  <span className={codeCls(n.xai?.code)}>{n.xai?.code ?? '—'}</span>
                  <span className={css.muted}>/</span>
                  <span className={codeCls(n.grok?.code)}>{n.grok?.code ?? '—'}</span>
                  <span className={css.muted}>/</span>
                  <span className={codeCls(n.openai?.code)}>{n.openai?.code ?? '—'}</span>
                  <span className={css.muted}> c:</span>
                  <span className={codeCls(n.ctrl?.code)}>{n.ctrl?.code ?? '—'}</span>
                </span>
              </td>
              <td className={css.num}>{fmtDur(n.xai?.ms ?? n.ctrl?.ms ?? null)}</td>
              <td>
                {n.quarantined
                  ? <span title={n.cooldownUntil ?? undefined}>{fmtAgo(n.cooldownUntil)}</span>
                  : <span className={css.muted}>—</span>}
              </td>
            </tr>
          ))}
          {!d.nodes.length && !d.error && (
            <tr><td colSpan={5} className={css.muted}>{t('noData')}</td></tr>
          )}
        </tbody>
      </table>
      {d.recentEvents && d.recentEvents.length > 0 && (
        <div className={css.eventList}>
          <p className={css.muted}>{t('surge.events')}</p>
          {d.recentEvents.map((e, i) => (
            <div key={i} className={css.eventRow}>
              <span className={css.muted}>{fmtAgo(e.ts)}</span>
              <span className={eventCls(e.type)}>{t(`surge.evt.${e.type}`) || e.type}</span>
              {e.node ? <span className={css.mono}>{e.node}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrendChart({ data, t }: { data: unknown; t: (k: string) => string }) {
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as { series?: { provider?: string; model?: string; points?: { day?: string; avgDurationMs?: number | null }[] }[]; points?: ({ ts?: string; load1?: number | null; memUsedPct?: number | null } | null)[]; sampleMs?: number; windowStart?: string | null; windowEnd?: string | null }
  const COLORS = [
    'color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, transparent)',
    'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 80%, transparent)',
    'color-mix(in srgb, var(--dsw-alias-state-success-primary) 80%, transparent)',
    'color-mix(in srgb, var(--dsw-alias-state-error-primary) 70%, transparent)',
  ]
  if (d.series) {
    const series = d.series
      .filter((s) => (s.points ?? []).length > 1)
      .slice(0, 4)
      .map((s, i) => ({
        name: `${s.model ?? s.provider ?? '?'}`,
        color: COLORS[i % COLORS.length],
        unit: 'ms' as const, // los trends avgDurationMs 单位 ms
        values: (s.points ?? []).map((p) => p.avgDurationMs ?? null),
      }))
    if (!series.length) return <p className={css.muted}>无趋势数据</p>
    return <Sparkline series={series} />
  }
  if (d.points) {
    const pts = d.points
    const real = pts.filter((p): p is NonNullable<typeof p> => p != null)
    if (real.length < 2) return <p className={css.muted}>等待采样…</p>
    const series = [
      { name: 'load1', unit: 'raw' as const, color: COLORS[0], values: pts.map((p) => (p == null ? null : p.load1 ?? null)) },
      { name: 'mem%', unit: 'raw' as const, color: COLORS[1], values: pts.map((p) => (p == null ? null : p.memUsedPct ?? null)) },
    ]
    // 断档数 = null 占位计数；窗口 = windowStart~windowEnd（idle 停采期间曲线断开，不再直连跳变）
    const gaps = pts.filter((p) => p == null).length
    const winMin = d.windowStart && d.windowEnd
      ? Math.max(1, Math.round((new Date(d.windowEnd).getTime() - new Date(d.windowStart).getTime()) / 60000))
      : null
    return (
      <div>
        <Sparkline series={series} />
        <p className={css.muted}>
          {winMin != null ? `${t('chart.window')} ${winMin}min · ` : ''}{t('chart.points')} {real.length}
          {gaps > 0 ? ` · ${t('chart.gap')} ${gaps}` : ''}
        </p>
      </div>
    )
  }
  return <p className={css.muted}>无图表数据</p>
}

interface ListRow {
  name?: string; ok?: boolean; degraded?: boolean; detail?: string; latencyMs?: number
  status?: string; latency?: number; uptime?: number; active?: boolean
}

function ListCard({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as { results?: ListRow[]; monitors?: ListRow[]; down?: number; total?: number; enabled?: boolean; reason?: string }
  if (d.reason && !d.results && !d.monitors) return <p className={css.muted}>{d.reason}</p>
  if (d.monitors) {
    return (
      <table className={css.table}>
        <thead>
          <tr><th>服务</th><th>状态</th><th className={css.num}>延迟</th><th className={css.num}>uptime</th></tr>
        </thead>
        <tbody>
          {d.monitors.map((m, i) => (
            <tr key={i}>
              <td>{m.name ?? '—'}</td>
              <td>
                <span className={css.rowDot}><StateDot state={m.status === 'up' ? 'done' : m.status === 'down' ? 'error' : 'warning'} size={8} /></span>
                <span className={m.status === 'up' ? css.okText : m.status === 'down' ? css.errText : css.warnText}>{m.status ?? '—'}</span>
              </td>
              <td className={css.num}>{m.latency != null ? fmtDur(m.latency) : '—'}</td>
              <td className={css.num}>{m.uptime != null ? `${m.uptime.toFixed(1)}%` : '—'}</td>
            </tr>
          ))}
          {!d.monitors.length && <tr><td colSpan={4} className={css.muted}>无 monitor（Kuma 侧未配置）</td></tr>}
        </tbody>
      </table>
    )
  }
  const results = d.results ?? []
  const degraded = results.filter((r) => r.degraded)
  const down = results.filter((r) => !r.ok && !r.degraded)
  const upCount = d.ok ?? results.length - down.length - degraded.length
  const rowDot = (r: ListRow): StateDotState => (r.ok ? 'done' : r.degraded ? 'warning' : 'error')
  const rowText = (r: ListRow) => (r.ok ? 'up' : r.degraded ? 'degraded' : 'down')
  const rowCls = (r: ListRow) => (r.ok ? css.okText : r.degraded ? css.warnText : css.errText)
  return (
    <div>
      <div className={css.pillRow}>
        <span className={`${css.pill} ${down.length ? css.pillWarn : degraded.length ? css.pillWarn : css.pill}`}>
          {upCount}/{d.total ?? results.length} up{degraded.length ? ` · ${degraded.length} degraded` : ''}
        </span>
      </div>
      <table className={css.table}>
        <thead>
          <tr><th>服务</th><th>状态</th><th className={css.num}>延迟</th><th>详情</th></tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td>{r.name ?? '—'}</td>
              <td>
                <span className={css.rowDot}><StateDot state={rowDot(r)} size={8} /></span>
                <span className={rowCls(r)}>{rowText(r)}</span>
              </td>
              <td className={css.num}>{r.latencyMs != null ? `${r.latencyMs}ms` : '—'}</td>
              <td className={css.muted}>{r.detail ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** feed 采集摘要报告（host 读 ~/.dsh/scheduler-reports/feed/ 最新 N 份）。 */
interface FeedDigest {
  file?: string
  at?: string | null
  title?: string
  lines?: number
  size?: number
  text?: string
}

function FeedCard({ data, t }: { data: unknown; t: (k: string) => string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as { dir?: string; count?: number; digests?: FeedDigest[]; error?: string }
  if (d.error && !(d.digests?.length)) return <p className={css.muted}>{d.error}</p>
  const digests = d.digests ?? []
  if (!digests.length) return <p className={css.muted}>{t('feed.empty')}</p>
  return (
    <div>
      <div className={css.pillRow}>
        <span className={`${css.pill} ${css.pillDim}`}>{t('feed.latest')} {digests.length}</span>
      </div>
      {digests.map((g) => {
        const key = g.file ?? g.at ?? ''
        const expanded = open === key
        return (
          <div key={key} className={css.feedItem}>
            <button
              type="button"
              className={css.feedToggle}
              onClick={() => setOpen(expanded ? null : key)}
              aria-expanded={expanded}
            >
              <span className={css.feedTitle}>{g.title ?? g.file ?? '—'}</span>
              <span className={css.feedTime}>
                {g.at ? new Date(g.at).toLocaleString() : '—'}
                {g.lines != null ? ` · ${g.lines} 行` : ''}
              </span>
            </button>
            {expanded && g.text ? (
              <div className={css.feedBody}>
                <MarkdownText text={g.text} />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function WidgetCard({ widget, snap, t, editing, removing, onRemove }: {
  widget: WidgetConfig
  snap?: Snapshot
  t: (k: string) => string
  editing?: boolean
  removing?: boolean
  onRemove?: () => void
}) {
  const d = snap?.data as unknown
  const hasError = !!(snap?.error || (d as { error?: string } | null)?.error)
  return (
    <section className={`${css.card} ${removing ? css.cardRemoving : ''}`}>
      <header className={css.cardHeader}>
        <p className={css.cardTitle}>{widget.title}</p>
        <span className={css.cardMeta}>
          {snap?.ts ? <span className={css.muted}>{t('updated')} {new Date(snap.ts).toLocaleTimeString()}</span> : null}
          {editing ? (
            <button
              type="button"
              className={css.removeBtn}
              onClick={onRemove}
              aria-label={`移除 ${widget.title}`}
              title={removing ? '取消移除' : '移除该 widget'}
            >
              {removing ? '↩' : '✕'}
            </button>
          ) : null}
        </span>
      </header>
      <div className={css.cardBody}>
        {hasError ? (
          <p className={css.error}>⚠️ {snap?.error || (d as { error?: string }).error}</p>
        ) : widget.type === 'stat' ? (
          <StatCard data={d} t={t} />
        ) : widget.type === 'matrix' ? (
          <NodeMatrix data={d} t={t} />
        ) : widget.type === 'chart' ? (
          <TrendChart data={d} t={t} />
        ) : widget.type === 'list' ? (
          <ListCard data={d} />
        ) : widget.type === 'surge' ? (
          <SurgeNodeTable data={d} t={t} />
        ) : widget.type === 'feed' ? (
          <FeedCard data={d} t={t} />
        ) : (
          <p className={css.muted}>{t('noData')}</p>
        )}
      </div>
    </section>
  )
}

/** 聚合快照 widget（配置+数据一次返回）。 */
interface SnapshotWidget extends WidgetConfig {
  snap?: Snapshot
}

export function DashboardView(props: ConvViewProps): React.JSX.Element {
  const { t } = props as { t?: (k: string) => string }
  const localeT = (k: string) => (t ? t(k) : k)
  const [widgets, setWidgets] = useState<SnapshotWidget[] | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ── 编辑模式：widget 移除 + 探针目标增删（PUT /dashboards/widgets + /probe-targets） ──
  const [editing, setEditing] = useState(false)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [probeTargets, setProbeTargets] = useState<ProbeTarget[] | null>(null)
  const [probeSource, setProbeSource] = useState<string>('default')
  const [probeDirty, setProbeDirty] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addPort, setAddPort] = useState('')

  const toggleEdit = async () => {
    if (editing) {
      setEditing(false)
      setRemovedIds(new Set())
      setProbeTargets(null)
      setProbeDirty(false)
      setEditMsg(null)
      setAddName(''); setAddUrl(''); setAddPort('')
      return
    }
    setEditing(true)
    setEditMsg(null)
    try {
      const res = await fetch('/dashboards/probe-targets', { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as { targets?: ProbeTarget[]; source?: string }
      setProbeTargets(d.targets ?? [])
      setProbeSource(d.source ?? 'default')
    } catch (e) {
      setEditMsg(`探针目标读取失败: ${String(e)}`)
    }
  }

  const toggleRemove = (id: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addTarget = () => {
    const name = addName.trim()
    if (!name) { setEditMsg('名称必填'); return }
    const url = addUrl.trim()
    const port = addPort.trim()
    if (!url && !port) { setEditMsg('URL 或端口至少填一项'); return }
    const t: ProbeTarget = { name }
    if (url) t.url = url
    if (port) t.port = Number(port)
    setProbeTargets((prev) => [...(prev ?? []), t])
    setProbeDirty(true)
    setAddName(''); setAddUrl(''); setAddPort('')
    setEditMsg(null)
  }

  const removeTarget = (i: number) => {
    setProbeTargets((prev) => (prev ?? []).filter((_, idx) => idx !== i))
    setProbeDirty(true)
  }

  const resetProbe = async () => {
    setSaving(true)
    try {
      const res = await fetch('/dashboards/probe-targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: [] }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as { targets?: ProbeTarget[] }
      setProbeTargets(d.targets ?? [])
      setProbeSource('default')
      setProbeDirty(false)
      setEditMsg('已重置为默认探针目标')
    } catch (e) {
      setEditMsg(`重置失败: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const saveAll = async () => {
    setSaving(true)
    setEditMsg(null)
    try {
      if (removedIds.size > 0 && widgets) {
        const remaining = widgets.filter((w) => !removedIds.has(w.id))
        const res = await fetch('/dashboards/widgets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgets: remaining }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`widgets HTTP ${res.status}`)
      }
      if (probeDirty && probeTargets) {
        const res = await fetch('/dashboards/probe-targets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: probeTargets }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`probe-targets HTTP ${res.status}`)
      }
      setEditing(false)
      setRemovedIds(new Set())
      setProbeTargets(null)
      setProbeDirty(false)
      setAddName(''); setAddUrl(''); setAddPort('')
      setReloadKey((k) => k + 1)
    } catch (e) {
      setEditMsg(`保存失败: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // 单 ticker：15s 拉一次 /dashboards/snapshot（host 侧按各后端 interval 决定真正采集，
  // client 不再逐卡 fetch——往返 7→1）。可见性门控：浏览器标签页隐藏时停 ticker，
  // 避免后台 tab 里挂着的看板让 host 8 个 poller 永活（配合 host 侧 180s 活动门控）。
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setInterval> | null = null
    const load = async () => {
      try {
        const res = await fetch('/dashboards/snapshot', { signal: AbortSignal.timeout(10000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json() as { widgets?: SnapshotWidget[] }
        if (alive) { setWidgets(d.widgets ?? []); setConfigError(null) }
      } catch (e) {
        if (alive) setConfigError(String(e))
      }
    }
    const sync = () => {
      if (document.visibilityState === 'visible') {
        void load()
        if (!timer) timer = setInterval(() => { void load() }, 15000)
      } else if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      alive = false
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [reloadKey])

  return (
    <div className={css.root}>
      <header className={css.header}>
        <span className={css.title}>📊 {localeT('view.dashboard')}</span>
        <button className={css.btn} onClick={() => setReloadKey((k) => k + 1)} aria-label="刷新">↻</button>
        {editing ? (
          <>
            <button className={`${css.btn} ${css.btnPrimary}`} onClick={() => void saveAll()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button className={css.btn} onClick={() => void toggleEdit()} disabled={saving}>取消</button>
          </>
        ) : (
          <button className={css.btn} onClick={() => void toggleEdit()}>编辑</button>
        )}
      </header>
      {editing && (
        <section className={css.editPanel}>
          <div className={css.editPanelHead}>
            <span className={css.editPanelTitle}>服务探活目标</span>
            <span className={css.muted}>
              来源: {probeSource === 'store' ? 'UI 编辑' : probeSource === 'config' ? '静态配置' : '默认'}
            </span>
          </div>
          {probeTargets && probeTargets.length > 0 ? (
            <div>
              {probeTargets.map((tg, i) => (
                <div key={`${tg.name}-${i}`} className={css.targetRow}>
                  <span className={css.mono}>{tg.name}</span>
                  <span className={`${css.muted} ${css.targetAddr}`}>{tg.url ?? `${tg.host ?? '127.0.0.1'}:${tg.port}`}</span>
                  <button type="button" className={css.removeBtn} onClick={() => removeTarget(i)} aria-label={`移除 ${tg.name}`}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <p className={css.muted}>暂无探针目标（保存空列表将重置为默认）</p>
          )}
          <div className={css.addForm}>
            <input className={css.input} placeholder="名称" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <input className={css.input} placeholder="URL http://…" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} />
            <input className={css.input} placeholder="端口" type="number" min={1} max={65535} value={addPort} onChange={(e) => setAddPort(e.target.value)} />
            <button type="button" className={css.btn} onClick={addTarget}>添加</button>
            <button type="button" className={css.btn} onClick={() => void resetProbe()} disabled={saving}>重置为默认</button>
          </div>
          <p className={css.muted}>编辑模式下可点卡片右上角 ✕ 移除 widget；点「保存」一并生效。</p>
        </section>
      )}
      {editMsg && <p className={css.hint}>{editMsg}</p>}
      {configError && <p className={css.error}>⚠️ {configError}</p>}
      {!configError && !widgets && <p className={css.muted}>{localeT('pending')}</p>}
      {widgets && widgets.length === 0 && <p className={css.muted}>{localeT('widgets.empty')}</p>}
      {widgets && widgets.length > 0 && (
        <div className={css.grid}>
          {widgets.map((w) => (
            <WidgetCard
              key={w.id}
              widget={w}
              snap={w.snap}
              t={localeT}
              editing={editing}
              removing={removedIds.has(w.id)}
              onRemove={() => toggleRemove(w.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
