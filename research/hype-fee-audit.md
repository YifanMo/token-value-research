# HYPE：99% 为什么与表格比例不同

核对日：2026-10-03（北京时间）。继续使用 **2026-10-02 行情快照、2026-09-02 至 2026-10-01 的30个完成UTC日**，未更新价格。分项接口另于本次核对抓取，其实际时间、原始字节哈希及各窗口覆盖保存在 [完整核对记录](hype-fee-audit.json)。

**分母不同，且原表确有一项重复。** 99%是合格交易费分配给 Assistance Fund（AF）的规则；原来的77.48%是第三方协议收入统计除以父级总手续费。父级总手续费重复加了一次HLP，去重后该比例为 **78.09%**。之前直接采用父级汇总，未检查这个重复项，现已修正。

## 1. 99%的分母

本次归档的DeFiLlama代码按以下方法统计：

```text
永续合格费用 = 永续毛费用 − builder分成 − HIP-3部署者分成 − 做市返佣
永续AF收入 = 永续合格费用 × 99%
现货AF收入 = 非Unit现货费用 × 99%
持有人统计金额 = 永续AF收入 + 现货AF收入 + HIP-1竞价销毁的美元估值
```

[helper代码](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/helpers/hyperliquid.ts#L193)注明团队确认，阈值为UTC 2025-08-30 00:00，严格大于阈值时AF/HLP比例为99%/1%，逐日零点口径因此从8月31日取99%；[永续适配器](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/hyperliquid-perp/index.ts#L74)与[现货适配器](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/dexs/hyperliquid-spot/index.ts#L90)使用该规则。[官方费用文档](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)说明费用在HLP、AF和部署者之间分配；当前该页面没有直接写“全部毛费用的99%”。

代码固定在commit `3e56fc842b3d26aac2648a5a506cd282ceb9b6ab`，本地副本及SHA256见完整核对记录。**这里验证的是第三方计算采用的分配规则，尚未把AF每笔买入成交重建为现金回购台账。** 规则中的99%与依据该规则生成的收入统计相符，不构成独立执行证明。

## 2. 原始父级总额为什么要去重

| 原始API子协议 | 手续费USD | 协议收入 / 持有人统计USD |
|---|---:|---:|
| Perps | 68,298,832 | 53,283,842 |
| Spot Orderbook | 2,590,957 | 2,071,853 |
| HLP | 556,924 | 0 |
| 父级相加 | 71,446,713 | 55,355,695 |

HLP这556,924美元是Perps/Spot费用中的分成，另列子协议时又被父级加进手续费。[HLP代码](https://github.com/DefiLlama/dimension-adapters/blob/3e56fc842b3d26aac2648a5a506cd282ceb9b6ab/fees/hyperliquid-hlp.ts#L55)明确标记 `doublecounted: true`，并说明已计入Perps/Spot供应侧分成。上述数值来自保存响应的 `totalDataChartBreakdown`，每一天的三个子项之和都与父级 `totalDataChart` 精确相等。[本次父级手续费JSON](../data/responses/52d9ebea4ee80a1040bf8921a88dcadcc44b2f37c6fa7788d1a8b603d7898dbd.json)、[在线父级API](https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyFees)

```text
去重总手续费 = 71,446,713 − 556,924 = 70,889,789 USD
协议收入占去重总手续费 = 55,355,695 ÷ 70,889,789 = 78.086979...%
```

这次仅剔除父级额外加的HLP行。Perps/Spot原本包含的HLP分成仍留在用户总费用中，不会再次扣除。

## 3. 不进入HYPE的费用，能否直接取得分项？

可以。以下是公开分项接口的同窗逐日加总，没有用“剩余差額”倒推分给各方多少。

| 分项API记录的费用去向 | 30天USD |
|---|---:|
| Builder Code Distribution | 9,395,934 |
| HIP-3 Deployer Distribution | 2,109,843 |
| Maker Rebates（做市返佣） | 2,963,115 |
| Unit Revenue | 500,403 |
| HLP分成（Perps+Spot标签） | 556,926 |
| 上述标签合计 | 15,526,221 |
| 去重总费 − 持有人统计金额 | 15,534,094 |
| **尚未对上的金额** | **7,873** |

两份直接来源：[永续分成API](https://api.llama.fi/v2/chart/fees/protocol/hyperliquid-perps/label-breakdown?dataType=dailySupplySideRevenue)、[现货分成API](https://api.llama.fi/v2/chart/fees/protocol/hyperliquid-spot-orderbook/label-breakdown?dataType=dailySupplySideRevenue)。本次完整JSON也已按字节哈希归档，链接见完整核对记录。HLP标签合计与父级HLP子项差2美元，其他标签与子协议汇总也有数美元差异，均原样保留。

改用子协议summary的供应侧总额对账，30天未解释金额为7,880美元，全部来自Perps；与分项标签口径差7美元。**目前没有足够底层价格或indexer账本证据确定原因，不把未解释金额归给builder、Unit或其他方，也不称完整财务对账。**

长窗缺口更大，不能把30天的接近对平推广为全年可靠：

| 窗口 | 去重总费USD | 持有人统计USD | 去重总费减持有人、再减分成标签后的未解释金额USD |
|---|---:|---:|---:|
| 7天 | 13,738,019 | 10,542,172 | 1,260 |
| 30天 | 70,889,789 | 55,355,695 | 7,873 |
| 90天 | 187,730,934 | 142,024,040 | 4,148,622 |
| 365天 | 900,083,023 | 684,247,605 | 62,159,077 |

这些窗口均有完整日记录。完整覆盖只证明没有缺日，不证明收入、分成与销毁的统计口径能够全部对平。

## 4. 55.36M是否全是回购现金？

不是现金成交统计。本窗持有人标签分成 **AF Token Buy Back统计55,135,546美元**，以及 **HIP-1竞价销毁估值220,149美元**，相加55,355,695美元。[永续持有人标签API](https://api.llama.fi/v2/chart/fees/protocol/hyperliquid-perps/label-breakdown?dataType=dailyHoldersRevenue)、[现货持有人标签API](https://api.llama.fi/v2/chart/fees/protocol/hyperliquid-spot-orderbook/label-breakdown?dataType=dailyHoldersRevenue)

AF标签按合格费用分配规则计算；HIP-1标签是支付HYPE直接销毁后的美元估值。都不能直接读成“本期实际花55.36M美元现金从市场回购”。相邻列100%表示这个API的协议所得收入与持有人统计金额相同，不等于全部用户手续费100%用于回购。

## 5. 本地修正与持续更新规则

`scripts/refresh.py`仅对HYPE手续费应用 `exclude-hlp-duplicate-v1`，保留原始响应。窗口保存 `raw_usd`、`excluded_usd`、用于计算的 `usd`、未能处理的日期及原因。浏览器从保存响应重新计算三笔金额并核对哈希。

每一天要求已核对的Fees方法描述一致，Perps/Spot/HLP子项齐全，数值有限非负，子项合计与父级匹配。接口已在父级剔除HLP时不再次扣除；缺项、方法变化、合计不匹配或模糊时该日显示未知，不自动填0。全历史10天缺HLP；当前7/30/90/365窗口均可完整去重。原始父级数据、收入、持有人金额和行情保持原始值。

此规则基于本次固定代码与公开元数据核对。元数据变化会阻止自动使用旧规则；上游若修改实现却未同步说明，仍需要人工复核适配器。分项标签是此次额外保存的核对证据，**不随常规refresh自动更新**，不能在未来刷新后冒充新窗口数据。
