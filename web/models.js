// Economic scope is separate from the API field name. Reserve burns do not
// establish income, buyback cash spending or a shareholder profit claim.
export const isReserveBurn = project => project.flow?.mode === 'reserve_and_gas_burn' || project.capture?.kind === 'reserve_burn';
export const hasIncomeLinkedCapture = project => !isReserveBurn(project) && project.capture?.income_linked !== false;
export const statisticLabel = project => project.flow?.revenue_stat_label ||
  (project.flow?.revenue_is_income === false ? project.capture?.stat_label || `${project.ticker} 非营业收入统计` : '协议所得收入');
export const isHypeFeeReconciliation = project => Boolean(project.fee_normalization && project.capture?.eligible_fee_policy &&
  (project.fee_normalization.reconciliation_kind === 'hype_eligible_fees' || project.ticker === 'HYPE'));
export const captureBadge = project => isReserveBurn(project) ? '季度销毁 + Gas销毁' :
  project.capture?.label_short || (project.capture?.kind === 'burn' ? '经济销毁' : project.capture?.kind === 'mixed-uncertain' ? '产品去向待核' : '回购保留');

