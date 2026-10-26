# dsh-dashboards

DSH 看板插件：在会话区注册「看板」tab（`conversation.view`），widget 网格展示：

- **los 第一方**：LLM 用量/成本（`/usage/summary`）、provider 延迟趋势（`/metrics/trends`）、任务统计（`/metrics` Prometheus）、**执行节点矩阵**（`/nodes`，含 load/mem 快照与心跳）
- **macOS 原生探针**（零安装）：loadavg / 内存（vm_stat，含可回收缓存口径）/ CPU（iostat）/ 磁盘（df）/ 网络速率（netstat 差分）/ 进程数，内存滚动 120 点短趋势
- **服务探活**：本机关键服务 HTTP/TCP（目标列表可经 `/dashboards/probe-targets` 编辑）
- **Uptime Kuma**（可选，默认关）：配置 `kuma.url` + `kuma.token` 即启用（REST v1 `/api/v1/monitors`）
- **Glances**（可选，默认关）：`brew install glances && glances -w` 后配置 `glances.url`
- **feed 采集摘要**：读 `~/.dsh/scheduler-reports/feed-digest-*.md`（scheduler job「多平台 feed 采集摘要」落盘）最新 5 份，卡片内点击展开正文

## 架构

- **host 半包**（`index.mjs`）：`ctx.webServer` 挂 `/dashboards/*` 同源聚合 API；每后端独立轮询缓存（single-flight）；los 双 token 解析链（Bearer 用量 + `x-los-operator-token` 节点，均不写明文，从环境/credentials/losEnvFile 读取）；widget 配置存 `~/.dsh/storages/dsh-dashboards/widgets.json`（PUT 校验 endpoint 白名单防注入）。
- **client 半包**（`src/client/`）：注册 `conversation.view` tab（id=`dashboard`，order=90，locale NS `dashboard` zh/en），按 widget 配置渲染 stat/matrix/chart/list 卡片；样式只用 `--dsw-alias-*` 白名单令牌。

## API

```
GET /dashboards/status        后端健康 + widget 数（含 sanity 丢弃计数 / egress 关停项 / 各后端 stale）
GET /dashboards/los/usage      GET /dashboards/los/trends   GET /dashboards/los/metrics
GET /dashboards/los/nodes      GET /dashboards/macos        GET /dashboards/macos/history
GET /dashboards/probe          GET /dashboards/glances      GET /dashboards/kuma
GET /dashboards/feed/digests  feed 采集摘要报告（scheduler-reports/feed-digest-*.md）
GET /dashboards/egress        出网清单（每项外呼的目标/用途/凭据 + 当前开关）
GET/PUT /dashboards/widgets   widget 配置（PUT 带 {widgets:[…], revision?}；revision 不匹配回 409）
GET/PUT /dashboards/probe-targets  服务探活目标（PUT 带 {targets:[…], revision?}；空数组=重置回默认；revision 不匹配回 409）
```

> ⚠️ `PUT /dashboards/probe-targets {targets:[]}` 是**破坏性**语义（删 store）。2026-10-12
> 该端点被当成"探鉴权面"的空请求打过一次，整张探针表当场消失且无副本可恢复。现在删除前
> 会先落 `probe-targets.json.bak-<yyyymmdd-HHMMSS>`（与 `widgets.json.bak-*` 同惯例）。
> 判"某个插件路由是否免鉴权"请用 GET/OPTIONS，**不要**用有副作用的 PUT。

### 角色：`primary`（默认）与 `mirror`（2026-10-12）

第二个 DSH 宿主（例如 Electron 桌面档）想显示同一块看板时，把这一行配成 `mirror`：

```yaml
- id: dashboards
  config:
    role: mirror
    upstreamUrl: http://127.0.0.1:3080   # 常驻的 primary 宿主
```

mirror 实例**不建任何 poller/timer、不写任何文件、不发出任何外呼**，只把 `/dashboards/*`
（含 PUT 编辑）透明反代给 `upstreamUrl`，并额外提供
`GET /plugins/dsh-dashboards/status` 报告 `mode/upstream/counts.proxied/counts.failed`。

