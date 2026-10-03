# JUP / RAY 收入构成与资金去向图：证据和展示口径

核查时间：2026-10-03 北京时间；统计窗口 **2026-09-02—2026-10-01 UTC，30 天**。本页只给图表节点、政策与对账建议，不改现有数据或界面。金额均为 USD 统计值；收入份额或回购预算不等于已成交的现金支出。

## 1. 展示原则

建议把图分为两层：第一层为“**哪些业务贡献协议收入**”，用保存父级 `dailyRevenue.totalDataChartBreakdown`；第二层为“**这些业务怎样分配费用／收入**”，区分外部分成、协议所得、回购额度及最终代币去向。第一层可以精确按父级保存的分项重建，第二层只有在独立 `SupplySideRevenue` / `ProtocolRevenue` 或细标签与父值对平时才画成闭合金额流。

节点用“协议所得收入（数据供应商口径）”“按政策计算的回购额度”“其他协议收入分配（适配器口径）”。不要把 `Revenue − HoldersRevenue` 直接叫“已留存现金／净利润”，不要把 `Fees − Revenue` 自动叫“已经支付给 LP”。现有适配器普遍按比例生成预算，尚未读取完整实际买入成交账。

JUP 的 Fees 包括借款利息、SOL 质押奖励及交易平台费，不宜给整个父级起“用户交易手续费”标题。RAY 的 AMM 子协议目前只统计经过筛选的池交易费；建池、验证者等其他业务不应以 0 画成已完整覆盖。

## 2. 保存的父级数据：全部分项与总额一致

读取 `data/dashboard.json` 的 `data_sources.response_path`；6 份保存响应原始存储字节 SHA256 均与记录一致。抓取时间为 2026-10-02 11:05 UTC。JUP 的 11 个产品和 RAY 的 2 个产品在每种数据类型中相加均等于父级 `totalDataChart` 同窗总额；这只证明**保存响应内部一致**，不证明经济上没有重叠。

### JUP

| 业务节点 | Fees | Jupiter 所得 Revenue | Holders / 回购额度代理 | 图中业务说明与资金规则 |
|---|---:|---:|---:|---|
| 聚合交易 / Ultra 平台费 | 3,740,371 | 3,740,371 | 1,870,182 | 只统计 Jupiter 平台费；下游 DEX 的总费不应再归 Jupiter。收入 50% 为回购额度代理。 |
| 永续交易 / Perps | 7,948,447 | 1,987,113 | 993,555 | 开平仓、流动性进出、swap、清算、funding、price impact；75% 给 JLP／LP，25% 归 Jupiter，再将其 50% 用于回购，即总费的 12.5%。 |
| jupSOL 质押与管理费 | 2,241,945.77 | 124,599.77 | 62,300.11 | Fees 含 SOL 质押奖励；奖励 95% 给持有人，5% 管理费归协议，另有存取费；协议所得再按 50% 计回购。 |
| DCA / Trigger | 142,883 | 142,883 | 71,443 | **与 Aggregator 有部分重叠，见下节。** 只有 Legacy DCA 可作为独立贡献；Trigger V2 已在聚合收费中。 |
| Studio 发行与交易 | 63,011 | 55,480 | 27,742 | 发行曲线交易费及 DAMM v2 手续费收款；协议所得 50% 为回购额度。Referral 和另一协议费项须独立处理。 |
| Lend 借贷 | 3,897,468 | 195,748 | 97,872 | 借款人利息先给出贷方；剩余 reserve 所得由 Fluid / Jupiter 各 50%；Jupiter 部分再按 50% 计回购。 |
| Limit 限价执行 / 盈余 | 1,198.44 | 1,198.44 | 598.83 | Jupiter 收取执行费／交易盈余；适配器按 50% 计回购。 |
| Offerbook 抵押借贷费用 | 4,331 | 4,331 | 0 | 偿还利息中的协议费、借款发起费和抵押物申领费。当前代码全部计 ProtocolRevenue，**没有 JUP 回购份额**。 |
| Lend DEX 交易费 | 5,032 | 627.89 | 0 | 先扣 LP；protocol cut 由 Fluid / Jupiter 各 50%；当前源码明确 **AMM fees do NOT feed the JUP buyback**。 |
| Prediction 预测市场接口 | 104,508 | 0 | 0 | 用户支付的是外部 venue 费用；全部归 Kalshi，Jupiter 当前收入为 0。 |
| Ape Jupiter | 0 | 0 | 0 | 历史交易／发行费用；本窗 0，不贡献当前收入。 |
| **父级保存总额** | **18,149,195.21** | **6,252,352.10** | **3,123,692.94** | 父级未经 Trigger V2 经济去重。 |

