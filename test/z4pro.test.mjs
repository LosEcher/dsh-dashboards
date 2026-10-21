/**
 * dsh-dashboards — 极空间 Z4Pro 巡检载荷 → list widget 映射单测（node:test，零依赖）。
 *
 * 覆盖 z4proToRows 的契约与阈值边界：
 *  - 固定检查清单（6 行）与 `x/y up` 语义
 *  - 内存 10%/5%、负载 1.5×、池 85%/92% 的档位边界
 *  - 坏盘/VM/ VNC/frp 的降级与点名
 *  - findings 补充行的去重（covered key 不重复）与 info 不上行
 *  - 防御：null / 非对象 / 缺字段
 *
 * fixtures 取自 2026-09-16 Z4Pro-S3AS 实测（报告
 * ZSPACE-Z4PRO-SSH-ACCESS-AND-MANAGEMENT-2026-09-16.md）。
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z4proToRows } from '../lib/parsers.mjs'

/** 健康基线 payload（6 盘全 PASSED、池最高 70.3%、VM running+autostart、VNC loopback、无 frp） */
const healthy = () => ({
  verdict: 'ok',
  checkedAt: '2026-09-16T13:49:34.379Z',
  summary: {
    host: 'Z4Pro-S3AS',
    uptimeDays: 89.9,
    cpuN: 4,
    load1: 3.38,
    memTotalMB: 15770,
    memAvailMB: 6513,
    memAvailPct: 41.3,
    swapUsedMB: 1352,
    disks: {
      sda: { health: 'PASSED', realloc: 0, pending: 0, temp: 36 },
      sdb: { health: 'PASSED', realloc: 0, pending: 0, temp: 41 },
      sdc: { health: 'PASSED', realloc: 0, pending: 0, temp: 36 },
      sdd: { health: 'PASSED', realloc: 0, pending: 0, temp: 34 },
      nvme0n1: { health: 'PASSED', realloc: null, pending: null, temp: null },
      nvme1n1: { health: 'PASSED', realloc: null, pending: null, temp: null },
    },
    pools: {
      '/data_s001': { sizeGB: 7428, usedPct: 70.3 },
      '/data_s005': { sizeGB: 14878, usedPct: 57.7 },
    },
    vms: {
      ubuntuVm: { state: 'running', autostart: 'enable', vncListen: '127.0.0.1' },
      zspace_dd3bbnazuexndeaz: { state: 'shutoff', autostart: 'disable', vncListen: '0.0.0.0' },
    },
    frpTunnels: 0,
    // T1 备份基线：相册正在跑、进程存活、队列已知 8 个数据集
    t1Sync: {
      available: true,
      reason: null,
      current: 'album',
      status: 'running',
      via: 'node34',
      attempts: 3,
      updated: '2026-10-21T23:57:08+08:00',
      percent: 11.91,
      filesDone: 897,
      totalFiles: 6005,
      elapsedSec: 2268,
      etaSec: 22585,
      alive: true,
      queueKnown: true,
      doneDatasets: 0,
      totalDatasets: 8,
      pending: ['album', 'wechat', 'photos'],
    },
  },
  findings: [],
})

test('z4proToRows: 健康基线 → 7 行固定清单（含 T1 备份）且 VNC 行失败', () => {
  const r = z4proToRows(healthy())
  assert.equal(r.total, 7)
  assert.equal(r.ok, 6) // VNC 行会因第二台 VM 非 loopback 而失败
  assert.equal(r.verdict, 'ok')
  assert.deepEqual(
    r.results.map((x) => x.name),
    ['主机 / 内存', '磁盘 SMART (6 块)', '存储池 (2 个)', '虚拟机 ubuntuVm', 'T1 备份', 'VNC 暴露面', 'frp 穿透'],
  )
})

test('z4proToRows: 若所有 VM 都是 loopback，则 7/7 全绿', () => {
  const p = healthy()
  p.summary.vms.zspace_dd3bbnazuexndeaz.vncListen = '127.0.0.1'
  const r = z4proToRows(p)
  assert.equal(r.ok, 7)
  assert.equal(r.down, 0)
  assert.equal(r.degraded, 0)
})