为什么需要这个开关：两个宿主共用同一个 `~/.dsh`，各自采集会

| 面 | 双 primary 的后果 |
|---|---|
| 13 路 poller | 重复外呼（idle 门控只挡"没开看板"的情形，两个 tab 同时开就双份） |
| `diskAlertTimer` | **不受 idle 门控** ⇒ 重复飞书告警（各自 6h 冷却，不共享） |
| `storages/dsh-dashboards/*` | `history*.jsonl` / `probe-targets.json` / `widgets.json` 是同一批文件且无跨进程锁 ⇒ 重复点 + "读全量→截断→原子重写"丢更新 |

判据（`test/mirror.test.mjs` 机械咬住）：mirror 期间 `setInterval` 调用数 **= 0**、
`DSH_HOME` 下**不产生 `storages/`**、注册路由恰好 2 条。

### 诚实性契约（2026-09-19，借鉴 Infomarchy 第一批加固）

报告：`dsfolder/INFOMARCHY-ANALYSIS-2026-09-19.md`。六项约定，改动此处代码时必须保持：

1. **截断必须显式上报**：列表/文本被 cap 时随响应给出 `available`/`totalChars` 与 `truncated`
   （feed 摘要、surge 事件、history 点数都遵守）；不允许静默 slice 后把截断值当总数。
2. **差分基线的样本时刻必须与字节数对应**（`lib/safety.mjs:publishNetSample`）：不允许把
   `Date.now()` 当采样时刻写进基线；dt 过小不出速率，过期发布直接拒绝。
3. **store 写入一律原子 + revision 守卫**（`writeJsonAtomic` / `saveEnvelopeReplace`）：
   tmp→rename（0600），PUT 带 `revision` 时做乐观并发（不匹配 409 + 回当前值）；
   新增任何"读-改-整表写"的 store 都必须走这两个原语。
4. **时间戳过合理性边界**（`plausibleTimestamp`：≥2000-01-01 且 ≤now+60s）：脏时间不得进入
   窗口切片、聚合桶或排序；丢弃计数走 `/dashboards/status` 的 `sanity`。
5. **失败不得伪装新鲜**：poller 快照 `ts`/`dataTs` 只在成功时推进，失败只推进 `attemptedAt`
   并置 `stale=true`；形状变更时递增 `SNAPSHOT_VERSION` 使旧缓存失效。
6. **出网清单化 + 逐项开关**：每一项外呼在 `lib/safety.mjs:EGRESS_FEATURES` 登记，并由
   `Config.egress.<id>=false` 单独关闭；拦断面放在最靠近 socket 的函数里（调用点判断只是省事）。

```yaml
# 逐项关闭外呼（缺省全开；关闭只停外呼，不影响读本机文件的采集）
- id: dashboards
  config:
    egress:
      quotaApis: false   # zenmux/packy/deepseek/openrouter 余额 API
      diskAlert: false   # 飞书 webhook 推送
```

### 磁盘口径（2026-10-22，方案 A：一源 / 一模型 / 一消费者）

macOS 上「可用空间」有三个都真、含义不同的数（本机实测：硬可用 34.1 GiB、可清除 51.6 GiB、
有效可用 85.7 GiB）。三者相差 50 GiB，于是同一台机器上「iStat 说还有 91 GB」与「看板说 93% 已满」
长期并存，85% 水位阈值在含可清除口径下 10 天误报 54 次。现在的约定：

1. **一个量只有一个用途**：`availableBytes`（硬可用）只判「余量是否见底」；`purgeableBytes`
   只判「系统还有没有东西可回收」；`effectiveBytes`（= available + purgeable = NSURL important）
   只用于展示「已用 %」。**不并列展示三个「可用空间」数字**——并列会逼人做减法，等于再造
   一个第四种口径。卡片给的是**一条容量条的三段分解**（已用 / 可清除 / 空闲，和为总容量），
   再加**一个**可写数字，不是三个互相竞争的「剩余」。
