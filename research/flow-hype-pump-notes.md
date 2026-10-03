# HYPE / PUMP 收入构成与回购资金图说明

核查时间：2026-10-03（Asia/Shanghai）；本轮文档补充归档与完整性核验。金额沿用 2026-10-02 收集的完整 UTC 日数据，最新日为 2026-10-01；本说明不修改原始 JSON。PUMP Mobile 的额外实时核查见 `research/evidence/pump-mobile/`，抓取时间 2026-10-02 18:14 UTC。

## 图的共同语义

- 实线：源码和统计字段确认的包含关系或资金分配规则；带金额的线表示同一个统计口径中的组成，不能默认为银行现金流审计结果。
- 虚线：回购政策、预算比例或跨来源的经济关系，缺少同一窗口逐笔现金对账。不要给此线按 burn 美元估值设置现金宽度。
- 灰色节点：已经存在但当前 API 无法拆金额，或不在当前父协议数据覆盖范围。
- `totalDataChartBreakdown` 是「链 → 子产品」分解；`breakdownMethodology` 提供更细的业务标签及定义，**标签存在不代表保存了相应标签的每日金额**。图应优先画可核实的产品组成，再说明每种产品有哪些分成。
- 收入、回购预算、实际买币成本、销毁代币的估值是四个不同节点。不要把 `dailyRevenue + dailyHoldersRevenue` 当成两笔收入。

## HYPE

### 推荐节点与连线

| 节点标题 | 业务含义 | 图中关系和金额边界 |
| --- | --- | --- |
| 永续交易用户费用 | 加密资产及 HIP-3 市场的交易费，包含 builder 所得 | 产品组成实线；30 日 $68,298,832 |
| 现货交易与 HIP-1 竞价 | 现货费含 Unit；HIP-1 部署竞价以 HYPE 支付、直接销毁 | 产品组成实线；30 日 $2,590,957。现金现货费与 HYPE 竞价估值在当前保存数据中未细分 |
| 其他参与者分成与统计差额 | builder、HIP-3 部署者、maker rebates、Unit、HLP；不能逐个算金额 | 可画名称标签；仅聚合剩余差额可量化，不能称公司利润 |
| 合格交易手续费 | 永续先扣 builder、HIP-3 部署者、maker rebates；现货排除 Unit | 规则实线，精确合格池金额需标签分解，不能把全部原始费用送入 99% 节点 |
| Assistance Fund 分配 | 当前合格交易费的 99%；另 1% 给 HLP | 政策/适配器规则实线，标明 2025-08-31 起适配器取 99%；此前为 97% |
| 自动买入 HYPE | AF 将收取费用转成 HYPE | 官方机制连线；当前持有人收入是费用分配金额，缺少逐笔 AF 买入实际成本汇总 |
| AF 的 HYPE 不可取回 / 经济销毁 | 2025-12-24 共识后存量和后续 AF 持币 | 最终去向；不能把这一天确认的存量再加到历史逐日费用回购中 |
| HIP-1 竞价直接销毁 | 部署者直接支付 HYPE | 必须单列旁路，直接连销毁；不经过现金回购，也不参与 99:1 分配 |

用户易懂的图标题可写「交易费先分给服务提供者，再把合格部分拨给回购基金」。若以合并节点展示 HYPE 的 `dailyHoldersRevenue`，标题应为「分给 AF 的收入 + HIP-1 销毁估值」，而非「实际现金回购」。

`dailyRevenue` 与 `dailyHoldersRevenue` 当前相等，均为给代币捕获路径的金额；这里的 `Revenue` 不是先含 HLP、然后再拨给代币的独立收入池。不要用两层数值相等的节点制造一笔重复收入。

### 已保存数据可支持的金额

| 完整日窗口 | 原始父级费用 | 已重复包含的 HLP | 去重用户费用 | AF 分配 + HIP-1 销毁估值 | 去重费用与代币路径差额 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 30 日（2026-09-02 至 10-01） | $71,446,713 | $556,924 | $70,889,789 | $55,355,695 | $15,534,094 |
| 365 日（2025-10-02 至 2026-10-01） | $906,992,899 | $6,909,876 | $900,083,023 | $684,247,605 | $215,835,418 |

30 日代币路径中，永续 $53,283,842、现货/竞价 $2,071,853；365 日分别 $657,789,696、$26,457,909。各产品数字是父级 breakdown 的原始统计值。

30 日 $55.36M 占去重费用 $70.89M 的 78.09%，这与「合格手续费 99% 给 AF」不冲突。差额中有其他参与者分成，也可能有统计时点/估值等未解释项；不能按剩余 $15.53M 给每个对象分配精确金额。HLP 的 $556,924 是既有交易费的分成，不能作为第四项收入或新资金入口。

