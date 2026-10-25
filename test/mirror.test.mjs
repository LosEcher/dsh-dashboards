/**
 * dsh-dashboards — mirror 角色 + store 破坏性重置的回归门禁（2026-10-12）。
 *
 * 锁住两件当天用血换来的事：
 *   1. `role: mirror` 必须**零采集、零落盘、零告警**，只把 /dashboards/* 反代给上游。
 *      判据不是"看代码感觉对"，而是：apply 期间 **setInterval 调用数 = 0**、DSH_HOME 下
 *      **不产生 storages/**、注册路由恰好 2 条。对照组跑 primary，setInterval 必须 > 0。
 *   2. `PUT /dashboards/probe-targets {targets:[]}` 是**破坏性**语义（删 store）。删除前
 *      必须落 `probe-targets.json.bak-<stamp>`；2026-10-12 该端点被当成"探鉴权面"的空
 *      请求打过一次，整张探针表当场消失且无副本可恢复。
 *
 * 运行：node --test test/mirror.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 宿主库探测链：沿用 host-smoke.test.mjs（显式 env → profiles → web profile）。 */
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
const SKIP = HOST_ROOT ? false : '未找到宿主 node_modules（@deepseek-ai/schemastery），跳过而非假装通过'

/** 桩 webServer：重复 (kind,path) 抛错（与真实实现同语义）。 */
function makeWebServer() {
  const tables = { exact: new Map(), prefix: new Map() }
  const routes = []
  return {
    routes,
    register: (r) => {
      const table = r.kind === 'exact' ? tables.exact : tables.prefix
      if (table.has(r.path)) throw new Error(`webserver: duplicate ${r.kind} route "${r.path}"`)
      table.set(r.path, r)
      routes.push(r)
      return () => { table.delete(r.path) }
    },
  }
}

function makeCtx() {
  const logs = []
  const disposers = []
  return {
    webServer: makeWebServer(),
    logs,
    logger: { info: (m) => logs.push(String(m)), warn: (m) => logs.push(String(m)) },
    on: () => {},
    effect: (fn) => { const d = fn?.(); if (typeof d === 'function') disposers.push(d); return d },
    dispose: () => { for (const d of disposers.splice(0).reverse()) { try { d() } catch { /* ignore */ } } },
  }
}

function fakeRes() {
  return {
    statusCode: 0, headers: null, body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers ?? null },
    end(chunk) { this.body = chunk ?? '' },
  }
}
function fakeReq(url, method = 'GET', body) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = { host: '127.0.0.1:19387', cookie: 'dsh-auth-xxx=secret', accept: 'application/json' }
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

