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
