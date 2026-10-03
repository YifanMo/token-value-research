# HYPE、PUMP、UNI、JUP、RAY：真实收入与代币投资价值

研究日：**2026-10-02，北京时间**；统计口径于 **2026-10-03** 复核修正。统一行情快照为当日 **19:03:20（11:03:20 UTC）**；统一流量窗口为 **2026-09-02至2026-10-01，30个已完成UTC日**。本文金额为USD，M=百万，B=十亿。研究、仪表盘和证据保存在本地，公开数据可重新采集。[计算口径](framework.md)、[当前快照](../data/dashboard.json)

## 先看结论

这五个项目确实存在用户付费，但投资价值的差异主要来自三件事：**收入能维持多少、价值捕获能否永久留下、释放多少新可交易代币**。不能仅用“宣称回购”把它们归入一类，也不能根据回购政策直接判断净通缩。

HYPE 的收入归属路径较强，但当前有效总量与流通量差距大，贡献者和储备释放影响判断。UNI 的手续费捕获已落地，业务需求较广，但仍需把金库增长预算与持续销毁对比。PUMP 的近期代理收益率较高，永久销毁承诺更明确，同时Meme周期、未来归属和一年承诺期限使其风险更集中。JUP 的产品较多，但回购保留、ASR分发和净零政策执行需要单独核实。RAY 的回购代理率也高，却不能当作已验证永久销毁：AMM明确金库保留，LaunchLab的burn标签尚缺实际交易对账。[HYPE费用](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)、[UNI机制](https://developers.uniswap.org/docs/ecosystem/governance/uni)、[PUMP承诺](https://pump.fun/pump-token)、[JUP战略储备](https://meow.bio/jup-4.html)、[RAY回购规则](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/ray-buybacks.mdx)

**本次没有任何一个项目具备完整、已核实的未来12个月自由流通释放台账，因此不能给出“五币均净通缩”的结论。**这不是估值工具失效，而是需要先补的数据。当前框架明确展示未知项，并提供有来源的部分供给情景。

## 1. 当前收入、捕获与收益率

| 项目 | 用户手续费30D | 可归属收入30D | holder统计代理30D | 代理 / 可归属收入 | 代理 / 用户费 |
|---|---:|---:|---:|---:|---:|
| HYPE | $70.89M（已去重） | $55.36M | $55.36M | 100.00% | 78.09% |
| PUMP | $159.51M（已去重） | $49.86M（已去重） | $23.92M | 47.98% | 15.00% |
| UNI | $197.19M | 待核独立收入 | $15.20M（兑换UNI估值） | 待核 | 7.71%（兑换估值 / 费用） |
| JUP | $18.15M | $6.25M | $3.12M | 49.96% | 17.21% |
| RAY | $44.97M | $7.51M | $4.70M | 62.57% | 10.45% |

来源：同窗父级 dailyFees、dailyRevenue、dailyHoldersRevenue，逐日求和，按已核规则剔除重复子项。URL和原始JSON在 `data/raw/`；可核对 [HYPE](https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue)、[PUMP](https://api.llama.fi/summary/fees/pump?dataType=dailyRevenue)、[UNI](https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue)、[JUP](https://api.llama.fi/summary/fees/jupiter?dataType=dailyRevenue)、[RAY](https://api.llama.fi/summary/fees/raydium?dataType=dailyRevenue)。这些字段不是已扣全部经营费用的净利润；HYPE的R已是代币路径分配，UNI的API revenue是兑换UNI估值，不能一律称独立协议收入。

2026-10-03复核修正：HYPE父级Fees把已含于Perps/Spot的HLP分成另加了一次；原始71,446,713美元剔除重复556,924美元，得到70,889,789美元，比例77.48%改为78.09%。99%是扣除builder、HIP-3部署者、返佣等项目后的合格费用分配规则，分母不同。30天分项标签仍有7,873美元未对上，90/365天缺口更大，不宣称完整财务对账。[原始金额、分项API与证据](hype-fee-audit.md)

同次复核确认 PUMP Mobile 是已在发行平台/PumpSwap计入的交易子集。30天原始F=$167,205,123、R=$53,599,784；按原始父级逐日金额减去Mobile重复项后，F=$159,514,205、R=$49,859,813；父级与产品细分的小额取整差异保留在构成对账中，不强配给产品。Terminal的净收入可能为负，表示当日cashback/referral钱包支出高于收费，保留负项，不截成0或当缺失。365天仍有2026-05-21 Mobile缺记录，完整去重窗口待核。[规则、精确金额与耐久证据](flow-hype-pump-notes.md)

UNI的API revenue与holders是同一Firepit兑换统计额的复制：Released事件数×查询所得UNI阈值，再按UNI币价估值。它没有独立量化当期归集的费用资产，也没有验证执行者买入UNI的现金成本。因此独立收入、收入占费用和P/S待核；7.71%仅是兑换估值与用户费用的统计比值。[固定源码与核查](flow-uni-notes.md)

| 项目 | 流通市值 | 供应商FDV | 资金捕获代理年化 / 流通 | 同代理 / FDV | 永久销毁代理 / 流通 · FDV |
|---|---:|---:|---:|---:|---:|
| HYPE | $20.22B | $86.82B | 3.33% | 0.78% | 3.33% · 0.78% |
| PUMP | $2.72B | $4.86B | 10.69% | 5.99% | 10.69% · 5.99% |
| UNI | $5.63B | $7.99B | 3.28%（兑换估值） | 2.31%（兑换估值） | 最终主网burn未完整对账 |
| JUP | $1.09B | $2.26B | 3.47% | 1.68% | 0% · 0%，保守经常性口径 |
| RAY | $527.35M | $1.08B | 10.84% | 5.27% | 待核，不能填0或全部算burn |

年化为30D金额×365/30，分母取同次行情。它是当前运行速度参考，**不是现金分红率、预期投资回报或实际回购成本排行榜**。市场数据源为 [CoinGecko markets API](https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hyperliquid,pump-fun,uniswap,jupiter-exchange-solana,raydium)；公式和数据时间可在仪表盘切换检查。

| 项目 | proxy实际含义 | 不能直接推导的东西 |
|---|---|---|
| HYPE | 合格费用归属AF + HIP-1直接burn日估值等 | 所有AF逐笔买入已花同样USD、全部生态收入已覆盖 |
| PUMP | 链上burn数量×当日价格，跨产品集中记录 | 回购真实花费、净收入分成精确兑现率；不能再乘50% |
| UNI | Firepit事件数×查询所得UNI阈值×UNI价格的兑换估值 | 独立费用收入、同日全部最终burn、searcher现金买入等额 |
| JUP | 多数产品50%协议所得的应计政策预算 | 预算已买完、买入永久销毁、净零政策全部执行 |
| RAY | AMM12%交易费 + LaunchLab25%协议费等预算代理 | 全部已现金买入、全部RAY已burn |

例如PUMP当窗47.98%不能证明50%政策精确兑现或少付：burn按价格估值、回购时差、合格净收入和产品覆盖都不一致，adapter收入还含官网回购口径排除的Mayhem。RAY父级62.57%也不是swap政策被改成62.57%：AMM回购占留存收入75%–100%，LaunchLab预算比例25%，混合后自然不同。[PUMP适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/pumpdotfun.ts)、[RAY AMM适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/raydium/index.ts)、[LaunchLab适配器](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/launchlab/index.ts)

### 美股类比指标：P/S与P/E

下表为独立收入及项目净利润口径，仍使用2026-10-02行情及统一30天收入窗口。年收入为可确认的窗口协议所得收入×365/30，是当前速度参考，不是过去一年财报收入；FDV倍数使用供应商FDV。UNI缺独立费用收入，不能把兑换估值用作独立收入口径P/S分母。

| 项目 | P/S：流通市值 / 年化收入 | FDV / 年化收入 | P/E | 协议收入 / 用户手续费 |
|---|---:|---:|---|---:|
| HYPE | 30.02x | 128.90x | 待核净利润 | 78.09% |
| PUMP | 4.49x | 8.01x | 待核净利润 | 31.26% |
| UNI | 待核独立收入 | 待核独立收入 | 待核净利润 | 待核独立收入 |
| JUP | 14.38x | 29.72x | 待核净利润 | 34.45% |
| RAY | 5.77x | 11.87x | 待核净利润 | 16.70% |

P/S使用经核查可作收入的统计，未扣完整经营成本；PUMP去重30天R的年化参考为$606.63M。协议收入占手续费不是利润率，源字段若实际为兑换/烧毁估值则不计算该分成率。当前未取得同窗同范围的完整净利润，P/E不以收入、回购额度或销毁估值代替。净利润未知也不表示亏损或0倍市盈率。[计算与净利记录规则](framework.md#51-表格中的美股类比指标)、[SEC财务报表与P/E说明](https://www.sec.gov/about/reports-publications/beginners-guide-financial-statements)

2026-10-03新增参考网站口径：五项目30天持币者回报倍数（市值÷年化持币人统计）依次为30.02x、9.35x、30.44x、28.78x、9.22x。收入字段P/S依次为30.02x、4.49x、30.44x、14.38x、5.77x；UNI这项明确为兑换估值分母，独立收入仍未知。主表固定并排显示P/S、持币者回报倍数、项目净利润P/E，不再切换口径或显示大解释框。已有回购／销毁统计可以显示倍数，不必先取得完整净利润；这些倍数不证明持币者实收现金、项目净利润或净通缩。[完整对照](crypto3d-comparison.md)保留参考站数据链、覆盖与时点差异，按需查看。

## 2. 业务质量与价值路径

| 项目 | 真实收入从哪里来 | 主要周期敏感点 | 进入代币的规则与去向 |
|---|---|---|---|
| HYPE | 永续/现货撮合费、HIP-1拍卖；独立HyperEVM gas等 | 杠杆交易、波动、费率、竞争和做市深度 | 合格费用约99%AF；AF于2025-12-24确认为不可取回的经济销毁，直接fee burn另记 |
| PUMP | Meme发行bonding curve、PumpSwap、Terminal等 | Meme发行与短线交易、creator/cashback分成、竞争 | 2026-04-28起50%合格净收入程序化回购并永久burn，承诺一年 |
| UNI | 已开启池/链的协议swap fee；其他收入逐项纳入 | 交易量、LP深度、路由份额、收费后流量迁移 | Fee Adapter→TokenJar→searcher交UNI换费用→主网dead地址；不保证USD一比一兑现 |
| JUP | Ultra收费、Perps协议分成、DCA/Trigger、质押管理与借贷reserve | Solana交易与杠杆周期；partner/LP分走收入 | Jupiter实际所得50%战略积累；Perps对应gross fee12.5%。历史库存burn不代表未来自动burn |
| RAY | AMM/CLMM/CPMM费、LaunchLab发行费等 | 高费率Meme币贡献、长尾币变现、竞争 | swap费12%回购留协议地址；LaunchLab25%协议收入标签需核实际销毁 |

HYPE不能把HLP做市盈亏或多空funding都算经营收入；“99%”也不是全生态毛费用比例。其AQAv2稳定币储备收益是新的分散化候选，但本次研究日尚未到USDC首个据报支付日，当前parent指标亦不完整涵盖，不能把预测现金混入已执行回购。[HYPE AQAv2规格](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets)、[项目详研](hype-pump.md)

UNI相较单一发行平台有更广的基础换币需求，但fee switch也会增加用户/LP的机会成本；需要观察份额和净take rate，而不是把开启收费看成没有竞争代价的利润增量。v4首批7链并不覆盖所有hook、池和链。Arc截至研究日仍在投票，不记已生效。[v4执行案](https://vote.uniswapfoundation.org/proposals/100)、[Arc提案](https://vote.uniswapfoundation.org/proposals/102)、[UNI详研](uni.md)

Raydium团队的2025Q4报告显示Meme约占21%成交量却贡献87%swap revenue；Q4 swap收入环比-60%、LaunchLab收入从Q3 $12.7M降至Q4 $1.5M。这直接表明真实收费仍可能高度顺周期。报告也承认长尾币手续费账面USD未必全部可变现回购，不宜直接将fee proxy视为现金利润。[团队管理评论与Q4报告](https://blockworks.com/api/investor-report/investor-relations-report/pdf)、[JUP/RAY详研](jup-ray.md)

## 3. 供应、团队/投资人和稀释

| 项目 | 价格 | reported流通 | reported有效总量 | 流通 / 总量 | 初始分配中的团队/投资人 |
|---|---:|---:|---:|---:|---|
| HYPE | $90.84 | 222.45M | 955.31M | 23.29% | 核心贡献者23.8%；无创世私募投资人；未来排放38.888% |
| PUMP | $0.00585644 | 464.93B | 830.42B | 55.99% | 团队20%+既有投资人13%；ICO33%另含机构私售，不能称所有机构仅13% |
| UNI | $9.01 | 625.27M | 887.52M | 70.45% | 团队21.266%、投资人18.044%、顾问0.69%，合计40% |
| JUP | $0.329467 | 3.319B | 6.861B | 48.38% | 销毁后历史团队1.4B/7B=20%、Mercurial350M/7B=5%；其他投资人币数未齐 |
| RAY | $1.96 | 269.86M | 555.00M供应商值 | 48.62% | 团队20%；community&seed合计6%，不能全归为私募 |

这些是**初始或政策基准分配，不是当前实际仍持有比例**。本次没有完成全部团队、投资人地址的现时余额归属审计，当前持币比例保留未知。[HYPE创世](https://hyperfnd.medium.com/hype-genesis-1830a4dc2e3f)、[PUMP分配/解锁研究](https://tokenomist.ai/research/pump-tokenomics-what-the-july-12-2026-insider-cliff-means-for-a-fixed-1t-supply-2)、[UNI初始分配](https://blog.uniswap.org/uni)、[JUP社区审计](https://discuss.jup.ag/t/jup-community-audit-feb-2025/34764)、[RAY token](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/index.mdx)

供给口径的几处重要差异：

- HYPE的经济分母包含预留而未铸的社区奖励；从储备mint到流通，不应又增加已含储备的经济总量一次。
- UNI的Firepit把币送dead，原合约totalSupply不减少；供应商total则可能排除dead。初始1B不是一个保证永远不增发的硬上限。
- JUP的max字段仍可能写10B，但3B库存burn已核，不能用旧10B不加说明地称当前FDV。该交易只有32.7M来自当时流通，绝大部分来自非流通库存。
- RAY供应商保留555M。本次公开finalized RPC确认mint authority=null、实际mint supply约554,997,391.047118 RAY，较初始少约2,609枚；这个差额未归因，既不能说从未burn，也不能支持将全部历史回购视为burn。
- PUMP于北京时间19:30的独立finalized RPC得到830,417,823,755.244606枚，mint/freeze authority均null；与19:03行情供应差异保留，估值不跨时点混拼。Token-2022还存在transferHook扩展authority而programId为null，不能概称全部权限已撤销。

来源及逐项核验范围在 [JUP/RAY证据](jup-ray.json)、[UNI证据](uni.json)、[HYPE/PUMP证据](hype-pump.json)。供应商与链上差异保留，不混拼估值。

| 项目 | 已知压力项 | 未来12个月完整性 |
|---|---|---|
| HYPE | 贡献者大部分2027–28归属，部分更晚；社区/质押奖励需区分储备与新经济增发 | 贡献者实际分发和未来排放不完整 |
| PUMP | 2026-07一年cliff；公开模型剩余247.5B÷36个月=6.875B/月，具体日期有冲突；社区释放表不齐 | 可取得82.5B/年部分模型，非完整实际释放 |
| UNI | 2026/27每年20M treasury growth budget；2%mint为尚未行使治理权限 | 金库实际转出、其他grants及未来mint未齐 |
| JUP | ASR50M/季来自旧已计circulating库存；Net-Zero涉及Jupuary、团队credits及Mercurial抵消 | 表决通过已由RPC核；执行与对冲台账仍待核 |
| RAY | 储备mining文档约1.9M/年；staking实际按slot发放；旧team/seed归属已结束 | 速率可变，生态与金库未来去向未齐 |

持币奖励或团队解锁不是必然新mint；另一方面，没有新mint也不意味着没有自由流通稀释。UNI的20M金库预算尤其重要：将其忽略，同时又每年机械扣一个尚未执行的2%mint，会同时高估和错估风险。[UNI财报](https://vote.uniswapfoundation.org/forums/7/duni-q4-and-year-end-2025-financial-statements-and-tax-update)、[JUP Net-Zero FAQ](https://discuss.jup.ag/t/faqs-net-zero-emission-proposal/39974)

## 3.1 未来供应数据可取得多少

**当前total supply是存量；净供应变化是期间流量，两者不是同一个指标。** 假设没有增发，且10M销毁来自流通、30M已存代币首次解锁并进入流通，则有效总量减少10M，自由流通增加20M。未来期末供应 = 当前存量 + 对应期间净变化；已有代币解锁不能直接加到total supply。

本轮增加了结构化未来数据：UTC日期窗口为 `(2026-10-02, 研究日+N天]`。下表展示**可取得的部分计划/模型**，不把它们称完整未来流通预测。

| 项目 / 展示范围 | 未来30天 | 未来90天 | 未来365天 | 依据与关键限制 |
|---|---:|---:|---:|---|
| HYPE贡献者理论归属 | 9.9167M | 29.75M | 119M | 238M÷24个月较高情景；统一月度曲线未获官方承诺，不是硬上限 |
| HYPE10月拟分发，仅此批 | 3.75M | 3.75M | 3.75M | 10月7日拟分发的二级报道；不能与上一行相加，不是全年预测 |
| PUMP团队+既有投资人 | 6.875B | 20.625B | 82.5B | 剩余247.5B÷36个月；LLama日期12日、Blockworks14日有冲突 |
| UNI原授权季度预算新到期 | 0 | 0 | 20M | 2027年1/4/7/10月1日各5M；当前参数/allowance未实时读齐，治理可变更 |
| JUP ASR延续、均匀年率情景 | 16.44M | 49.32M | 200M | 50M/季×4后按年率均摊；未来四季拨款未完整确认，币可能已计circulating |
| RAY文档奖励速度情景 | 约156.16K | 约468.49K | 约1.9M | 现存储备释放，staking按slot计发；受slot速度、调参、vault补资影响 |

来源及冲突逐项保存在 [HYPE/PUMP未来供应](supply-hype-pump.md)、[UNI未来供应](supply-uni.md)、[JUP/RAY未来供应](supply-jup-ray.md) 与 [仪表盘排期数据](../data/supply-forecasts.json)。PUMP公开模型可直接查 [DeFiLlama](https://defillama.com/unlocks/pump) 和 [Blockworks](https://app.blockworks.com/projects/pump-fun/token-unlocks)；HYPE原贡献者完成期只有较宽区间，见 [官方创世说明](https://hyperfnd.medium.com/hype-genesis-1830a4dc2e3f)，实际转账跟踪见 [DeFiLlama](https://defillama.com/unlocks/hyperliquid)。UNI季度计算依据 [UNIVesting代码](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/UNIVesting.sol) 与 [治理财报](https://vote.uniswapfoundation.org/forums/7/duni-q4-and-year-end-2025-financial-statements-and-tax-update)。

已到期但未领的币要另记。UNI原参数下截至10月1日累计到期20M，官方确认首期5M转出，但后续现时allowance与成功回执未读齐；未领取余额未知，0–15M仅为原参数条件区间。未来30/90天新到期为0，**不能推导该期间金库外流为0**。旧UNI/RAY团队计划已结束，可以明确这些原排期未来新解锁为0，仍可能存在已解锁持币出售。

JUP官方ASR API当前最新活动是2026 Q2，50M池已领取47,412,091.194282144，剩余**2,587,908.8057178557 JUP**，截止2026-10-08 14:00 UTC。这是期初已到期可领取上限，实际领取未知，领取后先进入质押；Q1剩余已过期，不能并入carry-in。未发现Q3或更后campaign，未来四季200M只保留情景。[官方活动API](https://datapi.jup.ag/rewards/v1/campaigns)

JUP公开跟踪器另列Team约427.78M、Mercurial约82.45M为TBD，Jupuary1.4B、community300M、strategic1,332.7M均需单列未定库存；这些不等于未来一年必然释放。RAY已核原staking reward为0.016712枚/slot，API名义2.5slot/秒换算年化1.31757408M；4分钟样本3.7slot/秒换算约1.95M，仅为样本情景。奖励vault现仅74,634.822826 RAY，后续补资影响全年是否足额，不能把文档1.9M当不可变承诺。[JUP未定排期库存](https://defillama.com/protocol/unlocks/jupiter)、[RAY官方SDK布局](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/farm/layout.ts)、[链上核验范围](supply-jup-ray.md)

JUP Net-Zero表决已在finalized RPC直接解码：2026-02-22结束，支持选项361.296102M votes，占含弃权总票75.26447%。但proposal的instructionCount=0、queuedAt=0，表决通过不等于自动完成暂停与抵消；不能由“净零”宣传将全部未来释放填0。[官方投票](https://vote.jup.ag/proposal/C5XRDvjHZXmMs45WhjzEKdg2dcSg2aCSwEvPvivWpBF6)

## 4. 回购和释放一起算：阈值而非假装完整预测

以下情景仅假设把30D捕获统计估值年化视作可用预算，并假定未来买入均价等于当前价格；**不宣称是真实现金支出、完整释放表或未来结果**。PUMP为burn估值，UNI为兑换UNI估值，二者都不是实付回购成本。

| 项目 | 年预算代理 | 模型买入量 | 部分释放情景 | 条件式结果 |
|---|---:|---:|---:|---|
| HYPE | $673.49M | 7.41M HYPE | 119M较高理论归属情景 | 若此部分全部入流通，模型净增加约111.59M；实际分发可能大幅不同。抵消阈值约7.41M/年 |
| PUMP | $291.05M | 49.70B PUMP | 82.5B/年摊销假设 | 缺口约32.80B；抵消需$483.16M预算，约当前代理1.66倍；50%分成下对应净收入约$966.31M |
| UNI | $184.99M兑换估值 | 20.53M UNI价值等量情景 | 20M/年金库预算 | 不是实付买入或已最终burn量；兑换下降、其他释放可改变符号 |
| JUP | $38.00M | 115.35M JUP | ASR200M/年自由流通情景 | 存币买入小于该情景约84.65M；ASR可能已计reported circulating，不把它称新增mint |
| RAY | $57.19M | 29.18M RAY | 储备奖励1.9M/年run-rate | 模型保留买入多于此单项；其他释放及真实支出未知，且不是永久burn结论 |

收入预算减半、价格不变时，所有模型买入量减半；买入均价上涨50%时，同一预算买入量下降1/3。价格下跌能买更多币，但也可能伴随收入下降。PUMP / UNI 的表例足以说明：看上去高的回购收益率不能单独证明可交易供给净收缩。

同样，HYPE有效总量可因burn减少，但核心贡献者由非流通转流通可使自由流通增加；UNI库存burn100M也不会当场吸收100M市场卖压。两张台账分别展示，不能把总量下降当流通下降。

## 5. 何时变更，之后真的改善了吗

关键政策节点见下表；时间线以UTC日编码，公告和实现可相差一天或更久。完整历史在各项目详研中。

| 项目 | 关键节点 | 要避免的混淆 |
|---|---|---|
| HYPE | 2024-11创世/AF阶段；2025-08-30现货97%→99%；2025-12-24销毁共识确认 | 12月存量确认不是当天又花一遍历史现金 |
| PUMP | 2025-07-14回购起算；2025-09 creator分成调整；2026-02 cashback；2026-04-28存量burn+50%净收入一年新承诺；2026-07cliff | 当前50%不能回套全部历史；库存burn不年化；cliff不等当天出售 |
| UNI | 2025-11-10提案；2025-12-28 #93执行/统计生效；2026-03扩链；06扩链；07-27 v4首批7链/Robinhood | 提案、主网执行、目标链起算及最终burn分开；100M库存与fee burn分开 |
| JUP | 2025-01-26 UTC（北京01-27）3Bburn；02-17拨款起算、约02-25买入启动；10月库存burn提案；11月库存burn第三方记录；2026-02净零提案与02-22表决通过 | 实际burn、应计预算、买入和新库存去向不能互相代替 |
| RAY | 2021–23已有回购支出记录；2024-02旧team/seed归属结束；2025 LaunchLab拓展 | 精确首笔回购日期未核，adapter起始日不是首单日期 |

对以下事件按同口径API历史重新计算，收入前窗为事件前N天，后窗为事件后1至N天，排除事件当天；价格从前1日至后N日。这里是**描述性前后对比**，没有控制所有市场和竞争因素。[历史数据与公式](../data/dashboard.json)

| 事件 | 窗口 | 可核收入或已注明统计前 → 后 | 统计变化 | 代币价格变化 | 相对BTC | 相对SOL |
|---|---:|---:|---:|---:|---:|---:|
| HYPE 2025-12-24销毁确认 | 30D | $54.98M → $47.69M | -13.26% | -13.22% | -14.19% | -15.03% |
| 同上 | 90D | $234.59M → $163.49M | -30.31% | +50.38% | +87.46% | +106.53% |
| PUMP 2026-04-28新销毁政策 | 30D | $30.26M → 后窗待核（Mobile首日缺项） | 待核完整窗口 | +1.64% | +7.51% | +7.32% |
| 同上 | 90D | $108.77M → 后窗待核（同上） | 待核完整窗口 | +14.41% | +37.68% | +29.70% |
| UNI 2025-12-28收费开始 | 30D | 兑换估值$0 → $2.40M；独立收入待核 | 兑换统计从0产生 | -16.85% | -17.74% | -18.19% |
| UNI 2026-07-27收费覆盖扩大 | 30D | 兑换估值$3.32M → $8.33M；独立收入待核 | 兑换统计+150.50% | +16.43% | -4.62% | -10.21% |
| JUP 2025-02-17拨款起算 | 30D | $21.92M → $19.44M | -11.34% | 价格窗口缺失 | — | — |
| JUP 2026-02-13净零提案 | 30D | $11.18M → $5.13M | -54.08% | +21.70% | +14.76% | +9.75% |

这些结果不支持“回购启动必然改善经营与股价”的简单叙事。HYPE的90日价格上涨和收入下降同时出现；UNI扩费后的兑换估值增长，却没有在30日跑赢BTC/SOL，不能据此直接称独立收入增长。PUMP后窗跨Mobile首日缺项，完整收入变化暂不下结论；JUP提案事件后的价格反弹也不能证明未核完的政策执行已经解决供给问题。

PUMP从原父级减去已出现Mobile子项后的候选后30/90天收入分别约$34.17M/$90.82M，候选变化+12.95%/−16.50%；因2026-05-21缺记录，以上仅为已知子项重算，不能替代完整事件窗口。旧值+12.98%/−15.78%含重复，不再采用。[逐日方法与缺口](flow-hype-pump-notes.md)

价格历史来自 [CoinGecko一年市场图API](https://docs.coingecko.com/reference/coins-id-market-chart)。2025-10前部分事件不在免费一年窗内，RAY2024归属事件的价格缺失；本次没有补造数据。90日后窗尚未结束的事件显示“尚未完整”，不外推。

**供应是否改善**的证据目前不对称：JUP3Bburn有RPC指令验证；UNI100M库存经济销毁、HYPEAF确认、PUMP历史存量销毁有官方政策/执行记录；但所有政策事件的同口径历史circulating和总量快照仍不齐，不能把本次供应商current supply与任意旧公告差额当精确净变化。工具已开始归档本次快照，为后续研究保留可对齐的供应数据。[供给证据和缺口](framework.md)

## 6. 投资判断与下一次复核

更适合优先追踪“永久捕获能否支撑估值”的是HYPE与UNI：HYPE需要重点检验FDV分母和即将归属/排放；UNI需要检验fee switch的净增量、市场份额以及金库预算兑现后还剩多少永久吸收。当前30D转FDV的代理率分别约0.78%和2.31%，不能只因项目质量较好就忽略价格里已经计入的预期。

PUMP的代理率较高，是需要严查的假设，不是便宜结论。Meme收入能否穿过低迷期、实际现金回购能否与burn对账、解锁能否被抵消、2027-04后的承诺是否续期，是决定估值的四个主要条件。收入大幅缩减时，高年化值会很快消失。

JUP与RAY应优先查钱包和权限，而不是直接用“分红股”定价。JUP查实际买入、后续库存burn政策、Net-Zero执行和ASR真实领取；RAY查AMM保留资产的再次释放可能性、LaunchLab25%标签对应的真实burn、以及费用资产兑现现金的差额。

下一轮最有信息增量的工作是补**执行台账**：AF fills及储备分发、PUMP actual spend与burn拆账、UNI最终主网burn与金库提款、JUP Litterbox/净零交易、RAY回购钱包与farm储备。每笔保留source与日期，并将新铸经济权利、已计储备首次释放、普通质押、金库存量burn分开。这会决定“净通缩”能否从宣传变成可复核结论；完整未来供给未获得前，情景输出保持条件式。

本地框架已经实现统一窗口、三种估值分母、收入/价格图、政策前后30/90日、未来30/90/365天分类排期、已到期未领余额、可选择排期的压力测试、未知值保护和API归档。它提供研究复算能力；尚未完成每个项目的全部历史链上现金与供给审计。
