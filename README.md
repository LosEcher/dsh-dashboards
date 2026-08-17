# dsh-dashboards

DSH 看板插件：在会话区注册「看板」tab（`conversation.view`），widget 网格展示：

- **los 第一方**：LLM 用量/成本（`/usage/summary`）、provider 延迟趋势（`/metrics/trends`）、任务统计（`/metrics` Prometheus）、**执行节点矩阵**（`/nodes`，含 load/mem 快照与心跳）
- **macOS 原生探针**（零安装）：loadavg / 内存（vm_stat，含可回收缓存口径）/ CPU（iostat）/ 磁盘（df）/ 网络速率（netstat 差分）/ 进程数，内存滚动 120 点短趋势
- **服务探活**：本机 + node34 关键服务 HTTP/TCP
- **Uptime Kuma**（可选，默认关）：Z4Nas 排查完成后配置 `kuma.url` + `kuma.token` 即启用（REST v1 `/api/v1/monitors`）
- **Glances**（可选，默认关）：`brew install glances && glances -w` 后配置 `glances.url`
- **feed 采集摘要**：读 `~/.dsh/scheduler-reports/feed-digest-*.md`（scheduler job「多平台 feed 采集摘要」落盘）最新 5 份，卡片内点击展开正文

## 架构

- **host 半包**（`index.mjs`）：`ctx.webServer` 挂 `/dashboards/*` 同源聚合 API；每后端独立轮询缓存（single-flight）；los 双 token 解析链（Bearer 用量 + `x-los-operator-token` 节点，均不写明文，从环境/credentials/losEnvFile 读取）；widget 配置存 `~/.dsh/storages/dsh-dashboards/widgets.json`（PUT 校验 endpoint 白名单防注入）。
- **client 半包**（`src/client/`）：注册 `conversation.view` tab（id=`dashboard`，order=90，locale NS `dashboard` zh/en），按 widget 配置渲染 stat/matrix/chart/list 卡片；样式只用 `--dsw-alias-*` 白名单令牌。

## API

```
GET /dashboards/status        后端健康 + widget 数
GET /dashboards/los/usage      GET /dashboards/los/trends   GET /dashboards/los/metrics
GET /dashboards/los/nodes      GET /dashboards/macos        GET /dashboards/macos/history
GET /dashboards/probe          GET /dashboards/glances      GET /dashboards/kuma
GET /dashboards/feed/digests  feed 采集摘要报告（scheduler-reports/feed-digest-*.md）
GET/PUT /dashboards/widgets   widget 配置（PUT 需带 {widgets:[{id,type,endpoint,title,refreshMs}]}）
GET/PUT /dashboards/probe-targets  服务探活目标（PUT 带 {targets:[{name,url?|port?}]}；空数组=重置回默认）
```

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
