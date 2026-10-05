/**
 * dsh-dashboards — host 入口冒烟测试（跨版本门禁）。
 *
 * 用**运行中 profile 的真实宿主库**（@deepseek-ai/schemastery）加载插件入口
 * index.mjs，用桩 ctx 驱动 apply()，再以假 req/res 走真实路由处理器。这样锁住：
 *   - 模块能加载（语法/导入/Config schema 构建）
 *   - 路由注册齐全（/dashboards 前缀 + /plugins/<id>/status）
 *   - P0 批次新增行为在**真实入口**上生效（truncated / revision / egress / sanity）
 *
 * 设计要点（沿用 dsh-undo harness-compat 先例）：
 *   - 依赖从 profile 解析（test/fixtures/resolve-host.mjs），不赌本机软链；
 *   - 解析不到宿主库 ⇒ skip 并打印原因，而不是假装通过（防空转）；
 *   - **DSH_HOME 指向临时目录**，绝不触碰用户真实 storages（写盘类用例必须隔离）。
 *
 * 运行：node --test test/host-smoke.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 宿主库探测链：显式 env → ~/.dsh/profiles（link 插件的公共层）→ web profile。 */
function findHostRoot() {
  const candidates = [
    process.env.DSH_HOST_MODULES,
    process.env.DSH_PROFILE_ROOT,
    join(homedir(), '.dsh', 'profiles'),
    join(homedir(), '.dsh', 'profiles', 'web'),
  ].filter(Boolean)
  for (const root of candidates) {
    if (existsSync(join(root, 'node_modules', '@deepseek-ai', 'schemastery'))) return root
  }
  return null
}

const HOST_ROOT = findHostRoot()

/** 桩 ctx：捕获路由与日志，提供 dispose 句柄（apply 内注册了 dispose 清理定时器）。 */
function makeCtx() {
  const routes = []
  const logs = []
  let disposeFn = null
  return {
    routes,
    logs,
    webServer: { register: (r) => { routes.push(r); return () => {} } },
    logger: { info: (m) => logs.push(String(m)), warn: (m) => logs.push(String(m)) },
    on: (event, fn) => { if (event === 'dispose') disposeFn = fn },
    effect: (fn) => { try { return fn?.() } catch { return undefined } },
    dispose: () => disposeFn?.(),
  }
}

function fakeRes() {
  const res = {
    statusCode: 0,
    body: '',
    writeHead(code) { res.statusCode = code },
    end(chunk) { res.body = chunk ?? '' },
  }
  return res
}

function fakeReq(url, method = 'GET', body) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

/** 加载插件入口：DSH_HOME 必须先指向临时目录（index.mjs 顶层就把它算进路径常量）。 */
async function loadPlugin(dshHome) {
  process.env.DSH_HOME = dshHome
  process.env.DSH_HOST_MODULES = HOST_ROOT
  register(new URL('./fixtures/resolve-host.mjs', import.meta.url).href)
  const mod = await import(`../index.mjs?smoke=${Date.now()}`)
  // feed 摘要目录也指向临时目录，避免读到真实报告（只读，但保持隔离）
  return mod
}

const callRoute = async (route, url, method = 'GET', body) => {
  const res = fakeRes()
  await route.handler(fakeReq(url, method, body), res)
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null }
}

const findRoute = (routes, path) => routes.find((r) => r.path === path)