test('z4proToRows: 内存 5-10% → degraded（earlyoom 阈值带）', () => {
  const p = healthy()
  p.summary.memAvailPct = 7.2
  const r = z4proToRows(p)
  const row = r.results.find((x) => x.name === '主机 / 内存')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, true)
  assert.equal(r.degraded >= 1, true)
})

test('z4proToRows: 内存 <5% → down（非 degraded）', () => {
  const p = healthy()
  p.summary.memAvailPct = 4.1
  const row = z4proToRows(p).results.find((x) => x.name === '主机 / 内存')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, false)
})

test('z4proToRows: 负载 ≥1.5×核数 → 主机行失败', () => {
  const p = healthy()
  p.summary.load1 = 6.1 // 4 核 => 1.525
  const row = z4proToRows(p).results.find((x) => x.name === '主机 / 内存')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, false) // 负载不产生 degraded 档
})

test('z4proToRows: 坏盘 → SMART 行失败且点名（health/重分配/待映射）', () => {
  const p = healthy()
  p.summary.disks.sdc = { health: 'FAILED!', realloc: 12, pending: 3, temp: 55 }
  const row = z4proToRows(p).results.find((x) => x.name === '磁盘 SMART (6 块)')
  assert.equal(row.ok, false)
  assert.match(row.detail, /sdc/)
  assert.match(row.detail, /FAILED!/)
  assert.match(row.detail, /重分配=12/)
})

test('z4proToRows: 池 85-92% → degraded；≥92% → down（边界）', () => {
  const mk = (pct) => {
    const p = healthy()
    p.summary.pools['/data_s001'] = { sizeGB: 7428, usedPct: pct }
    return z4proToRows(p).results.find((x) => x.name === '存储池 (2 个)')
  }
  assert.equal(mk(84.9).ok, true)
  assert.equal(mk(85).degraded, true)
  assert.equal(mk(91.9).ok, false)
  assert.equal(mk(92).ok, false)
  assert.equal(mk(92).degraded, false)
})

test('z4proToRows: 池行详情取"最高使用率"的池而非第一个', () => {
  const p = healthy()
  p.summary.pools['/data_s001'] = { sizeGB: 7428, usedPct: 99 }
  const row = z4proToRows(p).results.find((x) => x.name === '存储池 (2 个)')
  assert.match(row.detail, /data_s001 99%/)
})

test('z4proToRows: 关键 VM 非 running → 该行失败', () => {
  const p = healthy()
  p.summary.vms.ubuntuVm.state = 'shutoff'
  const row = z4proToRows(p).results.find((x) => x.name === '虚拟机 ubuntuVm')
  assert.equal(row.ok, false)
  assert.match(row.detail, /autostart=enable/)
})

test('z4proToRows: VNC 非 loopback → 失败并点名监听地址', () => {
  const p = healthy()
  p.summary.vms.ubuntuVm.vncListen = '0.0.0.0'
  const row = z4proToRows(p).results.find((x) => x.name === 'VNC 暴露面')
  assert.equal(row.ok, false)
  assert.match(row.detail, /0\.0\.0\.0/)
})

test('z4proToRows: frp 隧道 >0 → degraded（"就绪"态而非故障）', () => {
  const p = healthy()
  p.summary.frpTunnels = 2
  const row = z4proToRows(p).results.find((x) => x.name === 'frp 穿透')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, true)
  assert.match(row.detail, /2 条隧道/)
})

test('z4proToRows: 未覆盖的 crit/warn finding 追加为补充行（不被静默吞掉）', () => {
  const p = healthy()
  p.findings = [
    { level: 'crit', key: 'earlyoom', msg: 'earlyoom 未运行' },
    { level: 'warn', key: 'temp-extra', msg: '温度偏高' },
  ]
  const r = z4proToRows(p)
  assert.equal(r.total, 9) // 7 行固定清单（含 T1 备份）+ 2 条未覆盖 finding
  const eo = r.results.find((x) => x.name === 'earlyoom')
  assert.equal(eo.ok, false)
  assert.equal(eo.degraded, false) // crit => down
  const te = r.results.find((x) => x.name === 'temp-extra')
  assert.equal(te.degraded, true) // warn => degraded
})

