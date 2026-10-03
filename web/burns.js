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
const DAY = 86400000;
const burnSourceKinds = new Set(['burns','burn_proof','gas_burn','gas_burn_snapshot','supply','chain_fees','gas_burn_policy_estimate','policy_block','gas_burn_policy']);
const nonnegative = value => known(value) && value >= 0;

function rangeDays(start, end) {
  if (!validDate(start) || !validDate(end) || start > end) throw new RangeError('BNB统计需要有效的UTC起止日期。');
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY) + 1;
}

function normalizedWindow(candidate, start, end, days) {
  if (!candidate || candidate.start !== start || candidate.end !== end || candidate.days !== days) return null;
  const coverage = candidate.covered_days ?? candidate.coverage_days;
  if (!Number.isInteger(coverage) || coverage < 0 || coverage > days) return null;
  const missing = Array.isArray(candidate.missing_dates)
    ? [...new Set(candidate.missing_dates)].filter(date => validDate(date) && date >= start && date <= end).sort() : [];
  const complete = candidate.complete === true && coverage === days && missing.length === 0 && nonnegative(candidate.usd);
  return {start,end,days,usd:complete ? candidate.usd : null,
    observed_usd:nonnegative(candidate.observed_usd) ? candidate.observed_usd : complete ? candidate.usd : null,
    coverage_days:coverage,covered_days:coverage,missing_days:days-coverage,missing_dates:missing,complete,
    source:'compiled_window',evidence:candidate.evidence};
}

function historyWindow(project, field, start, end, days) {
  const values = new Map(), conflicts = new Set();
  for (const row of Array.isArray(project.history) ? project.history : []) {
    if (!validDate(row?.date) || row.date < start || row.date > end || !nonnegative(row[field]) || conflicts.has(row.date)) continue;
    if (values.has(row.date) && values.get(row.date) !== row[field]) {
      values.delete(row.date); conflicts.add(row.date);
    } else values.set(row.date,row[field]);
  }
  const missing = [];
  for (let offset=0, from=Date.parse(start+'T00:00:00Z'); offset<days; offset++) {
    const date = new Date(from+offset*DAY).toISOString().slice(0,10);
    if (!values.has(date)) missing.push(date);
  }
  const total = [...values.values()].reduce((sum,value)=>sum+value,0);
  const observed = values.size && known(total) ? total : null;
  const complete = values.size === days && known(observed);
  return {start,end,days,usd:complete ? observed : null,observed_usd:observed,
    coverage_days:values.size,covered_days:values.size,missing_days:missing.length,missing_dates:missing,complete,
    conflicting_dates:[...conflicts].sort(),source:Array.isArray(project.history) ? 'loaded_daily_history' : 'history_not_loaded'};
}

// Fee observations and the supplier's gas-burn model have separate coverage.
// A rolling-seven-day snapshot or a quarterly transfer never fills a daily gap.
export function bnbChainWindow(project, start, end) {
  const days = rangeDays(start,end);
  const selected = project.windows?.[String(days)];
  const fees = normalizedWindow(selected?.fees,start,end,days)
    || normalizedWindow(project.burns?.chain_fee_windows?.[String(days)],start,end,days)
    || historyWindow(project,'fees',start,end,days);
  const gasEstimate = normalizedWindow(selected?.gas_burn_estimate,start,end,days)
    || normalizedWindow(project.burns?.gas_burn_estimate_windows?.[String(days)],start,end,days)
    || historyWindow(project,'gas_burn_estimate_usd',start,end,days);
  return {start,end,days,fees,gasEstimate,
    gasShareOfFees:fees.complete && gasEstimate.complete ? ratio(gasEstimate.usd,fees.usd) : null,
    assumedRatio:0.1,actualDailyBurnVerified:false,cashBuybackUsd:null};
}

const missingDates = window => window.missing_dates.length
  ? window.missing_dates.slice(0,12).join('、')+(window.missing_dates.length>12 ? ` 等${window.missing_dates.length}天` : '')
  : window.missing_days ? `${window.missing_days}天未覆盖，保存窗口未列具体日期` : '无';

function bnbSources(project) {
  const sources = [...(Array.isArray(project.data_sources) ? project.data_sources.filter(source=>burnSourceKinds.has(source.kind)) : []),
    ...(Array.isArray(project.burns?.data_sources) ? project.burns.data_sources : [])];
  const unique = new Map();
  for (const source of sources) {
    const key = source.source_key || [source.kind,source.url,source.response_path].join('|');
    unique.set(key,{...(unique.get(key)||{}),...source});
  }
  return [...unique.values()];
}

const sourceLinks = source => source
  ? `${link('在线API ↗',source.url)} ${link('保存响应JSON ↗',source.response_path)} ${link('计算方法 ↗',source.methodology_url)}`
  : '对应来源尚未登记';

