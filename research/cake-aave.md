# CAKE / AAVE：回购、供应与证据边界

人工核对日期：2026-10-03。此文件记录机制与历史政策，不替代刷新脚本保存的窗口数据；网页上的市场价格、收入、回购统计及年化值以其实际采集日期为准。

## CAKE

CAKE的收入来自多链换币及彩票等产品付费，费用具有真实交易基础，但受交易量、费率、流动性和市场份额影响。不同产品采用不同分配规则，不能把一个回购比例套在全部收入上：V3低费档15%、高费档23%；V2回购分配相当于成交额的0.0575%，即0.25%交易费的23%；Infinity按协议收入50%；StableSwap按交易费40%；Lottery是用户投入CAKE的20%直接销毁。父级API统计覆盖哪些产品，需以当次归档中的子协议清单为准，不能假设官方所有产品均已覆盖。

这些holder统计主要由成交额或费用乘以分配规则计算。其合计既包含收入支持的回购额度，也包含用户直接支付CAKE的销毁估值，不能全部称为已支付回购现金。政策最终去向为销毁，仍须逐笔核对实际成交与最终burn，且把排放、铸币后直接销毁、永久锁仓、跨链记录及生态库存分开。

- [官方现行供应与费用销毁规则](https://docs.pancakeswap.finance/protocol/cake-tokenomics)
- [V2适配器：成交额乘以分配率](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pancakeswap-v2.ts)
- [V3适配器：按费率档位分配](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pancakeswap-v3.ts)
- [Infinity适配器：协议收入分配](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pancakeswap-infinity.ts)

2025-03-24起官方销毁周报改为展示产品排放减产品销毁等净通缩口径，生态增长基金尚未进入市场的部分另行处理。这是报告方式调整，不是首次启动回购，也不直接等于合约累计totalSupply变化。[官方mint与burn报告说明](https://blog.pancakeswap.finance/articles/pancake-swap-cake-burn-mechanics-a-comprehensive-guide)

Tokenomics 3.0提案于2025-04-18通过，官方列出的实施起点为4月23日。veCAKE退出、最后奖励期结束、V3收入分享转销毁、排放削减各有独立日期。旧锁仓退出属于已有币释放，不是新增铸币；原低费档V3池的5%分享转入销毁后，份额由10%变成15%。文档中的日排放降低至14,500枚为当时计划，此研究未将它当成2026年已核当前速度或未来固定速度。[官方实施时间表](https://blog.pancakeswap.finance/articles/implementation-of-cake-tokenomics-3-0-what-you-need-to-know)

官方2026年1月月报称，2026-01-19已将供应上限由450M降至400M。降低未来上限不代表当日实际烧毁50M已有币，400M也不是初始发行量。[官方上限实施月报](https://blog.pancakeswap.finance/articles/kitchen-report-january-2026)

未取得完整创世发行及团队、投资人分配表，也未核当前内部人余额。当前保留这些项目为未知，没有把缺数据写成100%社区或0%内部人。所选窗口的实际mint、最终burn、储备外流和未来365天排放日历未完整建立，故无法单靠费用销毁额度确认净通缩。网页中的销毁收益率若采用该额度，必须明确是按政策分配统计得到的估算。

## AAVE

Aave的付费来源包括借款利息、GHO、flashloan、清算及已覆盖的合作分成。借贷需求较单一Meme发行更广，但资产规模、利用率、利率、竞争和坏账风险都会影响收入。借款人总利息中有一部分属于出贷人，DAO所得还未扣齐服务、激励、坏账和运营成本，不能改称项目净利润。[V3费用与回购适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/aave-v3.ts)、[V4费用适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/aave-v4.ts)

官方文档确认执行回购从2025年4月开始，由Aave Finance Committee执行，并把买回币送入Ecosystem Reserve。储备可用于治理批准的质押奖励、拨款和服务支付，属于可重新释放的库存，不是永久销毁。预算可以治理调整；官方概述中的旧年度预算不应自动外推成当前持续回购，也没有固定占全部利息的比例。[官方回购与储备用途](https://www.aave.com/docs/ecosystem/aave)

适配器方法说明使用2025-04-09作为回购统计起点，并读取Ethereum指定回购金库收到AAVE的Transfer，排除一组地址后按代币价格估值。它统计的是代币流入估值，不能当成逐笔已付现金；首笔成交日期、内部转入、现金来源、买回后的再释放仍需独立对账。[AAVE V3回购统计实现](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/aave-v3.ts)

TokenLogic在2026-04-22的治理帖说明，rsETH事故后自4月19日起已暂停回购，提案将正式化该暂停。这里将执行方的回溯披露与正式投票分开；截至本次研究未取得已核实的恢复执行依据。API某窗口回购为零仅说明该窗口统计值，不自行证明暂停原因或持续状态。[执行方暂停披露](https://governance.aave.com/t/arfc-pause-aave-buybacks/24686)

2020年迁移分配为总量16M，其中13M用于LEND持有人按100:1迁移，3M用于生态储备，分别为81.25%和18.75%。这是迁移时分配，不是团队、投资人持仓分类，也不代表当前余额。[官方迁移与分配方案](https://governance.aave.com/t/welcome-to-aaves-governance-discussion/7)

储备奖励、拨款和服务支出会使已有币流向市场。2020年的奖励讨论属于历史提案，不能当成当前固定年率。[历史储备激励讨论](https://governance.aave.com/t/initial-discussion-aave-reserve-emission-for-safety-and-ecosystem-incentives/85)

当前没有完整的同窗奖励和储备外流账、未来365天释放日历以及独立铸币核验。买回转储备不能直接从totalSupply扣除，也不能只凭回购金额断言净流通通缩。持币者回购收益率是窗口流入估值的年化指标，不是分红到账率或永久销毁收益率。

## 在框架中的处理

- 客观机制与政策日期：引用官方文档、治理披露，并标注实施计划、官方月报或适配器统计起点等证据性质。
- 采集统计：CAKE为按产品规则计算的额度；AAVE为指定回购金库收到代币的估值，均与已支付现金分开。
- 推导指标：年化、估值倍数和收益率由网页观察窗口计算，不加入未经当次采集的网上最新数值。
- 未知事项：未来解锁、当前排放和完整净供应变化保持null；缺数据不填零。初始分配不当作当前持仓。
- 历史改善判断：这些政策日期可供后续事件对比；本文件不声称价格、收入或供应改善由政策造成。