test('host 冒烟：真实宿主库加载入口 + 路由注册 + P0 行为', { skip: HOST_ROOT ? false : '未找到宿主 node_modules（profile 未安装 @deepseek-ai/schemastery），跳过而非假装通过' }, async () => {
  const dshHome = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'dsh-dash-smoke-'))
  // 预置一份 feed 报告，验证 truncated 字段真的按真实条数上报
  mkdirSync(join(dshHome, 'scheduler-reports'), { recursive: true })
  writeFileSync(join(dshHome, 'scheduler-reports', 'feed-digest-20260919-0900.md'), '# 测试摘要\n正文一行\n')

  // P1-2：Packy 出口探测状态（形状与 surge-auto scripts/packy-probe.py 一致）。
  // 刻意让两个出口一个 ok 一个 403 —— 这个卡片存在的全部理由就是"403 不能算可达"。
  const packyState = join(dshHome, 'packy-probe-state.json')
  writeFileSync(packyState, JSON.stringify({
    capturedAt: new Date().toISOString(),
    probeUrl: 'https://www.packyapi.ai/v1/models',
    probeKind: 'authenticated',
    keySource: 'keychain:PACKYCODE_API_KEY',
    samples: 3,
    okCount: 1,
    standbyCandidates: ['tencent-sin-mesh'],
    results: [
      { policy: 'tencent-sin-mesh', verdict: 'ok', statuses: [200, 200, 200], median_ms: 300 },
      { policy: 'www.packyapi.com', verdict: 'blocked', statuses: [403, 403, 403], median_ms: 90 },
    ],
  }, null, 2))

  // P1-2 附带修复：ai-node-reputation 事件的 ts 是 ISO 串，曾被 Number() 判成不可信而**全部丢弃**。
  // 一份「1 条可信 + 1 条脏时间」的夹具同时钉住"不再全丢"和"脏时间仍然丢"。
  const surgeEvents = join(dshHome, 'health-watch-events.jsonl')
  writeFileSync(surgeEvents, [
    JSON.stringify({ ts: new Date().toISOString(), source: 'ai-node-reputation', type: 'quarantine', node: 'n1' }),
    JSON.stringify({ ts: 'not-a-timestamp', source: 'ai-node-reputation', type: 'quarantine', node: 'n2' }),
    JSON.stringify({ ts: new Date().toISOString(), source: 'other', type: 'ignored' }),
  ].join('\n') + '\n')
  const surgeState = join(dshHome, 'ai-reputation-state.json')
  writeFileSync(surgeState, JSON.stringify({
    lastRunAt: new Date().toISOString(), lastReport: { probeResults: {} }, quarantined: {},
  }))

  const ctx = makeCtx()
  try {
    const mod = await loadPlugin(dshHome)
    assert.equal(mod.name, 'dsh-dashboards')
    assert.deepEqual(mod.inject, ['webServer'])
    assert.ok(mod.Config, 'Config schema 应导出')

    // apply 不应抛（Config 校验 + 路由注册 + 定时器建立）
    mod.apply(ctx, {
      packyProbe: { stateFile: packyState },
      surgeRep: { eventsFile: surgeEvents, stateFile: surgeState },
    })

    const dash = findRoute(ctx.routes, '/dashboards')
    const status = findRoute(ctx.routes, '/plugins/dsh-dashboards/status')
    assert.ok(dash, '/dashboards 前缀路由应注册')
    assert.ok(status, '/plugins/dsh-dashboards/status 路由应注册')
    assert.equal(dash.kind, 'prefix')
    assert.equal(status.kind, 'exact')

    // ── P0-6 egress 清单 ──
    const eg = await callRoute(dash, '/dashboards/egress')
    assert.equal(eg.status, 200)
    assert.equal(eg.json.features.length, 9)
    assert.equal(eg.json.features.every((f) => f.enabled), true, '默认全开（未配置 egress 时保持既有行为）')

    // ── P0-3 widget store revision ──
    const w1 = await callRoute(dash, '/dashboards/widgets')
    assert.equal(w1.status, 200)
    assert.equal(typeof w1.json.revision, 'number')
    assert.ok(Array.isArray(w1.json.widgets) && w1.json.widgets.length > 0)

    // 带正确 revision ⇒ 成功并递增
    const one = w1.json.widgets[0]
    const put1 = await callRoute(dash, '/dashboards/widgets', 'PUT', { widgets: [one], revision: w1.json.revision })
    assert.equal(put1.status, 200)
    assert.equal(put1.json.ok, true)
    assert.equal(put1.json.revision, w1.json.revision + 1)

    // 带陈旧 revision ⇒ 409 且不写盘（防丢更新的关键路径）
    const put2 = await callRoute(dash, '/dashboards/widgets', 'PUT', { widgets: [one, one], revision: w1.json.revision })
    assert.equal(put2.status, 409)
    assert.equal(put2.json.ok, false)
    assert.equal(put2.json.currentRevision, w1.json.revision + 1)
    const w2 = await callRoute(dash, '/dashboards/widgets')
    assert.equal(w2.json.widgets.length, 1, '冲突请求不得落盘')

    // 不带 revision ⇒ 保持旧的最后写入者获胜语义（老客户端兼容）
    const put3 = await callRoute(dash, '/dashboards/widgets', 'PUT', { widgets: [one] })
    assert.equal(put3.status, 200)
    assert.equal(put3.json.revision, w1.json.revision + 2)

    // ── P0-3 探针目标 revision + reset ──
    const p1 = await callRoute(dash, '/dashboards/probe-targets')
    assert.equal(p1.status, 200)
    assert.ok(['default', 'config', 'store'].includes(p1.json.source))
    assert.equal(typeof p1.json.revision, 'number')
    const putP = await callRoute(dash, '/dashboards/probe-targets', 'PUT', { targets: [{ name: 'x', port: 1234 }], revision: p1.json.revision })
    assert.equal(putP.status, 200)
    assert.equal(putP.json.revision, 1)
    const staleP = await callRoute(dash, '/dashboards/probe-targets', 'PUT', { targets: [{ name: 'y', port: 4321 }], revision: 0 })
    assert.equal(staleP.status, 409)
    const resetP = await callRoute(dash, '/dashboards/probe-targets', 'PUT', { targets: [], revision: 1 })
    assert.equal(resetP.status, 200)
    assert.equal(resetP.json.reset, true)

    // ── P0-4 sanity + P0-5 stale 观测面 ──
    const st = await callRoute(dash, '/dashboards/status')
    assert.equal(st.status, 200)
    assert.ok(st.json.sanity && typeof st.json.sanity.historyImplausible === 'number', 'status 应暴露 sanity 计数')
    assert.ok(st.json.egress && typeof st.json.egress.total === 'number')
    const macos = st.json.backends.macos
    assert.equal(typeof macos.stale, 'boolean', '每个后端应暴露 stale')
    assert.ok('attemptedAt' in macos)
    assert.equal(macos.stats.v, 2, 'poller stats 应带形状版本戳')

    // 插件状态约定路由
    const ps = await callRoute(status, '/plugins/dsh-dashboards/status')
    assert.equal(ps.status, 200)
    assert.equal(ps.json.ok, true)
    assert.equal(ps.json.plugin, 'dsh-dashboards')

    // ── P0-1 feed 截断上报（真实读临时目录里的 1 份报告） ──
    const feed = await callRoute(dash, '/dashboards/feed/digests')
    assert.equal(feed.status, 200)
    const fd = feed.json.data
    assert.equal(fd.available, 1)
    assert.equal(fd.truncated, false)
    assert.equal(fd.digests[0].textTruncated, false)
    assert.equal(fd.digests[0].textTotalChars > 0, true)

    // ── P1-2 Packy 出口可达性：端点级判定，403 与 ok 必须分开 ──
    const pk = await callRoute(dash, '/dashboards/surge/packy')
    assert.equal(pk.status, 200)
    const pd = pk.json.data
    // 探针强度必须由 state 自曝：探针报什么就显示什么。硬编码成 unauthenticated
    // 会在探针已经升级为带凭据的业务级探测时，让卡片继续低估（声明与生效不一致）。
    assert.equal(pd.probeKind, 'authenticated')
    assert.equal(pd.keySource, 'keychain:PACKYCODE_API_KEY')
    assert.equal(pd.stale, false)
    assert.deepEqual(pd.standbyCandidates, ['tencent-sin-mesh'])
    assert.equal(pd.probeUrl, 'https://www.packyapi.ai/v1/models')
    const blocked = pd.results.find((r) => r.policy === 'www.packyapi.com')
    assert.equal(blocked.verdict, 'blocked', '403 不得被当成可达（这正是分组健康检查做不到的事）')
    assert.equal(blocked.statuses[0], 403)

    // ── 附带修复：surge 事件的 ISO ts 不再被全量判成不可信 ──
    const sr = await callRoute(dash, '/dashboards/surge/ai-reputation')
    assert.equal(sr.status, 200)
    const sd = sr.json.data
    assert.equal(sd.eventsAvailable, 2, '只统计 source=ai-node-reputation 的事件')
    assert.equal(sd.eventsImplausible, 1, '脏时间仍须被丢弃并计数（不能矫枉过正）')
    assert.equal(sd.recentEvents.length, 1)
    assert.equal(sd.recentEvents[0].type, 'quarantine')
    assert.equal(sd.recentEvents[0].node, 'n1')

    // 未注册路径仍 404（前缀路由不得吞掉一切）
    const nf = await callRoute(dash, '/dashboards/definitely-not-a-route')
    assert.equal(nf.status, 404)
  } finally {
    try { ctx.dispose() } catch { /* ignore */ }
    rmSync(dshHome, { recursive: true, force: true })
  }
})