2. **唯一读盘入口 `readDiskSnapshot()`**（`index.mjs`，30s 内复用同一份）：`collectMacos` 与
   `checkDiskAlert` 都读它，两者不可能给出不同的事实（此前它们各自跑一次 `df`）。
3. **数据源是 `tools/diskprobe.swift`**（NSURL 的 `volumeAvailableCapacityForImportantUsage`
   一对值，与 Finder / iStat 同源），首次运行编译到 `~/.dsh/storages/dsh-dashboards/bin/`
   （sha256 为缓存键，改源码自动重编）。**不用 `df` 当主源**（它没有 purgeable）；也**不用
   osascript**（JXA 的 `resourceValuesForKeys` 实测返回空字典）。
4. **降级只降不编**：拿不到 probe 时用 `df` 的硬可用，`purgeable`/`effective` 记 `null` 并渲染
   `—`，**绝不填 0**（0 会被读成"没有可清除空间"，把一个测量缺口伪装成坏消息）；
   probe 与 df 的硬可用相差超过 `max(3%, 1 GiB)` 时记 `degraded: ['df-mismatch']`。
5. **告警按「两个缓冲」判，不按百分比**：`diskAlertHardFreeGb`（缺省 15 GiB，低于即 critical）/
   `diskAlertPurgeableFloorGb`（2 GiB）配 `diskAlertHardFreeGuardGb`（30 GiB），外加 24h 趋势外推
   `daysToFloor ≤ 3`。`diskAlertPct` 保留但**默认 0=关闭**，显式配置时也只按 `hardUsedPct` 判。
6. 口径计算全在 `lib/disk.mjs`（纯函数、零依赖），单测 `test/disk.test.mjs` 锁住上述六条。
7. **看板卡片 `mbp-disk`（type=`disk`，2026-10-22 第二步）**：一条三段容量条 = 真正已用 /
   可清除 / 空闲（三段之和 == 总容量），左上角是「已用 %（含可清除）」，下面只给
   **一个**可写数字（不回收任何东西时能写多少），外加「可清除 N GiB · M 个本机 TM 快照
   （最近 HH:MM）」的来源归因。**刻意不把 `effectiveBytes` 也显示成一个"可用"值** ——
   卡片上出现两个「可用」正是这次要消掉的困惑源（读者会开始做减法）。
   状态点由 host 用**与告警同一个** `judgeDiskAlert` 算出（`disk.level`），客户端不另写阈值；
   所以「卡片绿灯、告警却发出去」这种自我矛盾在结构上不可能发生。
   快照计数来自 `tmutil listlocalsnapshots /`（用户态可读、300s 缓存、解析在
   `lib/disk.mjs::parseLocalSnapshots`），**只做归因、不参与判据**；取不到就渲染
   「快照来源未知」，不编数字。
   ⚠️ 新增内置卡片的完整契约 = `ALLOWED_ENDPOINTS` + `DEFAULT_WIDGETS` + `pollerByEndpoint`
   + 客户端 `type` 分派 + **`DEFAULT_WIDGETS_VERSION` 必须 +1**（store 一旦存在就完全取代
   内置列表，不 bump ⇒ 对已有安装静默不可见）。

8. **看板卡片 `host-restart`（type=`host`，2026-10-26，v5→v6）**：宿主自己的状态 + 一个
   「重启宿主」按钮（卡内两步确认）。三个事实——`turns` / `pending` / `daemon`——**只有一份
   实现**：`dsh-web-host-restart` 的 `/host-restart/status`，本卡的 host 采集器只是**同源回环
   读取**（15s）。在这里重算会让卡片的「在跑 1 个」与按钮真正的判断依据分叉，而这正是最
   不该不一致的地方。那个插件没装/被禁用 ⇒ 端点 404 ⇒ 卡片明确说「能力不可用 + 原因」，
   不用空数据伪装"一切正常"。拒绝理由按服务端 code 翻成本地文案并把原句放 `title`
   （`t()` 在本视图**不做变量插值**，占位符替换在 `translateCode` 里做）。

   ⚠️ **合并语义在本版改了（v6）**：新内置项不再一律**追加**到末尾，而是插在**声明位置**
   （锚点 = 它前面最近一个"已存在"的内置项；否则插到下一个已存在内置项之前）。理由：用户
   装完找不到按钮，正是因为"声明在 0"的卡被追加到 21 张卡的末尾。用户自己摆在前面的自定义卡
   **不会被顶下去**（锚点规则保证），`removedDefaults` 仍然不复活。

