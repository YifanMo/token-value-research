# BNB 季度销毁历史来源核验

核验时间：2026-10-03 UTC。结构化结果见 `data/bnb-quarterly-history.json`。

已从逐期 Binance 官方公告和 BNB Chain 官方文章读到第 1 至 36 次季度销毁总额，并保存了每期原始 HTTP 响应。清单有 36 期已发生事件、40 份官方证据（36 篇逐期公告，另加 Pioneer 机制、追踪器推荐和 Beacon Fusion 文档 4 份）。每份证据有抓取时间、SHA-256、保存路径、原文 URL；Binance 公告同时有实际返回 JSON 的 CMS URL。第 37、38 次是追踪器对尚未完成季度的预测，未放入已发生历史。

## 数据的证据层级

- `reported_total_tokens`：逐期官文报告的季度总额，全部为 `official_announcement_verified`。
- `actual_tokens`：官文明示的 actual/real burn，或报告总额减明确披露的 Pioneer 数量；方法分别为 `explicitly_reported`、`total_minus_pioneer`。它们不是本项目独立完成链上交易复核的标记。
- 独立链上数量、交易成功状态、区块时间以现有季度交易核验记录为准。该清单不写 `verified: true`，避免“已读公告”与“已读交易回执”混淆。
- `announcement_date` 是官方 CMS 发布时间对应的 UTC 日期，或 BNB Chain 页面日期。`execution_date` 在这份静态清单中保留 null，等待链上区块时间独立填入；公告时间不能替代交易执行时间。
- Pioneer 从 2020-09-18 发布。第 1 至 12 次早于该机制，Pioneer 为不适用；公告明确写 Nil 的第 27、28、29 次记 0。其余未给出拆分的事件保留 null。第 15、31、33、35、36 次实际新转入销毁地址数量在本清单仍未知，不能将未披露 Pioneer 当作 0 来填。
- 第 2 次官方公告未链接交易，保留追踪器的 TX 索引且 `tx_in_announcement: false`。其余 35 期均从官文正文或链接读到相应 TX。

## 发现的量与日期差异

| 次数 | 核验发现 | 处理 |
| --- | --- | --- |
| 13 | 官文总额 2,253,888，实际 2,253,021，Pioneer 867；追踪器 Pioneer 空白 | 从官文补拆分，保留追踪器原始值 |
| 14 | 官文总额 3,619,888，实际 3,609,050，Pioneer 10,838；追踪器 Pioneer 空白 | 同上 |
| 18 | 官方公告发布于 2022-01-17，追踪器 burnDate 为 2022-01-18 | 公告日期、交易时间和追踪器日期分别保存 |
| 25 | 官方总额 2,139,182.98，Pioneer 314.69，官文推算实际 2,138,868.29；追踪器总額 2,139,182 | 不把整数截断当作精确链上总额 |
| 26 | 官文总额 2,141,487.27，实际 2,139,945.12；追踪器总额截到整数 | 保留官文精度和不同证据层 |
| 27 | 官方总额 1,944,452.51；追踪器 amount 1,944,453 | 不将追踪器的舍入量冒充已核交易量 |
| 29 | 官文总额 1,772,712.363，含 1,710,142.733 公式 Auto-Burn 及 62,569.63 的 BToken 补计项；追踪器 amount 接近前者，未体现附加项 | 分列组成项，记录不同口径，不能丢掉附加销毁 |
| 30 | 官文总额 1,634,200.95，实际新转账销毁 1,524,200.95，Pioneer 110,000；后者对应 Beacon Chain 上已不可恢复的验证者自质押补偿 | 报告季度总额和实际交易额分列，不重复累计 Pioneer |
| 31 | 官文总额 1,579,207.72，追踪器 1,579,108.637346294，差约 99.08；官文没有给出原因或 Pioneer 拆分 | 明示未解释冲突；总额不覆盖已核交易值 |
| 32 | 官文总额 1,595,599.78，实际 1,595,470.69，Pioneer 129.10；分项之和比总额多 0.01 | 原文值完整保留，注明舍入差异。官文还指出 Lorentz/Maxwell 出块变快后公式参数已调整 |
| 34 | 官文披露 Pioneer 100.1 与 actual 1,371,703.67，追踪器更高精度 Pioneer 100.0995 | 各源精度保持，不覆盖交易或 tracker 原值 |
| 35、36 | 官文日期分别 2026-04-15、2026-07-15，追踪器 burnDate 分别 2026-04-24、2026-07-16 | 官文、链上、追踪器日期各自保存，统计以独立链上时刻为准 |

