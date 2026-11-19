/**
 * scheduler-surfaces.mjs — 「调度面」卡片的纯逻辑（无 IO，可单测）。
 *
 * 为什么（人话）：现在有四个地方各自在安排定时任务（dsh-scheduler / launchd / 原生 schedule / 治理案件），
 * 彼此不知道对方存在；想知道"今天这几个地方有没有东西坏了"只能手工拼表。这张卡就回答这一个问题。
 *
 * 设计约束（2026-11-19 设计确认单 §10）：
 *   ① **零新判据**：每行只读现成产物，不在这里重算 backlog / 不重判门禁 / 不重算治理；
 *   ② 输入全部是**已解析好的对象**（调用方负责读文件）⇒ 可以脱离文件系统单测；
 *   ③ 读不到的必须落到 `ok:false + detail:"判不了"`，**不许**当成 0 / 绿（本仓踩过多次）。
 *
 * 输出形状对齐 dsh-dashboards 的 `type:'list'`：
 *   { results: [{name, ok, degraded, detail}], total, ok, asOf }
 */
export const ACTIVE_OVERDUE_MS = 2 * 3600e3
export const GOVERNANCE_STALE_MS = 48 * 3600e3

/** 每个输入是 {ok:true, data} 或 {ok:false, error}；helper 统一取数。 */
function val(input) {
  return input && input.ok === true ? input.data : null
}
function why(input, dflt) {
  return input && input.ok === false ? String(input.error ?? dflt) : dflt
}

/**
 * 把台账里的 UTC 时间戳渲染成**本地**墙钟时间（YYYY-MM-DD HH:mm）。
 *
 * 为什么必须这么写（2026-11-19 实测）：台账 `ts` 是 `...Z`，面板原先 `slice(0,10)` 取的是
 * **UTC 日期**；本机 +08 下，今早 07:43 的跑批显示成「2026-11-18」——看起来像昨天的旧结论，
 * 实际是当天最新的。这是 V1（新鲜度要人读得懂）的反面：不渲染裸 UTC 日期。
 *
 * `tzOffsetMin` 可注入（分钟，东八区 = 480）⇒ 单测不必依赖运行机器的时区。
 */
