# JUP 与 RAY：收入、价值传导和供应审计

核验日期：2026-10-02（北京时间）。本文区分**已核实政策文本、政策推算、第三方报道、未核实执行**。同日行情取项目内 `data/raw/coingecko-markets.json`；历史政策不能直接充当未来保证。

## 可复用的核心判断

1. 交易手续费不是协议收入；协议收入也不是实际回购。应保留 `gross fees → revenue after LP / integrator / partner shares → buyback allocation → executed buyback → destination` 五个字段。
2. 回购进金库、暂时锁仓、永久销毁分别记账。**总供应通缩**看铸币减销毁；**自由流通收缩**看储备释放、解锁、金库外流减永久销毁、实际新增锁仓/金库净留存。已流通币重新分配的 ASR 可以不增加数据供应商的 circulating supply，却增加可交易卖压。
3. JUP 和 RAY 的 DefiLlama `dailyHoldersRevenue` 都包含按比例计算的回购预算。本次读取的 adapter 没有逐笔核实实际支付的美元金额或最终销毁，故只能标为**政策应计代理值**。
4. 金库币要保留重新释放可能性；若单独计算 float-adjusted 市值，先核对供应商是否已从 circulating 中扣除回购金库，避免二次扣减。

## 当前行情快照与供给分母

| 项目 | 价格 USD | reported 流通量 | reported 总量 | reported 流通市值 USD | reported FDV USD |
|---|---:|---:|---:|---:|---:|
| JUP | 0.329467 | 3,319,369,204.37 | 6,861,486,492.127128 | 1,093,721,154 | 2,260,837,063 |
| RAY | 1.96 | 269,863,602.195736 | 555,000,000 | 527,353,195 | 1,084,551,681 |

行情 `last_updated=2026-10-02T11:03:20.000Z`（北京时间19:03:20）。来源：[CoinGecko markets API](https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=jupiter-exchange-solana,raydium)。JUP 的 CoinGecko `max_supply` 仍为 10B，但官方已执行 3B 销毁，当前 total≈6.861B；因此不能不加说明地用旧 10B 计算 FDV。reported FDV 和 `price × current total supply` 也可能因不同刷新时点略有差异，须保存各自原始值。

## JUP：收入真实，收入分成须按产品拆开

| 业务 | 用户付费/收入来源 | 可归属 Jupiter 的收入 | 进入 JUP 的政策份额 |
|---|---|---|---|
| Ultra 聚合交易 | 平台费；底层 DEX 的 LP 费不能全部归 Jupiter | adapter 以平台 fee authority 到中心钱包的转账衡量 | 2025-02-17 起 platform revenue 的 50% |
| Perps | 开平仓、流动性进出、swap、清算、funding、price impact 等费用 | adapter：gross fees 的 25%，其余 75%给 LP/JLP | Jupiter revenue 的 50%，即此口径 gross fees 的 12.5% |
| DCA / Limit / Trigger | 执行费、平台费及部分交易盈余 | adapter 对归 Jupiter 的收款计为收入 | 50%；2026-03-10 起 Trigger V2 与 aggregator 重叠，汇总需要去重 |
| JupLend | 借款人利息 | 先扣出贷方所得；剩余 reserve 收入中 Fluid 50%、Jupiter 50% | Jupiter 所得再 50%回购；绝不是全部 borrower interest 的 50% |

以上是所读 adapter 的计算方法，不证明每一笔预算均已完成买入。来源：[aggregator adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter.ts)、[Perps adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-perpetual/index.ts)、[DCA / Trigger adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-dca.ts)、[Lend adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/jupiter-lend/index.ts)。aggregator adapter 的最新相关 commit 为 `485b9f65e2742ecc32721041965e3430bd8b93bb`（2026-08-30）。

真实收费来源能在链上看到，并非单纯靠发行 JUP 形成“收入”。但交易、杠杆和借贷需求仍受资产价格、活跃度、投机及费率竞争影响；“多产品”不等于与市场周期脱钩。评估可持续性应分别监测交易量、费率、独立付费用户、LP/partner 分成、补贴，以及市场低迷时的协议所得。

## JUP：时间线和政策状态