```yaml
- id: dashboards
  config:
    macos:
      diskAlertHardFreeGb: 15      # 硬可用地板
      diskAlertPurgeableFloorGb: 2 # 可清除地板
      diskAlertHardFreeGuardGb: 30 # 可清除见底时的硬可用 guard
```



### AI 额度渠道（`/dashboards/ai-quota`，widget type=quota）

统一输出 `channels[]`（保留 legacy `zenmux`/`packy` 字段供对账卡消费）。数据源分三类：

1. **余额 API（官方直连，需 `~/.dsh/.credentials.yaml` 对应 key）**
   - ZenMux（`ZENMUX_MANAGEMENT_API_KEY`）：PAYG 余额 + 订阅 5h/7d/月 窗口
   - Packy（`PACKY_SYSTEM_TOKEN` + `PACKY_USER_ID`）：`quota÷500000=USD`；Cloudflare 防护，被拦自动节流
   - DeepSeek（`DEEPSEEK_API_KEY`）：GET api.deepseek.com/user/balance
   - OpenRouter（`OPENROUTER_API_KEY`）：GET /api/v1/auth/key（免费档无预存余额只显示用量）
2. **订阅窗口（quota-axi 本地采集内核，schema v5）**：codex/cursor/claude/kimi/grok/copilot
   - 安装：`cd dsh-dashboards && npm install --no-save quota-axi@0.1.29`（运行时 spawn 本插件 node_modules 内二进制）
   - 依赖官方 CLI/App 本机登录态（`~/.codex/auth.json`、`~/.grok/auth.json`、`~/.kimi-code/credentials/kimi-code.json`、Keychain 等）；未登录渠道显示 `auth` + 恢复命令
   - 子集：`Config.aiQuota.quotaAxiProviders`（cordis.patch.yml）或默认全六家
3. **站内/控制台型（kimi 会员、NVIDIA build 等）无公开 API**，不做自动采集

刷新节奏：`Config.aiQuota.pollMs`（默认 5min；活动门控 + single-flight，看板未开零采集）。终端汇总：`~/.dsh/scripts/quota-all.mjs`（`--json` 机器可读）。

> Grok 本地登录态自动续期：`Config.aiQuota.autoRefreshGrok`（默认开）——采集前发现 `~/.grok/auth.json` 的 key 距过期 <1h 时，用同文件 `refresh_token` 走 `auth.x.ai/oauth2/token` 换新并原子写回（Grok CLI 同款 OIDC 流程，token 不落日志）；无需重新登录。Kimi 的 token 由其官方 CLI 自行续期（若长闲置过期，跑一次 `kimi login` 即可）。

探针目标解析链：UI 编辑 store（`~/.dsh/storages/dsh-dashboards/probe-targets.json`，PUT 落盘）→ `Config.probe.targets`（cordis.patch.yml）→ `DEFAULT_TARGETS`（index.mjs）。看板 tab 右上角「编辑」可增删探针目标与移除 widget，保存即时生效（client bundle 需刷新页面加载）。

## 安装

```bash
# profile 依赖 + bundles + cordis.patch.yml（参考 dsh-health-panel 接线）
pnpm dsh --profile web --dump-config   # 验证 dashboards 行合并
# 重启 dsh web（manifest touch 触发 daemon AUTO-RELOAD）
```

## 开发

```bash
node --check index.mjs
DSH_SOURCE=/path/to/deepseek-harness node scripts/build.mjs   # client bundle（jsx automatic）
```

## 验证

- 插件树：`include:dashboards` fiberPhase=active
- `curl http://127.0.0.1:3080/dashboards/status`
- 会话区切到「看板」tab 查看 widget 网格
