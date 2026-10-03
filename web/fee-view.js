import {known} from './core.js';
import {isHypeFeeReconciliation} from './models.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct = value => known(value) ? (value * 100).toFixed(2) + '%' : '未知';
const exact = value => known(value) ? '$' + value.toLocaleString('en-US', {maximumFractionDigits: 2}) : '—';
const link = (title, url) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(title)}</a>` : '';

export function feeReconciliationMarkup(project, metrics) {
  const rule = project.fee_normalization;
  if (!rule) return '';
  const w = metrics.coverage?.fees, source = project.data_sources?.find(item => item.kind === 'fees');
  const hype = isHypeFeeReconciliation(project), policy = project.capture?.eligible_fee_policy;
  const heading = hype ? '99%规则与表格比例，分母分别是什么？' : '费用去重与表格比例';
  const policyNote = hype ? `<p><strong>${pct(policy.rate)} 是合格交易费的分配规则</strong>（适配器逐日统计自 ${esc(policy.effective_from)} 起使用）。${esc(policy.basis)} 分给 AF 的收入与实际买入支出需分别核对。</p>` : '';
  return `<section class="fee-reconciliation"><h3>${heading}</h3>${policyNote}<p><strong>${pct(metrics.revenueShare)} = 协议所得收入 ÷ 去重后的总手续费</strong>，统计期 ${esc(w?.start)} → ${esc(w?.end)}。${hype ? '总手续费还包括其他去向和 HIP-1 竞价销毁的估值。' : '去重只剔除已核重复项，不代表已扣除完整经营成本。'}</p><div class="table-wrap"><table><thead><tr><th>本次窗口的核对步骤</th><th>USD 金额</th></tr></thead><tbody><tr><td>API 父级原始手续费</td><td>${exact(w?.raw_usd)}</td></tr><tr><td>减：重复项 ${esc(rule.child)}</td><td>${exact(w?.excluded_usd)}</td></tr><tr><td>用于计算的总手续费（去重后）</td><td>${exact(metrics.fees)}</td></tr><tr><td>协议所得收入 / 回购与销毁统计金额</td><td>${exact(metrics.revenue)} / ${exact(metrics.rawHolder)}</td></tr></tbody></table></div><p>${esc(rule.note)}${w?.normalization_issues?.length ? ' 本窗口有子项或统计方法缺口，去重金额显示未知。' : ''}${w?.already_excluded_days ? ' 本窗口 ' + w.already_excluded_days + ' 天由上游直接去重，未再次扣减。' : ''}</p><div class="sources">${link('原始手续费 API ↗', source?.url)} ${link('本次手续费 JSON ↗', source?.response_path)} ${link('重复项代码', rule.source_url)} ${hype ? link('99% 分配代码', policy.source_url) : ''} ${link('分项与核对依据', rule.audit_url)}</div></section>`;
}
