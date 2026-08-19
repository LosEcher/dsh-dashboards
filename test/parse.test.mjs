/**
 * dsh-dashboards — 指标解析函数单元测试（node:test，零依赖）。
 * 覆盖 2026-08-19 指标准确性审查修复：CPU 列错位、网络接口过滤，
 * 以及 los/kuma 文本解析。fixtures 取自本机实测输出。
 *
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseIostatCpu, parseNetstatIb, parseLoadavg, parseVmStat, parseDf,
  parsePrometheus, parseKumaMetrics, fillGapPoints,
} from '../lib/parsers.mjs'

// ── parseIostatCpu ──────────────────────────────────────────────────────
// 新版 macOS：两拍都带 load average 列（2026-08-19 本机实测）
const NEW_MACOS = `              disk0       cpu    load average
    KB/t  tps  MB/s  us sy id   1m   5m   15m
   16.91  445  7.34  15  8 77  13.00 11.56 10.67
    7.76 2288 17.34  25 13 62  13.00 11.56 10.67`

test('parseIostatCpu: 新版 macOS 两拍都含 load → 取 us/sy/id 列（非 load）', () => {
  const r = parseIostatCpu(NEW_MACOS)
  assert.deepEqual(r, { us: 25, sy: 13, id: 62, usedPct: 38 })
})

// 旧版 macOS：双 disk 列，第二拍无 load（列更多且 load 只在首拍）
const OLD_MACOS = `          disk0       disk1       cpu     load average
    KB/t tps MB/s KB/t tps MB/s  us sy id   1m   5m   15m
   19.40 123 1.23 1.23 2 0.01  5  3 92  1.52 1.42 1.38
   19.20 100 1.10 1.00 2 0.01 12  8 80`

test('parseIostatCpu: 旧版 macOS 双 disk、第二拍无 load → 仍取 us/sy/id', () => {
  const r = parseIostatCpu(OLD_MACOS)
  assert.deepEqual(r, { us: 12, sy: 8, id: 80, usedPct: 20 })
})

test('parseIostatCpu: 缺列名行 → null', () => {
  assert.equal(parseIostatCpu('no data'), null)
  assert.equal(parseIostatCpu(''), null)
})

// ── parseNetstatIb ──────────────────────────────────────────────────────
// 本机实测：lo0（回环 317GB）+ utun（隧道）+ en0 并存，应只保留 en*
const NETSTAT = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                      530762979     0 317711690962 530762979     0 317711690962     0
utun3      1380  <Link#15>                           123     0      45678       456     0      90123     0
en0        1500  <Link#4>                           999     0     1000000      888     0      2000000     0
en7        1500  <Link#6>                             1     0           2        2     0           3     0`

test('parseNetstatIb: 只保留物理 en* 接口，过滤 lo0/utun*', () => {
  const r = parseNetstatIb(NETSTAT)
  assert.deepEqual(Object.keys(r).sort(), ['en0', 'en7'])
  assert.deepEqual(r.en0, { ibytes: 1000000, obytes: 2000000 })
})

test('parseNetstatIb: Link 行无 Address 列（10 token）也不列错位', () => {
  // 真实 netstat -ib 的 <Link#> 行常无 Address 列（比有地址行少一列）
  const r = parseNetstatIb('en0        1500  <Link#4>  999     0     1000000      888     0      2000000     0\n')
  assert.deepEqual(r.en0, { ibytes: 1000000, obytes: 2000000 })
})

// ── parseLoadavg / parseVmStat / parseDf ───────────────────────────────
test('parseLoadavg: macOS 花括号格式', () => {
  assert.deepEqual(parseLoadavg('{ 13.00 11.56 10.67 }'), { load1: 13, load5: 11.56, load15: 10.67 })
})

const VMSTAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    10163.
Pages active:                                 667380.
Pages inactive:                               664119.
Pages speculative:                              2735.
Pages wired down:                             214588.
Pages purgeable:                               36860.`

test('parseVmStat: 页计数解析（wired down 不误吞）', () => {
  const r = parseVmStat(VMSTAT)
  assert.equal(r.free, 10163)
  assert.equal(r.inactive, 664119)
  assert.equal(r.speculative, 2735)
  assert.equal(r.purgeable, 36860)
  assert.equal(r.wired, undefined)
})

const DF = `Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk3s1s1   460Gi    12Gi    78Gi    14%    459k  815M    0%   /
/dev/disk3s5     460Gi   354Gi    78Gi    82%    5.2M  815M    1%   /System/Volumes/Data`

test('parseDf: 挂载点含空格也能完整解析', () => {
  const r = parseDf(DF)
  assert.equal(r.length, 2)
  assert.equal(r[1].mount, '/System/Volumes/Data')
  assert.equal(r[1].capacity, '82%')
})

// ── parsePrometheus（los /metrics） ────────────────────────────────────
const PROM = `# HELP los_task_runs_total Task runs by status.
los_task_runs_total{status="succeeded"} 42
los_task_runs_total{status="failed"} 3
los_tool_errors_total 7
los_model_cost_total 1.2345
los_provider_calls_total{provider="deepseek"} 100
los_provider_errors_total{provider="deepseek"} 1
los_provider_duration_milliseconds{provider="deepseek"} 2500
los_cache_hit_tokens_total 900
los_cache_miss_tokens_total 100`

test('parsePrometheus: los /metrics 分组统计', () => {
  const r = parsePrometheus(PROM)
  assert.deepEqual(r.taskRuns, { succeeded: 42, failed: 3 })
  assert.equal(r.toolErrors, 7)
  assert.equal(r.modelCost, 1.2345)
  assert.deepEqual(r.providerCalls, { deepseek: 100 })
  assert.deepEqual(r.providerErrors, { deepseek: 1 })
  assert.deepEqual(r.providerDurationMs, { deepseek: 2500 })
  assert.equal(r.cacheHit, 900)
  assert.equal(r.cacheMiss, 100)
})

// ── parseKumaMetrics（Kuma 2.x /metrics 实测片段） ─────────────────────
const KUMA = `# HELP monitor_uptime_ratio Uptime ratio calculated over sliding window specified by the 'window' label. (0.0 - 1.0)
monitor_status{monitor_id="2",monitor_name="1panelh",monitor_type="http"} 1
monitor_response_time{monitor_id="2",monitor_name="1panelh",monitor_type="http"} 1872
monitor_uptime_ratio{monitor_id="2",monitor_name="1panelh",monitor_type="http",window="30d"} 0.9901960784313726
monitor_uptime_ratio{monitor_id="2",monitor_name="1panelh",monitor_type="http",window="365d"} 0.9263254532935506
monitor_cert_days_remaining{monitor_id="2",monitor_name="1panelh",monitor_type="http"} 85
monitor_status{monitor_id="22",monitor_name="surge-auto-update",monitor_type="push"} 0`

test('parseKumaMetrics: 状态/延迟/uptime 单位（response_time 为 ms、uptime 0-1×100）', () => {
  const r = parseKumaMetrics(KUMA)
  const m = r.find((x) => x.id === '2')
  assert.equal(m.status, 'up')
  assert.equal(m.latency, 1872) // ms，不匹配 _seconds 变体
  assert.equal(m.uptime, 99.01960784313726) // 0.9902×100
  assert.equal(m.certDays, 85)
  const push = r.find((x) => x.id === '22')
  assert.equal(push.status, 'down')
})

test('parseKumaMetrics: monitor_response_time_seconds 变体不误匹配（名字精确）', () => {
  const r = parseKumaMetrics('monitor_response_time_seconds{monitor_id="2",monitor_name="x",monitor_type="http",window="30d"} 1.85\n')
  // _seconds 行不匹配，latency 保持 null
  assert.equal(r.length, 1)
  assert.equal(r[0].latency, null)
})

// ── fillGapPoints（macos history 断档标注） ───────────────────────────
const P = (ts, load1) => ({ ts, load1 })

test('fillGapPoints: 正常连续点不插入', () => {
  const pts = [P('2026-08-19T10:00:00', 1), P('2026-08-19T10:00:30', 2), P('2026-08-19T10:01:00', 3)]
  const out = fillGapPoints(pts, 30000)
  assert.equal(out.length, 3)
  assert.deepEqual(out, pts)
})

test('fillGapPoints: >2×sampleMs 间隔插入 null 断档占位（受默认 maxNulls=90 封顶）', () => {
  // idle 1h 后恢复：10:00 与 11:00 之间应插入 min(119, 90)=90 个 null（30s 采样）
  const pts = [P('2026-08-19T10:00:00', 1), P('2026-08-19T11:00:00', 2)]
  const out = fillGapPoints(pts, 30000)
  assert.equal(out.length, 2 + 90)
  assert.equal(out[1], null)
  assert.equal(out[out.length - 2], null)
  assert.equal(out[out.length - 1].load1, 2)
})

test('fillGapPoints: maxNulls 上限防超长 idle 撑爆', () => {
  const pts = [P('2026-08-19T10:00:00', 1), P('2026-08-19T20:00:00', 2)]
  const out = fillGapPoints(pts, 30000, 10)
  assert.equal(out.length, 2 + 10)
})

test('fillGapPoints: 参数异常返回原数组副本', () => {
  assert.deepEqual(fillGapPoints(null, 30000), [])
  assert.deepEqual(fillGapPoints([], 30000), [])
  assert.deepEqual(fillGapPoints([P('2026-08-19T10:00:00', 1)], 30000), [P('2026-08-19T10:00:00', 1)])
  assert.equal(fillGapPoints([P('2026-08-19T10:00:00', 1), P('2026-08-19T10:01:00', 2)], 0).length, 2)
})
