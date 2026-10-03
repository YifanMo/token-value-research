# Crypto3D 当前 P/E、P/S：HYPE/PUMP 核验

核查时间：2026-10-03 02:52–02:56 北京时间（2026-10-02 18:52–18:56 UTC）。仅检查当前第一方公开HTML/JSON，没有运行浏览器、读取未公开更新脚本或修改本地应用。原始响应及其URL/时间/SHA保存在本目录。

## 结论

Crypto3D 能显示 P/E，主要因为它把「持币人回报倍数」称作 P/E：`市值÷年化holder returns`。它没有把 Net Income 字段放入这个算式。HYPE 的 Net Income 本身又直接复制收入，运营成本、LP成本均为空，并自行说明没有经营成本模型。这份当前数据没有提供本地缺少的完整净利润台账。当前主汇总26项目中没有 PUMP，也未发现被详情模板引用的 PUMP 数据，因此不能声称其已给出 PUMP 的真实净利润/P/E。

## 可直接复现的来源路径

| 功能 | 当前第一方路径 | 本地档案 |
| --- | --- | --- |
| 首页公式、加载合并、7/30/90/365选择 | [equity](https://crypto3d.pro/equity/) | `equity.html`（根任务维护） |
| 主汇总 | [all-protocols.json](https://crypto3d.pro/data/all-protocols.json) | `all-protocols.json`（共享基准） |
| HYPE最新日信息 | [daily/hype/latest.json](https://crypto3d.pro/data/daily/hype/latest.json) | `hype-daily.json` |
| HYPE详情模板 | [protocol?id=hype](https://crypto3d.pro/equity/protocol?id=hype) | `hype-detail.html` |
| HYPE机制与计算过程 | [protocols/hype/config.json](https://crypto3d.pro/data/protocols/hype/config.json) | `hype-config.json` |
| HYPE损益与估值 | [snapshots/hype.json](https://crypto3d.pro/data/snapshots/hype.json) | `hype-key-snapshot.json` |
| HYPE历史损益标签 | [history/hype.json](https://crypto3d.pro/data/history/hype.json) | `hype-history.json` |
| HYPE持币人统计历史 | [protocols/hype/tev-records.json](https://crypto3d.pro/data/protocols/hype/tev-records.json) | `hype-tev-records.json` |

`snapshots/hyperliquid.json`亦存在，数据与hype键一致，仅protocol名称不同。首页实际使用key=`hype`，不能误用daily/hyperliquid。详情旧`protocol.html?id=...`返回308，Location为`/equity/protocol?id=...`（没有末尾斜杠），新地址可公开读取。

PUMP的详情URL会返回通用HTML模板，不能据HTTP200认定有数据。模板L780先读`../data/protocols/${pid}/config.json`，非OK即抛出Protocol not found；目前`protocols/pump/config.json`、`daily/pump/latest.json`、`snapshots/pump.json`全部404，失败状态/时间已归档。all-protocols当前也无pump键或PUMP ticker。没有穷举未引用的其他别名，结论限定在当前首页与已引用模板路径。

## 公式与窗口

当前首页源码：L325说明P/E口径，L472–473给排序函数，L552–591给显示函数。

- P/E=`100÷所选shareholder yield百分比`，等价于市值/年化持币人回报；不是市值/会计净利润。
- P/S=`100÷所选earning yield百分比`，意图为市值/年化配置收入；是否真收入仍须审查项目方法。
- 默认365d；7/30/90用`metrics.shareholder_yield_Nd_ann`及`metrics.total_yield_Nd_ann`，365用顶层percent。HYPE配置的计算流程为过去N天dailyRevenue加总，乘365/N后除以市值。
- 缺短窗百分比时回退顶层365百分比，未强制显示未知；不能仅凭按钮判断实际窗口完整。
- 首页Revenue和Net Inc列始终取`revenue_usd_365d`/`net_income_usd_365d`（L610及排序代码），不会跟7/30/90按钮同步变成短窗数字。详情损益表同样取365字段。
- 浏览器读取的是站方生成的静态JSON；上游更新过程在HYPE配置中列DefiLlama和Hyperliquid info等来源，本次未取得其未公开脚本。当前公开文件没有完整经营成本证据。

## HYPE数值例与成本边界

主汇总`generated_at=2026-10-02T00:14:56.314668Z`，snapshot `as_of=2026-10-02`。

| 输入/输出 | 当前值 |
| --- | ---: |
| 主汇总市值 | $19,496,307,623 |
| 365收入 | $772,987,701 |
| 365毛利 / Net Income | 同为$772,987,701 |
| LP成本 / 运营成本 | null / null |
| 毛利率 / 净利率 | 100% / 100%（模型值） |
| 365持币人回报 | $765,257,823.99，等于收入×0.99 |
| snapshot P/E | 19,496,307,623÷765,257,823.99=25.4768x |
| snapshot P/S | 19,496,307,623÷772,987,701=25.2220x |
| 若真的以其Net Income为P/E分母 | 25.2220x，与所显示P/E不同 |

Net Income和毛利并非独立测得；收入被直接复制，缺失成本没有阻止它显示100%净利率。HYPE snapshot还把“无持续增发”与成本为空等同，未展示贡献者/社区首次流通释放，因此不能用这张模型损益表消除未来稀释风险。

费用归属已被dailyRevenue处理时，再乘0.99不一定正确。本站HYPE snapshot用R×99%，而return_summary又写100%，analyst_notes仍保留AF可动用和HLP占40–46%的旧描述，与当前不可取回共识及已核99:1合格收费模型不一致。这些内部冲突要求单独复核，不能把“verified”标签当完整审计结论。

## 当前文件混合了不同日期/分母

HYPE主汇总短窗R和预计算yield如下；精确窗口起止未在这些字段旁列明。

| 所选窗口 | 配置R | 配置yield | 网页P/E与P/S | R按当前主汇总市值重算yield |
| --- | ---: | ---: | ---: | ---: |
| 7d | $8,228,544 | 5.82% | 17.18x | 2.2007% |
| 30d | $34,979,838 | 5.78% | 17.30x | 2.1829% |
| 90d | $142,582,881 | 7.85% | 12.74x | 2.9660% |

这三组yield与config中旧市值$7,368,065,201复算吻合到显示精度，而与当前主汇总$19,496,307,623不吻合。例：30天$34,979,838×365/30÷当前市值=2.1829%，相应倍数45.81x；页面却使用预计算5.78%，显示17.3x。能够确认是当前字段不一致，不能仅凭这点确定后台哪一天停止更新。

daily/hype/latest又给`updated_at=2026-10-02T00:14:09Z`、价格$51.51和市值$11,458,194,541，而主汇总价格$87.61/市值$19.496B。daily把它们放在latest_record里，首页浅层合并没有提升为外层market_cap字段，短窗yield也未重算。不能把文件“今日生成”理解为全部输入都在同一时点。

tev-records的591日历史最后一项为2026-08-09，文件更新时间2026-08-10；与标为10月2日的短窗数据也未逐日对齐。history/hype.json含2026-10-02 snapshot，但历史daily_value标estimated/最新pending，Net Income长期100%净利模型；不是新增独立成本账。

## 与本地缓存的差异与可用改进

本地统一快照市值$20,215,108,768，HYPE统一30天费用去重$70,889,789、AF分配+HIP-1销毁估值$55,355,695，365捕获统计$684,247,605；均与站方金额/时点不同。不能把两个站的倍数差直接解释成估值模型优劣。本站HYPE使用的DefiLlama/Hyperliquid信息源本地也已识别；未发现额外完整净利润来源。

本地可以立即复算同类「持币人捕获倍数」，但应保留经济名称，不能冒充P/E。例如本地PUMP30天burn估值$23,922,255年化后，市值$2,722,059,524÷该统计≈9.35x。这不是PUMP市盈率：burn估值不等于利润或实付买币成本。PUMP真正P/S已有去重收入分母，当前4.49x；P/E仍需完整成本数据。

机器复算在`hype-pump-reproduction.json`，保留公式、窗口缺口、旧/新分母与当前PUMP不可取得的状态。没有修改报告、app、pipeline、profiles或dashboard。
