# UNI 费用去向图：来源与绘图边界

核对日期：北京时间 2026-10-03。数值示例使用本地 `data/dashboard.json` 的 2026-10-02 研究快照，30 天窗口为 **2026-09-02 至 2026-10-01 UTC**。在线 API 只用于检查现时元数据，不与缓存金额混拼。

## 首要纠正：当前 API 的收入字段实际来自 UNI 兑换估值

固定到 DefiLlama adapter commit `3e56fc842b3d26aac2648a5a506cd282ceb9b6ab` 的 [`uniswap-v3.ts`](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/uniswap-v3.ts#L22) 后，代码明确：

- `fetchHoldersRevenue()` 读取各链 Firepit 的 `Released` 日志及 `threshold()`。
- 用 `日志次数 × 查询所得 UNI threshold / 10^18` 得到 UNI 数量，再调用 `addCGToken("uniswap", amount)` 估值。
- `dailyRevenue` 直接取该 `dailyHoldersRevenue` 的 USD 值。

因此，本次两个 API 字段相等是**同一兑换统计额的复制**，不是两份独立的收入与现金支出证明。此前本地说明将其称作“协议手续费应计”需要纠正。字段名称 `dailyRevenue` 本身不能证明它是协议当期收取手续费的美元值。

适配器没有逐笔读取执行者公开市场买入 UNI 的成本，也没有逐项估值其取得的费用资产。它用一个查询所得阈值乘当天所有事件数；若阈值日内变化，需进一步逐事件验证。各链的兑换也不等于全部已在主网最终销毁到账。建议用户可见名称为 **“兑换 UNI 的美元估值”** 或 **“兑换／销毁统计额”**，而非“实际现金回购支出”。

主表 P/S 和“协议收入占手续费”等计算也受影响：在未取得独立费用收入值之前，不应把该估值作为协议收入分母；可以保留回购／销毁规模统计及对应年化占市值比率，但注明来源方法。

## 缓存中可以复算的金额

| 字段 | 30 天金额 USD | 性质 |
|---|---:|---|
| 父级 `dailyFees`，F | 197,185,791.55 | 纳入父级的各版本、各链 swap 手续费统计 |
| 父级 `dailyRevenue` | 15,204,293.00 | Firepit 兑换 UNI 统计额的美元估值，不能独立认定为费用收入 |
| 父级 `dailyHoldersRevenue` | 15,204,293.00 | 与上一字段逐日相等 |
| F − API revenue | 181,981,498.55 | 两个不同时间／估值口径的统计差额；不等于已核 LP 分成或运营成本 |
| 独立协议手续费收入 R | 未取得 | 需要费用资产归集／累积与释放资产对账 |
| 当期实际市场买入 UNI 现金成本 | 未取得 | 执行者可能使用已有 UNI 库存 |
| 各链兑换对应的主网最终销毁量 | 未完整对账 | 需同一 canonical UNI 转账及跨链到账证据 |

金额应随所选窗口从同份缓存重算。数据缺日、来源定义变化、范围不匹配时保留未知，不把它改成零。

### 手续费构成可以按版本展示，但不要用它推断收入版本

| `dailyFees` 子项 | 30 天 USD |
|---|---:|
| Uniswap V1 | 7,660.55 |
| Uniswap V2 | 4,573,680.14 |
| Uniswap V3 | 62,174,256.36 |
| Uniswap V4 | 130,430,192.30 |
| 子项合计 | 197,185,789.35 |
| 父级减子项合计 | 2.20 |

30 天每日日细分合计与父级存在少量差异，最大绝对日差为 3.07 USD；原因未逐项核定。可显示“子项约数／细分统计差额”，不能按比例填平到某一产品或 LP 钱包。

`dailyRevenue` 与 `dailyHoldersRevenue` 的版本细分**全部挂在 Uniswap V3**，V1、V2、V4 显示零。API 方法说明明确 v2、v4 的兑换统计也合并在 v3 adapter：这些零是统计挂载方式，不代表 v2、v4 没有协议收费。不能画“全部收入来自 v3”，也不能把三份相同的实际兑换重复相加。

### 兑换统计可以按执行链展示，不能称作产品收入构成

| 执行链 | 30 天兑换统计额 USD |
|---|---:|
| Ethereum | 3,245,639 |
| Base | 2,234,103 |
| Arbitrum | 617,685 |
| BSC | 482,773 |
| Polygon | 104,026 |
| OP Mainnet | 64,642 |
| Robinhood Chain | 8,455,425 |
| 合计 | 15,204,293 |

这七项与父级兑换统计每日及窗口合计精确吻合。标签应为“按执行链统计的兑换估值”，不能暗示交易量、实际费用来源或最终主网销毁分布。

## 推荐的 UNI 图

图分成两条互相关联的路径，用箭头表示机制，数字卡表示已取得的统计；不要把不同估值口径画成严格守恒的现金 Sankey。

费用路径：

`兑换用户 → swap 手续费（F） → LP 所得／协议费份额 → Fee Adapter 归集 → TokenJar 费用资产 → 执行者领取费用资产`

- “LP 所得”和“协议费份额”按已启用版本、链、池的参数发生；真实窗口合计尚未独立量化。
- 归集时间、兑换时间可能不同，TokenJar 的资产余额也是存量。
- v2 适用池通常总费 30 bp，LP 25 bp、协议 5 bp；v3 按池档位，v4 按 family／配置，不能给全父级 F 无条件乘同一个比例。[费用配置](https://developers.uniswap.org/docs/protocols/protocol-fee/concepts/fees)。

UNI 路径：

`执行者提供 UNI（来源未核） → Releaser 兑换 → 主网 dead 地址／跨链最终送达`

- 与费用路径在 Releaser 处连接，画清 **费用资产出、UNI 入** 两个方向。
- 可在 Releaser 旁放“本窗兑换 UNI 估值 15.20M USD”的统计卡；以虚线连接统计卡与机制节点。
- 主网 Firepit 把 canonical UNI 送 dead；其他链可能先桥接／转送，完成主网永久移除另核。[官方流程](https://developers.uniswap.org/docs/protocols/protocol-fee/overview)、[Firepit 源码](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/releasers/Firepit.sol)。
- 执行者领取略多于提交 UNI 价值的资产以覆盖 gas、桥接、价格风险及价差；不能将 15.20M 当费用资产已全部兑换净额，更不能假定同额市场买单。低价值资产可能继续留在 TokenJar。[ExchangeReleaser](https://github.com/Uniswap/protocol-fees/blob/0c071d199dc32556365c78e03ec3f4d09b9fbf37/src/releasers/ExchangeReleaser.sol)。

建议节点名：**“用户 swap 手续费”／“LP 所得（实际合计未核）”／“协议费份额（实际合计未核）”／“TokenJar 累积费用资产”／“执行者交 UNI，领取费用资产”／“兑换 UNI 的美元估值”／“主网 dead 地址：经济永久移除”**。

需要展示 F−API revenue 时，将它放在灰色统计说明中，名称为 **“手续费与兑换估值的差额”**。不画成标称金额的 LP 已收款箭头，也不把 API revenue−holders 的零画成“运营金库余额为零／利润为零”。

## Unichain、Optimism 与其他范围

当前缓存 `dailyFees` 的 Unichain 链分项 30 天为 **718,862 USD**，它是 Uniswap DEX swap 费；排序器 gas／sequencer 收入是另一个费用范围。固定适配器确有 Unichain Firepit 配置，自 2026-01-09 跟踪兑换；本窗口该链兑换估值为零，不证明排序器没有收入，也不证明 TokenJar 没有累积资产。

UNIfication 描述排序器费在扣除 L1 数据成本及给 Optimism 的 15% 后进入 burn 路径。现有父级 F 不能据此再减一个 15%，也不能把 F−API revenue 的金额拆成 L1 与 Optimism 成本。图可在侧边另放 **“Unichain 排序器费用：扣 L1 数据成本、Optimism 分成后进入兑换路径；本图未单独量化”**，用虚线表示未取得同窗资产明细。[UNIfication](https://blog.uniswap.org/unification)。

Labs 的历史界面／钱包／API 费、治理金库售币、一次性 100M 库存经济销毁、20M/年的成长预算分别属于不同主体、存量或费用支出路径，不能并入本窗 swap 手续费／兑换估值。成长预算也不能从本窗数字中简单扣出会计利润。

## 子项重复与动态 API 检查

缓存三个父级响应的 `doublecounted` 字段以及 embedded child 对应字段均为 `null`。这表示没提供标志，不能当 `false`。北京时间 2026-10-03 的只读实时核对中，单独查询 v1/v2/v3/v4 四个 child，均返回 `doublecounted=false`，未发现 PUMP Mobile 那样明确标为重复的 child。

这不构成独立的全数据审计。构图数值仍只取父级一次，子项只用于解释构成；版本 revenue 桶已合并，不能把它当作相互独立的收入来源再加回父级。实时父级最新日 fees 已从缓存的 4,588,822.94 变为 4,519,781，说明在线 API 可以修订历史或进行不同刷新；用于图的缓存与在线核对结果必须分开。

来源路径：`data/raw/llama-uniswap-{fees,revenue,holders}.json` 与相应 `.meta.json`；在线字段为 `https://api.llama.fi/summary/fees/uniswap?dataType=dailyFees` 等。父级 API 和统计挂载方法可能变化，必须同时保存代码版本、方法说明、原始响应哈希、窗口和核对日期。

## 对公共图模型的独立审阅

1. **F→F−R、R 的拆分须有同范围、同估值性质的输入。** 在协议费收入可核时，可以把 F−R 标为“LP／创作者等所得（两统计差额）”；它仍不是已扣开发、运营、增长、税务等完整成本的净利润。UNI 的 API R 是兑换 UNI 的估值，当前不满足这个金额守恒前提，只能分别展示费用与兑换统计。
2. **R→回购／销毁节点按来源选择路径。** HYPE、JUP、RAY 的分配额可以画“费用分配／回购额度”，实际成交、锁仓与销毁另核。HYPE 图须使用已去重费用，AF 的费用份额也不能画成已成交美元买单；365 天跨旧政策时不能全标为当时已永久销毁。
3. **PUMP 的 burn 估值单列。** 放在“已销毁代币估值”节点，虚线关联回购／销毁机制；不从 R 实线扣除，不用 R−burn 生成“金库保留金额”，即使算术上恰好非负也不代表同口径现金流。发现重复的 Mobile 子项时，先使用各指标独立核定后的去重结果，不把子产品重新相加。
4. **UNI 也应采用兑换估值路径。** API `revenue=holders` 不能被误画为“收入100%已现金回购”，更不能把该值分别算一次收入、一次销毁，再给父级添一笔金额。
5. **未知、零、政策与执行分开。** 缺完整成本就不画净利润；未知实际买入／主网最终 burn 保留未知；零只指已明确范围内的那个字段。固定金额箭头应来自同一窗口，并在旁边区分“实际事件记录、按规则计算、统计差额、未量化机制”。
6. **图表示费用或资产去向，不表示持币人收到现金。** 普通质押、储备持币、销毁、团队／金库释放是不同供给事项；100M 金库存量销毁和预算释放放在独立供应说明中，不能拿它们填补经营流图。