| 时间 | 事件 | 研究中的记账状态 |
|---|---|---|
| 2024-08-01 | 提出供应 10B→7B，团队管理与社区各承担 1.5B 销毁 | 提案日；不能作为执行日 |
| 2025-01-26 UTC（北京时间01-27） | 官方社区审计披露执行销毁 3B | 已独立RPC解析burnChecked：UTC17:24:50；仅 32.7M 来自当时流通，2,967.3M 来自非流通 |
| 2025-02-17 | 50%回购预算开始收集，adapter 从这天记 holder revenue | 应计/资金拨入起点，不等于首笔买入日 |
| 2025-02-25 | 创始人确认 Accumulation Plan 已启动；Blockworks 时间线列实际回购启动 | 初次执行日期有研究时间线支持，首笔链上交易未独立解析 |
| 2025-10-28 | DAO 提案对当时约 130M Litterbox 库存表决是否销毁，并明确将未来50%收入用途另作第二个问题 | 只对已有库存；不能推导未来全部买入会自动销毁 |
| 2025-11-25 | Blockworks burn dashboard 记录约 135M Litterbox burn | 数据提供商记录；本次未独立核对 SPL Burn 指令/完整交易清单 |
| 2026-02-13 | Net-Zero Emissions 官方提案公布 | 机制文本已核实；官方最终投票结果和执行交易本次未取得 |
| 2026-02-22 附近 | 多个社区/第三方来源称约75%支持 Net-Zero | 通过及执行状态未独立核实，不能直接填未来12个月释放=0 |
| 2026-05-30、07-31 等 | 有社区提案要求提高至70%或建立更明确 burn 模式 | 属社区建议，未发现批准执行依据；现有50% adapter不能自动改为70% |