Revenue 来源图建议默认展示 Aggregator、Perps、Lend、jupSOL、Studio、独立 DCA、Limit、Offerbook、Lend DEX；Prediction 和 Ape 可放“本窗无协议收入”，避免把 104,508 的 Kalshi 费用画成 Jupiter 收入。

### RAY

| 业务节点 | Fees | Raydium 所得 Revenue | Holders / 回购额度代理 |
|---|---:|---:|---:|
| AMM / CLMM / CPMM 交易池 | 34,703,901 | 5,368,894 | 4,164,470 |
| LaunchLab 发行曲线 | 10,265,277 | 2,143,003 | 535,749 |
| **父级保存总额** | **44,969,178** | **7,511,897** | **4,700,219** |

RAY 父级不是纯 AMM；不能把父级全部 Holders 写成总交易费 12%，也不能把收入到代币的比例写成统一 75%–100%。AMM 和 LaunchLab 在本窗是两个独立产品：前者是交易池 swap fee，后者是毕业前 bonding curve TradeEvent 费用。迁移后的池交易是新的交易阶段，没有发现该两项父级内部重复。

## 3. 子协议重复覆盖与 flags：必须同时看文字、代码

独立 GET 各 child `summary/fees/...?...dailyRevenue`，抓取 2026-10-02 18:11:55—18:12:00 UTC；完整 raw、URL、SHA256、时间和 flags 见 `/tmp/flow-jup-ray-summary-meta.json`。

JUP Aggregator、Perps、Ape、jupSOL、DCA、Studio、Lend、Limit、Offerbook、Lend DEX 的 summary `doublecounted` 均为 false。**DCA 的 false 与自己的 methodology 冲突**：文字明确 Trigger V2 overlaps Aggregator，源码统计 Jupiter 共享 fee authorities，当前源码也没有实际设置 `doublecounted` 属性。这是已发现的重叠，不能因 flag 为 false 忽略。

当前 DCA 30/30 天 Fees / Revenue 标签为：

- `Jup DCA Trading Fees` **3,537.34**：独立 Legacy DCA。
- `Trigger V2 Fees` **139,345**：Aggregator 内已有覆盖，不宜另加。
- 标签合计 **142,882.34**，保存父级 DCA 为 **142,883**，差 **0.66**；与整数日金额舍入一致，但不能宣称字节上完全相等。

建议将 Trigger V2 画为 Aggregator 内部来源／重复覆盖提示，不另贡献到总收入。若采用去重金额，应显式记录同窗标签来源和抓取时间，保留 raw 父值与调整值；`Fees` 和 `Revenue` 均扣除 139,345。DCA Holders 标签只有合并 `Token Buy Back` 71,443，没有独立 Trigger 标签；按 50% 扣除 **69,672.50** 是**政策推算调整**，不是独立核实的 Trigger 买入现金。

JUP Prediction 的 `doublecounted=true` 是外部 Kalshi venue 收费已有其他协议覆盖；不能由此推断 Jupiter 父级中还有另一个相同收费产品。可以画“外部平台 Kalshi 104,508；JUP 协议所得 0”。RAY AMM、LaunchLab 的 flags 均为 false；本次未发现父内重复。

