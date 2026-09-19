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
  },
  findings: [],
})

test('z4proToRows: 健康基线 → 6 行固定清单且全 ok', () => {
  const r = z4proToRows(healthy())
  assert.equal(r.total, 6)
  assert.equal(r.ok, 5) // VNC 行会因第二台 VM 非 loopback 而失败
  assert.equal(r.verdict, 'ok')
  assert.deepEqual(
    r.results.map((x) => x.name),
    ['主机 / 内存', '磁盘 SMART (6 块)', '存储池 (2 个)', '虚拟机 ubuntuVm', 'VNC 暴露面', 'frp 穿透'],
  )
})

test('z4proToRows: 若所有 VM 都是 loopback，则 6/6 全绿', () => {
  const p = healthy()
  p.summary.vms.zspace_dd3bbnazuexndeaz.vncListen = '127.0.0.1'
  const r = z4proToRows(p)
  assert.equal(r.ok, 6)
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
  assert.equal(r.total, 8)
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
  assert.equal(r.total, 6)
  assert.equal(r.ok, 6)
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