来源：[2024供应减少提案](https://discuss.jup.ag/t/proposal-enhance-certainty-for-jup-holders-and-community-via-a-token-supply-reduction/20919)、[2025-02社区审计](https://discuss.jup.ag/t/jup-community-audit-feb-2025/34764)、[创始人 Litterbox 原始承诺](https://meow.bio/jup-4.html)、[Burn the Litterbox 提案](https://discuss.jup.ag/t/new-dao-vote-proposal-to-burn-the-litterbox/39627)、[Blockworks 项目历史](https://app.blockworks.com/projects/jupiter-exchange)、[Blockworks burn dashboard](https://blockworks.com/analytics/jupiter/jupiter-jup-token/jupiter-jup-burned)、[Net-Zero 提案](https://discuss.jup.ag/t/proposal-net-zero-emissions/39948)、[70%社区提案](https://discuss.jup.ag/t/increase-the-litterbox-buyback-allocation-from-50-to-70/40136)。

原始 Litterbox 承诺是未来两年把50%协议收入交给独立 Trust，用于战略积累。初期锁仓报道为三年，而非销毁。两年承诺窗口结束后的持续性、未来新回购库存如何处置应设成待复核事项；不能把当前 adapter 的永久 0.5 常量当作永久财产权。

## JUP：供应和稀释的三个层次

2025-02 审计确认团队原始分配经销毁降至 **1.4B / 7B=20%**，Mercurial stakeholders 降至 **350M / 7B=5%**；“团队管理50%”包含战略、流动性等储备，不能全部归作员工权益。官方2026提案披露 ParaFi 购买 $35M JUP 且锁定不能治理投票，但本次未获得其币数、完整锁定结束日期；不能把 Mercurial 5%当作全部投资者比例。

历史基线为团队每月约38.888889M，Mercurial每月14.583333M；团队首年 cliff 466.666667M 虽被报告为 circulating，却自愿追加锁仓两年。该统计例子证明 reported circulating 与自由流通不一致。**这些是2025审计基线，2026政策可能覆盖，不能无条件延长。**

Net-Zero option 2 机制为：700M Jupuary 返回 Community Cold Multisig且须未来 DAO 再投票才能使用；团队改为表内 JUP credit，有出售需求由 Jupiter 直接接手；Mercurial 加速归属，监测卖出/转CEX后由团队资产负债表买等量币进入团队金库。这是减少流通卖压的资金政策，**不是销毁 team/Mercurial 分配，也不是链上禁止未来释放**。抵消买入用团队资产，需与 Litterbox 收入资金分开，避免重复计数。[官方 FAQ](https://discuss.jup.ag/t/faqs-net-zero-emission-proposal/39974)。

ASR 官方仍为50M/季，按相同运行速度为200M/年；其来源是过往未领取的 Jupuary，官方已计为 circulating，故不是新的铸币或必然 reported circulating 增量，但转到可交易用户会增加有效卖压。未来四季预算、领取率、回到冷库的未领部分须单独追踪；200M是**政策运行速度情景**，并非已审计的未来发行量。

## RAY：12%分母及金库去向

| 产品 | 交易 gross fee 分配 | 回购资金占非LP收入 | 去向 |
|---|---|---:|---|
| AMM v4 | LP88%，RAY回购12% | 在此费用流中100% | 协议公开地址持有 RAY |
| CLMM / CPMM | LP84%，RAY回购12%，treasury4% | 在此费用流中75% | 协议公开地址持有 RAY；另有USDC treasury路径 |
| Pool creation | Standard/CPMM 当前0.15 SOL | 官方费用页未规定全部按12%回购 | 独立SOL资金流，不混入swap公式 |
| LaunchLab | bonding curve三项费用：Raydium protocol、platform、creator | adapter将Raydium所得protocol fee的25%列为holder revenue、75%为protocol revenue | adapter文字称buyback and burn；尚未取得实际RAY销毁归因，不能直接认定burn |

0.25% swap fee 的池子，1000 USDC成交收费2.50 USDC，其中0.30 USDC用于RAY回购，约为成交额0.03%。AMM相关现行官方仓库文档明确回购的 RAY **held by protocol**；不是销毁地址。LaunchLab另有adapter声称burn，证据冲突见末尾补充。来源：[官方回购文档](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/ray-buybacks.mdx)、[协议手续费](https://docs.raydium.io/raydium/protocol/protocol-fees)、[官方金库地址](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/treasury.mdx)。

所读 [Raydium adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/raydium/index.ts) 用官方 pool API 的24h `volumeFee`，剔除部分低TVL低费池，再计算 `holdersRevenue=12%×fees`、`protocolRevenue=4%×(CLMM+CPMM fees)`；`revenue=两者之和`。因此 **Raydium AMM子协议** 的 holdersRevenue/revenue 随池型组合落在75%–100%，不是12%。此 AMM adapter 本身不覆盖 LaunchLab；但DefiLlama的Raydium父级已汇总AMM与LaunchLab，父级比率可低于75%。建池、validator/perps等仍须另外核覆盖，不能据子协议值断言全公司全部收入分成，也不能据 adapter 的 start=2022-08-15 断言真实首笔回购发生于该日。

## RAY：供给、回购历史与周期验证

官方 token page 给出 max555M、mint authority disabled；mining reserve34%（188.7M）、partnership/ecosystem30%（166.5M）、team20%（111M）、liquidity8%（44.4M）、community&seed6%（33.3M）、advisors2%（11.1M）。community&seed 是合并桶，全部私人投资者比例未单列。团队和seed vesting在2024-02-21结束；并不意味着未发放储备永不入市。官方当前 mining reserve 释放约**1.9M RAY/年**，具体 farm/staking 可调整；这是固定cap内的流通释放。[官方 token page](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/index.mdx)。

历史首笔回购日期本次没有得到一手交易证据。Raydium 团队的2025Q4报告记载2021–2023累计投入$9.4M，故回购明显早于2024；其他报道把2024称“systematic buyback起点”应理解为执行规模/模式变化，不能覆盖早期历史。2025Q2推出LaunchLab、后续探索用单边SOL CLMM持仓转换RAY后撤出并存入回购钱包；2025Q4团队提出2026部署平滑和更清晰前瞻供应披露。任何新增 LaunchLab buyback 比例均应另查实际资金流。[Q4报告（含Raydium团队management commentary）](https://blockworks.com/api/investor-report/investor-relations-report/pdf)、[Q2报告](https://app.blockworks.com/projects/raydium/institutional-relations/q2-2025)。

Q4报告显示：LaunchLab revenue从2025Q3的$12.7M降至Q4的$1.5M；Q4 swap revenue为$5.4M（环比-60%），operating cash flow $7.6M（环比-72%）。Meme约占21%成交量却占87%swap revenue。团队还披露长尾币手续费的账面美元估值未必能完全变现回购。**有真实付费，不代表现金流稳定。**报告不同页面的全年总收入文字存在口径/数值冲突，本研究不直接使用其全年headline；对历史对比须沿同一表格重建口径。

## 可执行数据路径和仍需补全的证据

- JUP：mint `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`；Litterbox owner `6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX`（官方审计框架披露），社区冷库 `EXJHiMkj6NRFDfhWBMKccHNwdSpCT7tdvQeRf87yHm6T`。用 Solana RPC `getTokenSupply`、`getAccountInfo`、`getTokenAccountsByOwner`、`getSignaturesForAddress` + `getTransaction`；逐笔区分swap、内部转账、预算到账和SPL Burn/BurnChecked。RPC地址可配置，完整历史需要归档节点。
- RAY mint `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R`；回购持币 owner `DdHDoz94o2WJmD9myRobHCwtx1bESpHTd4SSPe6VEZaz`；CLMM fee `projjosVCPQH49d5em7VYS7fJZzaqKixqKtus7yk416`；CPMM fee `ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u`；AMM v4 fee `PNLCQcVCD26aC7ZWgRyr5ptfaR7bBrWdTFgRWwu2tvF`。这些中间钱包可能先持有USDC/wSOL/长尾币，余额增量不能直接等同回购。
- Raydium pool API：`https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=1000&page=1`；逐页按 programId 汇总。mining release需要从储备、farm funding、staking reward vault核对，不能仅看用户收到币重复累计。API/SDK可取 `rewardInfos` 的 `openTime/endTime/perSecond/mint` 后换算具体未来窗口。[API官方文档](https://api-v3.raydium.io/docs)。本次直连主要Raydium API返回403，未伪造实时 farm数据。
- DefiLlama公开 summary 端点示例 `https://api.llama.fi/summary/fees/jupiter?dataType=dailyRevenue`、`.../jupiter?dataType=dailyHoldersRevenue`、`.../raydium?dataType=dailyRevenue`、`.../raydium?dataType=dailyHoldersRevenue`。需要读取parent grouping和 `doublecounted` 标记；具体 slug/数据覆盖以接口返回为准。
- Discourse官方 JSON 可复现政策文本：`https://discuss.jup.ag/t/proposal-net-zero-emissions/39948.json`、`.../faqs-net-zero-emission-proposal/39974.json`、`.../new-dao-vote-proposal-to-burn-the-litterbox/39627.json`。作者身份和帖子内容状态须保存，社区提案不能升级为官方执行。

尚缺：JUP Net-Zero官方最终投票结果和执行清单；Mercurial表内/市场抵消买入实际金额与剩余权益；JUP未来四季ASR拨款；未来新回购币自动burn安排；RAY全部farms及treasury储备未来释放；两项目同口径历史自由流通量和每日实际回购支付。未知字段保留 null，不填0。

计算时同窗 `buyback yield = 实际回购现金支出 / reported MC或FDV`；政策应计金额仅作代理。`burn yield = 实际由收入回购并销毁币的对应现金成本 / MC或FDV`；不可把储备一次性销毁按当前价格冒充协议收入回购收益。RAY的回购持有政策不足以认定供应总量通缩；JUP的历史3B销毁只证明那次总量减少，不证明后续每年持续净通缩。

附：3B销毁执行由公共Solana RPC `getTransaction` 独立核验，交易 [`hVMkq…QQGW`](https://solscan.io/tx/hVMkqg6XJUrBykRF3L5JMJoVL8J3MEQrH1Apufw2oxXwXoJVN6b3U1CP71saHzghWmcPuqVyDpf6T6zMaanQQGW)，`blockTime=1737912290`，UTC2025-01-26 17:24:50／北京时间2025-01-27 01:24:50，inner `spl-token burnChecked` 数量3,000,000,000 JUP、decimals6、`meta.err=null`。历史事件日期须声明时区；公告使用Jan26，不应改为Jan28。随后批量请求供给/金库RPC遇到429，故未补充最新钱包余额。

## 2026-10-02补充：父级LaunchLab与burn标签的证据冲突

本地 `llama-raydium-revenue.json` 的Raydium父级包含 **Raydium AMM和LaunchLab**，不是纯AMM。对应30日revenue为$7,511,897，holdersRevenue代理值为$4,700,219，比例62.57%。前文75%–100%只适用于AMM子协议；加入LaunchLab的25%分成后，父级低于75%是合理的业务组合结果。

[LaunchLab adapter](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/launchlab/index.ts)当前读取TradeEvent的 `protocol_fee/platform_fee/creator_fee`，仅protocol fee归Raydium，其25%直接 `clone(0.25)` 记holdersRevenue、75%记protocolRevenue。methodology文字称“buy back and burn RAY”，但代码**没有读取RAY买入交易、支付美元或SPL Burn指令**。最新相关commit `6ac81236548dde55538cd601ca8d1a4050e0ffce`（2026-09-09）。因此该标签只能作为政策声称，不能替代实际执行。

[LaunchLab GlobalConfig](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/global-config.mdx)和[PlatformConfig](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/platform-config.mdx)说明protocol fee收取者及LP迁移分配；`burn_scale`烧的是**毕业池LP份额**，并不等于烧RAY。官方仓库的AMM回购页面则明确回购币存入协议地址。当前应标 **AMM回购持有 / LaunchLab burn声称待核**，收入资助的实际永久销毁金额填 `null`，不能填0，也不能把整个父级holdersRevenue全部记作burn。

另已用公共Solana RPC `getAccountInfo` 独立核对RAY mint：finalized slot `452596632`，`mintAuthority=null`、`decimals=6`、`supply=554997391047118`，即 **554,997,391.047118 RAY**。与555M名义初始/上限相差2,608.952882枚；这不支持把累计数千万枚回购视为全部烧毁，但这点差额的形成原因、窗口和资金来源未核实，不能当作本期收入回购burn。CoinGecko显示555M是供应商口径，应与该链上mint供应快照并列保存。官方仓库README自述community-maintained，政策矛盾应以最终链上mint与相关执行交易归因裁决。