/**
 * P1-2 补：**新增内置 widget 必须进入既有 store**。
 *
 * 这条门禁存在的理由是一个真实缺口：store 一旦存在就完全取代 DEFAULT_WIDGETS，
 * 于是 `z4pro-health`（更早加）与 `surge-packy`（本次加）在新装的机器上有、在已有
 * 安装上没有——HTTP 200、路由正常、测试全绿，**只有 GUI 里少两张卡**。
 * "新内置项对已有安装可见"此前没有任何断言，所以它静默了很久。
 *
 * 四个方向都要钉住：补齐缺失项 / 不复活用户删过的 / 已最新则零写入 /
 * 反向控制（用户没见过的项不得被误记为"已删除"，否则它永远进不来）。
 */
test('host 冒烟：新增内置 widget 迁移进既有 store + 用户删除不复活', { skip: HOST_ROOT ? false : '未找到宿主 node_modules，跳过而非假装通过' }, async () => {
  const dshHome = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'dsh-dash-migrate-'))
  const storeDir = join(dshHome, 'storages', 'dsh-dashboards')
  mkdirSync(storeDir, { recursive: true })
  const storePath = join(storeDir, 'widgets.json')

  // 夹具 = 本机真实形态：2026-08-22 的 store 快照，无 widgetsVersion，
  // 且缺 z4pro-health 与 surge-packy（这正是 GUI 里少卡的全部原因）。
  const legacy = [
    { id: 'los-usage', type: 'stat', endpoint: '/dashboards/los/usage', title: 'LLM 用量 24h', refreshMs: 60000 },
    { id: 'surge-ai-rep', type: 'surge', endpoint: '/dashboards/surge/ai-reputation', title: 'Surge 节点信誉', refreshMs: 30000 },
  ]
  writeFileSync(storePath, JSON.stringify({ revision: 7, updatedAt: '2026-08-22T15:53:00.000Z', widgets: legacy }, null, 2))

  const packyState = join(dshHome, 'packy-probe-state.json')
  writeFileSync(packyState, JSON.stringify({
    capturedAt: new Date().toISOString(), probeKind: 'authenticated',
    keySource: 'keychain:PACKYCODE_API_KEY', samples: 1, results: [],
  }))

  const ctx = makeCtx()
  try {
    const mod = await loadPlugin(dshHome)
    mod.apply(ctx, { packyProbe: { stateFile: packyState } })
    const dash = findRoute(ctx.routes, '/dashboards')

    const w1 = await callRoute(dash, '/dashboards/widgets')
    assert.equal(w1.status, 200)
    const ids = w1.json.widgets.map((x) => x.id)
    assert.ok(ids.includes('surge-packy'), '新增内置 widget 必须进入既有 store，否则 GUI 永远看不到卡片')
    assert.ok(ids.includes('z4pro-health'), '更早新增的内置项同样必须补齐（同一缺陷的另一半）')
    // 既有顺序与用户内容不得被迁移改动
    assert.equal(ids[0], 'los-usage')
    assert.equal(ids[1], 'surge-ai-rep')
    assert.equal(w1.json.widgets[1].title, 'Surge 节点信誉')

    const disk1 = JSON.parse(readFileSync(storePath, 'utf8'))
    assert.equal(disk1.widgetsVersion, 1, '迁移必须把版本写进信封（否则每次读都重迁）')
    assert.equal(disk1.revision, 8, '迁移应走同一个 revision 守卫写，递增而非重置')

    // 幂等：版本已最新 ⇒ 第二次读不得再写盘
    const w2 = await callRoute(dash, '/dashboards/widgets')
    const disk2 = JSON.parse(readFileSync(storePath, 'utf8'))
    assert.equal(disk2.revision, 8, '已最新的 store 不得被 GET 反复 churn revision')
    assert.deepEqual(w2.json.widgets.map((x) => x.id), ids)

    // 用户显式删掉一个内置项 ⇒ 记进 removedDefaults，且不得被迁移复活
    const keep = w2.json.widgets.filter((x) => x.id !== 'surge-packy')
    const put = await callRoute(dash, '/dashboards/widgets', 'PUT', { widgets: keep, revision: w2.json.revision })
    assert.equal(put.status, 200)
    const disk3 = JSON.parse(readFileSync(storePath, 'utf8'))
    assert.ok(disk3.removedDefaults.includes('surge-packy'), '删除必须被记录')
    assert.ok(!disk3.removedDefaults.includes('z4pro-health'),
      '反向控制：用户没见过的内置项不得被误记为"已删除"，否则它永远进不来')
    const w3 = await callRoute(dash, '/dashboards/widgets')
    assert.ok(!w3.json.widgets.map((x) => x.id).includes('surge-packy'), '用户删过的内置项不得复活')
    assert.ok(w3.json.widgets.map((x) => x.id).includes('z4pro-health'), '未删除的内置项应保持在场')
  } finally {
    try { ctx.dispose() } catch { /* ignore */ }
    rmSync(dshHome, { recursive: true, force: true })
  }
})