async function loadPlugin(dshHome) {
  process.env.DSH_HOME = dshHome
  process.env.DSH_HOST_MODULES = HOST_ROOT
  register(new URL('./fixtures/resolve-host.mjs', import.meta.url).href)
  return import(`../index.mjs?probe=${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

const newHome = () => mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'dsh-dash-mirror-'))
const callRoute = async (route, url, method = 'GET', body) => {
  const res = fakeRes()
  await route.handler(fakeReq(url, method, body), res)
  return res
}
const findRoute = (routes, path) => routes.find((r) => r.path === path)

/** 把 setInterval 换成计数器桩：既让"不采集"可直接判定，也不在测试进程里泄漏真定时器。 */
function withIntervalStub(fn) {
  const real = globalThis.setInterval
  const calls = []
  globalThis.setInterval = (cb, ms) => { calls.push(ms); return { unref() {} } }
  try { return fn(calls) } finally { globalThis.setInterval = real }
}

// ─────────────────────────────────────────────────────────── mirror 角色

test('mirror：零采集（setInterval=0）、零落盘、恰好 2 条路由', { skip: SKIP }, async () => {
  const home = newHome()
  const mod = await loadPlugin(home)
  const ctx = makeCtx()
  await withIntervalStub(async (calls) => {
    mod.apply(ctx, { role: 'mirror', upstreamUrl: 'http://127.0.0.1:3080' })
    assert.equal(calls.length, 0, `mirror 不得创建任何采集定时器，实测 ${calls.length} 个：${calls}`)
  })
  assert.deepEqual(
    ctx.webServer.routes.map((r) => `${r.kind} ${r.path}`).sort(),
    ['exact /plugins/dsh-dashboards/status', 'prefix /dashboards'],
  )
  assert.equal(existsSync(join(home, 'storages')), false, 'mirror 不得在 DSH_HOME 下落任何盘')
  assert.match(ctx.logs.join('\n'), /mirror/, '应声明自己处于 mirror 模式')
})

test('mirror：/dashboards/* 透明反代到上游，且不透传本宿主 cookie/host', { skip: SKIP }, async () => {
  const home = newHome()
  const mod = await loadPlugin(home)
  const ctx = makeCtx()
  mod.apply(ctx, { role: 'mirror', upstreamUrl: 'http://127.0.0.1:9999' })
  const proxy = findRoute(ctx.webServer.routes, '/dashboards')

  const realFetch = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return new Response(JSON.stringify({ ok: true, from: 'primary' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    })
  }
  try {
    const res = await callRoute(proxy, '/dashboards/widgets?window=1h', 'GET')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'http://127.0.0.1:9999/dashboards/widgets?window=1h')
    assert.equal(seen[0].init.method, 'GET')
    assert.equal(seen[0].init.headers.cookie, undefined, 'cookie 不得转发给上游')
    assert.equal(seen[0].init.headers.host, undefined, 'host 不得转发给上游')
    assert.equal(seen[0].init.headers.accept, 'application/json', '其余头应透传')
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { ok: true, from: 'primary' })
    // fetch 已解压正文：编码类头必须丢弃，否则下游二次解压失败
    assert.equal(res.headers['content-encoding'], undefined)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('mirror：上游不可达回 502 且状态端点可见失败计数', { skip: SKIP }, async () => {
  const home = newHome()
  const mod = await loadPlugin(home)
  const ctx = makeCtx()
  mod.apply(ctx, { role: 'mirror', upstreamUrl: 'http://127.0.0.1:9999' })
  const proxy = findRoute(ctx.webServer.routes, '/dashboards')
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
  try {
    const res = await callRoute(proxy, '/dashboards/snapshot', 'GET')
    assert.equal(res.statusCode, 502)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, false)
    assert.equal(body.upstream, 'http://127.0.0.1:9999')
  } finally {
    globalThis.fetch = realFetch
  }
  const status = await callRoute(findRoute(ctx.webServer.routes, '/plugins/dsh-dashboards/status'), '/plugins/dsh-dashboards/status')
  const payload = JSON.parse(status.body)
  assert.equal(payload.mode, 'mirror')
  assert.equal(payload.counts.failed, 1)
  assert.match(String(payload.lastError), /ECONNREFUSED/)
})

// ────────────────────────────────── primary 的破坏性重置必须留副本

test('primary：PUT probe-targets 空数组 = 重置，但删前必须落 .bak', { skip: SKIP }, async () => {
  const home = newHome()
  const storeDir = join(home, 'storages', 'dsh-dashboards')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(storeDir, { recursive: true })
  const seeded = {
    revision: 7,
    updatedAt: '2026-10-11T00:00:00.000Z',
    targets: [{ name: 'kimi-bridge', host: '127.0.0.1', port: 10086 }],
  }
  const storeFile = join(storeDir, 'probe-targets.json')
  writeFileSync(storeFile, JSON.stringify(seeded, null, 2))

  const mod = await loadPlugin(home)
  const ctx = makeCtx()
  await withIntervalStub(async (calls) => {
    mod.apply(ctx, { role: 'primary' })
    assert.ok(calls.length > 0, 'primary 必须建立采集定时器（与 mirror 的 0 形成对照）')
  })
  const proxy = findRoute(ctx.webServer.routes, '/dashboards')
  const res = await callRoute(proxy, '/dashboards/probe-targets', 'PUT', { targets: [] })
  const body = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.equal(body.reset, true)
  assert.equal(existsSync(storeFile), false, '空数组语义就是删 store')

  const baks = readdirSync(storeDir).filter((f) => f.startsWith('probe-targets.json.bak-'))
  assert.equal(baks.length, 1, `删除前必须留一份 .bak，实测 ${JSON.stringify(readdirSync(storeDir))}`)
  const kept = JSON.parse(readFileSync(join(storeDir, baks[0]), 'utf8'))
  assert.deepEqual(kept, seeded, '.bak 必须是被删掉的那份原文')
})

test('role 拼错一律回落 primary（不因配置笔误静默不采集）', { skip: SKIP }, async () => {
  const home = newHome()
  const mod = await loadPlugin(home)
  const ctx = makeCtx()
  await withIntervalStub(async (calls) => {
    mod.apply(ctx, { role: 'MIRROR' })
    assert.ok(calls.length > 0, '大小写不符不算 mirror')
  })
})