export function bnbChainMarkup(project, start, end) {
  const window = bnbChainWindow(project,start,end), {fees,gasEstimate} = window;
  const policy = project.burns?.gas_burn_policy_observation;
  const sources = bnbSources(project), feeSource = sources.find(source=>source.kind==='chain_fees'), gasSource=sources.find(source=>source.kind==='gas_burn_policy_estimate');
  const policyKnown = policy?.evidence === 'pinned_block_eth_call' && nonnegative(policy.ratio) && policy.ratio <= 1
    && Number.isInteger(policy.burn_ratio) && policy.burn_ratio >= 0 && Number.isInteger(policy.ratio_scale) && policy.ratio_scale > 0
    && policy.burn_ratio / policy.ratio_scale === policy.ratio;
  const differentRatio = policyKnown && policy.ratio !== window.assumedRatio;
  return `<article class="card bnb-chain-data"><h3>BSC链手续费与Gas销毁估算 · 所选期间</h3>
    <p>${esc(start)} → ${esc(end)}，共${window.days}个UTC日。链手续费由交易Gas索引汇总并换算美元；Gas销毁金额是供应商固定按手续费10%推算的模型值。</p>
    <div class="mini-stats"><div><span>BSC链手续费</span><strong>${dollars(fees.usd)}</strong><span class="number-sub">已覆盖${fees.coverage_days}/${window.days}天</span></div>
    <div><span>Gas销毁估算 · 10%模型</span><strong>${dollars(gasEstimate.usd)}</strong><span class="number-sub">已覆盖${gasEstimate.coverage_days}/${window.days}天</span></div>
    <div><span>Gas估算 ÷ 同窗链手续费</span><strong>${percent(window.gasShareOfFees)}</strong><span class="number-sub">模型比例，不是现金回购比例</span></div>
    <div><span>逐日实际Gas销毁核验</span><strong>尚未取得</strong><span class="number-sub">没有完整的销毁事件台账</span></div></div>
    <p class="footnote">BSC链手续费不包括币安公司收入、opBNB、Greenfield或链上应用收入；Gas模型不是实际现金回购或项目净利润，季度Auto-Burn另列。</p>
    <p class="footnote">链手续费来源：${sourceLinks(feeSource)}。Gas估算来源：${sourceLinks(gasSource)}。</p>
    ${!fees.complete || !gasEstimate.complete ? `<p>所选期间存在缺日，总额显示“未知”。已取得的手续费小计${dollars(fees.observed_usd)}，Gas估算小计${dollars(gasEstimate.observed_usd)}；没有补零或用滚动7日摘要填缺口。</p><details><summary>查看缺少的日期与覆盖情况</summary><p>手续费缺少：${esc(missingDates(fees))}。</p><p>Gas估算缺少：${esc(missingDates(gasEstimate))}。</p></details>` : ''}
    <h4>当前链上Gas销毁参数 · 独立区块</h4>
    <div class="mini-stats"><div><span>已核当前区块的销毁比例</span><strong>${policyKnown ? percent(policy.ratio) : '未取得'}</strong></div><div><span>供应商历史模型固定比例</span><strong>10.00%</strong></div></div>
    <p>${policyKnown ? `区块${esc(policy.block_number ?? '未知')}，区块时间${esc(policy.observed_at || '未知')}。${known(policy.burn_ratio)&&known(policy.ratio_scale)?`链上参数${quantity(policy.burn_ratio)} ÷ ${quantity(policy.ratio_scale)}。`:''}` : '尚缺可核验的当前区块参数；不能把供应商10%假设当作已核当前政策。'}${differentRatio ? ' 当前已核参数与供应商固定10%模型不同，模型值更不能视为当前实际销毁。' : ''} 本区块的比例不能证明整个历史观察窗口都使用相同比例。</p>
    ${policy ? `<p class="footnote">参数抓取${esc(policy.retrieved_at || '未知')}。${link('链上参数API ↗',policy.url)} ${link('保存响应JSON ↗',policy.response_path)} ${link('官方合约代码 ↗',policy.contract_source_url)}</p>` : ''}
  </article>`;
}

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

export function burnFinancialMarkup(project, range, legacyEnd) {
  const {start,end}=range && typeof range==='object' ? range : {start:range,end:legacyEnd};
  const sources=bnbSources(project);
  const names={burns:'季度销毁记录与拆分',burn_proof:'已核季度交易与执行区块',gas_burn:'滚动Gas销毁摘要',gas_burn_snapshot:'滚动Gas销毁摘要',supply:'原生供应索引观察',chain_fees:'BSC日手续费',gas_burn_policy_estimate:'Gas销毁估算 · 供应商10%模型',policy_block:'参数核验所用BSC区块',gas_burn_policy:'当前区块Gas销毁参数'};
  const status={fresh:'已更新',cached:'复用缓存','offline-cache':'离线缓存',missing:'未取得',unknown:'未知'};
  const proof=sources.length?`<section class="source-policy"><h3>BNB数据来源与保存响应</h3><div class="financial-data-sources">${sources.map(source=>`<article><strong>${esc(names[source.kind] || source.kind || '销毁数据')}</strong><span class="number-sub">抓取 ${esc(source.retrieved_at || '未知')} · ${esc(status[source.status] || source.status || '未知')}</span><div class="source-links">${sourceLinks(source)}</div><p>保存文件 SHA-256：<code>${esc(source.stored_sha256 || source.sha256 || '未知')}</code></p>${source.refresh_error?`<p class="footnote">本次抓取情况：${esc(source.refresh_error)}</p>`:''}</article>`).join('')}</div><p class="source-explanation">链手续费是交易费用索引，日Gas销毁是10%政策模型，当前参数是独立区块观察，季度销毁使用已核执行交易。保存响应便于复算，不表示完整供应台账已经取得。</p></section>`:'';
  return `<div class="source-meaning"><h3>BNB 的销毁与收入回购分别研究</h3><p>Auto-Burn 是按规则处理的季度储备销毁；BEP-95 是链上交易费中的实时销毁。不能把两者合称为“企业净利润用于回购”，也不能用季度销毁估值填入营业收入或净利润。</p><p>本行 P/S、持币者回报倍数、项目净利润 P/E 和年化回购收益率均不适用。季度记录的供应效果仍须与其他供应变动对账，不能据此断言自由流通净通缩。</p></div>${bnbChainMarkup(project,start,end)}${burnRecordsMarkup(project, start, end)}${burnObservationsMarkup(project)}${proof}<div class="sources">${(project.sources || []).map(source => link(source.title, source.url)).join(' ')}</div>`;
}
