import {known, ratio} from './core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const quantity = value => known(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 4}) : '未知';
const dollars = value => known(value) ? '$' + value.toLocaleString('en-US', {maximumFractionDigits: 0}) : '未知';
const percent = value => known(value) ? (value * 100).toFixed(2) + '%' : '未知';
const link = (title, url) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(title)}</a>` : '';
const usdBasis = record => ['executed_native_tokens_times_same_utc_date_price; not_cash_cost',
  'executed_bnb_tokens_times_same_utc_date_price; not_cash_cost'].includes(record.usd_basis)
  ? '执行日UTC采样价 × 实际销毁枚数；非现金支出' : record.usd_basis || '销毁日历史价格估值，非成交支出';
const publicNote = value => String(value ?? '').replace(/successful receipt/g,'执行成功的交易回执').replace(/dead地址/g,'销毁地址')
  .replace(/chainId/g,'链标识').replace(/block/g,'执行区块').replace(/BSC native转账/g,'BSC原生BNB转账').replace(/native transfer/g,'原生BNB转账');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const DAY = 86400000;
const burnSourceKinds = new Set(['burns','burn_proof','gas_burn','gas_burn_snapshot','supply','chain_fees','gas_burn_policy_estimate','policy_block','gas_burn_policy']);
const nonnegative = value => known(value) && value >= 0;
const ledgerNumber = value => nonnegative(value) ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
  && Number.isFinite(Number(value)) ? Number(value) : null;
const ledgerQuantity = value => nonnegative(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 8}) : '未知';

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

// The latest executed burn belongs to the research snapshot, independently of
// the selected fee window. A forecast or a future-dated row cannot replace it.
export function latestQuarterBurn(project) {
  const cutoff = project.burns?.cutoff_utc || project.flow_end;
  if (!validDate(cutoff)) return null;
  return burnStats(project, '1970-01-01', cutoff).records
    .filter(record => nonnegative(record.tokens)).at(-1) || null;
}

const quarterAnnouncement = (project, record) => record && (project.events || []).find(event =>
  event.date === record.date && event.title?.includes(`第${record.rank}次`))?.source;

// A tracker row, a read announcement and a verified chain transaction are three
// separate observations. Combining their identifiers must not upgrade evidence
// or turn an absent Pioneer split, price or chain proof into zero.
export function historicalLedger(project) {
  const registry = project.burns?.official_history;
  const registrySources = Array.isArray(registry?.sources) ? registry.sources : [];
  const officialRows = Array.isArray(registry?.quarters) ? registry.quarters : [];
  const records = Array.isArray(project.burns?.quarterly_records) ? project.burns.quarterly_records : [];
  const cutoff = project.burns?.cutoff_utc || project.flow_end;
  const groups = new Set(), aliases = new Map(), sourceMap = new Map(registrySources.map(source => [source.id,source]));
  const keysFor = row => {
    const keys = [];
    const rank = Number(row.rank);
    if (Number.isInteger(rank) && rank > 0) keys.push('rank:'+rank);
    const tx = row.transaction_hash || row.tx_url || row.transaction_url || row.reported_transaction_url;
    const hash = typeof tx === 'string' && tx.match(/(?:^|\/tx\/)(?:0x)?([0-9a-f]{64})(?:$|[?#])/i)?.[1];
    if (tx) keys.push('tx:'+(hash ? '0x'+hash.toLowerCase() : String(tx).toLowerCase()));
    return keys;
  };
  const eligible = (row, official) => {
    if (!row || ['projected','after_cutoff'].includes(row.status)) return false;
    const date = official ? row.execution_date || row.announcement_date : row.date || row.indexed_date || row.reported_date;
    return validDate(date) && (!validDate(cutoff) || date <= cutoff);
  };
  for (const [rows,kind] of [[records,'records'],[officialRows,'official']]) {
    for (const row of rows) {
      if (!eligible(row,kind==='official')) continue;
      const keys = keysFor(row);
      if (!keys.length) continue;
      const matches = [...new Set(keys.map(key=>aliases.get(key)).filter(Boolean))];
      const group = matches[0] || {records:[],official:[]};
      groups.add(group);
      for (const extra of matches.slice(1)) {
        group.records.push(...extra.records);group.official.push(...extra.official);groups.delete(extra);
        for (const [alias,owner] of aliases) if (owner===extra) aliases.set(alias,group);
      }
      for (const key of keys) aliases.set(key,group);
      group[kind].push(row);
    }
  }
  const rows = [...groups].map(group => {
    const official = group.official.find(row=>row.amount_status==='official_announcement_verified') || group.official[0];
    const officialSources = Array.isArray(official?.source_ids) ? official.source_ids.map(id=>sourceMap.get(id)).filter(Boolean) : [];
    const officialReviewed = official?.amount_status === 'official_announcement_verified'
      && ledgerNumber(official.reported_total_tokens) !== null && officialSources.length > 0;
    const proofs = group.records.filter(record=>record.verified===true && validDate(record.date) && nonnegative(record.tokens)
      && (record.transaction_hash || record.tx_url || record.transaction_url));
    const proofIdentity = record => keysFor(record).find(key=>key.startsWith('tx:'));
    const distinctProofs = new Map(proofs.map(record=>[proofIdentity(record),record]));
    const officialTxIdentity = official && keysFor(official).find(key=>key.startsWith('tx:'));
    const announcementTxMismatch = Boolean(officialTxIdentity && proofs.some(record=>proofIdentity(record)!==officialTxIdentity));
    const chainConflict = announcementTxMismatch || distinctProofs.size > 1 || proofs.some(record=>
      proofs.some(other=>proofIdentity(other)===proofIdentity(record) && (other.tokens!==record.tokens || other.date!==record.date)));
    const proof = !chainConflict ? proofs[0] : null;
    const tracker = group.records.find(record=>record.verified===true) || group.records[0];
    const indexed = group.records.find(record=>record.status==='indexed_verified' && record.evidence==='indexed_beacon_burn_transaction'
      && validDate(record.indexed_date) && nonnegative(record.indexed_tokens) && record.indexed_source_key
      && bnbSources(project).some(source=>source.source_key===record.indexed_source_key
        && source.kind==='burn_proof' && source.role==='official_explorer_indexer'));
    const date = proof?.date || indexed?.indexed_date || official?.execution_date || official?.announcement_date || tracker?.date || tracker?.reported_date;
    const dateBasis = proof ? '链上UTC执行日' : indexed ? '官方浏览器索引UTC日' : official?.execution_date ? '官文所列执行日，未独立核验'
      : official?.announcement_date ? '官方公告日；执行日待核' : '跟踪器日期；执行日待核';
    const rank = Number(official?.rank ?? tracker?.rank);
    const reportedTokens = officialReviewed ? ledgerNumber(official.reported_total_tokens) : null;
    const pioneerTokens = officialReviewed ? ledgerNumber(official.pioneer_tokens) : null;
    const officialActualTokens = officialReviewed ? ledgerNumber(official.actual_tokens) : null;
    const trackerTokens = ledgerNumber(tracker?.reported_amount);
    const chainTokens = proof?.tokens ?? null;
    const notes = [];
    if (announcementTxMismatch) notes.push('官方公告所列交易与跟踪器已核交易不一致，暂不认定它们属于同一期执行。');
    else if (chainConflict) notes.push('同一期有相互冲突的已核交易，暂不认定本期实际枚数。');
    if (official?.evidence_notes) notes.push(...(Array.isArray(official.evidence_notes) ? official.evidence_notes : [official.evidence_notes]));
    if (official?.tracker_discrepancies) notes.push(...(Array.isArray(official.tracker_discrepancies) ? official.tracker_discrepancies : [official.tracker_discrepancies]));
    if (proof?.reported_date && proof.reported_date !== proof.date) notes.push(`跟踪器日期${proof.reported_date}与链上UTC日期不同。`);
    if (nonnegative(chainTokens) && nonnegative(officialActualTokens) && Math.abs(chainTokens-officialActualTokens)>0.000001)
      notes.push('官文实际销毁枚数与已核交易数值不一致，仍分别保留。');
    if (!proof && tracker?.verification_error) notes.push(`链上核验未完成：${publicNote(tracker.verification_error)}。`);
    const txUrl = proof?.tx_url || proof?.transaction_url || official?.tx_url || tracker?.tx_url || tracker?.transaction_url || tracker?.reported_transaction_url;
    const proofKeys = proof?.proof_source_keys || proof?.source_keys;
    const savedProofSources = proof ? bnbSources(project).filter(source=>source.kind==='burn_proof'
      && (!Array.isArray(proofKeys) || proofKeys.includes(source.source_key))) : [];
    const savedTracker = bnbSources(project).find(source=>source.source_key===tracker?.source_key)
      || bnbSources(project).find(source=>source.kind==='burns' && source.url?.includes('getQuarterBurns'));
    const savedIndex = indexed ? bnbSources(project).find(source=>source.source_key===indexed.indexed_source_key) : null;
    return {rank:Number.isInteger(rank)&&rank>0 ? rank : null,quarter:official?.quarter || tracker?.quarter,
      date,dateBasis,announcementDate:official?.announcement_date || null,trackerDate:tracker?.reported_date || null,
      reportedTokens,trackerTokens,pioneerTokens,pioneerStatus:official?.pioneer_status,officialActualTokens,actualTokensMethod:official?.actual_tokens_method,
      chainTokens,chainVerified:Boolean(proof),chainConflict,officialReviewed,
      indexedTokens:indexed?.indexed_tokens ?? null,indexVerified:Boolean(indexed),savedIndex,
      chain:proof?.chain || official?.chain || (txUrl?.includes('etherscan.io') ? 'Ethereum' : txUrl?.includes('explorer.binance.org') ? 'Beacon Chain' : txUrl?.includes('bsc') ? 'BSC' : null),
      announcementUrl:official?.announcement_url || quarterAnnouncement(project,proof),txUrl,
      trackerUrl:tracker?.source_url || savedTracker?.url,officialSources,savedProofSources,savedTracker,
      usd:proof && nonnegative(proof.usd) ? proof.usd : null,notes:[...new Set(notes.map(String))]};
  }).sort((a,b)=>(b.rank ?? 0)-(a.rank ?? 0) || b.date.localeCompare(a.date));
  const ranks = new Set(rows.map(row=>row.rank).filter(rank=>rank!==null));
  const highest = ranks.size ? Math.max(...ranks) : 0;
  const missingRanks = [];
  for (let rank=1;rank<=highest;rank++) if (!ranks.has(rank)) missingRanks.push(rank);
  return {rows,totalCount:rows.length,chainVerifiedCount:rows.filter(row=>row.chainVerified).length,
    indexVerifiedCount:rows.filter(row=>row.indexVerified && !row.chainVerified).length,
    officialReviewedCount:rows.filter(row=>row.officialReviewed).length,
    unverifiedCount:rows.filter(row=>!row.chainVerified).length,missingRanks,
    reviewedAt:registry?.reviewed_at_utc || null,
    earliest:rows.length ? rows.map(row=>row.date).sort()[0] : null,
    latest:rows.length ? rows.map(row=>row.date).sort().at(-1) : null};
}

const savedLedgerLink = (title, source) => source?.response_path ? link(title,source.response_path) : '';

export function quarterHistoryMarkup(project) {
  const ledger = historicalLedger(project);
  const tableRows = ledger.rows.map(row => {
    const reported = row.officialReviewed ? `<strong>${ledgerQuantity(row.reportedTokens)}</strong><span class="number-sub">已核官方公告总量</span>`
      : nonnegative(row.trackerTokens) ? `<strong>${ledgerQuantity(row.trackerTokens)}</strong><span class="number-sub">跟踪器记录，官文金额待核</span>` : '未知';
    const actual = row.chainVerified ? `<strong>${ledgerQuantity(row.chainTokens)}</strong><span class="number-sub">${esc(row.chain || '对应链')}交易已独立核验</span>`
      : row.indexVerified ? `<strong>${ledgerQuantity(row.indexedTokens)}</strong><span class="number-sub">官方浏览器索引；非独立RPC核验</span>`
      : `未核验${row.chain ? `<span class="number-sub">${esc(row.chain)}</span>` : ''}`;
    const pioneer = row.pioneerStatus==='not_applicable' ? '不适用（机制尚未启动）' : ledgerQuantity(row.pioneerTokens);
    const split = row.officialReviewed ? `Pioneer：${pioneer}<span class="number-sub">官文实际销毁：${ledgerQuantity(row.officialActualTokens)}${row.actualTokensMethod==='total_minus_pioneer' ? '（总量减Pioneer）' : row.actualTokensMethod==='explicitly_reported' ? '（官文列值）' : ''}</span>` : '拆分待核';
    const sources = [link('官方公告',row.announcementUrl),link('跟踪器JSON',row.trackerUrl),link('交易记录',row.txUrl),
      savedLedgerLink('保存跟踪器响应',row.savedTracker),
      link('官方浏览器API',row.savedIndex?.url),savedLedgerLink('保存浏览器响应',row.savedIndex),
      ...row.officialSources.map((source,index)=>savedLedgerLink(row.officialSources.length>1 ? `保存官文${index+1}` : '保存官文',source)),
      ...row.savedProofSources.map((source,index)=>savedLedgerLink(row.savedProofSources.length>1 ? `保存链上响应${index+1}` : '保存链上响应',source))].filter(Boolean).join(' ');
    const statuses = [row.chainVerified ? '链上已独立核验' : row.indexVerified ? '官方浏览器索引确认' : '链上待核',row.officialReviewed ? '官文金额已核' : '官文金额待核'];
    return `<tr><td>第${esc(row.rank || '未知')}次<span class="number-sub">${esc(row.quarter || '季度销毁')}</span></td>
      <td>${esc(row.date)}<span class="number-sub">${esc(row.dateBasis)}</span>${row.announcementDate&&row.announcementDate!==row.date ? `<span class="number-sub">公告 ${esc(row.announcementDate)}</span>` : ''}</td>
      <td>${reported}</td><td>${actual}</td><td>${split}</td>
      <td>${esc(statuses.join(' · '))}${row.notes.length ? `<details><summary>核验说明</summary><p>${esc(row.notes.join(' '))}</p></details>` : ''}</td>
      <td><div class="sources">${sources || '来源尚未登记'}</div></td></tr>`;
  }).join('');
  return `<article class="card quarter-history" id="bnb-quarterly-history" aria-labelledby="quarter-history-title">
    <h3 id="quarter-history-title">全部季度销毁历史</h3>
    <p>独立于上方观察窗口，按期数展示已取得的历史记录；未来预测不列作已执行销毁。</p>
    <div class="mini-stats"><div><span>已取得历史记录</span><strong>${ledger.totalCount}期</strong></div>
    <div><span>链上交易独立核验</span><strong>${ledger.chainVerifiedCount}期</strong></div>
    <div><span>官方浏览器索引确认</span><strong>${ledger.indexVerifiedCount}期</strong></div>
    <div><span>官方公告金额已核</span><strong>${ledger.officialReviewedCount}期</strong></div></div>
    <p class="footnote">公告总量可能含Pioneer补偿统计，不应再次加到本次交易实际销毁上。未知拆分保留未知；官方浏览器索引与独立RPC核验分开计数。</p>
    ${tableRows ? `<div class="table-wrap quarter-history-table" tabindex="0" aria-label="全部季度销毁历史，可滚动查看早期记录"><table><thead><tr><th>期数</th><th>日期及依据</th><th>公告／跟踪器总量 · BNB</th><th>执行交易枚数 · BNB</th><th>Pioneer拆分 · BNB</th><th>证据状态</th><th>来源与保存响应</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : '<p>尚未取得可列示的历史季度记录。</p>'}
    ${ledger.missingRanks.length ? `<p class="footnote">已取得期数之间仍缺第${esc(ledger.missingRanks.join('、'))}次记录。</p>` : ''}
    <p class="footnote">${ledger.earliest ? `已取得记录日期${esc(ledger.earliest)} → ${esc(ledger.latest)}。` : ''}${ledger.reviewedAt ? `官文复核${esc(ledger.reviewedAt)}。` : ''}只有核验成功的执行交易进入所选窗口统计；未取得历史价格的早期记录没有套用当前价格估值。</p>
  </article>`;
}

