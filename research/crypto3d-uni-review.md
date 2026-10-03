# Crypto3D 的 P/E、P/S 与 UNI 数据：公开源对照

核对时间：2026-10-02 18:52–18:54 UTC（北京时间 2026-10-03）。这是当前公开发布文件的核对，不是对其链上源数据的独立审计。保存文件、HTTP 时间和 SHA-256 见 [manifest](evidence/crypto3d-uni/manifest.json)。未修改应用代码和项目 profiles。

## 结论

Crypto3D 能显示 P/E，主要因为它把**市值除以年化持币人回报**称为 P/E；主表没有用 Net Inc 作为这个倍数的分母。UNI 的公开损益表又把销毁估值同时列作收入、毛利和净利，运营成本没有数值。本地若复刻该口径，倍数可以计算，但应叫“持币人统计金额倍数”，与完整经营成本后的净利润 P/E 分开。[参考页面](https://crypto3d.pro/equity/)、[UNI 损益快照](https://crypto3d.pro/data/snapshots/uniswap.json)

**当前 UNI 没有直接采用 DefiLlama 的兑换估值作为主表营收。** 其公开说明称 2026-04-22 已改为 Etherscan 主网 UNI 转入 dead 地址的统计，排除单笔大额一次性事件，然后按 UNI 价格重估；它把这个销毁金额命名为 protocol fees / revenue。故问题是“把销毁金额替代收入和净利润”，并非本地新发现的 Firepit API revenue 复制问题。其数据日期与价格还存在下面列出的混合情况。[UNI 配置](https://crypto3d.pro/data/protocols/uniswap/config.json)

## 主表实际代码及周期

保存的 [equity.html](evidence/crypto3d-uni/equity.html) 可定位以下实现：

| 位置 | 代码使用的字段与意义 |
|---|---|
| 第 388 行 | `currentYieldPeriod = '365d'`，默认 1Y |
| 第 416–466 行 | 先载入 `../data/all-protocols.json`，再把 daily latest 中非 null 的字段合并；缺财务字段时才从 snapshot 补非零值 |
| 第 554–590 行 | 7D / 30D / 90D 使用预计算 `metrics.shareholder_yield_Nd_ann` 和 `metrics.total_yield_Nd_ann`；1Y 使用顶层 percent 字段。P/E = `100 / tevYield`；P/S = `100 / earningYield` |
| 第 610–611 行 | Rev 与 Net Inc 始终显示 `revenue_usd_365d` 和 `net_income_usd_365d`，不随所选短周期改成对应金额 |
| 第 472–473、501–502 行 | P/E、P/S 排序用顶层年度收益率，即短周期显示与排序也不一定采用同一周期 |

因此不能依据表中 P/E 旁边同时出现 Net Inc，就推定 P/E 已经等于市值 / 那个净利润。UNI 默认 1Y 恰好给出近似相同值，是该项目的收入、持币人回报、净利都被设置为同一烧币估值造成的。详情页也使用收益率倒数，见 [protocol 页面](https://crypto3d.pro/equity/protocol?id=uniswap) 保存源码第 815–842 行。

当前公开数据的 UNI 例子（仅复现发布字段；未独立认证其收益率）：

| 所选周期 | 股东回报率 / Earning Yield | 原始倒数 P/E = P/S | 主表格式化显示 |
|---|---:|---:|---:|
| 7D 年化 | 0.87% | 114.943x | 115x |
| 30D 年化 | 0.69% | 144.928x | 145x |
| 90D 年化 | 0.75% | 133.333x | 133x |
| 1Y | 0.327% | 305.810x | 306x |

7/30/90 天年化方法由其 `config.calc_pipeline[4].formula` 描述为：窗口金额 × 365/N ÷ 市值。上述页面只消费预计算收益率，并未在浏览器中重新读取逐笔记录、按最新市值复算。[all-protocols 发布数据](https://crypto3d.pro/data/all-protocols.json)

## UNI 的 Net Inc 具体从哪里来

[snapshot 文件](https://crypto3d.pro/data/snapshots/uniswap.json) 的精确路径与值如下：

| JSON 路径 | 当前发布值 |
|---|---:|
| `income_statement.revenue.revenue_included.burn_usd_365d` | $18,365,812.03 |
| `income_statement.revenue.revenue_included.protocol_fees_usd_365d` | $18,365,812.03 |
| `income_statement.revenue.revenue_included.total_usd_365d` | $18,365,812.03 |
| `income_statement.gross_profit.gross_profit_usd_365d` | $18,365,812.03 |
| `income_statement.net_income.net_income_usd_365d` | $18,365,812.03 |
| `income_statement.net_income.operating_cost_usd_365d` | null |
| `income_statement.token_emission_cost.usd_365d` | null |
| `income_statement.margins.net_margin_percent` | 100% |

`net_income.calculation_note` 将净利定义为股东回报；不是一份列出开发、增长、人员、供应商等完整经营成本的独立利润表。`verification.method` 明示：4,580,003 UNI × $4.01 = $18,365,812.03。公开的 `verified` 标签应理解为网站对其口径的标记，不能扩展为这些成本已核实为零、每笔 burn 都来自当前经营收入、或每笔 UNI 都在市场买入。[公开 UNI 损益快照](https://crypto3d.pro/data/snapshots/uniswap.json)

其 `token_emission_cost.calculation_note` 还把 10 亿供给称为封顶；本地已核官方 UNI 存在可治理行使的 mint 权限，应保留“权限未使用”与“永远不能增发”的区别。金库季度预算释放同样不在该 Net Inc 数值中独立量化。

## 来源、范围与新鲜度

UNI `config.calc_pipeline[0]` 指向 Etherscan V2 UNI Transfer 日志查询；`[1].output_file` 明示 `data/protocols/uniswap/burn-history.json`。该公开文件已取到。[burn-history](https://crypto3d.pro/data/protocols/uniswap/burn-history.json)

这条口径的已公开限制是：只覆盖 Ethereum 主网；统计所有来源转入 dead 的 UNI，而非只筛选 Firepit 经营兑换；对大额一次性事件用数量阈值过滤。大额门槛在配置 prose 中写 `>=10M`、burn-history 的 source 文本写 `>10M`；本次没取得执行脚本，不能确定等于 10M 时实际如何处理。公开日汇总文件通常没有每笔 tx/from 归属，不能单靠该文件完成经营来源审计。[配置与计算流程](https://crypto3d.pro/data/protocols/uniswap/config.json)

| 公开字段 / 文件 | 日期或数值 | 能证明的范围 |
|---|---|---|
| `all-protocols.generated_at` | 2026-10-02 00:14:56 UTC | 汇总文件的生成时间 |
| `daily/uniswap/latest.updated_at` | 2026-10-02 00:14:52 UTC | 日行情文件更新；该文件包含 DefiLlama / CoinGecko 来源说明 |
| snapshot `as_of` / `verification.last_checked` | 2026-10-02 | 网站标记，不足以证明 underlying burn 全量更新到这天 |
| `protocols.uniswap.validation.data_range.end` | 2026-08-01 | 汇总中声明的烧币来源范围终点 |
| UNI config `last_updated` | 2026-08-02 | 专属配置时间 |
| burn-history / tev-records `updated_at` | 2026-08-10 13:11 UTC | 已公开烧币日文件最新更新时间 |
| burn-history 最大日记录 | 2026-08-10 | 当前公开日烧币文件未覆盖后续研究日；缺日不等于零 |
| validation `uni_price_usd` | $4.01 | 当前 Net Inc 采用的重估价格 |
| 最新汇总 `metrics.current_price_usd` | $8.98 | 最新行情价格，未同步替换上述烧币估值价格 |

此外，当前汇总市值是 $5,616,491,951，daily metrics 市值是 $5,614,453,461，而专属 config 市值仍是约 $2.542B。短期收益率 0.87% / 0.69% / 0.75% 可近似用旧 config 市值复现；按发布 burn 数量 × $4.01，再除最新汇总市值，分别约为 0.395% / 0.311% / 0.340%。这说明公开预计算字段没有统一按最新市值重算；具体后端流程未取得，原因保持未知。[汇总](https://crypto3d.pro/data/all-protocols.json)、[日快照](https://crypto3d.pro/data/daily/uniswap/latest.json)、[专属配置](https://crypto3d.pro/data/protocols/uniswap/config.json)

latest 的 `metrics.trailing_30d_shareholder_returns_usd` 为 $1,996,110、`trailing_365d_shareholder_returns_usd` 为 $2,952,151，也不等于上级保留的 $18.366M 年度金额。主表合并后仍以已有 yield 字段计算 P/E/P/S；不能把新 daily 金额当作表中倍数的实际分母。这些文件的生成日期、交易覆盖截止日、币价日期应分别展示，不能只用“更新到 10 月 2 日”概括。

历史图 [history/uniswap.json](https://crypto3d.pro/data/history/uniswap.json) 虽列出截至 2026-10-02 的 365 行，364 行的 `daily_value_status` 是 `estimated`，最后一行是 `pending`；它不能补足独立实际利润来源。

## 可兼容的本地指标

- **持币人统计金额倍数（参考站 P/E 口径）**：流通市值 / 年化 holders 统计额。注明项目分别统计费用分配、已执行兑换／销毁估值等，不能统称净利润。
- **API 收入字段倍数（参考站 P/S 类比）**：只在明确展示字段性质时作为附加比率；UNI 的分母须叫兑换 UNI 估值，不能放入真实协议收入 P/S。
- **净利润 P/E**：完整经营成本和独立同窗净利来源未取得时保持未知。该未知不妨碍显示上面可复算的规模倍数。

复算时使用本地同窗数据与同日市值，不照搬参考站的较早数值；保留原始来源、窗口、币价计量方法、一次性事件处理与成本缺口。网站可计算一个类比指标，与该项目已有可验证的股票式净利润，是两件不同的事。