HyperEVM gas、AQA v2 储备收益等新业务不在这次已审计父级范围；可显示灰色「当前未覆盖」旁注。资金费及 HLP 持仓盈亏不应画为这张协议手续费图的收入。

### HYPE 来源

1. [官方手续费说明](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)：AF 自动转换费用为 HYPE，部署者分成、HLP、AF 等去向。
2. [固定版本 helper](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/helpers/hyperliquid.ts#L193)：团队确认的 97:3 / 99:1 分配及生效时间；同文件净合格永续收入扣除项目。
3. [永续适配器](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/hyperliquid-perp/index.ts)、[现货适配器](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/hyperliquid-spot/index.ts)：原始费、外部分成、AF 与竞价销毁的公式。
4. [HLP 适配器](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/fees/hyperliquid-hlp.ts)：`doublecounted:true`，交易费分成已经包含于永续/现货。
5. [官方 2026-01-04 共识回顾](https://t.me/s/hyperliquid_announcements/497)：确认 2025-12-24 AF HYPE 经济销毁共识。
6. 缓存 `data/raw/llama-hyperliquid-{fees,revenue,holders}.json`；本地更细核对见 `research/hype-fee-audit.md`。

## PUMP

### 推荐节点与连线

| 节点标题 | 来源或最终去向 | 图中关系和金额边界 |
| --- | --- | --- |
| 发行交易 / bonding curve | 用户交易费；历史毕业费；Mayhem 费在 adapter 中也计入 | 真实业务入口；30 日 F $47,067,512，R $33,483,562 |
| PumpSwap | 用户 swap 费用，协议、LP、创作者各有份额 | 真实业务入口；30 日 F $107,190,930，R $13,757,351 |
| Terminal | Solana/Ethereum/BSC/Base 交易终端收费 | 真实业务入口；30 日 F $5,255,762.65，R $2,618,899.65 |
| 创作者 / cashback / LP / 推荐奖励 | bonding curve 创作者或 cashback；Swap LP 和创作者；Terminal cashback/referral | 类别名称可确认，合并费用与 R 的统计差额可以展示；不是全部已同日现金支付的精确汇总 |
| 协议产品净收费（统计口径） | 收费扣除上述产品级分成后的 R | 实线连接业务来源；30日归一化总额$49,859,813，产品细分和$49,859,812.65，$0.35差额保留。adapter R 含 Mayhem，与官方回购合格 Revenue 仍有差异 |
| 符合回购政策的净收入 | 官方：全产品收入，扣 referral/cashback，排除 Mayhem | 需单独节点，R 到该节点仅用虚线或注明尚未对账；不能直接把 adapter R 全额视为合格池 |
| 50% 净收入回购预算 | 2026-04-28 起程序化锁定，承诺一年 | 政策虚线，期限到 2027-04-28；不是 50% 用户总费用 |
| 公开市场买入 PUMP | 实际使用 SOL/稳定币等买币的成本 | 官方台账可另列已报告支出；当前 LLama H 不能作为此线的现金金额 |
| 永久销毁 PUMP | 链上 burn；H 的统计位置在 pump.fun 子产品 | 最终去向；全产品烧毁汇总，不表示只有发行平台供钱 |
| Mobile 渠道（重复子集） | 手机端调用 app program 的 bonding curve / Swap 交易 | 仅作为渠道标签或虚线说明，不能成为新收入入口；必须从父级合计中去重 |

可画「用户交易费 → 外部参与者分成 + 协议产品净收费」实线，再以「合格净收入的 50%」虚线连回购预算。销毁统计卡单独接最终销毁节点；不要把 burn 估值强行嵌进同一现金守恒 Sankey。

官方费率随池类别、币种市值和政策而变。bonding curve 当前协议费 0.95%、创作者/cashback 槽位 0.30%；PumpSwap 不能统一画为 LP 0.20% + 协议 0.05% + 创作者 0.05%，低市值 canonical 和非 canonical 的规则不同。图可标「费率随池变化」；以保存的真实美元统计值作为产品金额。

Terminal 的 R 为 gross fee 减 cashback/referral 钱包支出，支出日期不一定等于对应收费日，不能声称每个日窗口都完成严格的现金闭环。其他链的适配器亦未提供同样完整的分成观测，缺分项不等于分成为零。

### 必须去除 Mobile 重复：本次逐日核查

父级 API 的 `doublecounted` 是 `null`，不能据此认定所有 child 无重复。独立 Mobile API：`id='8404'`、`slug='pump.fun-mobile-app'`、`doublecounted=true`、`chains=['Solana']`。

父级保存的精确字段路径是：`totalDataChartBreakdown[i][1]['Solana']['pump.fun Mobile App']`。`childProtocols` 中精确名称 `pump.fun Mobile App`、`defillamaId='8404'`，对应 `methodologyURL` 为 `fees/pumpfun-app.ts`。其中 `methodology.Fees` 明确这是已在 pump.fun/PumpSwap 计入的交易费；`Revenue` 是同一子集的协议份额；PUMP holders 仍只在父适配器记录。该 child 的 `breakdownMethodology` 标签包括 bonding-curve protocol/creator/cashback 和 PumpSwap protocol/LP/creator，均不是可新增的业务。

源码最新文件提交 `9bd52fb339e32e05fa975ab9b86b73db2fb0b01e`（2026-08-12 13:39:38 UTC）。L6–11 说明 app program 交易筛选、与父业务重复、不含 Mayhem、H 在父适配器；L146 链为 SOLANA；L147 `start:'2026-05-21'`（注释 first tx）；L148 `doublecounted:true`。

缓存与最新独立 child 的 F、R 均从 2026-05-22 首个非零日开始，连续 133 日；每一天的 Mobile child 数值完全一致。父级所有日总值都等于包括 Mobile 的各链各产品之和，误差至多每日 $1 的总值取整；当前父级确实重复相加。最终归一化保留原父级逐日总額，减去已验证的Mobile重复项；产品组成单独对账，取整误差不强配给任何产品。

| 窗口截至 2026-10-01 | 原始父级 F | Mobile 重复 F | 去重 F | 原始父级 R | Mobile 重复 R | 去重 R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 日 | $51,497,875 | $2,613,194 | $48,884,681 | $17,374,848 | $1,193,994 | $16,180,854 |
| 30 日 | $167,205,123 | $7,690,918 | $159,514,205 | $53,599,784 | $3,739,971 | $49,859,813 |
| 90 日 | $395,627,616 | $15,315,442 | $380,312,174 | $143,900,608 | $7,343,803 | $136,556,805 |
| 365 日（候选，完整窗口待核） | $1,156,485,763 | $15,570,882已知子项 | $1,140,914,881候选 | $465,832,442 | $7,455,367已知子项 | $458,377,075候选 |

30日原始父级减Mobile后的F=$159,514,205、R=$49,859,813；产品组成和分别$159,514,204.65/$49,859,812.65，各有$0.35细分差额，不能按比例填平。R/F=31.26%、H/R=47.98%、H/F=15.00%。H比值仅是烧毁估值与收费统计的比较，不是实付回购比例。365日因2026-05-21 Mobile缺记录，上表仅为已知子项候选重算，完整去重额仍未知。

Terminal R有真实负项：2026-07-21为−$13,289（Solana−$13,339+BSC$50），2026-09-03为−$7,451（Solana−$7,552+Base$101）；费用减当日cashback/referral钱包支出可以为负，不能截成0或当缺失。

30日归一化F−R统计差额共$109,654,392，产品差额：发行 $13,583,950、Swap $93,433,579、Terminal $2,636,863。这支持合并剩余部分，但没有充分数据把它再拆成 LP、每种 creator、referral、cashback 各一条有精确金额的边。

稳定的每日去重判定：

1. 校验独立 child 的 id、链、`doublecounted` 与预期 methodology，父级 child 的名称/id/URL 也必须对应。方法变化时停用规则并标记待核查。
2. 对当日按各链child求和；若父级总值约等于包含Mobile的全部child和（当前误差容忍$1/日），取原父级金额减Mobile。若上游已去重则保留原父级，不能再扣一次；子项取整差额留作composition对账，不能以child合计替换父级。方法判定如有歧义则保持待核。
3. 只有 Solana 的精确 Mobile key 可按这个规则处理，不要按名称模糊匹配其他产品、其他链。检查Mobile费用/收入数值非负、未超过对应launchpad+Swap，单独child时间戳匹配可作为持续对账；Terminal净收入允许带符号，费用/回购统计的非负约束不能套到它。
4. 源码起点以前无Mobile不重复扣；从源起点起应有记录却缺Mobile key时，即使父级与其余产品相加一致，也不能据此证明该子集为0或上游已去重。保留当日去重未知，完整跨该日窗口也未知；可另列已有子项候选合计。无法对账时不估计扣除值，不将部分可去重日混入原始父级日而隐藏方法变化。
5. 2026-05-21 之前，只能说当前 adapter 识别的 app program 尚未启动（源码给出的 first tx 日）；不能说历史上没有任何手机端用户或交易。2026-05-21 当日源码起点与 API 首日存在一天差异，不能据缺记录直接判费用为零。2026-05-22 后本次 133 日均实证出现子项并可去重。

### PUMP 回购与烧毁不能推导的数

- H30 = $23,922,255，H365 = $281,833,707。当前源码把已知 burn 钱包的数量用 `addCGToken('pump-fun', pumpBurnt, ...)` 估值，因此 H 定义不是逐笔买币的花费。不能用 `R-H` 算留存现金、`H/R` 算实际现金分配率、`H×50%` 再算代币捕获。
- 这些 H 全部在 `pump.fun` 子项出现，另外三产品为零。这是集中记录全产品烧毁的所在地，不能据此推出回购只用 launchpad 收入。
- adapter R 含 Mayhem，官方合格回购 Revenue 明确排除 Mayhem。历史毕业费用和产品/估值时点也需对账；不能简单对合并 R 乘 50% 作为已实际支付的现金。
- 官方 2026-04-28 是历史库存烧毁与后续承诺变更事件；存量烧毁必须与后续持续收入回购分开。但**本次保存的 H 序列是否纳入那次约 129B PUMP 库存事件，尚不能确认**：4 月 27/28/29 日分别只有 $808,249 / $1,536,333 / $677,827，历史序列亦没有对应大额库存的明显峰值。不能仅凭日期列表就删除 4 月 28 日全部 H，也不能断言当前 H365 已包含那次库存。
- 当前 API 元数据指向 burn 源码，历史序列可能来自较早回购方法/历史回填；具体转换边界未核实。365 日图应保留“历史方法与库存事件尚未对账”，不可把全年 H 当成同口径持续现金回购并年化。旧政策 100% 和当前 50% 也不能混用。

### PUMP 来源与额外证据快照

1. [官方 PUMP 台账和方法](https://pump.fun/pump-token)：2025-10-24 起全产品 Revenue 的范围；排除 Mayhem，净 referral/cashback；2026-04-28 起 50% 一年承诺。官网同时提示部分 custom-pair 的 dashboard fee/buyback 统计暂有错误，应把台账标为官方自报。
2. [官方费率页](https://pump.fun/docs/fees)：2026-05-20 更新；平台 web/mobile 没有一项独立新业务收费，部分手机交易费调整可能流向创作者/用户/referrer；因此不能凭手机费率例外将整个 Mobile child 重新加入合计。
3. [发行/全产品 burn 适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/pumpdotfun.ts)、[PumpSwap](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/pump-swap/index.ts)、[Terminal](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/trading-terminal/index.ts)：收费/分成定义、Mayhem、全产品 burn 汇总及 Terminal 支出时间口径。
4. [Mobile 固定源码版本](https://github.com/DefiLlama/dimension-adapters/blob/9bd52fb339e32e05fa975ab9b86b73db2fb0b01e/fees/pumpfun-app.ts#L143)：截至核查最新文件提交与 `doublecounted`。`research/evidence/pump-mobile/mobile-adapter.ts` SHA256 `9cdf014e84c95a5f5eb63dcafa3e975ad2b200ba0f441cf972fcc8c72d0f0ec8`。
5. [独立 Mobile F API](https://api.llama.fi/summary/fees/pump.fun-mobile-app?dataType=dailyFees)：原响应 SHA256 `245cc35d79773405027d503df16bd069f56348b8a253e42f02907b8ca0f07965`；[独立 Mobile R API](https://api.llama.fi/summary/fees/pump.fun-mobile-app?dataType=dailyRevenue)：`37b6b243d5c717d008590c06b4e3f44eabb2cd4c9d2f1d82c7e17d62afa651a9`。当前 parent 再抓原响应 hash `5c332d07f5a9c89890a151d25913f5b783c2cb3564861a46f94552cd258bb5c7` 与原缓存 meta 的原响应 hash 一致。
6. 以上新响应/源码均在 `research/evidence/pump-mobile/`，同名 `.meta.json` 保存 URL、抓取时间、hash；`audit-result.json`保存原始逐日对账结论及child重建候选窗口；最终实现改取原父级减重复项，区别见`normalization-correction.json`，原审计响应/结果不改写。其 SHA256 `5ec97be865c4c20c238303d99e6a6620ad45c6ef85ab356304fd4d7db23e0a16`。
7. 原金额来自 `data/raw/llama-pump-{fees,revenue,holders}.json` 与各自 meta；用户界面应保留原始数据，并另标去重口径及方法，而非覆盖原数据。
