import {hasIncomeLinkedCapture, isReserveBurn, passiveHolderScope} from './models.js';

// Research calculations. Null is unknown, never zero. All rates are decimal fractions.
export const known = value => typeof value === 'number' && Number.isFinite(value);
export const ratio = (a, b) => known(a) && known(b) && b > 0 ? a / b : null;
export const annual = (amount, days) => known(amount) && days > 0 ? amount * 365 / days : null;

export function calculate(project, days = 30, basis = 'remaining') {
  const w = project.windows?.[String(days)];
  const m = project.market || {};
  const fdv = basis === 'original' ? m.original_cap_fdv : basis === 'reported' ? m.fully_diluted_valuation : m.remaining_supply_fdv;
  const incomeLinkedCapture = hasIncomeLinkedCapture(project);
  const holderScope = passiveHolderScope(project, w);
  const holder = incomeLinkedCapture && holderScope.eligible ? w?.holders?.recurring_usd ?? (w?.holders?.oneoff_dates?.length ? null : w?.holders?.usd ?? null) : null;
  const reportedRevenue = w?.revenue?.usd ?? null;
  // Some upstream "revenue" fields mirror token-redemption valuations. Keep
  // that observation, but do not turn it into sales or an income-based ratio.
  const revenueStatus = isReserveBurn(project) ? 'not_applicable' : project.flow?.revenue_is_income === false ? 'valuation_only' : 'income';
  const revenue = revenueStatus === 'income' ? reportedRevenue : null;
  const fees = w?.fees?.usd ?? null;
  const holderAnnual = annual(holder, days);
  const crossesBurnPolicy = project.capture?.pre_burn_kind && w?.holders?.start < project.capture?.permanent_from;
  const burnProxyAnnual = !incomeLinkedCapture || !holderScope.eligible ? null : project.capture?.permanent_burn_proxy === true ? crossesBurnPolicy ? null : holderAnnual : project.capture?.permanent_burn_proxy === false ? 0 : null;
  const earnings = project.financials?.net_income_windows?.[String(days)];
  // A revenue or buyback series cannot substitute for net income. A manually
  // reviewed profit record must match this window, currency and protocol scope.
  const netIncomeStatus = isReserveBurn(project) ? 'not_applicable' : !earnings || !known(earnings.usd) ? 'missing'
    : earnings.start !== w?.revenue?.start || earnings.end !== w?.revenue?.end ? 'period_mismatch'
    : earnings.currency !== 'USD' || earnings.same_protocol_scope !== true ? 'scope_unverified'
    : earnings.costs_complete !== true ? 'costs_incomplete'
    : days !== 365 && earnings.recurring_only !== true ? 'oneoffs_unseparated'
    : !earnings.source_url ? 'source_missing'
    : earnings.usd < 0 ? 'loss' : earnings.usd === 0 ? 'zero' : 'positive';
  const netIncome = ['positive','zero','loss'].includes(netIncomeStatus) ? earnings.usd : null;
  const netIncomeAnnual = annual(netIncome,days);
  return {
    holder, rawHolder: w?.holders?.usd ?? null, holderScope, revenue, reportedRevenue, revenueStatus, fees, holderAnnual, burnProxyAnnual, fdv, crossesBurnPolicy, incomeLinkedCapture,
    grossYieldMc: ratio(holderAnnual, m.market_cap), grossYieldFdv: ratio(holderAnnual, fdv),
    permanentProxyYieldMc: ratio(burnProxyAnnual, m.market_cap),
    permanentProxyYieldFdv: ratio(burnProxyAnnual, fdv),
    holderCapture: ratio(holder, revenue), feeCapture: ratio(holder, fees),
    revenueAnnual: annual(revenue, days),
    psRevenueMc: ratio(m.market_cap, annual(revenue, days)),
    psRevenueFdv: ratio(fdv, annual(revenue, days)),
    revenueShare: ratio(revenue,fees),
    netIncome, netIncomeAnnual, netIncomeStatus,
    peMc: ratio(m.market_cap,netIncomeAnnual), peFdv: ratio(fdv,netIncomeAnnual),
    netMargin: ratio(netIncome,revenue),
    floatRatio: ratio(m.circulating_supply, m.total_supply),
    coverage: w,
  };
}

