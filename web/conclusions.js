import {calculate, known} from './core.js';
import {componentAmount} from './supply.js';

// These are reviewed interpretations of the research, not fetched facts.
// Amounts, ratios, dated schedules and event observations come from the snapshot.
const interpretations = {
  HYPE: {
    headline: 'HYPE 的交易收费与经济销毁路径较清楚，但团队和奖励释放仍使流通净通缩无法确认。',
    business: '收费来自永续和现货交易，统计还含部署竞价销毁估值；持续性取决于交易量、波动率与竞争，受牛熊周期影响。',
    allocation: '初始核心贡献者23.8%，无私募投资人，社区及未来排放储备38.888%',
    future: '社区与质押储备释放仍未知，不能由回购规模断言新增流通已被抵消',
    supplyEffect: '经济销毁会减少有效总量，但团队与奖励释放可能增加流通；同窗实际枚数与完整台账未齐，净通缩或净通胀仍待核',
    eventDate: '2025-12-24',
  },
  PUMP: {
    headline: 'PUMP 有真实收费与永久销毁，但收入高度依赖 Meme 热度，销毁力度仍须与团队和投资人释放一起评估。',
    business: '收入来自 Meme 发行、PumpSwap 和交易终端，扣除相应分成；高度依赖 Meme 热度和短期交易量。',
    allocation: '初始团队20%、既有投资人13%；ICO还含机构份额，13%并非全部机构持仓上限',
    future: '社区与生态释放仍缺完整计划',
    supplyEffect: '已核销毁减少代币合约总量，现有储备解锁仍可能抬高流通；同窗实际释放与销毁枚数未对齐，不能确认流通净通缩或净通胀',
    eventDate: '2026-04-28',
  },
  UNI: {
    headline: 'UNI 的协议费销毁机制已落地，但真实收入分成和全年自由流通净通缩尚不能确认。',
    business: '基础换币需求较广，但仍依赖交易量与LP深度；大部分交易费归LP，仅已开启的协议费进入费用兑换UNI路径。',
    allocation: '初始团队21.266%、投资人18.044%，原始归属已结束',
    future: '这属于旧金库释放；2%治理增发权限当前未行使，不能算成已经增发',
    supplyEffect: '销毁与金库释放分别影响总量和流通，跨链最终销毁及完整流通台账未齐，净通缩或净通胀仍待核',
    eventDate: '2026-07-27',
  },
  JUP: {
    headline: 'JUP 的多产品收费支持回购，但锁仓回购与“净零”政策尚不足以证明持续净通缩。',
    business: '收入来自聚合、永续、借贷和质押等业务，来源较分散但仍受Solana交易周期影响；API业务重叠尚未全部去净。',
    allocation: '历史销毁后分配中团队20%、Mercurial5%，其他投资人比例未齐',
    future: 'ASR来自已计入流通的旧储备，可能增加可交易筹码，并非新增代币；净零政策执行仍待核',
    supplyEffect: '回购锁存不等于永久销毁，也未核清是否从供应商流通量扣除；奖励、解锁和抵消购买尚未完整对账，不能确认净通缩或净通胀',
    eventDate: '2026-02-22',
  },
  RAY: {
    headline: 'RAY 的交易费支持回购，但主要仍是协议持币储备机制，Meme 周期和储备释放是关键风险。',
    business: '收入来自AMM交易和LaunchLab，是真实收费；Meme交易贡献集中，持续性取决于成交量、费率及长尾费用资产能否变现。',
    allocation: '初始团队20%，社区与seed合计6%，投资人单独比例未知；原团队与seed归属已结束',
    future: '新增铸币权限已撤销，仍有其他生态与金库外流缺口',
    supplyEffect: 'AMM回购保留不减少总量，LaunchLab实际销毁未核清，储备释放可能增加流通；不能把回购额度减奖励就判为净通缩或净通胀',
    eventDate: '2024-02-21',
  },
};