test('z4proToRows: covered key 与 info 级 finding 不产生重复行', () => {
  const p = healthy()
  p.summary.vms.zspace_dd3bbnazuexndeaz.vncListen = '127.0.0.1'
  p.findings = [
    { level: 'crit', key: 'mem', msg: '重复：清单已覆盖' },
    { level: 'warn', key: 'pool', msg: '重复：清单已覆盖' },
    { level: 'info', key: 'vm', msg: '非关键 VM 关机（按设计）' },
  ]
  const r = z4proToRows(p)
  assert.equal(r.total, 7)
  assert.equal(r.ok, 7)
})

test('z4proToRows: 防御——null / 非对象 / 空对象 → 空结果而非抛错', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    const r = z4proToRows(bad)
    assert.equal(r.total, 0)
    assert.deepEqual(r.results, [])
    assert.equal(r.verdict, 'unknown')
  }
  // 空对象：summary 缺失 → 清单退化为 0 盘/0 池，但仍返回结构完整的对象
  const r = z4proToRows({})
  assert.equal(typeof r.total, 'number')
  assert.equal(r.checkedAt, null)
})

test('z4proToRows: summary 缺字段时不抛错（脚本降级路径）', () => {
  const r = z4proToRows({ verdict: 'warning', summary: { host: 'X' } })
  assert.equal(typeof r.total, 'number')
  assert.equal(r.results[0].name, '主机 / 内存')
  assert.match(r.results[0].detail, /X/)
})

// ── T1 备份行（summary.t1Sync）────────────────────────────────────────────
// 这一组钉住的是"诚实性"：读不到 ≠ 完成 0 个；state 说 running 但没进程 ≠ 健康。

test('z4proToRows: 老载荷无 t1Sync → 不凭空造行（6 行）', () => {
  const p = healthy()
  delete p.summary.t1Sync
  const r = z4proToRows(p)
  assert.equal(r.total, 6)
  assert.equal(
    r.results.some((x) => x.name === 'T1 备份'),
    false,
  )
})

test('z4proToRows: t1Sync.available=false → 该行 degraded 且写明原因（不是 0 个完成）', () => {
  const p = healthy()
  p.summary.t1Sync = { available: false, reason: '未读到 syno-sync-state（keeper 未安装或从未运行）' }
  const row = z4proToRows(p).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, true)
  assert.match(row.detail, /状态未知/)
  assert.match(row.detail, /syno-sync-state/)
  assert.doesNotMatch(row.detail, /已完成 0\//)
})

test('z4proToRows: running + alive → ok，detail 含百分比/ETA/via', () => {
  const row = z4proToRows(healthy()).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, true)
  assert.equal(row.degraded, false)
  assert.match(row.detail, /album 11\.91%/)
  assert.match(row.detail, /文件 897\/6005/)
  assert.match(row.detail, /ETA 6\.3h/)
  assert.match(row.detail, /via node34/)
  assert.match(row.detail, /进程存活/)
})

test('z4proToRows: state=running 但没有 restic 进程 → degraded（keeper 未拉起/冷却中）', () => {
  const p = healthy()
  p.summary.t1Sync.alive = false
  const row = z4proToRows(p).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, true)
  assert.match(row.detail, /无 restic 进程/)
})

test('z4proToRows: blocked → degraded 且给出尝试次数与自愈预期', () => {
  const p = healthy()
  Object.assign(p.summary.t1Sync, { status: 'blocked', attempts: 8, alive: false })
  const row = z4proToRows(p).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, false)
  assert.equal(row.degraded, true)
  assert.match(row.detail, /blocked/)
  assert.match(row.detail, /第 8 次/)
  assert.match(row.detail, /冷却 6h/)
})

test('z4proToRows: 全部数据集完成 → ok 且写"全部 N 个已完成"', () => {
  const p = healthy()
  Object.assign(p.summary.t1Sync, { status: null, current: null, alive: false, doneDatasets: 8, pending: [] })
  const row = z4proToRows(p).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, true)
  assert.equal(row.degraded, false)
  assert.match(row.detail, /全部 8 个数据集已完成/)
})

test('z4proToRows: percent 为 null → 渲染 ? 而不是 null%（缺值不伪装成 0）', () => {
  const p = healthy()
  p.summary.t1Sync.percent = null
  const row = z4proToRows(p).results.find((x) => x.name === 'T1 备份')
  assert.equal(row.ok, true)
  assert.match(row.detail, /album \?/)
  assert.doesNotMatch(row.detail, /null/)
})