来源：[DCA / Trigger 源码](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-dca.ts)、[DCA 标签 API](https://api.llama.fi/v2/chart/fees/protocol/jupiter-dca/label-breakdown?dataType=dailyRevenue)、[Prediction summary](https://api.llama.fi/summary/fees/jupiter-prediction?dataType=dailyRevenue)。

## 4. JUP 最终去向与费用分配：图不应假装已经现金闭合

政策路径建议为：

> 独立业务 Jupiter 所得 → 适用产品的 50% 回购额度 → 用协议收入资金买 JUP → Litterbox / 战略储备长期锁定；已有存量销毁另作历史事件。

创始人原始承诺为未来两年分配收入进行战略积累；不等于每笔购入都自动永久 burn。Offerbook、Lend DEX、Prediction 当前各自没有该回购份额。ASR 和 Net-Zero 的团队／Mercurial抵消买入应从这条收入回购路径之外显示：后者来源是团队资产负债表，不能与 Litterbox 收入回购重复。

外部节点名称可使用“JLP / LP 费用份额”“jupSOL 持有人质押奖励”“借贷出贷方利息”“Fluid 分成”“Studio referrals”“外部 Kalshi venue 费用”。数字若仅由比例或差额得出，边标“按政策推算／统计余额”，不标“已支付现金”。

本次新增独立抓取父级 `dailyProtocolRevenue` 和 `dailySupplySideRevenue` 的时间为 2026-10-02 18:13:59 UTC；raw 和 SHA256 在 `/tmp/flow-jup-ray-distributions-meta.json`。它们与保存的 JUP 父级旧快照**未严格对平**：

- 新取 ProtocolRevenue **3,131,194.83**；保存 Holders **3,123,692.94**，两者和比保存 Revenue 多 **2,535.67**。
- 新取 SupplySideRevenue **11,986,350.31**；保存 Revenue + 新 Supply 比保存 Fees 多 **89,507.20**。
- Lend 新供给侧 **3,798,296**，但保存 `Fees − Revenue` 为 **3,701,720**；差 **96,576**，不能强行称完整同期出贷方／Fluid现金分配。
- Studio 新供给侧只有 **459.99** referral。保存 `Fees − Revenue` **7,531** 还包含另一个未列为 SupplySide 的费用项；源码的 totalFees 加了 `total_protocol_fees`，Revenue 只加 `total_trading_fees + damm_v2_fees`。不要把整个 7,531 叫 referral 或 LP。

因此 JUP 更合适画“业务收入构成 + 政策分配结构”，金额不闭合时显示“未对账／其他费用口径余额”，保留正负号和来源时间。不能根据来源接口包含 30 条日记录就宣称所有账项已经对齐。当前 jupSOL SupplySide 标签只有 21 个非空日，合计 2,117,346 与保存 Fees − Revenue 相等；标签缺日仍不能一律新增 0 记录。

政策来源：[创始人收入回购承诺](https://meow.bio/jup-4.html)、[Litterbox 存量销毁提案](https://discuss.jup.ag/t/new-dao-vote-proposal-to-burn-the-litterbox/39627)、[Net-Zero FAQ](https://discuss.jup.ag/t/faqs-net-zero-emission-proposal/39974)。产品源码：[Aggregator](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter.ts)、[Perps](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-perpetual/index.ts)、[jupSOL](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-staked-sol/index.ts)、[Lend](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-lend/index.ts)、[Studio](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jup-studio/index.ts)、[Offerbook](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-offerbook/index.ts)、[Lend DEX](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-lend-dex/index.ts)。

## 5. RAY 可展示的两条路径与闭合数字

### 交易池路径

> 池 swap fee → AMM v4：88% LP、12% RAY 回购额度；CLMM / CPMM：84% LP、12% RAY 回购额度、4% treasury → 收费币种兑换为 RAY → 协议公开回购持币地址。

用于回购的是**池收取的交易费份额**，不是成交额的 12%，也不是所有协议 Revenue 的 12%。协议收款可能为 USDC、wSOL、RAY 或长尾 SPL 币，需要先变现／转换，手续费美元估值不保证等量现金可兑现。

官方回购文档明确 bought-back RAY **held by protocol**，持币地址 `DdHDoz94o2WJmD9myRobHCwtx1bESpHTd4SSPe6VEZaz`。用“协议持有 RAY”最终节点；不要画成烧毁地址或消失的供应量。

### LaunchLab 路径

> 毕业前曲线交易费 → Launch platform fee / token creator fee 给外部 → Raydium protocol fee → 25% 回购额度代理、75% 协议分配 → RAY 去向待核。

25% 的分母是 **Raydium 自己的 protocol fee**。adapter 的文字称 buyback and burn，但实现只对 protocol fee `clone(0.25)`，没有读取实际 RAY 买入或 SPL Burn。官方 AMM 回购文档与该声明的适用范围不同，父级最终去向应显示“AMM 协议持有；LaunchLab 销毁声明待核”，不能把整个父级记作永久烧毁。

### 独立分配接口的本窗对账

| 业务 | SupplySideRevenue | ProtocolRevenue | 已保存 Holders | 已保存 Revenue |
|---|---:|---:|---:|---:|
| AMM | 29,335,008 | 1,204,425 | 4,164,470 | 5,368,894 |
| LaunchLab | 8,122,273 | 1,607,253 | 535,749 | 2,143,003 |
| **父级合计** | **37,457,281** | **2,811,678** | **4,700,219** | **7,511,897** |

父级 44,969,178 = 37,457,281 + 7,511,897；7,511,897 = 2,811,678 + 4,700,219，**合计精确闭合**。各子协议相加仍有 ±1 的整数日统计差异。可以据独立 SupplySide / ProtocolRevenue 接口画“按适配器统计分配”的闭合金额图；这并不把分配代理变成已付现金或净利润。

LaunchLab 的细标签 **只有 2026-09-09—10-01，23/30 天**：protocol 1,961,906、platform 8,047,662、creator 74,610；Holders 490,476。不能用这组标签宣称完整 30 天精确 platform / creator 分拆。9 月 9 日的 [adapter commit 6ac8123](https://github.com/DefiLlama/dimension-adapters/commit/6ac81236548dde55538cd601ca8d1a4050e0ffce)首次将 platform / creator 加进 Fees 和 SupplySide；此前 Fees 只计 protocol fee。父级 Fees 长期序列存在收入覆盖语义变化，不能把历史增长全解释成业务增长。

建议 30 天图把外部部分合并为“Launch 平台 / 创建者分成（统计覆盖）8,122,273”，平台与创建者分别金额只在 **23 天详细标签**子卡中展示，明确日期和覆盖。不要补缺少的 7 天为 0。

来源：[Raydium 官方回购文档](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/ray-buybacks.mdx)、[AMM adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/raydium/index.ts)、[LaunchLab adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/launchlab/index.ts)、[LaunchLab fee 标签](https://api.llama.fi/v2/chart/fees/protocol/launchlab/label-breakdown?dataType=dailyFees)、[父级 SupplySide](https://api.llama.fi/summary/fees/raydium?dataType=dailySupplySideRevenue)、[父级 ProtocolRevenue](https://api.llama.fi/summary/fees/raydium?dataType=dailyProtocolRevenue)。

## 6. 本轮临时原始响应索引

- child summary：`/tmp/flow-summary-<slug>-dailyRevenue.json`；详细 URL、SHA256、时间、flags：`/tmp/flow-jup-ray-summary-meta.json`。
- 父级两个分配指标：`/tmp/flow-<jupiter|raydium>-<dailyProtocolRevenue|dailySupplySideRevenue>.json`；精确元数据：`/tmp/flow-jup-ray-distributions-meta.json`。
- DCA 标签：`/tmp/flow-jupiter-dca-dailyFees.json`、`dailyRevenue.json`、`dailyHoldersRevenue.json`；Fees / Revenue SHA256 `e73633f9f6174582cdccdfbe22deb3a6bd5b7a82c79474f1b7fbf63557d4168d`，抓取 18:11:08 UTC；30/30 天。
- LaunchLab 标签：`/tmp/flow-launchlab-dailyFees.json`（SHA256 `04d4406284e62f3b66ea981261979590bedfce54cbaca10083c5eb76b3c5c385`）、`dailyRevenue.json`、`dailySupplySideRevenue.json`、`dailyHoldersRevenue.json`；抓取 18:11:08—18:11:11 UTC；23/30 天。
- Lend SupplySide 细标签：`/tmp/flow-jupiter-lend-dailySupplySideRevenue.json`，SHA256 `a2f50e034ed444f314da728443d8264e12473a70948ffd29e3a5d0fdf56631af`，18:11:09 UTC；30/30 天，但与保存父级不同口径／快照尚未对平。
- jupSOL SupplySide 细标签：`/tmp/flow-jupiter-staked-sol-dailySupplySideRevenue.json`，SHA256 `a8b9fa2d47cc7585a2b2cf099356a5134b7467be3b0bf45709f965793f61d2cc`，18:11:10 UTC；21 个标签日，合计与保存父级差额相同。

上述时间均为 2026-10-02 UTC，即北京时间 2026-10-03。本轮没有修改 `data/`、cache、profiles 或网页。