const pct = value => known(value) ? `${(value * 100).toFixed(2)}%` : '未知';
const quantity = value => {
  if (!known(value)) return '未知';
  const absolute = Math.abs(value);
  if (absolute >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (absolute >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return value.toLocaleString('zh-CN', {maximumFractionDigits: 2});
};
const usd = value => known(value) ? `${quantity(value)}美元` : '未知';
const change = value => known(value) ? `${value > 0 ? '+' : ''}${pct(value)}` : '未知';

function captureSentence(project, metrics, asOf) {
  if (project.ticker === 'UNI') {
    return '独立协议收入尚未取得，进入代币的真实收入比例未知；API的收入与代币回报实际是同一费用兑换估值，不能据此称100%收入进入代币。';
  }
  if (project.ticker === 'HYPE') {
    return `本窗代币去向统计÷协议收入为${pct(metrics.holderCapture)}，但该收入字段本身已是AF分配与销毁统计；按总费用统计看为${pct(metrics.feeCapture)}，99%只针对合格交易费，实际现金回购成本仍待对账。`;
  }
  const share = known(metrics.holderCapture)
    ? `本窗${project.ticker === 'PUMP' ? '销毁估值' : '回购额度'}÷协议收入为${pct(metrics.holderCapture)}`
    : '本窗进入代币的比例因缺完整可比数据而未知';
  if (project.ticker === 'PUMP') {
    const commitment = asOf > '2027-04-28' ? '一年承诺期已结束，后续政策需复核' : '承诺至2027-04-28';
    return `政策为50%合格净收入回购销毁（${commitment}，并非扣完整成本后的净利润）；${share}，不是现金支出比例。`;
  }
  if (project.ticker === 'JUP') {
    return `多数业务按Jupiter所得收入的50%计算回购额度，${share}；实际买入未逐笔核清，通常进入储备或锁仓。`;
  }
  if (project.ticker === 'RAY') {
    return `AMM按交易费12%、LaunchLab按协议收入25%计算额度，${share}；分母各异，不能当固定现金回购率。`;
  }
  return `${share}；${project.capture?.stat_note || '实际买入与销毁须另核。'}`;
}

function futureSentence(project, asOf) {
  const forecast = project.supply_forecast;
  const component = forecast?.components?.find(item => item.id === forecast.overview_component_id);
  const horizon = 90;
  const tokens = component ? componentAmount(component, asOf, horizon) : null;
  const labels = {scenario: '情景模型', tracker: '第三方归属模型', run_rate: '当前速度外推', contract: '原合约预算资格', official: '官方排期', reported_plan: '报道中的拟执行批次', approved_policy: '已通过政策'};
  const estimate = known(tokens)
    ? `未来${horizon}天${component.label}约${quantity(tokens)}枚（${labels[component.evidence] || '已登记依据'}，非确定流通增量）`
    : `未来${horizon}天主要释放量因排期或覆盖缺口仍未知`;
  const additional = project.ticker === 'HYPE' ? forecast?.components?.find(item => item.id === 'hype-october-subset') : null;
  const additionalTokens = additional ? componentAmount(additional, asOf, horizon) : null;
  const alternative = known(additionalTokens) && additionalTokens > 0 ? `另有媒体转述近期拟分发${quantity(additionalTokens)}枚，实际执行未核且不能与理论模型相加。` : '';
  return {horizon, tokens, component, additional, text: `${estimate}；${interpretations[project.ticker]?.future || '其他释放仍须复核'}。${alternative}`};
}

function yieldSentence(project, metrics, days) {
  const names = {HYPE: 'AF分配及销毁统计', PUMP: '销毁估值', UNI: '费用兑换UNI估值', JUP: '政策回购额度', RAY: '政策回购额度'};
  const name = names[project.ticker] || '回购／销毁统计';
  if (!known(metrics.holderAnnual)) {
    return `所选${days}天窗口${metrics.coverage?.holders?.oneoff_dates?.length ? '跨存量销毁事件、经常性金额未对账' : '缺完整经常性金额'}，流通市值与FDV两种年化回购／销毁收益率均无法可靠计算。`;
  }
  const policyNote = metrics.crossesBurnPolicy ? '窗口跨销毁政策生效日，不能全算永久销毁；' : '';
  return `按所选${days}天${name}折年，除以流通市值为${pct(metrics.grossYieldMc)}、除以FDV为${pct(metrics.grossYieldFdv)}；${policyNote}这反映历史统计速度，实际现金回购成本尚未逐笔核实。`;
}

function modelHistory(project) {
  const dates = new Set((project.events || []).map(event => event.date));
  const recorded = (date, text) => dates.has(date) ? `${date} ${text}` : null;
  const milestones = {
    HYPE: [recorded('2024-11-29', '创世后AF回购阶段（精确首笔未核）'), recorded('2025-08-31', '适配器合格费用分成97%→99%'), recorded('2025-12-24', '确认AF经济销毁')],
    PUMP: [recorded('2025-07-14', '回购统计起算'), recorded('2026-04-28', '改为50%净收入回购销毁'), recorded('2026-07-12', '团队与投资人一年等待期到期（第三方排期）')],
    UNI: [recorded('2025-12-28', '开启协议费并处理1亿枚历史库存销毁'), recorded('2026-03-08', '多链收费扩展'), recorded('2026-06-02', '继续扩链'), recorded('2026-07-27', '首批v4费用开启')],
    JUP: [recorded('2025-01-26', '公布50%回购及30亿枚库存销毁'), recorded('2025-02-17', '回购额度起算（首笔成交未核）'), recorded('2025-11-25', '另有库存销毁记录待核'), recorded('2026-02-22', '净零政策通过，执行待核')],
    RAY: [recorded('2024-02-21', '原团队与seed归属结束；首笔回购日仍未知')],
  };
  const values = (milestones[project.ticker] || (project.events || []).map(event => `${event.date} ${event.title}`)).filter(Boolean);
  return values.length ? `模型节点：${values.join('；')}。` : '回购启动和政策变更日期尚缺可核实记录。';
}

function eventObservation(project) {
  const date = interpretations[project.ticker]?.eventDate;
  const event = project.event_studies?.find(item => item.date === date);
  const study = event?.studies?.find(item => item.days === 30);
  if (!event || !study?.pre || !study?.post) {
    return {event, study, text: '政策前后尚缺完整30天对照，不能确认收入、供应与价格持续改善。'};
  }
  const cashIncome = project.flow?.revenue_is_income !== false;
  const incomeKnown = study.pre.complete === true && study.post.complete === true && known(study.revenue_change);
  const income = incomeKnown ? `${cashIncome ? '收入' : '费用兑换估值'}${change(study.revenue_change)}` : `${cashIncome ? '收入' : '费用兑换估值'}因缺日无法比较`;
  const price = known(study.token_return) ? `币价${change(study.token_return)}` : '币价缺历史数据';
  const benchmark = known(study.relative_btc) ? `（相对BTC ${change(study.relative_btc)}）` : '';
  const supply = known(study.historical_supply_change) ? `、供应变化${change(study.historical_supply_change)}` : '；供应前后变化缺历史快照';
  const caution = project.ticker === 'RAY' ? '该事件不是回购启动，不能证明回购有效。' : '这些是事件前后对照，不能证明持续改善或由政策造成。';
  return {event, study, text: `${date}事件前后各30天：${income}、${price}${benchmark}${supply}。${caution}`};
}

export function buildConclusion(project, days, asOf) {
  const reviewed = interpretations[project.ticker];
  const metrics = calculate(project, days, 'reported');
  const future = futureSentence(project, asOf);
  const observation = eventObservation(project);
  const market = project.market || {};
  const supply = `当前流通${quantity(market.circulating_supply)}枚、数据源总量${quantity(market.total_supply)}枚，流通市值${usd(market.market_cap)}、FDV${usd(metrics.fdv)}；${reviewed?.allocation || project.allocation_note || '初始分配未齐'}，当前团队与投资人持仓尚未完整核实。`;
  const sentences = [reviewed?.business || project.business || '收费来源与持续性仍需核实。', captureSentence(project, metrics, asOf), supply, future.text,
    `${reviewed?.supplyEffect || '同窗供应台账未齐，净通缩或净通胀仍待核'}。`, yieldSentence(project, metrics, days), modelHistory(project), observation.text];
  const sourceUrls = new Set();
  const sources = [...(project.sources || []), {title: '本次市场快照', url: market.source},
    ...(project.data_sources || []).filter(source => source.kind === 'holders').map(source => ({title: '本次回购／销毁JSON', url: source.response_path})),
    ...(future.component?.sources || []), ...(future.additional?.sources || []), ...(observation.event?.source ? [{title: '本次事件对照的政策来源', url: observation.event.source}] : [])]
    .filter(source => source.url && !sourceUrls.has(source.url) && sourceUrls.add(source.url));
  return {headline: reviewed?.headline || `${project.ticker} 的收入、回购与供应关系仍需结合完整证据评估。`, text: sentences.join(' '), sentences,
    metrics, future, observation, sources, netSupplyStatus: 'unverified', policyVerifiedOn: project.supply_forecast?.verified_on || null};
}