所有字段的原始值与差异说明可在结构化清单逐条查看；完整历史不是将 36 个追踪器预测金额直接改名为链上事实。

## 更稳定的数据获取方式

**首次补历史：静态官文清单 + 链上核验缓存。** 旧事件已经发生，不必每次打开网页再请求 36 篇文章或 36 个交易。将此次官文原始 JSON/HTML 和链上返回的交易/回执/区块存为不可变证据，后续渲染读取本地汇总。历史证据不会因为网站接口临时失效而从页面消失。

**定期发现新事件：官方推荐的社区追踪器作索引。** BNB Chain 在 [Tracking BNB Burn](https://www.bnbchain.org/en/blog/tracking-bnb-burn) 明确推荐 bnbburn.info 查询完整销毁历史与流通量；较早的 [22nd BNB Burn](https://www.bnbchain.org/en/blog/22nd-bnb-burn) 明确称其为社区建设的第三方网站。这个推荐提高了其可用性，但它仍是社区数据接口，不应被写成官方链上账本或承诺永远稳定的公共 API。已有样本证明它会混合预测、报告公式金额、执行日期与缺省 Pioneer。

**独立核验新增 BSC 事件：TX + receipt + block。** 第 27 次起季度销毁在 BSC 执行，官文给出黑洞地址。成功交易、接收地址、真实 value、区块 UTC 时间形成可机器检验的证据。用交易哈希去重，失败时保留上次已核结果；不从季度公式金额反推真实执行金额。BSC执行统计只纳入独立已核记录，完整历史分别标明证据层级；下一季预测另存。

**Beacon 旧链：使用其档案接口，不能把 BSC RPC 当作全历史节点。** 第 8 至 26 次发生在 Beacon Chain，ERC-20 BNB 的第 1 至 7 次在 Ethereum。BNB 官方 [Fusion Overview](https://docs.bnbchain.org/bc-fusion/overview/) 记录 Beacon 在区块 385,251,927 于 2024-12-03 停止出块；[Fusion FAQ](https://docs.bnbchain.org/bc-fusion/post-fusion/faq/) 列出 `https://api.bnbchain.org/bc/` 历史区块服务与 `https://explorer.bnbchain.org/` 浏览器，并说明历史会存入 Greenfield/Filecoin/Arweave。这些接口仍需实测返回能力，官文承诺或存档计划本身不是当前每笔交易已取回的证据。旧 ERC-20 迁移销毁也不能再计入季度供给减少，防止跨链重复统计。

本次实测已取得全部 19 笔 Beacon 浏览器 JSON：`https://explorer.bnbchain.org/api/v1/tx?txHash=<交易哈希>`。核对了哈希、成功状态、BURN_TOKEN 类型、BNB 资产、数量和 UTC 时间，保存原始返回；这些是官方浏览器索引确认，不是独立原始节点证明。另已通过 Ethereum RPC 核验 7 笔原始 ERC-20 Burn 事件，连同 10 笔 BSC 季度交易，共 17 笔独立核验。实际覆盖及原 AAVE 429 错误恢复证据见 `research/bnb-history-validation.json`。本次历史证明重复更新没有产生网络请求。

**官方公告 JSON 可以减少网页解析依赖，但不能当作有 SLA 的对外业务 API。** 实测普通 Binance 官方网页会返回 HTTP 202 空正文；对应 CMS 返回 JSON：

```
https://www.binance.com/bapi/composite/v1/public/cms/article/detail/query?articleCode=901a3d8dec1c42bba6e0931a7e68ceba
```

上面第 16 次公告请求为 HTTP 200，并含 title/body/publishDate/TX。发现旧公告时可查询 `article/list/query?type=1&catalogId=49&pageNo=…&pageSize=50`，然后只抓需要的 articleCode。它是官网使用的公开 CMS 接口，当前有效，不是经过文档承诺长期支持的交易 API。适合作官文抓取后备，仍应保留缓存、错误详情和人工复核入口。BNB Chain 的新文章 URL 也不能机械猜测：第 30 次真实链接是 `30th-bnb-burn-2`，第 32 次标题有额外空格。

## 保存响应校验

40 个来源均使用实际 HTTP 返回字节计算 SHA-256。`response_path` 相对于 `/web/`；本地文件即去掉开头 `../` 后的仓库路径。结构化清单与原始文件应一同版本控制。静态 `reviewed_at_utc` 只表示这次官文审核时间，不应因为每日脚本再次读取清单就假装每日已重新审核全部官文。
