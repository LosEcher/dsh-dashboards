/**
 * dsh-dashboards — '看板' tab view: widget grid driven by host-side
 * widget config (GET /dashboards/widgets). Each widget fetches its own
 * backend endpoint on its own refresh cadence.
 *
 * Theme-aware: only --dsw-alias-* design tokens (light/dark safe).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DashboardView.module.css'

export interface WidgetConfig {
  id: string
  type: 'stat' | 'matrix' | 'chart' | 'list' | 'feed'
  endpoint: string
  title: string
  refreshMs: number
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
          <th>{t('col.node')}</th><th>{t('col.status')}</th><th className={css.num}>{t('col.load')}</th>
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
            <td className={css.num}>{n.capacity?.cpuLoad1m != null ? n.capacity.cpuLoad1m.toFixed(2) : '—'}</td>
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

function Sparkline({ series }: { series: { name: string; color: string; values: (number | null)[] }[] }) {
  const W = 300
  const H = 56
  const P = 3
  const paths = series.map((s) => {
    const nums = s.values.filter((v): v is number => v != null)
    if (!nums.length) return null
    const max = Math.max(...nums, 1e-6)
    const min = Math.min(...nums, 0)
    const range = max - min || 1
    const pts = nums.map((v, i) => {
      const x = P + (i / Math.max(nums.length - 1, 1)) * (W - P * 2)
      const y = H - P - ((v - min) / range) * (H - P * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return {
      name: s.name,
      color: s.color,
      last: nums[nums.length - 1],
      d: `M${pts.join(' L')}`,
    }
  })
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="sparkline">
        {paths.filter((p): p is NonNullable<typeof p> => p !== null).map((p, i) => (
          <polyline key={i} points={p.d.slice(1)} fill="none" stroke={p.color} strokeWidth="1.6" strokeLinejoin="round" />
        ))}
      </svg>
      <div className={css.legend}>
        {paths.filter((p): p is NonNullable<typeof p> => p !== null).map((p, i) => (
          <span key={i} className={css.legendItem}>
            <span className={css.legendDot} style={{ background: p.color }} />
            {p.name} {p.last != null ? (p.last >= 1000 ? `${(p.last / 1000).toFixed(1)}k` : p.last.toFixed(1)) : '—'}
          </span>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') {
    return <p className={css.muted}>—</p>
  }
  const d = data as { series?: { provider?: string; model?: string; points?: { day?: string; avgDurationMs?: number | null }[] }[]; points?: { ts?: string; load1?: number | null; memUsedPct?: number | null }[] }
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
        values: (s.points ?? []).map((p) => p.avgDurationMs ?? null),
      }))
    if (!series.length) return <p className={css.muted}>无趋势数据</p>
    return <Sparkline series={series} />
  }
  if (d.points) {
    const pts = d.points
    if (pts.length < 2) return <p className={css.muted}>等待采样…</p>
    const series = [
      { name: 'load1', color: COLORS[0], values: pts.map((p) => p.load1 ?? null) },
      { name: 'mem%', color: COLORS[1], values: pts.map((p) => p.memUsedPct ?? null) },
    ]
    return <Sparkline series={series} />
  }
  return <p className={css.muted}>无图表数据</p>
}

interface ListRow {
  name?: string; ok?: boolean; detail?: string; latencyMs?: number
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
  const down = results.filter((r) => !r.ok)
  return (
    <div>
      <div className={css.pillRow}>
        <span className={`${css.pill} ${down.length ? css.pillWarn : css.pill}`}>
          {d.ok ?? (results.length - down.length)}/{d.total ?? results.length} up
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
                <span className={css.rowDot}><StateDot state={r.ok ? 'done' : 'error'} size={8} /></span>
                <span className={r.ok ? css.okText : css.errText}>{r.ok ? 'up' : 'down'}</span>
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
              <pre className={css.feedBody}>{g.text}</pre>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function WidgetCard({ widget, snap, t }: { widget: WidgetConfig; snap?: Snapshot; t: (k: string) => string }) {
  const d = snap?.data as unknown
  const hasError = !!(snap?.error || (d as { error?: string } | null)?.error)
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <p className={css.cardTitle}>{widget.title}</p>
        <span className={css.cardMeta}>
          {snap?.ts ? <span className={css.muted}>{t('updated')} {new Date(snap.ts).toLocaleTimeString()}</span> : null}
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
          <TrendChart data={d} />
        ) : widget.type === 'list' ? (
          <ListCard data={d} />
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
        <button className={css.btn} onClick={() => setReloadKey((k) => k + 1)}>↻</button>
      </header>
      {configError && <p className={css.error}>⚠️ {configError}</p>}
      {!configError && !widgets && <p className={css.muted}>{localeT('pending')}</p>}
      {widgets && widgets.length === 0 && <p className={css.muted}>{localeT('widgets.empty')}</p>}
      {widgets && widgets.length > 0 && (
        <div className={css.grid}>
          {widgets.map((w) => <WidgetCard key={w.id} widget={w} snap={w.snap} t={localeT} />)}
        </div>
      )}
    </div>
  )
}
