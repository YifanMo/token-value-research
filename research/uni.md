# UNI：费用兑换、经济销毁与流通释放研究

研究基准日：2026-10-02（Asia/Shanghai）；收入口径更正于 2026-10-03。本文行情例示保留首次读取的 2026-10-02 10:58:30 UTC 历史快照，不能混用于随后更新的 dashboard。本文区分「提案」「以太坊治理执行」「目标链生效」「销毁最终到账」，不把它们当成同一天；本文件是可复核研究记录，不给出买卖指令。

## 主要判断

UNI 已启动协议手续费资产换取 UNI、再经济销毁的机制，但当前 API 没有独立量出真实协议手续费收入和现金买入成本。最容易高估的部分包括：把 LP 总手续费当成 UNI 收入，把兑换 UNI 的美元估值当作营业收入，把一次性金库销毁 1 亿枚当成年度回购，把未行使的 2% mint 权限当成已经发生的增发。与此同时，2026 年起每年 2,000 万枚 UNI 的 Labs growth budget 是必须跟踪的金库释放；因此「有效总供应收缩」和「可交易流通供给上升」可以同时成立。预算可领取、实际转出与自由流通并非同一事实。[UNI 文档](https://developers.uniswap.org/docs/ecosystem/governance/uni)、[DUNI 年报](https://vote.uniswapfoundation.org/forums/7/duni-q4-and-year-end-2025-financial-statements-and-tax-update)

## 收入口径更正：API revenue 是兑换估值

**此前将 DefiLlama `dailyRevenue` 称为“协议手续费应计”的解释撤回。** 固定到 adapter commit `3e56fc842b3d26aac2648a5a506cd282ceb9b6ab` 后，`fetchHoldersRevenue()` 按各链 Firepit 的 `Released` 事件次数乘查询所得 `threshold()` 得到 UNI 数量，再估成美元；`dailyRevenue` 直接复制该值。API 名称不能替代其计算方法。[固定适配器源码](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/uniswap-v3.ts#L36)

本地 2026-09-02 至 2026-10-01 UTC 的 30 天缓存中，用户 swap 手续费为 **$197,185,791.55**，`dailyRevenue` 与 `dailyHoldersRevenue` 均为 **$15,204,293.00**。后一金额的可用名称为“用于费用兑换的 UNI 估值”，不是独立现金／协议费应计收入；两字段相等也不证明收入已 100% 现金回购。[保存的 revenue 响应](../data/raw/llama-uniswap-revenue.json)、[保存的 holders 响应](../data/raw/llama-uniswap-holders.json)

真实协议收入、P/S、协议收入占手续费比例、回购占收入比例在当前数据集均为 **未知**；已有同口径净利润来源仍可独立研究，但本次未取得。可以保留兑换估值占流通市值／FDV 的规模比率，须注明它不是营业收入倍数、现金收益或已核最终销毁收益率。**总手续费减去兑换估值的 $181,981,498.55 只是统计差额，不能叫 LP 已得分成、经营成本或利润。** 适配器的 supply-side 字段也用了同类相减方法，不构成独立 LP 付款证明。

缓存的 revenue／holders 版本分项全部挂在 V3 桶；V2／V4 的元数据明确说明兑换统计也合并在 V3 adapter。这是统计挂载位置，不能宣称全部来自 V3；V2／V4 的零也不证明它们没有协议收费。兑换统计可按执行链解释，不能直接当作费用来源链或最终主网销毁分布。更详细的同窗构成与绘图边界见[费用去向说明](flow-uni-notes.md)。

该估值仍有核验边界：查询所得阈值不一定能代表每个历史事件的实际阈值；跨链 release 不等于 canonical UNI 已送达主网 dead；执行者可使用已有 UNI 库存；释放的费用资产及 TokenJar 库存需要单独对账。因此历史事件研究须区分“费用产生”“费用资产归集”“UNI 兑换估值”“主网最终经济销毁”。

## 收入是什么，多少进入代币

用户兑换代币支付 swap fee；LP 提供资本和承担库存、价格及逆向选择风险，按配置取得其份额。协议 fee 是从总 swap fee 中划出的部分，才是费用兑换机制的资产来源。以下配置说明经济路径，不是本次窗口实际收入／LP 分成的测量。Uniswap Labs 过去的界面、钱包、API 费属于另一主体，不能加入历史 UNI token revenue；UNIfication 将这些收费归零。DEX 的成交需求可持续存在，但费用规模仍同时受币价、交易量、波动、DEX 市占率、路由竞争和流动性吸引力影响。协议收入并不等于经营利润；开发和增长还由金库 UNI 支出支持。[手续费配置](https://developers.uniswap.org/docs/protocols/protocol-fee/concepts/fees)、[UNIfication](https://blog.uniswap.org/unification)

| 已配置 v2 / v3 档位 | 总 swap fee | LP 获得 | 协议取得 | 协议占该笔 swap fee |
| --- | ---: | ---: | ---: | ---: |
| v2 | 0.30% | 0.25% | 0.05% | 16.67% |
| v3 1 bp | 0.01% | 0.0075% | 0.0025% | 25% |
| v3 5 bp | 0.05% | 0.0375% | 0.0125% | 25% |
| v3 30 bp | 0.30% | 0.25% | 0.05% | 16.67% |
| v3 100 bp | 1.00% | 约 0.8334% | 约 0.1666% | 约 16.67% |

这不是全协议统一的「收入回购比例」：要逐版本、逐链、逐池乘以生效覆盖率，再按真实 fee tier 的成交权重加总。v3 后续新增的低费率 tier 也需读取当前 adapter 配置，不能用上表推定所有档位。[官方档位表](https://developers.uniswap.org/docs/protocols/protocol-fee/concepts/fees)

2026-07-27 执行的 v4 第一批政策仅涵盖静态无 hook 池、CCA 池和 aggregator hook 指定 families。原生静态曲线在 LP fee 为 1 / 5 / 30 / 100 bp 时的协议费分别为 0.25 / 1.25 / 5 / 10 bp；aggregator 默认费非 Base 为 10 bp、指定稳定币对 3 bp，Base 为 3 / 1 bp。不能把所有 v4 交易套用 25%。[v4 执行案 #100](https://vote.uniswapfoundation.org/proposals/100)

Unichain 排序器 fee 是另一条费用来源；初始提案规定先扣 L1 数据成本及给 Optimism 的 15%，剩余进入 UNI burn。当前父级 `dailyFees` 中的 Unichain 分项是 DEX swap 费，不能用它推算排序器费、L1 成本或 Optimism 分成。研究应记录各自基数和实际转入值；本次没有独立量化排序器净收入。[UNIfication 排序器政策](https://blog.uniswap.org/unification)

## 「回购销毁」的实际路径及漏损

各链 Fee Adapter → TokenJar → searcher 交 UNI 换取累积手续费资产 → 主网 `0xdead`。主网 Firepit 并不直接拿美元在交易所下单；searcher 可以使用已有 UNI 库存。它创造 UNI 需求和不可回流供给，却不能单凭 release 事件证明同笔 UNI 曾在公开市场买入。其永久销毁结果比协议可再花费的金库持仓更强，但持币者没有直接按份索取手续费的权利。[协议费用架构](https://developers.uniswap.org/docs/protocols/protocol-fee/overview)、[Firepit 源码](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/releasers/Firepit.sol)

名义上收集到的协议费进入 burn 路径，实际「手续费资产 USD」与「最终销毁 UNI 的 USD」并非精确一比一：searcher 保留价差以覆盖 gas、桥接、价格风险和搜索成本；TokenJar 中低价值/难出售资产可能滞留；每次 release 至多选择 20 项资产；阈值与价格突变也可能增大执行者价差。治理还可更换 Releaser。因此必须同时记录 accrued protocol revenue、fee assets released、burn finalized、库存和执行差额。[ExchangeReleaser 源码](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/releasers/ExchangeReleaser.sol)

跨链 synthetic UNI 的 burn 是解除对应主网锁定的桥接流程，不是额外 UNI 增发；主网销毁到账前列为 pending，到账后只计一次。Arbitrum/Orbit 等路径的挑战期造成时间差；Wormhole NTT 路径也需核实对应主网 canonical UNI 已发至 burn 地址。[Robinhood #99](https://vote.uniswapfoundation.org/proposals/99)、[Arc #102 技术说明](https://vote.uniswapfoundation.org/proposals/102)

## 供应结构与稀释

初始发行 10 亿 UNI：社区 60%（金库 43%、空投 15%、最初流动性挖矿 2%），团队及未来雇员 21.266%，投资人 18.044%，顾问 0.69%。团队、投资人和顾问合计 40%。这代表初始分配，不能推导 2026 年实际仍持有 40%；需要地址归属、转让和实际余额。[2020 初始公告](https://blog.uniswap.org/uni)

原公告写团队/投资人/顾问四年 vesting，且四年后有 2% 年通胀。原始合约实际上要求 minter 主动 `mint`，单次额度最多为合约 totalSupply 的 2%，两次 mint 至少间隔 365 天；不存在自动按年增加。当前官方文档明确尚未行使 mint 权限。基础情景记录 `actual_mint = 0`（官方陈述，未完成全量 mint 日志独立核验），另设 `potential_annual_mint = 20M` 的治理压力情景。[UNI 原始代码](https://github.com/Uniswap/governance/blob/ab22c084bacb2636a1aebf9759890063eb6e4946/contracts/Uni.sol)、[当前 UNI 文档](https://developers.uniswap.org/docs/ecosystem/governance/uni)

初始 vesting 日期有官方资料冲突：2020 公告的四年意味着常规终点在 2024；当前开发者页却称所有 vesting 在 2025-09 结束。两者不能同时作为精确解锁时间表。保守确定的是截至 2026 年原始四年 vesting 已结束；未来团队解锁不能继续照旧每月扣一遍。精确最后释放日仍需逐一核验 vesting 合约。这不排除已解锁团队/投资人继续出售持仓。

UNIfication 已批准两年共 4,000 万枚金库 UNI，2026、2027 每年 2,000 万枚，按季 500 万枚，可通过治理取消尚未 vest 的余额。2026-01-05 首笔 500 万枚转给 Labs 有 DUNI 官方年报确认。Etherscan 可见 2026-04-10、07-14 两次后续 `withdraw`，但本次无法读取 receipt 验证金额；结合未更改的默认季度 500 万枚，仅能推断累计可能为 1,500 万枚，不能声称已确认全量，更不能把转账等同全额卖币。2026-10-01 第四笔按计划可领取，但截至研究日是否实际领取未知。[DUNI 年报](https://vote.uniswapfoundation.org/forums/7/duni-q4-and-year-end-2025-financial-statements-and-tax-update)、[Vesting 合约](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/UNIVesting.sol)、[Vesting 交易列表](https://etherscan.io/address/0xCa046A83EDB78F74aE338bb5A291bF6FdAc9e1D2)

其他 grant、LP incentives、供应商支付、税务相关金库处置也会释放 UNI。2026-06-30 DUNI 金库为 275,104,000 枚；财报为未审计且只覆盖 DUNI 财务，不等于全 Uniswap 协议损益。[Q2 2026 财报](https://vote.uniswapfoundation.org/forums/56/duni-q2-2026-financial-statements-and-tax-update)

### 两种「总供应」

UNI 合约没有真正减少 `totalSupply` 的 burn 方法；Firepit 是把 UNI 转至 `0xdead`。应同时保留：

1. `contract_total_supply`：初始 1B + 实际 mint；dead 转账不使该值下降。
2. `effective_total_supply`：合约供应减不可用 burn 地址余额（经济有效供应）。
3. `circulating_supply`：供应商的流通定义；需保存供应商、时间和排除项。

本次 CoinGecko 快照：价格 $9.03；流通 625,268,422.61 UNI；供应商 total_supply 887,516,418.92；max_supply 1B；流通市值 $5,645,984,361；FDV $8,013,787,577。其 total_supply 显然不同于原始合约的 1B；按「无 mint、供应差全是 burn」假设，隐含总排除 112,483,581.08 枚，扣一次性 100M 后为约 12.484M。这个差值只是推断，未独立对账 dead 地址、无关 burn、桥接在途与供应商计算方法，不能冒充链上已核持续回购量。[CoinGecko API](https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=uniswap)

## 回购收益率和净供给的计算

令 `B_usd` 为同一窗口费用机制支持且最终完成的 UNI 销毁价值（按每次执行当时价格估值）。`B_uni` 是相同销毁枚数；`M` 是实际 mint；`U` 是非流通转流通的团队解锁、金库和激励释放；`R` 是市场购入后永久退出流通枚数；`L` 是新增锁定枚数。当前 API 兑换估值记作 `H_usd`，在完成历史阈值、费用资产和主网最终到账对账前，不能无条件用它替代 `B_usd`。

```text
销毁收益率（流通） = annualized(B_usd) / circulating_market_cap
销毁收益率（FDV） = annualized(B_usd) / vendor_FDV
保守满额估值收益率 = annualized(B_usd) / (price × contract_total_supply)
经济总供应变化 = M − B_uni
可交易供给变化 = U + M_to_float − R − L
```

销毁金库中原本不流通的 UNI 不会当场缩减可交易供给。实际 searcher burn 的来源有可能是原有库存，`B_uni` 与同窗市场新购入的 `R` 也不应未经验证设为相同。因此 dashboard 可另展示「把所有 fee burn 当作浮动供给消除」的简化情景，但须标明假设。

2026-07-18 Labs 报持续协议 fee 累计支持约 7.5M UNI / $25.6M burn，2026-02 月 fee 约 $3.1M，2026-06 约 $5.1M。[Labs 治理说明](https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/17)

保留早期调研的口径示例：把 **官方作者所报 2026-06 单月 $5.1M × 12 = $61.2M** 与 **2026-10-02 历史行情快照** 相除，会得到流通规模比率 1.084%、供应商 FDV 规模比率 0.764%、1B 合约供应 FDV（$9.03B）规模比率 0.678%。这些数既不是当前 API 测得的营业收入／P/S，也不是独立验证的已完成销毁收益率或年度预测。以同一 $9.03 恒定价格作算术换算约 6.78M UNI/year，低于 20M/year growth budget；后者同价等量抵消约需 $180.6M/year。该比较假设金额能等值换成最终烧毁 UNI，未验证执行价差、未来价格或预算实际流通，仅展示两种供给口径为何可能得出相反结论。

## 经济模型变更时间线

| 日期 | 事件与验证状态 | 研究事件编码 |
| --- | --- | --- |
| 2020-09-16 | UNI 发布及初始分配；四年 vesting / 未来 mint 权限 | supply_genesis |
| 2024-03-06 | UniStaker 治理改善 Snapshot 通过；尚不等于开 fee | proposal_vote |
| 2024-05-31 | 官方治理作者延期 onchain vote；不可回填为已开始手续费分红 | proposal_delayed |
| 2025-11-10 | UNIfication RFC 发布，宣布 burn、排序器回流、Labs 对齐 | policy_announcement |
| 2025-12-25 | UNIfication 最终投票通过；有 timelock，尚需执行 | policy_passed |
| 2025-12-28 | Agora #93 HTML 显示 EXECUTED；初始主网 v2 + selected v3、100M treasury burn，季度预算授权 | policy_executed / one_time_treasury_burn |
| 2026-01-01 / 01-05 | 第一季 5M treasury UNI 可领取 / 已实际转出 | treasury_release_eligible / confirmed_transfer |
| 2026-02-18 | 提出扩大八链与主网 v3 全池 open adapter | policy_announcement |
| 2026-03-07 / 03-08 | #94 / #95 执行；以太坊消息执行与目标链生效分开计 | governance_execution |
| 2026-06-01 | #96 执行 BNB/Polygon；修复先前批准但未成功执行的 Celo | execution / failed_execution_fix |
| 2026-07-07 | v4 开费提案发布 | policy_announcement |
| 2026-07-27 | #99 Robinhood v2/v3 与 #100 v4 第一批七链 EXECUTED | policy_executed |
| 2026-09-18 | Arc 扩链提案发布 | policy_announcement |
| 截至 2026-10-02 | #102 Arc 仍 ACTIVE，投票页面称 10-03 结束；不得计作已执行 | proposal_active |

来源：[2024 官方延期](https://gov.uniswap.org/t/temperature-check-activate-uniswap-protocol-governance/22936/124)、[#93](https://vote.uniswapfoundation.org/proposals/93)、[#94](https://vote.uniswapfoundation.org/proposals/94)、[#95](https://vote.uniswapfoundation.org/proposals/95)、[#96](https://vote.uniswapfoundation.org/proposals/96)、[#99](https://vote.uniswapfoundation.org/proposals/99)、[#100](https://vote.uniswapfoundation.org/proposals/100)、[#102](https://vote.uniswapfoundation.org/proposals/102)。

需明确保留的日期冲突：DUNI 年报称 #93 于 2025-12-27 执行，Agora HTML 为 12-28 23:35，DefiLlama prose methodology 写 12-28；但本次固定 V3 适配器的 Ethereum `feeSwitchDate` 是 **2025-12-29**。治理执行、方法文字和事件跟踪起点不是同一证据，不能合并成已核的精确 UTC 生效日；上表保留治理页面日期，精确时间待执行交易 block timestamp 仲裁。当前 UNI / fee configuration 文档仍写 selected v3 和仅 v2/v3，但 #94 / #100 执行页已显示扩大范围；研究不可只靠未注明更新时间的文档概述。v4 其余五链第二批本次未找到独立执行案，不推定已生效。

## 改变后是否改善：证据和事件研究

官方 Labs 报告上述费用支持的持续销毁及月度数值提升；这是作者报告，不能拿 API 的同名 revenue 字段当作第二份独立协议收入验证。Labs 同时报告主网 top-25 v3 池保留 98.5% 原 token 数量流动性，Base top-25 达 131%；对应成交量主网下跌 20% 对比整个 Ethereum DEX 下跌 62%，Base 为 -31% 对 -36%。这些是提案方提供的样本和市场对照，显示开费不必然驱赶 LP，但尚非独立因果识别。[Labs 2026-07-18](https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/17)

费用或兑换估值提升可能同时包含「收费覆盖链扩大」「开更多池」「价格与交易周期变化」，不能全部归因政策改善。建议分别研究公告日的超额价格反应（UNI 对 BTC/ETH/DEX basket）与执行后的费用资产收入、兑换 UNI 数量、已完成经济销毁、market-adjusted TVL、链内市占率、成交 pair mix、LP 净表现；公告前后 7 / 30 / 90 日窗口和对照组都保存。独立费用收入未取得时，该结果项保持未知。重叠变更期用分批事件，不能仅以 100M 一次销毁后的供应下降来证明经营模式改善。历史快照单点 $9.03 无法给出任何价格因果结论。

## 本地数据接口及未解决问题

| 数据 | 推荐来源 / 接口 | 必须注意 |
| --- | --- | --- |
| 用户 swap fee | DefiLlama `https://api.llama.fi/summary/fees/uniswap?dataType=dailyFees` | 是父级总手续费统计；子项只解释构成，不能重复加回父级 |
| UNI 兑换估值 | 同父级 `dataType=dailyRevenue` 或 `dailyHoldersRevenue`；对应 V3 适配器源码 | 两字段来自同一 Firepit 统计，不是独立协议收入；V2／V4 集中挂 V3 桶，不可按版本零值推断收入 |
| 协议实际费用资产收入／LP 分成 | Fee Adapter、TokenJar 资产归集／余额／释放与逐池 fee 配置对账 | 本次未取得独立同窗 USD；`dailySupplySideRevenue` 算术差额不能替代完整 LP 分成证据 |
| 历史成交量 | `https://api.llama.fi/summary/dexs/uniswap` | 与用户费用、协议费、兑换估值分别保留，不混作收入 |
| 价格、流通、FDV | CoinGecko markets + `coins/uniswap/market_chart/range` | Public 历史窗口可能受付费限制；保存 updated_at；供应商 FDV 与1B合约口径分开 |
| 执行状态和 tx | `vote.uniswapfoundation.org/proposals/<id>` SSR HTML | #93/#95 web 工具间歇超时，直接 HTTPS HTML 可读；显示时间未声明时区 |
| 主网最终 burn | UNI `Transfer` logs，to=`0xdead`，区分 from=Timelock 一次性100M与releaser | 只计 finalized 主网一份；searcher market buys 另查；无关用户burn排除 |
| 新增 mint | UNI `Transfer` from zero + `totalSupply()` | 上限是权利，新增 mint 才是当期总供应稀释 |
| 金库释放 | `UNIVesting.Withdrawn` + UNI token transfers，recipient和数量；金库其他转出 | 领取权、转出、出售、流通定义四者不同 |
| 生效覆盖链/池 | 当前 factories 的 feeTo / owner，v3 adapter、v4 PoolManager controller | 主网提案 EXECUTED 不足以证明所有目标链已完成 |
| burn 资产多样性 | Dune query `https://dune.com/queries/6711845` | 本次只读到空壳；需要 Dune API key / query export 才能复核结果 |

核心地址（主网）：UNI `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`；TokenJar `0xf38521f130fcCF29dB1961597bc5d2B60F995f85`；Firepit `0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721`；UNIVesting `0xCa046A83EDB78F74aE338bb5A291bF6FdAc9e1D2`；V3OpenFeeAdapter 正确地址 `0xf2371551Fe3937Db7c750f4DfABe5c2fFFdcBf5A`。#94 原文字曾写另一地址，官方作者已更正，不能从旧提案 prose 直接导入。[当前部署表](https://developers.uniswap.org/docs/protocols/protocol-fee/deployments)、[官方更正](https://gov.uniswap.org/t/temp-check-protocol-fee-expansion-eight-more-chains-and-remaining-mainnet-v3-pools/26035/5)

本次公共 Ethereum RPC POST 和 Etherscan/Blockscout receipt 读取均被 403 拒绝，未完成独立 burn / mint / quarterly treasury receipt 对账。该缺口应标成 `unknown`，不以宣传百分比填补。
