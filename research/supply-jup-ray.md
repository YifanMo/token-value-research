# JUP / RAY：未来释放与未定库存

核验日期：2026-10-02。窗口起点采用 UTC 日历日期 2026-10-02；链上结果另记 finalized slot。本文把已核结果、通过的政策、第三方库存估计和速率情景分开，不能把任何一种当作完整的未来实际流通日历。

## JUP：净零投票已通过，实际执行仍需单独对账

本次直接读取官方 [vote.jup.ag](https://vote.jup.ag/) 前端内嵌治理 IDL，再用 Solana finalized RPC 解码 [Net-Zero proposal account](https://solscan.io/account/C5XRDvjHZXmMs45WhjzEKdg2dcSg2aCSwEvPvivWpBF6)。链上投票从 **2026-02-17 10:59:30 UTC** 开始，到 **2026-02-22 10:59:30 UTC** 结束。第二选项 Net-Zero Emissions 获 361,296,102.221466 JUP 投票权，占包括弃权的总票 **75.2644718767%**；第一选项 118,730,351.488857，弃权 8,937.773262。总票超过 266.3M quorum，可核实第二选项获胜。[官方提案页面](https://vote.jup.ag/proposal/C5XRDvjHZXmMs45WhjzEKdg2dcSg2aCSwEvPvivWpBF6)

这一账户的 `proposalType=1`、`instructionCount=0`、`queuedAt=0`，没有内嵌可执行转账或自动暂停指令。因此“投票通过”可以标为链上已核；“700M 已回到冷多签、团队停止所有发币、Mercurial 卖出均已足额补购”不能仅凭这个账户标为链上已执行。

通过后的政策内容来自 Kash 的[原提案](https://discuss.jup.ag/t/proposal-net-zero-emissions/39948)及[FAQ](https://discuss.jup.ag/t/faqs-net-zero-emission-proposal/39974)：

| 类别 | 通过的政策 | 对未来数量的正确处理 |
|---|---|---|
| Jupuary 2026 | 700M 退回 Community Cold Multisig，无限期延期；需要新的 DAO 投票才能使用 | **政策延续情景：排期释放 0**；700M 是潜在库存，未销毁。恢复日期未知 |
| Team Reserve | 无期限暂停链上发放；成员改获对 Jupiter 资产负债表的 JUP credit；想出售时由 Jupiter 直接承接 | **政策延续情景：新链上成员发放 0**；成员经济权益和账面负债仍存在，不能把剩余分配抹掉 |
| Mercurial | 加速归属，并对已知持有者卖出或转入 CEX 的数量补购相同枚数，加入团队金库 | gross unlock、实际卖出、补购三项分开。补购政策目标 net market impact≈0，但实际净数量未知；补购也不是 burn |
| ASR | 继续每季度 50M，由已计入 circulating 的旧未领 Jupuary 支出 | reported circulating 增量可为 0；用户控制权与可出售量可能增加，不能省略 |

Mercurial 跟踪承诺针对当年剩余时间，并未给出对 2027 年每一笔卖出的相同公开保证。官方称超过 99% 的分配集中在不足 300 个已知钱包，但本次没有取得完整公开名单与一一对应的补购流水。不能把“项目声称抵消”当成未来一年净外流已经核定为零。

### 尚无日期的库存

[DeFiLlama 当前 unlock 页面](https://defillama.com/protocol/unlocks/jupiter)注明数据由 Jupiter 团队提供，列出以下 TBD 库存。它们是**第三方页面当前披露的近似值**，本次未取得适配器的精确原始数量或逐钱包重算，不能再加小数位伪装成精确量：

| 库存类别 | 页面数值 | 性质 |
|---|---:|---|
| Team | 约 427.78M JUP | 已暂停、无恢复排期 |
| Mercurial Stakeholders | 约 82.45M JUP | 仍列为协议保管的 TBD；不能声称这一池全部分发完毕 |
| Jupuary | 1.4B JUP | 700M 延期份额 + 700M 未计划空投的储备 |
| Community Reserves | 300M JUP | 无定义的释放日历 |
| Strategic Reserve | 1,332.7M JUP | 无定义的释放日历 |

该页面同时列出 **2026-02-25 Mercurial 77.97M JUP cliff**，这是已发生的历史事件，不能再计入 2026-10-02 起的未来窗口。页面“最后事件”与 TBD 共存，不能据最后一条事件推定剩余库存为零。库存中不同分配、reported circulating 与被锁住但已归属的币还需要分类对账，不能简单求和当未来新增流通。

旧 [2025-02 官方社区审计](https://discuss.jup.ag/t/jup-community-audit-feb-2025/34764)给 Team 每月 38,888,888.89、Mercurial 每月 14,583,333.33 JUP，仅能作为 2026 政策变更前的历史基线或“恢复旧政策”压力情景。它们不能在暂停以后无条件延长。首期 466,666,666.67 团队 cliff 自愿重新锁两年属于已归属库存；本次未核全部锁仓账户和具体解锁时间戳，不能凭“2025+2 年”虚构某日精确释放。

### ASR：现在能取得的日期与数量

可复用的官方端点为 **[https://datapi.jup.ag/rewards/v1/campaigns](https://datapi.jup.ag/rewards/v1/campaigns)**。这是官方投票前端代码调用的 rewards API。按 `slug` 筛选 ASR，可取得活动期间、领取窗口、分配和已领数量。

| 活动 | 奖励总池 | 领取开始 UTC | 领取截止 UTC | 抓取时已领取 | 抓取时未领取 |
|---|---:|---|---|---:|---:|
| ASR Jan–Mar 2026 | 50,000,000 | 2026-04-08 15:30 | 2026-07-08 15:29:59.999 | 49,780,052.3533236 | 219,947.6466763988 |
| ASR Apr–Jun 2026 | 50,000,000 | **2026-07-08 14:00** | **2026-10-08 14:00** | **47,412,091.194282144** | **2,587,908.8057178557** |

Q1 已过领取期限，页面 remaining 数值不能算成仍可领取。Q2 的 2,587,908.8057178557 是**现有活动未领取上限 / carry-in**，可以在截止前进一步领取；不保证全部领取，也不是在 10 月 8 日一次解锁。Q2 campaign 账户为 `J4W94wtULKdUixPwokCJDMRdt1cMUspphLuo6uUcbftV`。API 明写来源为第一期 Jupuary 未领取余额，并明写领取后自动加入 stake account。它不应再次机械加到供应商的 circulating 或经济总供给。

截至本次抓取，campaign 列表最新 ASR 为 Q2，没有 Q3 2026 或此后活动条目。**每季 50M × 未来四季 = 200M JUP** 可以作为制度延续的自由流通压力情景；未来具体开始/截止日期、持续拨款与实际领取率未核，不应虚构季度精确发币事件。现有 Q2 carry-in 与未来新一期情景需要分开呈现，不能在四季外推中不加说明地重复计数。

## RAY：老团队排期为零，储备奖励仍可改变流通

官方托管的 [RAY 文档](https://github.com/raydium-io/raydium-docs-v1/blob/main/ray/index.mdx)说明：最大初始供应 555M，mint authority 已取消，挖矿储备 34% 即 188.7M，当前释放约 **1.9M RAY / 年**；团队及 seed 原归属在 **2024-02-21** 完成。因此未来 30/90/365 天的**该原团队与 seed 排期解锁可明确填 0**。这不意味着原持币人不会卖出，不涉及其他金库处置。该仓库 README 注明为社区维护，供给结论另用链上核对。

本次 Solana RPC mint 账户核对 `mintAuthority=null`，六位小数，实际总 supply 为 554,997,391.047118 RAY（finalized slot 452596632）；额外 mint 权限可填 0。储备奖励发的是已经铸出的库存，能增加自由流通，却不必增加这一 mint 的总供应。

### 当前 staking 速率的原始单位是每 slot

官方 [farm metadata](https://api.raydium.io/v2/sdk/farm/mainnet.json)中 RAY staking farm 是 `4EwbZo8BZXP5313z5A2H11MRBP15M5n6YxfmkjXESKAW`；`EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q` 是 program ID，不能误当 farm ID。可执行查询为：

`https://api-v3.raydium.io/farms/info/ids?ids=4EwbZo8BZXP5313z5A2H11MRBP15M5n6YxfmkjXESKAW`

API 返回 `perSecond="41780"` raw units。按照官方 [SDK farm layout](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/farm/layout.ts)，本次 RPC 解码 v3 staking account（200 字节，finalized slot 452609487）得到 **`perSlotReward=16712` raw = 0.016712 RAY / slot**。API 值恰好按 2.5 slots/s 换算。因此应使用：

`RAY奖励枚数 = 每slot raw奖励 ÷ 10^6 × 窗口实际slots`。

| 情景 | 30天 | 90天 | 365天 | 证据含义 |
|---|---:|---:|---:|---|
| 官方文档当前约数 1.9M / 年 | 约156,164.38 | 约468,493.15 | 约1,900,000 | 默认可用的速率情景，非固定未来排期 |
| API 名义 2.5 slots/s | 108,293.76 | 324,881.28 | 1,317,574.08 | 与上一行覆盖同一 staking 奖励，不能相加 |
| 4分钟观察 3.7 slots/s | 160,274.7648 | 480,824.2944 | 1,950,009.6384 | 仅短期速度对照，不能将四分钟速度保证全年 |

RPC `getRecentPerformanceSamples(4)` 返回 60 秒样本 slots 222、220、223、223，即 888/240=3.7 slots/s。这解释了官方约 1.9M 与 API 名义 1.3176M 的差别。本次 reward vault `BihEG2r7hYax6EherbRmuLLrySBuSXx4PYGd9gAsktKY` 的余额为 74,634.822826 RAY（slot 452609495）。余额包含可能已应付未领的奖励，未来又能补资，不能把余额除以速度得到的天数冒充保证的终止日。

### 有日期的 farms 覆盖结果

本次将官方旧 metadata 中含 RAY reward 的 136 个 farm 全部查询 v3 API：136 个全部返回，仅 staking 的速度非零，其他 135 个 API 速度为 0。继续读取官方 [farm-v2 metadata](https://api.raydium.io/v2/sdk/farm-v2/mainnet.json)，其中 stake 1、raydium 12、fusion 122、ecosystem 1,437。生态 v6 中找到 48 条 RAY reward，均有 open/end/perSecond；最新已结束时间为 **2026-09-12 11:12 UTC**，没有结束时间晚于 2026-10-02 的条目。API 元数据可能存在覆盖或刷新局限，不能因此将所有其他协议库存外流填零。

在途的 v6 链上查询最后完成：对 farm program `FarmqiPv5eAj3j1GMdMCMUGXqPUvmquZtMy86QH6rzhG`，按官方 SDK 1976 字节布局与五个 reward mint 偏移 248/552/856/1160/1464 过滤，返回 78/24/11/1/5 个匹配，去重后 **119 个 farm、119 条 RAY reward**（slots 452610288–452610296）。113 条在 UTC 起点之前结束；6 条 endTime 在该起点以后。它们只有每秒 1–13 raw units，按 UTC 2026-10-02 00:00 起点积分，未来30/90/365天分别为 **1.001101 / 1.001101 / 1.605901 RAY**。其中两条在10月2日03:40及03:43 UTC已经结束，核验时不再有未来支付；按参考时间12:29:02 UTC积分则为0.573222 / 0.573222 / 1.178022 RAY。其余到期为10月3日两条、10月6日一条，以及2027-01-01至01-08的一条。完整地址、原始速率和时间戳已记录到 JSON。

这些 v6 配置是已核合约计划，奖励由第三方 `rewardSender` 提供；未核资金是否来自协议挖矿储备，不能直接当作新增流通或和1.9M挖矿储备情景相加。这个结果也说明 farm-v2 metadata 的48条覆盖有滞后，不能据 API 说全部 v6 RAY 未来配置为0。

CLMM 使用官方 [SDK CLMM layout](https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/clmm/layout.ts)另作链上核查：在 program `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` 下，以 PoolState discriminator 和三个 reward mint 偏移 454/623/792 查询，分别返回 119/26/0 个匹配（slots 452609964/971/975），去重后 145 个池、145 条 RAY rewards，全部 endTime 已早于起点。因此**这次已覆盖的 CLMM RAY 配置，其既定未来未结束奖励为 0**；未来重新配置、新增池及未领取历史奖励仍另外处理。

对前端的推荐默认：未来30/90/365天显示官方文档速率情景约156,164 / 468,493 / 1,900,000 RAY；老团队/seed 0、额外mint 0；其他未知库存另列。staking v3 没有 v6 式固定 endTime，不应造一个 2027-10-02 的合约终止日。收入回购进入协议保管钱包不会减少 mint 总 supply；LaunchLab“burn”声明与 AMM 持币机制的永久性证据仍需另核，不能仅凭回购美元值推出净通缩。

## 对本地 supply-forecasts.json 的口径检查

截至本次只读检查，JUP 的每季50M延续情景、RAY的两个重叠年化场景以及团队历史排期结束为0的分类合理。建议补充这些已得证据：

1. JUP 分离现有 Q2 ASR carry-in 2,587,908.8057178557、领取截止 2026-10-08 14:00 UTC 与未来200M制度延续情景；Q1旧 remaining 已过期，不纳入 carry-in。
2. JUP 显示“通过政策维持时 Jupuary / Team Reserve 新发放0”，并保留实际执行 unknown。将 Team≈427.78M、Mercurial≈82.45M 和其他 TBD 库存独立展示；这些近似页面数不能标精确链上余额。
3. 把 RAY 文档场景的标签从“staking储备约1.9M”改为“mining储备释放约1.9M”：文档讲整体 mining 储备；当前已核发放大头是 staking。
4. RAY SDK source 指到实际 `src/raydium/farm/layout.ts`；补充已覆盖 CLMM 与 metadata 的 dated 查核，但保留其他生态/金库未来处置未知。
5. 所有额数外推同时需要“无调参、储备持续供资、slot速度假定、领取率假定”。不能把 scenario mode 的行误标成已经核实的完整未来解锁。