export function quarterlyPlanMarkup(project) {
  const plan = project.quarterly_burn_plan;
  if (!plan) return '';
  const latest = latestQuarterBurn(project);
  const recordSource = bnbSources(project).find(source => source.kind === 'burns');
  return `<article class="card quarterly-plan" id="bnb-quarterly-plan" aria-labelledby="quarterly-plan-title">
    <h3 id="quarterly-plan-title">BNB季度销毁计划 · Auto-Burn</h3>
    <p>${esc(plan.description)}</p>
    <div class="mini-stats"><div><span>执行频率</span><strong>每季度</strong></div>
    <div><span>季度计划的总供应目标</span><strong>${quantity(plan.target_supply_tokens)} BNB</strong></div>
    <div><span>最近已核执行 · 当前研究快照</span><strong>${latest ? `第${esc(latest.rank || '未知')}次` : '尚未取得'}</strong><span class="number-sub">${esc(latest?.date || '未知日期')}</span></div>
    <div><span>最近一笔实际销毁枚数</span><strong>${quantity(latest?.tokens)} BNB</strong></div></div>
    <p>最近一笔按当前研究快照展示，不受上方日期筛选影响；所选期间的合计另列在下表。未来季度的执行日期与数量以实际公告及交易为准。</p>
    <p>${esc(plan.cash_note)} BEP-95的Gas实时销毁另列，不包含在这些季度交易枚数中。</p>
    <div class="sources">${(plan.sources || []).map(source => link(source.title, source.url)).join(' ')} ${link('最近一笔官方公告 ↗',quarterAnnouncement(project,latest))} ${link('最近一笔销毁交易 ↗',latest?.tx_url || latest?.transaction_url)}</div>
    <p class="footnote">季度记录：${sourceLinks(recordSource)}。机制复核日：${esc(plan.verified_on || '未知')}。</p>
    <details><summary>早期“利润回购”与现行季度销毁的区别</summary><p>${esc(plan.history_note)}</p><div class="sources">${(plan.history_sources || []).map(source => link(source.title, source.url)).join(' ')}</div></details>
  </article>`;
}