// Reference-site multiples deliberately use holder/revenue statistics rather
// than audited net income. Keep this separate from calculate()'s financial
// fields so switching display methods cannot change their meaning.
export function calculateReferenceMultiples(project, days = 30, basis = 'reported') {
  const strict = calculate(project, days, basis);
  const w = strict.coverage;
  const reportedAmount = series => series?.complete !== false && known(series?.usd) ? series.usd : null;
  const holderScope = strict.holderScope;
  const rawHolderUsd = reportedAmount(w?.holders);
  const holderUsd = holderScope.eligible ? rawHolderUsd : null;
  const revenueUsd = reportedAmount(w?.revenue);
  const validDays = known(days) && days > 0;
  const annualStatistic = value => {
    const result = validDays ? annual(value, days) : null;
    return known(result) ? result : null;
  };
  const finiteMultiple = (valuation, statistic) => {
    const result = ratio(valuation, statistic);
    return known(result) ? result : null;
  };
  const holderAnnual = hasIncomeLinkedCapture(project) ? annualStatistic(holderUsd) : null;
  const revenueAnnual = isReserveBurn(project) ? null : annualStatistic(revenueUsd);
  const revenueStatus = isReserveBurn(project) ? 'not_applicable' : w?.revenue?.complete === false ? 'incomplete'
    : !known(revenueUsd) ? 'missing'
    : project.flow?.revenue_is_income === false ? 'valuation_only' : 'income';
  const start = w?.holders?.start;
  const end = w?.holders?.end;
  const datedOneoffs = Array.isArray(project.holder_oneoff_dates) ? project.holder_oneoff_dates.filter(date =>
    start && end && date >= start && date <= end) : [];
  const containsOneoff = Boolean(w?.holders?.oneoff_dates?.length || datedOneoffs.length);
  const crossesBurnPolicy = Boolean(strict.crossesBurnPolicy);
  const notes = [
    '参考PE＝估值÷同窗年化持有人统计；持有人统计不是已扣除全部成本的净利润，净利润缺失也不阻止这项参考倍数。',
    '参考PS＝估值÷同窗年化API收入统计；只使用本地归一化后的金额，不用原始父级金额或部分观察额补齐缺日。',
    '年化统计＝窗口金额×365÷窗口天数；365天使用该年度金额。这是历史统计比例，不是未来收入或净利润预测。',
  ];
  if (isReserveBurn(project)) {
    notes.splice(0, notes.length, '季度储备销毁与Gas销毁单独记录，不作为收入回购现金、企业收入或净利润；不计算参考P/E、P/S和年化回购收益率。');
  }
  notes.push(holderScope.note);
  if (holderScope.eligible) {
    if (w?.holders?.complete === false) notes.push('持有人统计未覆盖完整期间，参考PE未知。');
    else if (!known(holderUsd)) notes.push('缺少有效的持有人统计金额，参考PE未知。');
    else if (holderUsd <= 0) notes.push('持有人统计分母为零或负数，参考PE不适用；不能据此断言净利润为零或亏损。');
  }
  if (revenueStatus === 'incomplete') notes.push('收入统计缺日或归一化数据不完整，参考PS未知；未用原始金额或观察额回填。');
  else if (revenueStatus === 'missing') notes.push('缺少有效的API收入统计金额，参考PS未知。');
  else {
    if (revenueStatus === 'valuation_only') notes.push('当前API收入列是代币兑换估值；参考PS仅作来源口径对照，不代表营业收入或严格P/S。');
    if (revenueUsd <= 0) notes.push('API收入统计分母为零或负数，参考PS不适用。');
  }
  if (containsOneoff) notes.push('窗口含存量或一次性代币事件；参考PE可显示历史统计倍数，但不能把该分母当作经常性净利润。');
  if (crossesBurnPolicy) notes.push('窗口早于或跨越永久销毁政策生效日；参考PE保留原始统计，不能将整个窗口视为当前永久销毁规则下的经常性净利润。');
  if (!validDays) notes.push('窗口天数无效，未进行年化或计算参考倍数。');
  return {
    peMc:finiteMultiple(project.market?.market_cap, holderAnnual),
    peFdv:finiteMultiple(strict.fdv, holderAnnual),
    psMc:finiteMultiple(project.market?.market_cap, revenueAnnual),
    psFdv:finiteMultiple(strict.fdv, revenueAnnual),
    holderUsd, rawHolderUsd, holderScope, holderAnnual, revenueUsd, revenueAnnual, revenueStatus,
    containsOneoff, crossesBurnPolicy, coverage:w, notes,
  };
}

// total is economic supply INCLUDING booked/unminted reserves. A mint from those
// reserves is a first reserve release, not newly created economic entitlement.
// Release buckets must be mutually exclusive. Do not count the same tokens twice.
export function ledger({circulating, total, burnTokens, burnFromFloatTokens, buybackToLockTokens, unlockTokens,
  reserveRewardsTokens, newEconomicSupplyTokens, newEconomicTokensToFloat, treasuryReleaseTokens, relockTokens = 0, knownComplete = false}) {
  const fields = [burnTokens, burnFromFloatTokens, buybackToLockTokens, unlockTokens, reserveRewardsTokens,
    newEconomicSupplyTokens, newEconomicTokensToFloat, treasuryReleaseTokens, relockTokens];
  const allKnown = fields.every(x => known(x) && x >= 0) && burnFromFloatTokens <= burnTokens && newEconomicTokensToFloat <= newEconomicSupplyTokens;
  if (!allKnown || !knownComplete) return {complete: false, totalChange: null, floatChange: null,
    totalRate: null, floatRate: null, netSupplyConclusion: '缺完整供应台账，不能判定净通缩/通胀'};
  const totalChange = newEconomicSupplyTokens - burnTokens;
  const floatChange = unlockTokens + reserveRewardsTokens + newEconomicTokensToFloat + treasuryReleaseTokens
    - burnFromFloatTokens - buybackToLockTokens - relockTokens;
  return {complete: true, totalChange, floatChange, totalRate: ratio(totalChange, total),
    floatRate: ratio(floatChange, circulating), netSupplyConclusion:
    `${totalChange < 0 ? '经济有效总量减少' : totalChange > 0 ? '经济有效总量增加' : '经济有效总量不变'} / ${floatChange < 0 ? '自由流通减少' : floatChange > 0 ? '自由流通增加' : '自由流通不变'}`};
}

export function stress({baseAnnualUsd, revenueFactor, repurchasePrice, dilutionTokens,
  denominator, burnEligible = false}) {
  const cash = known(baseAnnualUsd) ? baseAnnualUsd * revenueFactor : null;
  const purchased = ratio(cash, repurchasePrice);
  const netTokens = known(purchased) && known(dilutionTokens) ? purchased - dilutionTokens : null;
  const netCashEquivalent = known(netTokens) && known(repurchasePrice) ? netTokens * repurchasePrice : null;
  return {cash, purchased, netTokens, netCashEquivalent, grossYield: ratio(cash, denominator),
    netYield: ratio(netCashEquivalent, denominator), burnEligible};
}
