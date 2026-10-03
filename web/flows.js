import {calculate, known} from './core.js';
import {isReserveBurn} from './models.js';

const MODES = new Set(['allocation', 'burn_valuation', 'token_redemption_valuation', 'reserve_and_gas_burn']);
const joinNotes = (...notes) => notes.filter(note => typeof note === 'string' && note.trim()).join(' ');
const completeAmount = series => series?.complete === true && known(series.usd) ? series.usd : null;
const datesAgree = (a, b) => !a || !b ||
  (!a.start || !b.start || a.start === b.start) && (!a.end || !b.end || a.end === b.end);
const sameWindow = (a, b) => typeof a?.start === 'string' && typeof a?.end === 'string' &&
  a.start === b?.start && a.end === b?.end;

// This is a model of reported statistics and policy paths, not a cash ledger.
// Valuing removed/redeemed tokens never establishes the cash spent to buy them.
export function buildFlow(project, days = 30) {
  const config = project.flow || {};
  const mode = MODES.has(config.mode) ? config.mode : 'allocation';
  const calculated = calculate(project, days);
  const w = calculated.coverage || {};
  if (isReserveBurn(project)) {
    const start = w.fees?.start || w.holders?.start || project.custom_range?.start || null;
    const end = w.fees?.end || w.holders?.end || project.custom_range?.end || null;
    return {ticker:project.ticker, start, end, days, mode:'reserve_and_gas_burn', unallocatedUsd:null, unallocatedRecord:null,
      warnings:[...(config.cautions || []), '季度储备销毁与实时Gas销毁是两条独立路径；未将季度销毁公告估值填入收入或回购现金。', '实时Gas观察是抓取时点的数据，不是所选时间窗口的销毁总额。'],
      nodes:[
        {id:'fees',label:config.fees_label || 'BNB Chain交易Gas费用',usd:null,evidence:'policy',note:config.origins || '用户使用链上交易支付Gas，所选窗口费用总额尚未取得。'},
        {id:'revenue',label:'验证者等所得',usd:null,evidence:'unknown',note:'除实时销毁部分以外的费用分配，所选期间金额待核；不等于交易所企业收入。'},
        {id:'other',label:'BEP-95实时Gas销毁',usd:null,evidence:'policy',note:config.gas_burn_note || '按链上规则处理部分Gas费用；累计观察与期间增量需分别核对。'},
        {id:'funding',label:'Auto-Burn季度销毁规则',usd:null,evidence:'policy',note:config.funding_note || '根据已公布规则决定季度销毁数量，不能推定为利润支付的市场回购现金。'},
        {id:'outcome',label:'已核季度储备销毁',usd:null,evidence:'policy',note:config.outcome_note || '所选期间的已核季度记录在下方单列；未核完整发行、销毁及流通台账。'},
      ],edges:[{from:'fees',to:'revenue',dashed:true},{from:'fees',to:'other',dashed:true},{from:'funding',to:'outcome',dashed:true}]};
  }
  const warnings = Array.isArray(config.cautions) ? config.cautions.filter(Boolean).map(String) : [];
  const warn = message => { if (!warnings.includes(message)) warnings.push(message); };
  const labels = {
    fees:config.fees_label || '费用来源统计',
    revenue:config.revenue_label || '协议所得收入',
    other:config.other_label || '其他费用分配 / 统计差额',
    funding:config.funding_label || '按政策计算的回购额度',
    outcome:config.outcome_label || '代币最终去向',
  };
  const amounts = {};
  const statisticNames = {fees:'费用统计', revenue:'收入统计', holders:'代币回购或销毁统计'};
  for (const kind of ['fees', 'revenue', 'holders']) {
    amounts[kind] = completeAmount(w[kind]);
    if (w[kind]?.complete !== true) warn(`${statisticNames[kind]}未覆盖完整期间，金额未知。`);
    else if (!known(w[kind]?.usd)) warn(`${statisticNames[kind]}缺少有效金额，暂无法显示。`);
    const composition = w[kind]?.composition;
    if (composition?.complete === false) warn(`${statisticNames[kind]}的来源分项覆盖不完整，不能视作完整业务拆分。`);
    if (known(composition?.difference_from_total_usd) && Math.abs(composition.difference_from_total_usd) > 1)
      warn(`${statisticNames[kind]}的来源分项与总额未对平。`);
  }
  const start = w.revenue?.start || w.fees?.start || w.holders?.start || null;
  const end = w.revenue?.end || w.fees?.end || w.holders?.end || null;
  const income = config.revenue_is_income === true && mode !== 'token_redemption_valuation';
  const fees = amounts.fees;
  const revenue = income ? amounts.revenue : null;
  // Keep the raw window statistic, including any stock event, with a warning.
  // calculate().holder is the recurring-only series and is deliberately unused.
  const holder = amounts.holders;
  const oneoffs = [...new Set([
    ...(Array.isArray(w.holders?.oneoff_dates) ? w.holders.oneoff_dates : []),
    ...(Array.isArray(project.holder_oneoff_dates) ? project.holder_oneoff_dates.filter(date =>
      start && end && date >= start && date <= end) : []),
  ])];
  if (oneoffs.length) warn(`窗口包含存量或一次性代币事件（${oneoffs.join('、')}）；原始估值不代表同期收入产生的经常性现金支出。`);
  if (calculated.crossesBurnPolicy) warn('窗口跨越永久销毁政策生效日，不能把整个窗口套用当前永久销毁规则。');
  if (config.funding_effective_from && start < config.funding_effective_from && end >= config.funding_effective_from)
    warn('窗口跨回购比例或范围变更，图中政策节点列当前规则；历史部分需分别核对，不能统一套用。');
  if (config.funding_effective_from && end < config.funding_effective_from)
    warn('所选历史期间早于现行回购规则；图中政策节点说明当前规则，不能用它推定历史分配比例。');
  if (!income) warn('当前收入栏的统计不作为协议营业收入，不能据此计算 P/S 或推断费用留存。');
  const sameFeesRevenuePeriod = datesAgree(w.fees, w.revenue);
  const sameRevenueHolderPeriod = datesAgree(w.revenue, w.holders);
  if (!sameFeesRevenuePeriod || !sameRevenueHolderPeriod) warn('来源统计期间不一致，不能相减生成同窗分配金额。');

  let other = null;
  let otherEvidence = 'difference';
  let otherNote = joinNotes(config.parties, '统计差额不是完整成本账，也不等于已支付给参与者的现金。');
  const distributions = w.flow_distributions || {};
  const supply = completeAmount(distributions.supply);
  if (income && known(fees) && known(revenue) && sameFeesRevenuePeriod) {
    if (fees < revenue) warn('费用总额小于协议所得收入；其他分配为未知，负差额不能填成零。');
    else {
      other = fees - revenue;
      if (known(supply) && supply >= 0 && sameWindow(distributions.supply, w.fees) && sameWindow(distributions.supply, w.revenue)) {
        if (Math.abs(supply - other) <= 1) {
          other = supply;
          otherEvidence = 'api';
          otherNote = joinNotes(config.parties, '分给LP等参与者的费用分配统计；独立分配接口与同窗总额对平。该统计不是完整成本账或实际现金支付证明。');
        } else warn('独立供给侧分配接口与费用减收入未对平，保留统计差额及未对账提示。');
      } else if (known(supply)) warn('供给侧分配接口的金额或期间不匹配，不能据此确认参与者分配。');
    }
  }

  let unallocatedUsd = null;
  let unallocatedRecord = null;
  // The renderer presents funding_rule separately from this explanatory note.
  let fundingNote = joinNotes(config.funding_note);
  if (mode === 'allocation') {
    fundingNote = joinNotes(fundingNote, '金额为原始窗口的代币持有人统计 / 分配额度，不是逐笔已成交回购现金。');
    if (known(revenue) && known(holder) && sameRevenueHolderPeriod && holder > revenue)
      warn('代币持有人统计金额大于协议收入，不能将负分配差额填为零或视作已留存现金。');
    const canCheckRemainder = (config.independent_protocol_reconciliation === true ||
      (config.independent_protocol_reconciliation !== false && ['HYPE', 'RAY'].includes(project.ticker))) && !oneoffs.length &&
      income && known(revenue) && known(holder) && revenue >= holder && sameRevenueHolderPeriod;
    if (canCheckRemainder) {
      const protocol = completeAmount(distributions.protocol);
      // General policy cautions do not invalidate independently reconciled
      // allocation statistics. A policy ratio or arithmetic remainder alone
      // cannot establish a retained cash balance or protocol distribution.
      if (known(protocol) && protocol >= 0 && sameWindow(distributions.protocol, w.revenue) &&
        sameWindow(distributions.protocol, w.holders) && Math.abs(protocol + holder - revenue) <= 1) {
        unallocatedUsd = protocol;
        unallocatedRecord = '独立分配接口对平';
        fundingNote = joinNotes(fundingNote, '其余协议分配已与独立接口对平；不是已留存现金或净利润。');
      } else {
        if (known(protocol)) warn('独立协议分配接口与收入减持有人统计的金额或期间未对平，其余协议分配金额未知。');
        else warn('缺少完整同窗的独立协议分配记录，其余协议分配金额未知。');
      }
    }
  } else if (mode === 'burn_valuation') {
    fundingNote = joinNotes(fundingNote, '实际回购现金支出尚未取得；销毁代币美元估值独立展示，不从协议收入中相减。');
    warn('销毁估值与回购成交现金的计量时点和口径不同，虚线表示政策或估值联系。');
  } else {
    fundingNote = joinNotes(fundingNote, `交付 ${project.ticker} 兑换费用；兑换代币的美元估值不是已核实现金回购支出，也不能替代协议营业收入。`);
    warn(`${project.ticker} 兑换估值单列，未推算精确 LP 费用分配或回购现金。`);
  }

  const nodes = [
    {id:'fees', label:labels.fees, usd:fees, note:config.origins || '', evidence:known(fees)?'api':'unknown', composition:w.fees?.composition},
    {id:'revenue', label:labels.revenue, usd:revenue,
      note:income ? '协议所得收入统计，尚未扣除完整经营成本。' : '当前统计口径不确认为协议营业收入。',
      evidence:known(revenue) ? 'api' : 'unknown', ...(income ? {composition:w.revenue?.composition} : {})},
    {id:'other', label:labels.other, usd:other, note:otherNote, evidence:known(other)?otherEvidence:'unknown'},
    {id:'funding', label:labels.funding, usd:mode === 'allocation' ? holder : null, note:fundingNote,
      evidence:'policy', ...(mode === 'allocation' ? {composition:w.holders?.composition} : {}),
      ...(unallocatedRecord ? {record:unallocatedRecord} : {})},
    {id:'outcome', label:mode==='burn_valuation' && oneoffs.length?'历史回购／销毁统计（口径待核）':labels.outcome, usd:mode === 'allocation' ? null : holder,
      note:joinNotes(mode==='burn_valuation' && oneoffs.length?null:config.outcome_note, mode === 'allocation'
        ? '最终去向按政策标示；实际购入、持有或销毁数量仍需链上台账核实。'
        : mode==='burn_valuation' && oneoffs.length?'跨事件窗口保留API原始值；历史统计方法及库存事件尚未对账，不能一律视为销毁估值或现金支出。':'此处是代币的美元估值，不是现金支出。'),
      evidence:mode === 'allocation' ? 'policy' : mode==='burn_valuation' && oneoffs.length?'mixed':'valuation',
      ...(mode === 'allocation' ? {} : {composition:w.holders?.composition})},
  ];
  const edges = [
    {from:'fees', to:'revenue', dashed:!income || !known(fees) || !known(revenue) || !sameFeesRevenuePeriod},
    {from:'fees', to:'other', dashed:!known(other)},
    {from:'revenue', to:'funding', dashed:true},
    {from:'funding', to:'outcome', dashed:true},
  ];
  return {ticker:project.ticker, start, end, days, mode, nodes, edges, warnings, unallocatedUsd, unallocatedRecord};
}
