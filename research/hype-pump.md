# HYPE 与 PUMP：收入回流、供应稀释和政策变化研究

研究日：2026-10-02（Asia/Shanghai）。价格和供应以本地 `data/raw/coingecko-markets.json` 的时间戳为准；官网数字为抓取时页面快照，不能视为同一秒的市场数据。`verified` 表示核对过来源支持该描述，不代表第三方数据已独立完成全链审计。

## 关键结论

- **HYPE 不能继续只归类为“回购后进入可动用金库”**。2025-12-17 官方提出确认 Assistance Fund（AF）内 HYPE 已销毁，2025-12-24 完成权益加权共识；没有追加链上 burn 交易，而是确认系统地址无私钥且承诺不通过协议升级取出。当前官方 fees 文档明确其永久移出流通和总供应。历史研究仍要记录此前语义与会计口径的不确定性。[官方提案](https://t.me/s/hyperliquid_announcements/490)、[官方结果回顾](https://t.me/s/hyperliquid_announcements/497)、[现行费用机制](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
- **PUMP 的历史金库回购和现行永久销毁必须切开**。2025-07-14 起回购的代币曾存在金库用途不确定性；2026-04-28 改成未来一年用符合口径的净收入 50% 程序化回购并销毁，并销毁此前回购存量。故不能把当前 PUMP 一概描述为“回购但不销毁”，也不能把历史回购日和最终销毁日都计一次现金回流。[官网](https://pump.fun/pump-token)、[官方原帖链接](https://x.com/Pumpfun/status/2049232513541767594)
- 两者均不是股权或法律意义的利润分配权。回购减少供给/增加交易需求，不等同持有人收到现金，也不保证价格上涨。净供应判断至少需要两张表：总量变化和流通量变化。

## HYPE

### 收入来源与可持续性

主要来源是永续合约及现货交易的用户付费、HIP-1 部署竞价支付的 HYPE，以及 HyperEVM gas。用户交易有可观测的真实付费，但交易量、有效费率和市场份额仍具周期性。Funding 是多空之间转移，HLP 做市或清算盈亏是资金提供人的收益/损失，都不应直接加作协议经营收入。可观察收入集中于交易，不能因产品可用性好就视为非周期现金流。

现行官方规则把交易费用分给 HLP、AF 和市场部署人；市场部署人、builder/referral 收入、maker rebates、优惠档位会改变最终回流比例。所谓“99%”应应用于**符合条件且扣除相关外部分成后的协议费用**，不能直接乘全生态毛手续费。HIP-3 growth mode 还会下调协议费 90%。应持续追踪净 take rate＝符合条件协议费用/真实成交额，以及客户/市场集中度。[Fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)、[DeFiLlama 永续适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hyperliquid-perp/index.ts)

新增收入分散化候选是 AQAv2：稳定币部署人把其在 Hyperliquid 上供应对应的约 90% 成本调整后储备收益交给协议，30 日区间后 8 日进入 AF。该收入受稳定币余额、利率、发行人和成本调整影响。二级披露报告 USDC 2026-08-26 开始计提、2026-10-03 首次支付；研究日尚未到首次支付，不能把预计全年金额混进已执行回购。[官方 AQAv2 规格](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets)、[日期补充来源](https://app.blockworks.com/projects/hyperliquid/token-disclosures)

### 回流与销毁的证据边界

AF 地址：`0xfefefefefefefefefefefefefefefefefefefefe`。协议在 L1 执行层自动把交易费换成 HYPE；当前政策永久不可回流。HyperEVM 的 base fee 从 EVM 总供应扣除，priority fee 进入零地址；HIP-1 竞价 HYPE 属于直接支付销毁，区别于“现金回购”。这三项应分列，汇总只计一次。[HyperEVM](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm)、[HIP-1](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-1-native-token-standard)

DeFiLlama `dailyHoldersRevenue` 是分成规则应用于交易费用的**归属代理值**，另含 HIP-1 竞价销毁的日价格估值，不能冒充所有 AF 已成交买单的实际美元成本。适配器中的部分 priority fee 代码仍注释，AQAv2 不在该已核对部分代码中，故不能宣称覆盖全部销毁渠道。真正执行口径应获取 AF fills，逐笔合计 `size × fill price`，并与 AF 余额变动对账；历史数据需归档/索引器，因为公开用户 fills 接口有数量上限。

### 供应结构

初始经济最大供应 10 亿：Genesis 31%；未来排放和社区奖励 38.888%；核心贡献者 23.8%；基金会 6%；社区资助 0.3%；HIP-2 0.012%。官方明确没有私募投资人、CEX 或做市商分配；但“无 VC”不等于“无团队稀释”。贡献者锁一年，官方原始政策说大多数归属于 2027–2028 年完成、部分晚于 2028 年，未披露可独立审计的全体成员逐月未来表。[2024-11-28 官方 Genesis](https://hyperfnd.medium.com/hype-genesis-1830a4dc2e3f)

原始公告称 388.88M future emissions 为 **unminted reserve**；staking 文档称奖励来自此储备，400M 总质押量时奖励率约 2.37%/年。按此例计算约 9.48M HYPE/年进入奖励；这是条件化示例，不是研究日已验证的未来年新增量。储备发行可增加链上已铸币数量和流通，但不增加 10 亿初始经济上限。因此应同时保存 `minted_supply`、`remaining_reserved_supply`、`economic_total_after_burn` 和 aggregator `total_supply`，不要混为一项。[Staking](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/staking)

解锁服务广泛展示约 9.92M/月排期（238M/24），但实际分发可能显著低于该上限；官方推荐社区团队钱包追踪器。公开第三方 SEC 文件对归属年限/实际发放时点也有差异。**不能把 tracker 排期当实际进入流通，更不能把未发布的社区排放填 0。** 未来 12 月完整流通增量仍为 unknown。[团队钱包追踪器](https://www.qwantify.io/app/team-wallets)、[官方推荐位置](https://t.me/s/hyperliquid_announcements/498)

### 政策时间线

| 日期 | 已核对变化 | 证据/状态 |
|---|---|---|
| 2024-11-28 公告 / 11-29 TGE | 公布分配与贡献者一年锁仓 | 官方 verified |
| 至迟 2024-12-31 | 当时研究已观测 AF 持有回购 HYPE；准确第一笔执行日期未核实 | 同期 [Mint Ventures](https://research.mintventures.fund/2024/12/31/a-quick-overview-of-hyperliquid-current-product-status-economic-model-and-valuation/)，第一笔 unknown |
| 2025-08-26 公告 / 约 08-30 adapter 边界 | AF 97%→99%，HLP 3%→1% | 公告日期来自 [SEC 披露](https://www.sec.gov/Archives/edgar/data/2078856/000119312526370281/purr-20260630.htm)；有效日以 [helper 代码](https://github.com/DefiLlama/dimension-adapters/blob/master/helpers/hyperliquid.ts) 建模，边界仍需链上核验 |
| 2025-11-29 | 一年锁定期结束；归属、分发、出售分开统计 | 原始分配政策 |
| 2025-12-17 / 12-24 | 正式确认 AF burn：无额外链上动作；结果 85%赞成、7%反对、8%弃权 | 官方提案及回顾 |
| 2026 年 AQAv2 / 08-26 计提 / 10-03 首次支付计划 | 新增储备利息回流通道 | 规格 verified；具体启用和支付日期依赖二级披露，支付尚未到期 |

12 月确认是**存量会计/共识变化**；事件分析不应把当日确认的全部历史 AF 存量归因于那一天的经营现金流。政策后价格表现需相对 BTC/ETH/SOL 和永续交易同业调整，不能仅用 HYPE 上涨证明回购导致上涨。

## PUMP

### 收入来源与回流比例

交易服务包括 bonding curve、PumpSwap 和 Terminal。Bonding curve 现行毛费用 1.25%，其中协议 0.95%、creator/cashback 槽位 0.30%。PumpSwap 含 LP、creator、协议等不同收入去向，随资本规模和配对方式变动；Terminal 收入口径需扣 referral 和 cashback。**平台毛手续费不是 PUMP 可回购收入**。ICO 收入、金库资产升值、充值流水都不是营业收入。[官方费用表，更新于 2026-05-20](https://pump.fun/docs/fees)

官网自 2025-10-24 起定义用于政策计算的 Revenue＝bonding curve＋PumpSwap＋Terminal，覆盖列出的链，扣 referral/cashback，排除 Mayhem。2026-04-28 起 50% 程序化锁定用于 buyback-and-burn，期限一年。按 bonding curve 单独示例，代币得到毛用户付费的约 `0.95% × 50% / 1.25% = 38%`，不能宣传为所有用户费用的 50%。该 38% 仅为这一产品与当前档位示例，不能外推全平台。

Meme 热度、Solana 活跃交易、热门 token 集中度、bot 自交易、竞争 launchpad 是关键收入变量。真实缴费与可持续需求须分别评价：wash trading 也可能真实付费，却不能说明真实用户留存。新产品/Terminal 提供分散化可能，但在没有分产品净收入、付费用户留存和熊市样本前，不能当作已降低周期性的证据。

### 数据快照与限制

2026-10-03逐日核查确认，父级PUMP的Mobile child是bonding curve/PumpSwap交易的重复子集。统一30天窗口2026-09-02至10-01，原始父级F=$167,205,123、R=$53,599,784；按原父级逐日金额减去Mobile重复项后，**F=$159,514,205、R=$49,859,813**；父级与细分的取整差额留在构成对账中。R/F=31.26%；H=$23,922,255，因此H/R=47.98%、H/F=15.00%，后两项是burn估值的统计比值，不是实际现金回购比例。按统一$2.7221B流通市值/$4.8621B供应商FDV，R年化$606.63M，对应P/S=4.49x、FDV/收入=8.01x。[资金路径、去重证据与边界](flow-hype-pump-notes.md)

Terminal净收入定义为收费减cashback/referral钱包当日支出，可能出现负项；例如2026-07-21合计−$13,289、2026-09-03合计−$7,451。保留这些值，不截成零或判为缺失。Mobile源起点为2026-05-21，API首项却在05-22；完整365天窗口及跨05-21的事件后窗去重金额仍待核，已知子项候选合计不代表完整年收入。

2026-10-02 官网展示约 **$535.05M 的 90 日收入年化**、累计回购约 **$470.89M**、累计销毁 **169.30B PUMP**，最新日为 2026-10-01。官网还明确自定义配对推出后收入及回购 dashboard 有误、等待修正。故这组数字属于官方自报快照，并非干净审计结果。[官网数据及方法声明](https://pump.fun/pump-token)

官网市场卡仍显示总供应 1T、流通 399.46B，与其自身累计销毁及 CoinGecko 当前 total/circulating 口径冲突。本地研究应以统一 CG 快照估值，并把链上 SPL mint supply 核验单列；不要用官网流通配 CG 价格凑市值。

DeFiLlama 当前 PUMP `dailyHoldersRevenue` 源码读取 Allium 的 `burn`/`burnChecked` 数量，按当日 PUMP 市场价格估值，并聚合全部产品销毁、只挂在 launchpad 子协议。它不是历史逐笔回购真实成本，也不是单一 bonding curve 利润。不能再乘50%；不能与PumpSwap/Terminal重复相加；adapter R还含官方回购Revenue排除的Mayhem，不能对合并R直接乘50%当成实付成本。[原始适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/pumpdotfun.ts)

**对旧“4/28必然造成年累计跳升”的核验更正：**库存销毁确需与经常性流量分开，但此次保存的H历史序列是否已纳入约129B库存事件尚未确认。4月27/28/29日只有$808,249/$1,536,333/$677,827，未出现对应库存烧毁的大峰值。不能仅按事件日期删去整天H，也不能断言H365已含该库存；历史来源切换/回填和执行账尚待对齐。[原值与说明](flow-hype-pump-notes.md)

旧 `fees.pump.fun/api/buybacks` 当前请求返回 HTML（已测试），不能再当稳定 JSON API。可保留为来源线索，但采集器必须验证 content type/schema；需要改接官网新端点或 burn instructions。已披露执行账户：`99mRw3EzdJZWEUjgp1nrU4WeHsukUBjbh7gYE7pm4F3c`、`9jHrTCwpDANHLNQz5cem6XLUBM8KiTWKe766Br6KVCXM`。应查看账户发出的 burn 指令；这两个地址本身不是自动证明 irretrievable 的“黑洞”。

### 供应与解锁

初始最大总量 1T：ICO 33%；community/ecosystem 24%；team 20%；existing investors 13%；livestreaming 3%；liquidity/exchanges 2.6%；ecosystem fund 2.4%；foundation 2%。其中 ICO 33%还包含机构私售份额，不能把“existing investors 13%”当所有机构相关分配上限。通常统计的团队＋既有投资人明确为 33%。[Tokenomist allocation 页面](https://tokenomist.ai/pump-fun)、[2025 年官方分配公告的同期报道](https://www.cryptopolitan.com/pump-fun-reveals-pump-tokenomics/)

较可靠的已发布解锁信息是 2026-07-12 首个 insider cliff 82.5B（team 50B、investors 32.5B，各桶 25%）。二级链上报道称 07-15 实际向 121 个地址分发 57.279B，**entitlement、distribution、exchange deposits、sale**应四列记录。未独立逐交易核验前该 actual 数不宜标 chain-audited。[Tokenomist 2026-07-10 研究](https://tokenomist.ai/research/pump-tokenomics-what-the-july-12-2026-insider-cliff-means-for-a-fixed-1t-supply-2)

剩余内幕分配 247.5B。未来解锁源互相冲突：Tokenomist 上述研究明确剩余形状 undocumented；Blockworks TTF 后续称三年线性、6.875B/月；tokenomics.com 则列 9.1667B/月。community 24% 的释放表也不完整。**完整未来 12 月增量应为 unknown**，不能以“fully unlocked”FAQ 自动填零（该 FAQ 同页又称仅 46.5% unlocked）。可以场景建模余 247.5B/36 月＝6.875B/月、年 82.5B，但必须标 inferred/custom assumption，并把社区未知量保留空值。[Blockworks TTF](https://blockworks.com/token-transparency/filing/pump/f1c25ac2-1f7c-4d63-8f01-359f879fbe10)、[冲突 tracker](https://app.tokenomics.com/tokenomics/pump-fun/unlocks)

未发现现行 PUMP staking 增发机制；有上限不代表流通无稀释。2026-10-02 的公开 RPC 已核验 mintAuthority 与 freezeAuthority 均为 null，当前总供应见末尾链上快照；预留供应释放是否合约强制仍需核验。

### 政策时间线

| 日期 | 变化 | 状态 |
|---|---|---|
| 2025-07-09 公告 / 07-12 ICO | 1T 分配，33% sale，team20%+existing13% | 分配二级转载；原始 PDF 现在重定向官网 |
| 2025-07-14 | adapter 按 100%协议份额回购阶段建模 | 适配器 verified；逐笔第一单未独立核对 |
| 2025-09-15 | Project Ascend，creator 槽位 0.05%→0.30% | 适配器时间边界 verified |
| 2025-10-24 | Terminal 纳入官网 Revenue定义、扣 referral/cashback、排除Mayhem | 官方方法 verified |
| 2026-02-17 | Cashback Coins 以同一0.30%槽位替代creator | 适配器时间边界 verified |
| 2026-04-28 | 历史回购存量销毁；未来50%净收入一年程序化buyback-and-burn | 当前官网 verified；原帖存在但此次取正文失败 |
| 2026-05-21 | 可用USDC配对 | 官方fees verified；自定义pairs带来dashboard口径故障 |
| 2026-07-12 / 07-15 | insider cliff资格82.5B / reported分发57.279B | 二级证据，不能当已售出 |

## 本地模型的落地规则

`total_net_supply_delta = newly_minted - permanent_burn`；`circulating_net_delta = actual_unlock_distribution + circulating_rewards + treasury_release - burn_from_circulating - irreversible_new_locks`。只解锁到可领取未分发不能自动算流通；可随时解锁的普通staking不能计永久供给缩减。

现金回购收益率＝经常性实际回购USD运行率/统一流通市值（另以 economic FDV 算）；直接销毁收益率＝经常性直接销毁token×同日估值/同一分母。若仅使用 DeFiLlama holder revenue，则名称应是 **“代币回流代理收益率”**，随值展示 HYPE＝fee-allocation＋auction-burn proxy；PUMP＝onchain-burn日估值。不能把两者合成“实付现金回购排名”。

供应阈值场景：给定价格 P，未来流通新增 U，抵消它所需回购预算约 `P × U`；PUMP 若假设一年释放82.5B，且50%净收入回购，则需要年净收入约 `P × 82.5B / 0.5`。HYPE 可设 actual contributor distribution、staking reward reserve draw、other reserve release 三个参数，未来完整 U 未知时最终“净通缩/通胀”输出必须是待核验。

事件验证应以公告日和生效日分开，统一 UTC 日边界；计算前后30/90日付费收入、用户、份额、净fee rate、真实burn数量及流通变化；价格相对 BTC/SOL/同业的变化只可称相关表现。不要把会计存量确认、一次性burn或市值波动认作回购使经营改善。

## 已实测可用的数据入口

- `GET https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyHoldersRevenue`：截至2026-10-01，30日 $55,355,695，7日 $10,542,172，24h $1,442,742；归属代理值。
- `GET https://api.llama.fi/summary/fees/pump?dataType=dailyHoldersRevenue`：同日，30日 $23,922,255，7日 $7,984,966，24h $1,200,599；burn日估值代理。
- 同地址改`dataType=dailyRevenue`读取原统计字段，必须先审查语义，不能无条件称收入；例如UNI对应费用兑换UNI的估值，独立收入与P/S待核。`dailyFees`看用户费用；parent/child不能盲目相加，且父级也可能包含重复。Pump Mobile是已计入母产品的交易渠道，应按逐日已核规则去重。[UNI核查](flow-uni-notes.md)
- `GET https://api.hypurrscan.io/fees`：累计费用历史，用差分算区间，单位需按适配器 `/1e6`；`GET https://api.hypurrscan.io/pastAuctions`：HIP-1直接burn。
- `POST https://api.hyperliquid.xyz/info`：按官方 info schema 请求 AF `userFills`/`userFillsByTime` 和 `spotClearinghouseState`；先处理返回上限和跨时段归档，再对账。
- Solana RPC `getTokenSupply`（mint `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`）、`getAccountInfo` 核验 mint authority；执行账户 signatures+parsed transaction 核验 burn 与现金支出。公用 RPC 能否完整扫历史此次未测试，不能标完工。

## PUMP 有界链上核验（2026-10-02 19:30 上海时间）

公开 [Solana mainnet RPC](https://api.mainnet-beta.solana.com) 批量请求 `getAccountInfo`（jsonParsed）及 `getTokenSupply`，均使用 `finalized` commitment，返回同一 **slot 452597013**。核验 mint `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn` 的当前总量为 **830,417,823,755.244606 PUMP**；raw amount `830417823755244606`，decimals `6`。这与供应商 total 有小差异，应分别展示来源及时间，不能用 mint 总量推导流通量。

`mintAuthority=null`、`freezeAuthority=null`，说明当前这两项权限已撤销。账户属于 SPL Token-2022（owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`）。同时存在 transferHook 扩展，`authority=DMdBa812dBW1CHVhmTyUyVcrBnSbZbfoFC7U14k4riH1`、`programId=null`，因此不能把上述两项 null 泛化为“所有管理权限均已撤销”。metadataPointer authority 和 tokenMetadata updateAuthority 也为 null。此次只核验一个 finalized 快照，没有重建历史回购现金成本、逐日销毁或未来 insider/community 分发。完整请求结果字段已保存到同目录 JSON 的 `pump_onchain_mint_check`。
