---
subject: dsh-dashboards 计费模块（scripts/dsh-usage-aggregate.py）及其消费的 los 定价表（packages/agent/src/model-profiles.ts）
auditedRev:
  dsh-dashboards: e3ecea999a7ac5999324a9975d23d5ce3ac8bcc6
  los: 263c6b52c035c7f51c5850e5dad6c159dd346986
readOnly: true
auditedAt: 2026-10-09
changeStatus: 已实施（P0 + P1；审计阶段只读，改动在本文档定稿之后进行，见 §9 实施记录）
method:
  - 源码阅读（聚合脚本 / 客户端渲染器 / los 定价解析链与 provider 注册）
  - 会话日志实测复算（~/.dsh/sessions/*/session*.jsonl.zstd 直读 zstd 多帧）
  - 线上端点取数（GET /dashboards/dsh/usage、GET /plugins/dsh-dashboards/status、los GET /usage/summary）
  - 站点价格核验（api-docs.deepseek.com 中文/英文价格页、更新日志、news260813 与 news260910 定价图 OCR）
  - 运行态一致性核对（8080 监听进程 cwd = 本 checkout，tsx 直跑 TS 源码 ⇒ 源码即运行态）
---

# dsh-dashboards 计费模块审计：单位口径与成本正确性

## 0. 结论（TL;DR）

看板计费**确实不对，且不是精度问题而是整体失效**：

| 卡片 | 看板显示 | 按站点价复算 | 偏差 |
| --- | --- | --- | --- |
| DSH 消耗 7d | **$0.00**（42300 次调用 100% 标为「未计价」） | ¥479.94 / **$70.58** | **漏报 100%** |
| LLM 用量 24h（los） | $0.3152 | $0.2441 | 高估 **+29.2%** |
| 综合成本（DSH 7d + los 24h） | $0.32 | ≈ $70.82 | 差约 **220×** |

**单位口径**：计费内核是**人民币**（定价表单位 CNY/百万 tokens），对外展示是**美元**（`USD = CNY ÷ 6.8`），UI 一律打 `$`。
所以卡片上的 `$` 是「人民币价按固定汇率折算的美元」，不是站点的美元标价。

根因是 **2026-09-10 12:00 站点对 Flash 同时做了「模型改名」与「降价」两件事，本模块两样都没跟上**：
模型名从 `deepseek-v4-flash` 改为 `deepseek-flash`（`PRICING` 未登记新名 ⇒ 全部落进「未知模型」分支 ⇒ 成本恒为 0），
单价从 (1.5, 4.5, 0.05) 降到 (1.0, 4.0, 0.02)（即使名字修好，也仍会高估 ≈94%）。

## 1. 单位口径：是美元还是人民币

| 层 | 口径 | 位置 |
| --- | --- | --- |
| 定价表 `PRICING` | **CNY** / 百万 tokens，填的是**空闲价** | `scripts/dsh-usage-aggregate.py:53` |
| 原始累加字段 | `estimatedCostCny`（人民币，未折算） | 同上 `:121` |
| 对外字段 | `estimatedCostUsd = CNY ÷ CNY_PER_USD`，`CNY_PER_USD = 6.8` | 同上 `:62`、`:103` |
| UI | 一律 `$`（`fmtUsd`），不出现 `¥` | `src/client/DashboardView.tsx:36`、`:275` |

汇率常数本身的误差（次要）：

- 站点中英双页**隐含汇率并不自洽**：flash 列 1元/$0.15 = **6.667**，pro 列 4.5元/$0.66 = **6.818**。6.8 落在站点自身区间内。
- 相对 PBOC 中间价（2026-10-09 = **6.7330**）偏低 ≈1%，即美元金额被**低估约 1%**（$70.58 vs $71.27）。可忽略，但应知道方向。

> 判据：`CNY_PER_USD` 不是「错了」，而是「不能当作站点的美元价来对账」。要做严格对账应以 `estimatedCostCny` 为准。

## 2. 站点真实价格（两个纪元）

来源：[中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[英文价格页](https://api-docs.deepseek.com/quick_start/pricing/)、[更新日志](https://api-docs.deepseek.com/zh-cn/updates)、[news260813](https://api-docs.deepseek.com/zh-cn/news/news260813)（定价图 OCR）、[news260910](https://api-docs.deepseek.com/zh-cn/news/news260910)。

单位 CNY/百万 tokens（空闲价；高峰 = ×2）：

| 纪元 | 模型 | 缓存未命中输入 | 输出 | 缓存命中输入 |
| --- | --- | --- | --- | --- |
| **2026-08-17 00:00 ~ 09-10 12:00** | DeepSeek-V4-Flash | 1.5 | 4.5 | 0.05 |
| | DeepSeek-V4-Pro | 4.5 | 13.5 | 0.15 |
| **2026-09-10 12:00 起（现行）** | `deepseek-flash`（V4.1-Flash） | **1.0** | **4.0** | **0.02** |
| | `deepseek-v4-pro`（计费不变） | 4.5 | 13.5 | 0.15 |

关键规则（现行价格页脚注 2）：

- 高峰 = 北京时间**周一至周五、且不含中国法定节假日**，9:00-12:00 与 14:00-18:00；其余（含周末与节假日**全天**）为空闲。
- 旧名 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 仍可调用，但**路由到 V4.1-Flash 并按 Flash 单价计费**。
- 9/10 公告曾提及 V4 Pro 有序下线并改按 Flash 计费，但 9/10 [更新日志](https://api-docs.deepseek.com/zh-cn/updates) 明确「继续提供 V4 Pro，计费方式保持不变」——以更新日志为准，pro 表无需改动。

**代码里的 (1.5, 4.5, 0.05) 并非一开始就错**：与 8/13 公告定价图 OCR 结果逐位吻合，说明它是 8/17 版的正确取值，属于**过期**而非错误。pro 列 (4.5, 13.5, 0.15) 两代一致，正确。

## 3. 缺陷清单

### D1（致命）模型改名未登记 ⇒ 成本恒为 0

`PRICING` 的 key 只有 `deepseek-v4-flash` / `deepseek-v4-pro`。站点 9/10 起实际模型名为 `deepseek-flash`，
`cost_for()` 查不到 → 返回 `(None, None, None)` → 只递增 `costUnknownCount`，**从不累加成本**（`dsh-usage-aggregate.py:92-103`、`:127-138`）。

会话日志实测的分界点：

```
MODEL: deepseek-official | deepseek-v4-flash | USD 399.83 | unknown 0     | resp 47366
MODEL: deepseek-official | deepseek-flash    | USD   0.00 | unknown 61866 | resp 61866

byDay:  2026-09-11  USD 28.71        ← 仍是旧名
        2026-09-12  USD  0.006       ← 改名当天归零
        2026-10-01  USD  0.000 起    ← 此后精确为 0
```

线上端点当前返回即为：`estimatedCostUsd: 0`、`costUnknownCount: 42265 / 42265`（`GET /dashboards/dsh/usage`）。

### D2（高）Flash 单价停留在 8/17 版 ⇒ 若只修 D1 仍高估 ≈94%

9/10 降价后未同步：缓存未命中输入 +50%、输出 +12.5%、缓存命中 +150%。

### D3（中）峰谷判定未排除中国法定节假日 ⇒ 假期高估

站点规则明确「不含中国法定节假日」；`peak_multiplier_at()`（`:80-89`）只判「工作日 + 时段 + 8/23 起周末平谷」，
**没有节假日集合**。国庆（10/1-10/7）、中秋（9/25-9/27）会被按高峰 ×2 计费。
依据：[国办发明电〔2025〕7号](https://www.gov.cn/gongbao/2025/issue_12406/202511/content_7048922.html)。

附带一处同源近似：`peak_multiplier_at()` 对 8/17 之前的事件也会 ×2，而峰谷定价本身 **8/17 才生效**（早于 8/17 的 3 天数据受影响）。

### D4（中）los 侧同源缺陷 + 一处潜在零成本陷阱

「综合成本」卡 = DSH(7d) + los(24h)，两半都有问题：

- **单价同源过期**：los 用 `estimateCost(usage, provider.profile)`（`packages/agent/src/loop.ts:278`），
  取 `profile.pricing` = `DEEPSEEK_V4_FLASH_PRICING` = (1.5, 4.5, 0.05)，同样停留在 8/17 版。
  实测 24h：los 报 $0.3152，按现行价应为 $0.2441 ⇒ **高估 29.2%**（该比例与峰谷无关——峰谷对三项单价同乘会约掉）。
- **峰谷同样无节假日**：`billingPeriodAt()`（`model-profiles.ts:54-60`）只有周末平谷。
- **潜在零成本陷阱（结构性）**：`resolveModelProfile()` 在 `pricingByModel` 存在时**不回退**到 `base.pricing`：

  ```ts
  const pricing = base.pricingByModel ? base.pricingByModel[resolved.model] : base.pricing
  ```

  而 `pricingByModel` 没有 `deepseek-flash` 键 ⇒ `resolveModelProfile('deepseek', { model: 'deepseek-flash' }).pricing === undefined`（**已实测**）。
  今天没爆，是因为 event 的 `model` 列取**响应模型名**（`loop.ts:305` `model: res.model`），
  而定价取**请求模型名**（`provider.profile`，由 `registry.ts:26` 用请求 model 解析）——两者当前恰好是 `deepseek-flash` / `deepseek-v4-flash`。
  **一旦有客户端直接请求 `deepseek-flash`，los 侧成本会立刻静默归零，与 D1 完全同型。**
- 另注：`pricingByModel` 在 los 内无其它消费者，等价于 pro 也按 flash 价计——修 D4 时应一并确认。

### D5（低）汇率常数

见 §1：6.8 对 PBOC 6.7330 偏低 ≈1%（美元低估），且站点自身两列隐含汇率不自洽（6.667 / 6.818）。

## 4. 量化总表（实测）

窗口起止：7d = 2026-10-02 23:56 → 10-09；9/12 起 = 2026-09-12 00:00 → 10-09；全量 = 2026-08-14 → 10-09。

| 口径 | 响应数 | 未计价 | CNY | USD@6.8 |
| --- | --- | --- | --- | --- |
| 7d 现状（未修） | 42300 | **42300** | 0.00 | 0.00 |
| 7d 只修名（价格表不动） | 42300 | 0 | 930.47 | 136.83 |
| 7d 修名+新价（沿用原峰谷判定） | 42301 | 0 | 624.72 | 91.87 |
| 7d 修名+新价+节假日（对齐站点） | 42303 | 0 | **479.94** | **70.58** |
| 9/12 起 现状 | 62002 | 61882 | 0.43 | 0.06 |
| 9/12 起 对齐站点 | 62002 | 0 | **723.94** | **106.46** |
| 全量 现状 | 109329 | 61963 | 2718.87 | 399.83 |
| 全量 对齐站点 | 109333 | 88 | **3190.17** | **469.14** |

（全量「对齐站点」残留 88 次未计价 = 非 DeepSeek 路由：`lmstudio-win` / `los-gateway` / `opencode-zen` / `nvidia-nim`，属预期。）

**缺陷贡献分解（7d）**：D1 造成 100% 漏报；D2 使成本从 479.94 抬到 930.47（**+93.9%**）；D3 把它从 479.94 抬到 624.72（**+30.2%**）。

## 5. 修复方案

### P0 — `dsh-dashboards/scripts/dsh-usage-aggregate.py`

1. **登记现行模型名**：`deepseek-flash`（provider `deepseek-official` 与 `deepseek` 两个 key 都要）。
2. **价格纪元化**：把扁平 `PRICING` 改为按生效时间取表，用事件时间选表——
   `ts < 2026-09-10 12:00 北京（epoch ms 1789012800000）` 用 8/17 表，其余用现行表；
   `deepseek-v4-flash` 视为同一 Flash 家族（旧名兼容路由，按 Flash 计费）。
   **不能简单换表**：直接换成新价会让 9/10 之前约一个月的历史少算（那段时间真价是 1.5/4.5/0.05）。
3. **节假日平谷**：加入 2026 法定节假日集合（元旦 1/1-3、春节 2/15-23、清明 4/4-6、劳动 5/1-5、端午 6/19-21、中秋 9/25-27、国庆 10/1-7），命中即空闲；并让 `peak_multiplier_at()` 对 `ts < 2026-08-17 00:00 北京` 返回 1（峰谷定价尚未生效）。
4. **让下一次漂移可发现（防复发）**：输出新增 `unpricedModels`（未计价路由的 `provider/model` 列表）与 `pricingAsOf`；
   未计价时不再只是「数字变小」，而是能在卡片上直接看到**是哪个模型名没登记**。
5. **必须递增 `CACHE_VERSION`（3 → 4）**：增量缓存的是**已算好的每小时后验成本**。
   不递增则旧缓存（成本 0）会被直接复用，改动看起来"无效"。同时提醒：本机缓存 `~/.dsh/storages/dsh-dashboards/usage-aggregate-cache.json` 需失效一次。
6. 更新 `test/usage-aggregate.test.mjs`：现断言 `estimatedCostCny === 2.49` 基于旧表（fixture 用 8/17 时间，仍应保持 2.49——**正好可作 D2 的回归保护**），并新增 `deepseek-flash` 新名/新纪元的断言。

### P1 — `los/packages/agent/src/model-profiles.ts`

1. `DEEPSEEK_V4_FLASH_PRICING` 更新为现行价 (1.0, 4.0, 0.02)，`asOf` 改 `2026-09-10`。
2. `pricingByModel` 登记 `deepseek-flash`，并把 `modelAliases` 补上新名。
3. **消除 D4 的零成本陷阱**：`resolveModelProfile()` 的定价解析改为「命中优先，未命中回退 `base.pricing`」，
   避免新模型名再次静默归零。
4. `billingPeriodAt()` 排除法定节假日（与 P0-3 共用同一份节假日真源，避免两处各写一份）。
5. 更新 `packages/agent/src/model-profiles.test.ts` 中的 deepseek 定价期望。

**爆炸半径（必须先知情）**：`profile.pricing.promptTokenCostPer1M` 会进
`scheduler/provider-selection.ts:48-50` 的 cost-aware provider 路由，也会进 `pi-kernel-input.ts:136-150`。
即改动会**改变 provider 选择的成本权重**。降的是真实价格，方向上正确，但这属于行为变更而非纯展示修复。

**跨仓顺序建议**：P0 先行（只读投影、零副作用、直接消除用户的错误观感）；P1 单独提交并在 los 仓 CI 下验证。

## 6. 验收判据（机械可验）

| # | 判据 |
| --- | --- |
| A1 | 7d 窗口下 `costUnknownCount == 0` 且 `estimatedCostCny > 0`（窗口内仅 deepseek 路由时） |
| A2 | 同一 token 组合下，`deepseek-flash` 与 `deepseek-v4-flash` 在 9/10 12:00 之后单价相同；之前不同 |
| A3 | 2026-10-01（周四，国庆）北京 10:00 的事件按 ×1；2026-10-08（周四，非节假日）北京 10:00 按 ×2 |
| A4 | `unpricedModels` 非空 ⟺ `costUnknownCount > 0` |
| A5 | 带旧缓存与 `--force-full` 跑出的结果一致（证明 CACHE_VERSION 生效、旧桶被丢弃） |
| A6 | 端到端：`GET /dashboards/dsh/usage` 的 `estimatedCostUsd > 0`，且与手工复算一致 |
| A7 | los：`resolveModelProfile('deepseek', { model: 'deepseek-flash' }).pricing` 不再为 `undefined` |
| A8 | 两仓测试套件通过（`node --test test/*.test.mjs` / los 侧 agent 包测试） |

## 7. 复现命令

```bash
# 现状（应为 0）
python3 scripts/dsh-usage-aggregate.py --from-ms $(( ($(date +%s) - 7*86400)*1000 )) \
  --cache /tmp/audit.json | python3 -c "import json,sys;print(json.load(sys.stdin)['totals'])"

# 线上卡片实际取数
curl -s http://127.0.0.1:3080/dashboards/dsh/usage | head -c 300

# 运行态确认（8080 = 本 checkout）
lsof -nP -iTCP:8080 -sTCP:LISTEN -t | xargs -I{} lsof -a -p {} -d cwd -Fn
```

## 8. 非缺陷项（已核，避免误改）

- **`inputTokens` 无二次扣除**：注释所称「DSH 输入已是净缓存未命中」经原始事件验证成立
  （实测 `inputTokens 841 / cacheReadTokens 32384 / totalTokens 33592 = 841+367+32384`）⇒ `prompt = inputTokens` 正确。
- **缓存节省公式** `cacheRead × (prompt_rate − cache_rate) × peak` 口径合理。
- **pro 单价**两代一致，不需要改。
- **`6.8` 不是错误**，只是不等于站点美元标价（见 §1）。

---

## 9. 实施记录（2026-10-09，文档定稿后执行）

### 9.1 改动清单

**P0 — `dsh-dashboards`**（rev 基线 `e3ecea9`）

| 文件 | 改动 |
| --- | --- |
| `scripts/dsh-usage-aggregate.py` | 定价纪元化（`_FLASH_RATES`/`_PRO_RATES` + `rates_for()` 按事件时间选表）；登记 `deepseek-flash` 与旧名同族；`CHINA_HOLIDAYS`（2026）+ `peak_multiplier_at()` 节假日平谷；`PEAK_PRICING_SINCE_MS`（8/17 前不启用峰谷）；输出新增 `pricingAsOf`/`unpricedModels`；`CACHE_VERSION` 3→4 |
| `src/client/DashboardView.tsx` | 「未计价」pill 点名 `unpricedModels`；对账卡新增「综合成本为下限」告警（DSH 侧未计价时） |
| `lib/client.js` | 重新构建（`node scripts/build.mjs`） |
| `test/usage-aggregate.test.mjs` | 新增 2 个回归测试（定价纪元、峰谷节假日）+ 未计价点名断言 |

**P1 — `los`**（rev 基线 `263c6b5`）

| 文件 | 改动 |
| --- | --- |
| `packages/agent/src/model-profiles.ts` | flash 价 (1.5,4.5,0.05)→(1,4,0.02)、`asOf`→`2026-09-10`；`pricingByModel` 登记 `deepseek-flash`（新名）与 `deepseek-v4-flash-vision-exp`；`modelAliases` 补新名；`resolveModelProfile()` 定价改为 `base.pricingByModel?.[model] ?? base.pricing`（消除 undefined 静默归零）；`CHINA_PUBLIC_HOLIDAYS` + `billingPeriodAt()` 节假日平谷 |
| `packages/agent/src/model-profiles.test.ts` | 定价期望更新；新增「旧名与现行名同价」「未登记名回退而非 undefined」「节假日 off-peak + 非节假日对照」断言 |

### 9.2 验收结果

| # | 判据 | 结果 |
| --- | --- | --- |
| A1 | 7d 窗口 `costUnknownCount == 0` 且成本 > 0 | ✅ 0 / 42365，¥480.63（$70.68） |
| A2 | 新旧模型名在 9/10 12:00 后同价、之前不同 | ✅ 测试「定价纪元」 |
| A3 | 国庆按空闲、非节假日工作日按高峰 | ✅ 两仓测试 + 运行态实测 |
| A4 | `unpricedModels` 非空 ⟺ `costUnknownCount > 0` | ✅ 测试断言 |
| A5 | 旧缓存被丢弃（CACHE_VERSION 生效） | ✅ v3 缓存跑出全量重扫，缓存升 v4 |
| A6 | 端到端 `GET /dashboards/dsh/usage` 成本 > 0 | ✅ **2026-10-09T16:18:33Z 起 `estimatedCostUsd = 70.92`、`pricingAsOf = 2026-09-10`、未计价 0**（此前 0 / 未计价 42323） |
| A7 | `resolveModelProfile('deepseek',{model:'deepseek-flash'}).pricing` 不为 undefined | ✅ 运行态实测 1/4/0.02 |
| A8 | 两仓测试通过 | ✅ 插件 `node --test test/*.test.mjs` 118/118；los `model-profiles.test.ts` 23/23；los agent `tsc --noEmit` 干净 |

### 9.3 与计划的偏差（如实记录）

1. **节假日表在两仓各存一份**，未做到 §5 所说的「共用同一真源」——两仓之间没有共享包，硬共享需要新建依赖。
   缓解：los 的 `CHINA_PUBLIC_HOLIDAYS` 声明为真源、dsh 侧注释指向 los 并镜像同一份国办通知；两仓测试各自锁定行为。
   **年更风险**：每年国务院公布次年安排后两处都要改，否则节假日多计 ×2。这是已知残留债务。
2. **los 的默认模型名仍是 `deepseek-v4-flash`**，未改为 `deepseek-flash`。
   依据：站点明确旧名仍被接受并按 Flash 单价计费（兼容路由），故功能等价；改默认模型属于**请求路由变更**而非计费修复，留给独立决策。
3. **los 的 blast radius 确实生效**：`scheduler/provider-selection.ts:48-50` 用 `promptTokenCostPer1M` 做 cost-aware 排序，
   DeepSeek 的权重由 1.5 降到 1.0 ⇒ 相对更易被选中。这是真实价格变动的正确反映，但属于**行为变更**，不是纯展示修复。

### 9.4 未纳入本次改动（后续候选）

- 非 DeepSeek 厂商（`lmstudio-win`/`los-gateway`/`opencode-zen`/`nvidia-nim`）仍为未计价——属预期。
- `los-gateway` 行与 los 卡片存在**同一批调用两侧各记一次**的口径重叠风险（当前 DSH 侧该行未计价，故未造成金额重复；若未来为其补价需先去重）。
- `pricingByModel` 在 los 内无其它消费者，等价于 pro 也按 flash 价参与 provider 排序（本次未动，pro 的 `promptTokenCostPer1M` 仍为 4.5，排序取值不受影响）。
- `CNY_PER_USD = 6.8` 相对 PBOC 中间价（6.7330）低估美元 ≈1%，未调整（见 §1：站点自身隐含汇率亦不自洽）。
