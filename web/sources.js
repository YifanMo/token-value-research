import {known} from './core.js';

export const buybackSource = project => project.data_sources?.find(source => source.kind === 'holders');

const close = (a,b,tolerance=1e-6) => known(a) && known(b) && Math.abs(a-b) <= Math.max(tolerance,Math.abs(b)*1e-10);

function normalizeFeeRow(row, breakdown, rule) {
  if (row.date < rule.valid_from) return {...row,rawUsd:row.usd,excludedUsd:0,normalization:'before_child_start'};
  const groups=breakdown.get(row.date);
  if (!groups || typeof groups!=='object' || Array.isArray(groups) || !Object.keys(groups).length) return {...row,usd:null,issue:'missing_breakdown'};
  const parts=Object.values(groups);
  if (parts.some(group=>!group || typeof group!=='object' || Array.isArray(group) || !Object.keys(group).length)) return {...row,usd:null,issue:'incompatible_breakdown'};
  const amounts=parts.flatMap(group=>Object.values(group));
  if (amounts.some(value=>!known(value) || (value<0 && !rule.allow_signed_components))) return {...row,usd:null,issue:'incompatible_breakdown'};
  const duplicate=groups[rule.chain]?.[rule.child];
  if (!known(duplicate)) return {...row,usd:null,issue:'missing_duplicate_child'};
  if (duplicate<0) return {...row,usd:null,issue:'negative_duplicate_child'};
  if ((rule.required_children||[]).some(child=>!(child in groups[rule.chain]))) return {...row,usd:null,issue:'missing_required_child'};
  const sum=amounts.reduce((a,b)=>a+b,0);
  const includes=close(row.usd,sum,rule.tolerance_usd), excludes=close(row.usd,sum-duplicate,rule.tolerance_usd);
  if (duplicate>0 && includes && excludes) return {...row,usd:null,issue:'ambiguous_breakdown'};
  if (includes && row.usd>=duplicate) return {...row,rawUsd:row.usd,usd:row.usd-duplicate,excludedUsd:duplicate,normalization:'removed_duplicate'};
  if (excludes) return {...row,rawUsd:row.usd,excludedUsd:0,normalization:'provider_already_excluded'};
  return {...row,usd:null,issue:'parent_children_mismatch'};
}

// Rebuild the displayed UTC window from the saved response, independently of the
// compiled aggregate. Duplicate dates follow the collector's last-observation rule.
export function auditResponse(raw, project, days, kind='holders') {
  if (!Array.isArray(raw?.totalDataChart)) throw Error('接口缺少 totalDataChart，无法核对。');
  const window = project.windows?.[String(days)]?.[kind];
  if (!window) throw Error('快照缺少所选窗口。');
  const daily = new Map();
  for (const row of raw.totalDataChart) {
    if (!Array.isArray(row) || row.length !== 2 || !known(row[0]) || !known(row[1])) continue;
    const date = new Date(row[0] * 1000);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0,10);
    if (key >= window.start && key <= window.end) daily.set(key,{date:key,timestamp:row[0],usd:row[1]});
  }
  const rows = [];
  let documentedZeros = 0;
  for (let index=0;index<days;index++) {
    const date = new Date(Date.parse(window.start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10);
    if (daily.has(date)) rows.push(daily.get(date));
    else if (project.zero_before?.[kind] && date < project.zero_before[kind] &&
      (!project.custom_range || (project.custom_range.research_start && date >= project.custom_range.research_start))) documentedZeros++;
  }
  const rawComplete = rows.length + documentedZeros === days;
  const rawTotal = rawComplete ? rows.reduce((sum,row)=>sum+row.usd,0) : null;
  const rule = project.flow_normalizations?.[kind] || (kind==='fees' ? project.fee_normalization : null);
  if (rule) {
    const actualMethods=new Map((raw.childProtocols||[]).map(child=>[child.name,child.methodology?.Fees]));
    const methodsMatch=Object.entries(rule.expected_fee_methodologies||{}).every(([name,description])=>actualMethods.get(name)===description);
    const breakdown=new Map();
    for (const row of raw.totalDataChartBreakdown||[]) {
      if (!Array.isArray(row) || row.length!==2 || !known(row[0])) continue;
      const date=new Date(row[0]*1000);
      if (Number.isFinite(date.getTime())) breakdown.set(date.toISOString().slice(0,10),row[1]);
    }
    for (let i=0;i<rows.length;i++) rows[i]=methodsMatch?normalizeFeeRow(rows[i],breakdown,rule):{...rows[i],usd:null,issue:'methodology_changed'};
  }
  const complete = rawComplete && rows.every(row=>known(row.usd));
  const total = complete ? rows.reduce((sum,row)=>sum+row.usd,0) : null;
  const expected = window.usd;
  const rawExpected = rule ? window.raw_usd : expected;
  const rawMatches = known(rawTotal) && known(rawExpected) ? close(rawTotal,rawExpected) : null;
  const excludedTotal = rule && complete ? rows.reduce((sum,row)=>sum+row.excludedUsd,0) : null;
  const excludedMatches = rule && known(excludedTotal) && known(window.excluded_usd) ? close(excludedTotal,window.excluded_usd) : null;
  const matches = known(total) && known(expected) ? close(total,expected) && (!rule || (rawMatches===true && excludedMatches===true)) : null;
  return {rows,documentedZeros,complete,total,expected,matches,rawTotal,rawExpected,rawMatches,excludedTotal,excludedMatches,
    normalization:rule?.id,issues:rows.filter(row=>row.issue).map(row=>({date:row.date,reason:row.issue})),start:window.start,end:window.end};
}
