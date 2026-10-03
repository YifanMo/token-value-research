import {known, ratio} from './core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const quantity = value => known(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 4}) : '未知';
const dollars = value => known(value) ? '$' + value.toLocaleString('en-US', {maximumFractionDigits: 0}) : '未知';
const percent = value => known(value) ? (value * 100).toFixed(2) + '%' : '未知';
const link = (title, url) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(title)}</a>` : '';
const usdBasis = record => record.usd_basis === 'executed_native_tokens_times_same_utc_date_price; not_cash_cost'
  ? '执行日UTC采样价 × 实际销毁枚数；非现金支出' : record.usd_basis || '销毁日历史价格估值，非成交支出';
const publicNote = value => String(value ?? '').replace(/successful receipt/g,'执行成功的交易回执').replace(/dead地址/g,'销毁地址')
  .replace(/chainId/g,'链标识').replace(/block/g,'执行区块').replace(/BSC native转账/g,'BSC原生BNB转账').replace(/native transfer/g,'原生BNB转账');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

// This is a sum of registered observations, not a complete burn ledger. In
// particular, no quarterly record in a period does not establish a zero burn.
export function burnStats(project, start, end) {
  const registered = Array.isArray(project.burns?.quarterly_records) ? project.burns.quarterly_records : [];
  const inRange = registered.filter(record => {
    const date=record.verified===true ? record.date : record.date || record.reported_date;
    return validDate(date) && date >= start && date <= end;
  });
  const seen = new Set();
  const records = inRange.filter(record => {
    if (record.verified !== true) return false;
    const key = record.transaction_hash || record.tx_url || record.transaction_url;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => a.date.localeCompare(b.date));
  const total = field => {
    if (!records.length || !records.every(record => known(record[field]) && record[field] >= 0)) return null;
    const amount = records.reduce((sum, record) => sum + record[field], 0);
    return known(amount) ? amount : null;
  };
  const tokens = total('tokens'), usd = total('usd');
  return {start, end, records, tokens, usd, count: records.length, unverifiedCount:inRange.filter(record=>record.verified!==true).length, complete: false,
    shareMc: ratio(usd, project.market?.market_cap), shareFdv: ratio(usd, project.market?.fully_diluted_valuation),
    note: '仅合计已核季度记录，未覆盖全部历史季度、实时Gas销毁或其他供应变动；未年化，销毁日估值不是回购支出。'};
}

export function burnRecordsMarkup(project, start, end) {
  const stats = burnStats(project, start, end);
  const rows = stats.records.map(record => `<tr><td>${esc(record.rank ? '第'+record.rank+'次（'+(record.quarter || '季度销毁')+'）' : record.quarter || record.title || '季度销毁')}<span class="number-sub">${esc(record.date)}</span></td><td>${quantity(record.tokens)}</td><td>${dollars(record.usd)}<span class="number-sub">${esc(usdBasis(record))}</span></td><td>${link('公告 / 依据', record.source_url || record.source || record.url)} ${link('交易记录', record.tx_url || record.transaction_url || (/^https?:\/\//.test(record.tx || '') ? record.tx : null))}</td></tr>`).join('');
  const limitations = project.burns?.limitations;
  return `<article class="card burn-records"><h3>已核季度销毁 · 所选期间</h3><p>${esc(start)} → ${esc(end)}。${stats.count ? `已登记 ${stats.count} 笔季度记录。` : '所选期间没有已核季度记录，不能推定实际销毁为零。'}</p>
    <div class="mini-stats"><div><span>已核季度销毁枚数</span><strong>${quantity(stats.tokens)} ${esc(project.ticker)}</strong></div><div><span>销毁日美元估值合计</span><strong>${dollars(stats.usd)}</strong></div><div><span>记录估值 ÷ 当前流通市值</span><strong>${percent(stats.shareMc)}</strong></div><div><span>记录估值 ÷ 当前 FDV</span><strong>${percent(stats.shareFdv)}</strong></div></div>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>记录 / 日期</th><th>销毁枚数</th><th>销毁日美元估值</th><th>来源</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${stats.unverifiedCount ? `<p class="footnote">另有 ${stats.unverifiedCount} 条未核 / 预计记录，没有纳入合计。</p>` : ''}
    <p class="footnote">${esc(stats.note)} 比例只比较已核记录与当前估值，不能作为收益率或未来季度预测。</p>
    ${limitations ? `<p class="footnote">${esc(publicNote(Array.isArray(limitations) ? limitations.join(' ') : limitations))}</p>` : ''}</article>`;
}

export function burnObservationsMarkup(project) {
  const supply=project.burns?.supply_observation, realtime=project.burns?.realtime_observation;
  if (!supply && !realtime) return '';
  return `<article class="card burn-observations"><h3>供应与实时Gas销毁 · 独立观察时点</h3>
    ${supply?`<h4>链上原生供应观察</h4><div class="mini-stats"><div><span>供应观察量</span><strong>${quantity(supply.tokens)} ${esc(project.ticker)}</strong></div><div><span>Beacon / BSC 观察量</span><strong>${quantity(supply.beacon_tokens)} / ${quantity(supply.bsc_tokens)}</strong></div></div><p>${esc(supply.note)}</p><p class="footnote">抓取 ${esc(supply.retrieved_at || '未知')}；这是当前索引供应快照，不是所选期间的供应变化，也不替代数据源的流通量。${link('在线来源',supply.url)} ${link('本次JSON',supply.response_path)}</p>`:''}
    ${realtime?`<h4>BEP-95实时Gas销毁观察</h4><div class="mini-stats"><div><span>供应商最近滚动7天销毁</span><strong>${quantity(realtime.last7_days_tokens)} ${esc(project.ticker)}</strong></div><div><span>累计Gas销毁观察量</span><strong>${quantity(realtime.cumulative_tokens)} ${esc(project.ticker)}</strong></div></div><p>${esc(realtime.note)}</p><p class="footnote">最新区块时间 ${esc(realtime.latest_block_at || '未知')}；抓取 ${esc(realtime.retrieved_at || '未知')}。滚动7天和累计值独立于上方日期筛选，不能加进所选期间季度合计；缺历史日级台账时无法算同窗Gas销毁增量。${link('在线来源',realtime.url)} ${link('本次JSON',realtime.response_path)}</p>`:''}</article>`;
}

export function burnFinancialMarkup(project, start, end) {
  const sources=project.burns?.data_sources || (project.data_sources || []).filter(source=>['burns','burn_proof','gas_burn','supply'].includes(source.kind));
  const names={burns:'季度销毁记录与拆分',burn_proof:'链上交易与执行区块核验',gas_burn:'实时Gas摘要',supply:'供应观察'};
  const proof=sources.length?`<section class="source-policy"><h3>独立销毁数据与保存响应</h3><div class="financial-data-sources">${sources.map(source=>`<article><strong>${esc(names[source.kind] || source.kind || '销毁数据')}</strong><span class="number-sub">抓取 ${esc(source.retrieved_at || '未知')} · ${esc(source.status || 'unknown')}</span><div class="source-links">${link('在线 API ↗',source.url)} ${link('本次 JSON ↗',source.response_path)}</div><p>保存文件 SHA-256：<code>${esc(source.stored_sha256 || source.sha256 || '未知')}</code></p></article>`).join('')}</div><p class="source-explanation">季度记录只纳入已核执行交易；来源完整性与全部供应变化完整性分别评估。</p></section>`:'';
  return `<div class="source-meaning"><h3>BNB 的销毁与收入回购分别研究</h3><p>Auto-Burn 是按规则处理的季度储备销毁；BEP-95 是链上交易费中的实时销毁。不能把两者合称为“企业净利润用于回购”，也不能用季度销毁估值填入营业收入或净利润。</p><p>本行 P/S、持币者回报倍数、项目净利润 P/E 和年化回购收益率均不适用。季度记录的供应效果仍须与其他供应变动对账，不能据此断言自由流通净通缩。</p></div>${burnRecordsMarkup(project, start, end)}${burnObservationsMarkup(project)}${proof}<div class="sources">${(project.sources || []).map(source => link(source.title, source.url)).join(' ')}</div>`;
}
