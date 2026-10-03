// Economic scope is separate from the API field name. Reserve burns do not
// establish income, buyback cash spending or a shareholder profit claim.
export const isReserveBurn = project => project.flow?.mode === 'reserve_and_gas_burn' || project.capture?.kind === 'reserve_burn';
export const hasIncomeLinkedCapture = project => !isReserveBurn(project) && project.capture?.income_linked !== false;
export const HOLDER_RETURN_RULE = '仅计入持有原代币的分配及回购／销毁间接价值；不计转换、包装、质押、锁仓参与或提供流动性才能获得的收益。';

// Scope is independent of whether a provider reports a valid numeric amount.
// An unresolved historical split is unknown, rather than a zero holder return.
export function passiveHolderScope(project, window) {
  const capture = project.capture || {};
  const note = typeof capture.passive_scope_note === 'string' ? capture.passive_scope_note : '';
  if (capture.holder_requires_action === true) {
    return {eligible:false, status:'requires_action', note:['需额外操作才能获得的收益不计入原币持有收益。',note].filter(Boolean).join(' ')};
  }
  const from = capture.passive_scope_from;
  const start = window?.holders?.start;
  if (typeof from === 'string' && from && (typeof start !== 'string' || !start || start < from)) {
    return {eligible:false, status:'historical_unseparated', note:['历史统计尚未拆分原币持有收益与需额外操作的收益，合规金额未知。',note].filter(Boolean).join(' ')};
  }
  return {eligible:true, status:'eligible', note:note || HOLDER_RETURN_RULE};
}
export const statisticLabel = project => project.flow?.revenue_stat_label ||
  (project.flow?.revenue_is_income === false ? project.capture?.stat_label || `${project.ticker} 非营业收入统计` : '协议所得收入');
export const isHypeFeeReconciliation = project => Boolean(project.fee_normalization && project.capture?.eligible_fee_policy &&
  (project.fee_normalization.reconciliation_kind === 'hype_eligible_fees' || project.ticker === 'HYPE'));
export const captureBadge = project => isReserveBurn(project) ? '季度销毁 + Gas销毁' :
  project.capture?.label_short || (project.capture?.kind === 'burn' ? '经济销毁' : project.capture?.kind === 'mixed-uncertain' ? '产品去向待核' : '回购保留');
