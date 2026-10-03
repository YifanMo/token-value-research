import {known} from './core.js';
import {auditResponse} from './sources.js';

const DAY = 86400000;
const MAIN_KINDS = ['fees', 'revenue', 'holders'];

function utcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function validateDateRange(start, end, earliest, latest) {
  const from = utcDate(start), to = utcDate(end);
  const result = {valid: false, start, end, days: null, error: ''};
  if (from === null || to === null) return {...result, error: '请输入有效的起止日期。'};
  if (from > to) return {...result, error: '开始日期不能晚于结束日期。'};
  if (earliest != null && utcDate(earliest) === null) return {...result, error: '数据起点日期无效。'};
  if (latest != null && utcDate(latest) === null) return {...result, error: '数据截止日期无效。'};
  if (earliest && start < earliest) return {...result, error: `可选日期最早为 ${earliest}。`};
  if (latest && end > latest) return {...result, error: `结束日期不能晚于已完成 UTC 日 ${latest}。`};
  return {...result, valid: true, days: Math.round((to - from) / DAY) + 1};
}

function dateOfSecond(value) {
  if (!known(value)) return null;
  const timestamp = value * 1000;
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function responseDaily(raw) {
  const values = new Map();
  for (const row of raw?.totalDataChart || []) {
    if (!Array.isArray(row) || row.length !== 2 || !known(row[1])) continue;
    const date = dateOfSecond(row[0]);
    if (date) values.set(date, row[1]); // Same last-observation rule as the collector.
  }
  return values;
}

function protocolEarliest(responses) {
  const dates = ['fees', 'revenue'].flatMap(kind => [...responseDaily(responses[kind]).keys()]);
  return dates.length ? dates.reduce((first, date) => date < first ? date : first) : null;
}

function sum(values) {
  const total = values.reduce((result, value) => result + value, 0);
  return known(total) ? total : null;
}

function composition(raw, start, end, days, validValues, rule) {
  const daily = new Map();
  for (const row of raw?.totalDataChartBreakdown || []) {
    if (!Array.isArray(row) || row.length !== 2) continue;
    const date = dateOfSecond(row[0]);
    if (date && date >= start && date <= end) daily.set(date, row[1]);
  }
  const products = new Map(), chains = new Map(), invalid = [];
  let observed = 0;
  for (const [date, groups] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
    if (!validValues.has(date) || !groups || typeof groups !== 'object' || Array.isArray(groups) || !Object.keys(groups).length) {
      invalid.push(date); continue;
    }
    const categories = Object.entries(groups);
    if (categories.some(([, group]) => !group || typeof group !== 'object' || Array.isArray(group))) {
      invalid.push(date); continue;
    }
    const amounts = categories.flatMap(([chain, group]) => Object.entries(group).map(([product, value]) => ({chain, product, value})));
    if (amounts.some(item => !known(item.value))) {invalid.push(date); continue;}
    observed++;
    for (const {chain, product, value} of amounts) {
      if (rule && chain === rule.chain && product === rule.child) continue;
      products.set(product, (products.get(product) || 0) + value);
      chains.set(chain, (chains.get(chain) || 0) + value);
    }
  }
  const complete = observed === days;
  const total = complete ? sum([...products.values()]) : null;
  const parent = validValues.size === days ? sum([...validValues.values()]) : null;
  const categories = values => [...values].map(([label, usd]) => ({label, usd})).sort((a, b) => b.usd - a.usd);
  return {products: categories(products), chains: categories(chains), observed_days: observed, days, complete,
    sum_usd: total, difference_from_total_usd: known(total) && known(parent) ? total - parent : null,
    invalid_dates: invalid,
    note: '按API已列项目加总；未出现的类别不推定为现实中无收入，未单列的版本或来源不能硬拆。'};
}

function aggregate(project, kind, raw, range, researchStart) {
  const {start, end, days} = range;
  const available = Array.isArray(raw?.totalDataChart);
  const rule = project.flow_normalizations?.[kind] || (kind === 'fees' ? project.fee_normalization : null);
  // Reuse the independent source verifier for UTC grouping and normalization.
  // Documented zeros are counted below so they cannot predate protocol evidence.
  const stub = {...project, zero_before: {}, windows: {[String(days)]: {[kind]: {start, end, usd: null}}}};
  const audit = available ? auditResponse(raw, stub, days, kind) : {rows: [], issues: []};
  const rows = new Map(audit.rows.filter(row => !researchStart || row.date >= researchStart).map(row => [row.date, row]));
  const original = responseDaily(raw), values = new Map();
  const rawValues = [], excludedValues = [], missing = [];
  let documentedZeros = 0, observedDays = 0, alreadyExcluded = 0;
  for (let i = 0, first = utcDate(start); i < days; i++) {
    const date = new Date(first + i * DAY).toISOString().slice(0, 10);
    const row = rows.get(date);
    if (row && known(row.usd)) {
      values.set(date, row.usd); observedDays++;
      if (row.normalization === 'provider_already_excluded') alreadyExcluded++;
    } else if (available && !row && researchStart && date >= researchStart && project.zero_before?.[kind] && date < project.zero_before[kind]) {
      values.set(date, 0); documentedZeros++;
    } else missing.push(date);
    if ((!researchStart || date >= researchStart) && original.has(date)) rawValues.push(original.get(date));
    else if (values.has(date) && !row) rawValues.push(0);
    if (known(row?.excludedUsd)) excludedValues.push(row.excludedUsd);
    else if (values.has(date) && !row) excludedValues.push(0);
  }
  const observed = values.size ? sum([...values.values()]) : null;
  const complete = values.size === days && known(observed);
  const result = {usd: complete ? observed : null, observed_usd: observed,
    coverage_days: values.size, observed_days: observedDays, documented_zero_days: documentedZeros,
    missing_days: days - values.size, missing_dates: missing, days, start, end, complete, source_available: available};
  if (rule) Object.assign(result, {
    raw_usd: rawValues.length === days ? sum(rawValues) : null,
    excluded_usd: excludedValues.length === days ? sum(excludedValues) : null,
    normalization_rule: rule.id, already_excluded_days: alreadyExcluded,
    normalization_issues: audit.issues.filter(issue => !researchStart || issue.date >= researchStart),
  });
  if (MAIN_KINDS.includes(kind)) result.composition = composition(raw, start, end, days, values, rule);
  return result;
}

// Build one inclusive UTC period from this snapshot's pinned response JSONs.
// Valuation, supply forecasts and historical events retain their own dates.
export function createRangeProject(project, start, end, responses = {}) {
  const range = validateDateRange(start, end);
  if (!range.valid) throw new RangeError(range.error);
  const researchStart = protocolEarliest(responses);
  const window = Object.fromEntries(MAIN_KINDS.map(kind => [kind, aggregate(project, kind, responses[kind], range, researchStart)]));
  const oneoffs = [...new Set(project.holder_oneoff_dates || [])].filter(date => date >= start && date <= end).sort();
  Object.assign(window.holders, {oneoff_dates: oneoffs,
    recurring_usd: oneoffs.length ? null : window.holders.usd,
    recurring_note: oneoffs.length ? '窗口跨存量销毁事件，API是否纳入及经常性部分尚未对账，不年化' : '无已识别存量一次性项目'});
  const registeredSources = Object.values(project.windows || {}).find(value => value.flow_distributions?.sources)?.flow_distributions.sources || [];
  const sourceKinds = new Set(registeredSources.map(source => source.kind).filter(kind => ['supply', 'protocol'].includes(kind)));
  for (const kind of ['supply', 'protocol']) if (responses[kind] != null) sourceKinds.add(kind);
  if (sourceKinds.size) {
    const extra = {sources: registeredSources.map(source => ({...source}))};
    for (const kind of sourceKinds) extra[kind] = aggregate(project, kind, responses[kind], range, researchStart);
    extra.complete = [...sourceKinds].every(kind => extra[kind].complete);
    window.flow_distributions = extra;
  }
  return {...project, windows: {...project.windows, [String(range.days)]: window}, custom_range: {...range, research_start: researchStart}};
}