export function quarterComparisonMarkup(project, start, end) {
  const stats = burnStats(project,start,end), latest = latestQuarterBurn(project);
  return `<button class="metric-button" data-quarter-plan="${esc(project.ticker)}" aria-label="${esc(project.ticker)} 查看季度销毁计划">
    <strong>${stats.count ? quantity(stats.tokens)+' BNB' : '季度销毁计划 ↗'}</strong>
    <span class="number-sub">${stats.count ? `所选期间已核${stats.count}笔 · 未年化` : '所选期间没有已核事件'}</span>
    ${latest ? `<span class="number-sub">最近一笔 ${quantity(latest.tokens)} BNB · ${esc(latest.date)}</span>` : ''}
    <span class="stat-method">实际销毁枚数；现金回购收益率不适用</span></button>`;
}

export function burnRecordsMarkup(project, start, end) {
  const stats = burnStats(project, start, end);
  const rows = stats.records.map(record => `<tr><td>${esc(record.rank ? '第'+record.rank+'次（'+(record.quarter || '季度销毁')+'）' : record.quarter || record.title || '季度销毁')}<span class="number-sub">${esc(record.date)}</span></td><td>${quantity(record.tokens)}</td><td>${dollars(record.usd)}<span class="number-sub">${esc(usdBasis(record))}</span></td><td>${link('官方公告',quarterAnnouncement(project,record))} ${link('季度记录API', record.source_url || record.source || record.url)} ${link('交易记录', record.tx_url || record.transaction_url || (/^https?:\/\//.test(record.tx || '') ? record.tx : null))}</td></tr>`).join('');
  const limitations = project.burns?.limitations;
  return `<article class="card burn-records"><h3>已核季度销毁 · 所选期间</h3><p>${esc(start)} → ${esc(end)}。${stats.count ? `已登记 ${stats.count} 笔季度记录。` : '所选期间没有已核季度记录，不能推定实际销毁为零。'}</p>
    ${stats.count ? `<div class="mini-stats"><div><span>已核季度销毁枚数</span><strong>${quantity(stats.tokens)} ${esc(project.ticker)}</strong></div><div><span>销毁日美元估值合计</span><strong>${dollars(stats.usd)}</strong></div><div><span>记录估值 ÷ 当前流通市值</span><strong>${percent(stats.shareMc)}</strong></div><div><span>记录估值 ÷ 当前 FDV</span><strong>${percent(stats.shareFdv)}</strong></div></div>` : ''}
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>记录 / 日期</th><th>销毁枚数</th><th>销毁日美元估值</th><th>来源</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${stats.unverifiedCount ? `<p class="footnote">另有 ${stats.unverifiedCount} 条未核 / 预计记录，没有纳入合计。</p>` : ''}
    <p class="footnote">${esc(stats.note)} 比例只比较已核记录与当前估值，不能作为收益率或未来季度预测。</p>
    ${limitations ? `<details><summary>查看季度销毁核验范围</summary><p class="footnote">${esc(publicNote(Array.isArray(limitations) ? limitations.join(' ') : limitations))}</p></details>` : ''}</article>`;
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
  return `${quarterlyPlanMarkup(project)}${quarterHistoryMarkup(project)}${burnRecordsMarkup(project,start,end)}<div class="source-meaning"><h3>BNB 的销毁与收入回购分别研究</h3><p>Auto-Burn 是按规则处理的季度储备销毁；BEP-95 是链上交易费中的实时销毁。不能把两者合称为“企业净利润用于回购”，也不能用季度销毁估值填入营业收入或净利润。</p><p>本行 P/S、持币者回报倍数、项目净利润 P/E 和年化回购收益率均不适用。季度记录的供应效果仍须与其他供应变动对账，不能据此断言自由流通净通缩。</p></div>${bnbChainMarkup(project,start,end)}${burnObservationsMarkup(project)}${proof}<div class="sources">${(project.sources || []).map(source => link(source.title, source.url)).join(' ')}</div>`;
}
