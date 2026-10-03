# CAKE / AAVE：未来释放补充

复核日：2026-10-03。可接入条目见 [supply-cake-aave-update.json](supply-cake-aave-update.json)。金额为枚数，采用365天；下面两条年率是有条件的延续情景，均不是不可调整的完整分发日历。

| 项目与口径 | 30天 | 90天 | 365天 | 依据与限制 |
|---|---:|---:|---:|---|
| CAKE净有效排放政策 | 约667,500 | 约2,002,500 | 约8,121,250 | 约22,250/日；扣除原始铸币回烧，仍未扣经营收入支持的回购销毁 |
| AAVE stkAAVE储备奖励 | 约4,500 | 约13,500 | 约54,750 | 约150/日；已有储备奖励，须维持速率并获持续补资 |

## CAKE

官方主厨2026-01-30解释，原合约每块40 CAKE，区块变快会增加原始铸币，多数回烧后使净mint约22.25k/日。此前1月13日概述约22.5k，后续更明确的22.25k用于本次情景；旧14.5k只是farm子项。这里没有把1月的政策披露冒充10月当天独立重算的执行速率。[官方答复第11帖](https://forum.pancakeswap.finance/t/discussion-of-proposal-to-reduce-cake-token-max-supply/1551/11)

本次BSC finalized读取确实得到CAKE的owner为原MasterChef，cakePerBlock为40×10¹⁸。源码还有dev分配、按池update和alloc计算，不能直接把40/块变成全年市场新增量。[官方MasterChef源码](https://github.com/pancakeswap/pancake-farm/blob/master/contracts/MasterChef.sol)、[CAKE铸币权限源码](https://github.com/pancakeswap/pancake-farm/blob/master/contracts/CakeToken.sol)

净22.25k政策已扣维持额度所需的铸币回烧，不应再扣同一回烧。业务费用支持的销毁以及旧生态库存外流分别记账；政策排放含储备拨入，不能保证全部立即自由流通。未得到全部产品当前执行和未来调参，故保持情景标签。

官方Tokenomics 3.0提案称没有VC funds或team allocations，因此原专属分配池不列团队月度解锁。该声明不是团队当前持仓审计，也不取消其他奖励或生态库存。[官方原方案](https://forum.pancakeswap.finance/t/cake-tokenomics-proposal-3-0-true-ownership-simplified-governance-and-sustainable-growth/1237)

## AAVE

Ethereum finalized块26,111,098（2026-10-03 10:05:11 UTC）读取stkAAVE的`assets(stkAAVE)`，首项`emissionPerSecond=1,736,111,111,111,111`，18位小数，换算约150枚/日。[奖励参数源码](https://github.com/aave/aave-stake-v2/blob/master/contracts/stake/AaveDistributionManager.sol)、[官方模块地址表](https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveSafetyModule.sol)

官方2026年8月补资提案也使用150/日；9月16日修订为补90天及一部分旧待领缺口。奖励累积、领取和卖出不同；旧待领会消耗授权，全年必须续批。[官方补资及修订](https://governance.aave.com/t/direct-to-aip-safety-module-august-2026-allowance-update/25550)

同块生态储备余额为564,693.874627354528499932 AAVE，stkAAVE从该储备支出的allowance为28,104.810513111087595411。授权是同一库存的支出权限，两者不能相加，也不能全当未来奖励预算。

第二次finalized读取块26,111,130（10:11:35 UTC）：stkABPT v1、stkGHO、stkAAVEwstETHBPTv2的奖励速度均0。当前参数保持时没有新增奖励，旧待领依然可以支付。两次批次分别保存块信息，未声称统一固定历史块。

当前totalSupply为16M。原初始化一次性mint13M给LEND迁移、3M给储备；迁移源码转出既有AAVE。迁移合约当前AAVE余额0，但不能据此声称全部旧LEND权益或团队经济利益已结束。[原初始化源码](https://github.com/aave/aave-token/blob/master/contracts/token/AaveToken.sol)、[迁移源码](https://github.com/aave/aave-token/blob/master/contracts/token/LendToAaveMigrator.sol)

代理实现槽指向`0x5d4aa78b08bc7c530e21bf7447988b1be7991322`，链上验证的AaveTokenV3及继承源码/ABI没有外部mint；proxy admin非零，仍有治理升级能力。因此只确认当前实现，没有把未来增发政策写为永久或未来365天绝对0。[现行已验证代码API](https://eth.blockscout.com/api/v2/smart-contracts/0x5d4aa78b08bc7c530e21bf7447988b1be7991322)、[官方代理说明](https://github.com/aave/aave-token/blob/master/README.md)

## 原始证据与未完成部分

JSON中每条已归档来源带`raw_file`与`metadata_file`，元数据保存URL、抓取UTC时间及响应SHA256；RPC还保存完整请求。14份有效响应已逐一校验哈希。公开API为 [BSC PublicNode](https://bsc-rpc.publicnode.com)、[Ethereum PublicNode](https://ethereum-rpc.publicnode.com)，RPC需要POST，方法及地址可以直接从元数据复现。

固定历史块的Ethereum批量调用返回HTTP403；本次采用成功的finalized批次并记录各自块。Sourcify full-match返回404，改用已验证的Blockscout源码，并与代理槽交叉核对。失败的Flashbots批次返回JSON-RPC错误，没有参与数字计算。

仍缺完整团队当前持仓、所有旧储备外流、当前待领总负债和自由流通账。CAKE政策年率与AAVE奖励年率均只覆盖已注明类别，不能据此推断完整净通缩，也不能把未披露类别记零。