export function fmtLocal(iso, tzOffsetMin) {
  const ms = Date.parse(String(iso ?? ''))
  if (!Number.isFinite(ms)) return ''
  const off = Number.isFinite(tzOffsetMin) ? Number(tzOffsetMin) : -new Date(ms).getTimezoneOffset()
  const d = new Date(ms + off * 60e3)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * 取治理侧**未过期**的认损，按 `source` 关联到本卡片的某个消费方。
 *
 * 只读现成产物（governance summary 的 `acceptedItems`），不在这里重算案件状态；
 * 快照过期（>48h）或读不到 ⇒ 返回 null（宁可变红，也不拿旧认损当今天的挡箭牌）。
 */
function acceptedForSource(governance, source, now) {
  const g = val(governance)
  const items = g?.acceptedItems
  const asOf = Date.parse(String(g?.asOf ?? ''))
  if (!Array.isArray(items) || !Number.isFinite(asOf) || now - asOf > GOVERNANCE_STALE_MS) return null
  let best = null
  for (const it of items) {
    if (String(it?.source ?? '') !== source) continue
    const exp = Date.parse(String(it?.expiresAt ?? ''))
    if (!Number.isFinite(exp) || exp <= now) continue
    if (!best || exp > Date.parse(String(best.expiresAt))) best = it
  }
  return best
}

export function buildSchedulerSurfaces(inputs = {}) {
  const { now = Date.now(), jobs, registry, schedule, nightlyPending, verdicts, governance } = inputs
  const results = []

  // 1) dsh-scheduler：有作业被关着 ⇒ 黄（可能是故意停，也可能是连续失败被熔断 ⇒ 要人看一眼）
  {
    const list = val(jobs)
    if (!Array.isArray(list)) {
      results.push({ name: 'dsh-scheduler', ok: false, degraded: false, detail: `判不了（${why(jobs, '读不到 jobs.json')}）` })
    } else {
      const disabled = list.filter((j) => j?.enabled !== true)
      results.push({
        name: 'dsh-scheduler',
        ok: disabled.length === 0,
        degraded: disabled.length > 0,
        detail: disabled.length === 0
          ? `${list.length}/${list.length} 启用`
          : `${list.length - disabled.length}/${list.length} 启用（关着 ${disabled.length} 个：${disabled.map((j) => String(j?.name ?? j?.id ?? '?').slice(0, 14)).join('、')}）`,
      })
    }
  }

  // 2) launchd：清单说的数量和实际条数不一致 ⇒ 黄（生成器漂移）
  {
    const reg = val(registry)
    const declared = Number(reg?.count)
    const actual = Array.isArray(reg?.jobs) ? reg.jobs.length : null
    if (!reg || !Number.isFinite(declared) || actual === null) {
      results.push({ name: 'launchd', ok: false, degraded: false, detail: `判不了（${why(registry, '读不到 registry.json')}）` })
    } else {
      const drift = declared !== actual
      results.push({
        name: 'launchd',
        ok: !drift,
        degraded: drift,
        detail: drift ? `清单 ${declared} ≠ 实际 ${actual}（生成器漂移）` : `${actual} 个，清单与实际一致`,
      })
    }
  }

  // 3) 原生 schedule：有 active 却早该触发（>2h） ⇒ 黄（"悄悄停了"的典型样子）
  {
    const tasks = val(schedule)?.tables?.tasks
    if (!tasks || typeof tasks !== 'object') {
      results.push({ name: '原生 schedule', ok: false, degraded: false, detail: `判不了（${why(schedule, '读不到 schedule.json')}）` })
    } else {
      const all = Object.values(tasks)
      const active = all.filter((t) => t?.status === 'active')
      const overdue = active.filter((t) => {
        const at = Date.parse(String(t?.record?.scheduledAt ?? t?.scheduledAt ?? ''))
        return Number.isFinite(at) && at + ACTIVE_OVERDUE_MS < now
      })
      results.push({
        name: '原生 schedule',
        ok: overdue.length === 0,
        degraded: overdue.length > 0,
        detail: overdue.length
          ? `${active.length} 个在跑，${overdue.length} 个已过期未触发`
          : `${active.length} 个在跑 / 共 ${all.length} 个`,
      })
    }
  }

  // 4) 未落地补丁：读夜间提醒落的状态（不在这里重算 git apply）
  {
    const b = val(nightlyPending)?.backlog
    if (!b || !Number.isFinite(Number(b.pending))) {
      results.push({ name: '未落地补丁', ok: false, degraded: false, detail: `判不了（${why(nightlyPending, '读不到 nightly-pending 状态')}）` })
    } else {
      const pending = Number(b.pending)
      const gate = b.gate === true
      results.push({
        name: '未落地补丁',
        ok: pending === 0,
        degraded: pending > 0 && !gate,
        detail: gate
          ? `${pending} 张未落地 ⇒ 已触发积压闸门（今夜不派活）`
          : `${pending} 张未落地（已落地 ${Number(b.landed ?? 0)} / 判不了 ${Number(b.unjudged ?? 0)}）`,
      })
    }
  }

  // 5) rust 门禁：只看台账最后一行（不重跑门禁）
  {
    const list = val(verdicts)
    const last = Array.isArray(list) && list.length ? list[list.length - 1] : null
    if (!last || !Number.isFinite(Number(last.merged_rc))) {
      results.push({ name: 'rust 门禁', ok: false, degraded: false, detail: `判不了（${why(verdicts, '台账没有可解析的最后一行')}）` })
    } else {
      const rc = Number(last.merged_rc)
      const stamp = fmtLocal(last.ts) || '—'
      const accepted = rc === 0 ? null : acceptedForSource(governance, 'daily-verdicts', now)
      results.push({
        name: 'rust 门禁',
        ok: rc === 0,
        // 认损既不是绿也不是红：它有自己的一句话（V3：故障态与认损态是两件事）。
        // 不给 degraded 就等于把「已知认损一个月」渲染成和「今天炸了」一样的红灯。
        degraded: rc !== 0 && accepted !== null,
        detail: rc === 0
          ? `merged_rc=0（${stamp}）`
          : accepted
            ? `merged_rc=${rc}（gate=${last.gate_rc} routeguard=${last.routeguard_rc}，${stamp}）· 已认损至 ${fmtLocal(accepted.expiresAt).slice(0, 10)}（不是绿：到期或修好才会消失）`
            : `merged_rc=${rc}（gate=${last.gate_rc} routeguard=${last.routeguard_rc}，${stamp}）`,
      })
    }
  }

  // 6) 治理案件：读治理 CLI 落的 summary（唯一生产者是 governance-cases.mjs）
  {
    const g = val(governance)
    const c = g?.counts
    const asOf = Date.parse(String(g?.asOf ?? ''))
    if (!c || !Number.isFinite(asOf)) {
      results.push({ name: '治理案件', ok: false, degraded: false, detail: `判不了（${why(governance, '读不到治理快照')}）` })
    } else if (now - asOf > GOVERNANCE_STALE_MS) {
      results.push({ name: '治理案件', ok: false, degraded: false, detail: `快照过期 ${Math.round((now - asOf) / 3600e3)}h（治理 sweep 没跑）` })
    } else {
      results.push({
        name: '治理案件',
        ok: Number(c.overdue) === 0,
        degraded: Number(c.claimed ?? 0) > 0,
        detail: `新开 ${c.newlyOpened} / 关闭 ${c.newlyClosed} / 超期 ${c.overdue}` +
          `（在案 ${c.open}、认损 ${c.accepted}、声称已修 ${c.claimed ?? 0}；闭环率 ${g.closedRate ?? '—'}）`,
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  return { results, total: results.length, ok: okCount, asOf: new Date(now).toISOString() }
}
