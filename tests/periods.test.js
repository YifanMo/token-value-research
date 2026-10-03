import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRangeProject, validateDateRange} from '../web/periods.js';
import {calculate} from '../web/core.js';
import {auditResponse} from '../web/sources.js';

const second = date => Date.parse(date + 'T00:00:00Z') / 1000;
const response = rows => ({totalDataChart: rows.map(([date, usd]) => [second(date), usd])});
const fixture = () => ({ticker: 'TEST', market: {market_cap: 1000, fully_diluted_valuation: 2000},
  capture: {permanent_burn_proxy: true}, history: [{date: '2026-09-01', fees: 1}],
  data_sources: [{kind: 'holders', response_path: '../data/responses/pinned.json'}], windows: {}});
const selected = (project, days) => project.windows[String(days)];
const close = (actual, expected, message) => {
  if (expected === null) assert.equal(actual, null, message);
  else assert.ok(Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-10), message);
};

test('date validation counts inclusive UTC days, including same-day periods and leap years', () => {
  assert.equal(validateDateRange('2024-02-29', '2024-02-29').days, 1);
  assert.equal(validateDateRange('2024-01-01', '2024-12-31').days, 366);
  assert.equal(validateDateRange('2023-01-01', '2023-12-31').days, 365);
  assert.equal(validateDateRange('2023-12-31', '2024-01-01').days, 2);
  for (const [start, end, earliest, latest] of [
    ['2023-02-29', '2023-03-01'], ['2024-04-31', '2024-05-01'],
    ['2024-2-01', '2024-03-01'], ['2026-10-02', '2026-10-01'],
    ['2026-10-01', '2026-10-02', '2018-11-03', '2026-10-01'],
    ['2018-11-02', '2018-11-03', '2018-11-03', '2026-10-01'],
    ['2026-09-01', '2026-10-01', 'bad', '2026-10-01'],
  ]) {
    const result = validateDateRange(start, end, earliest, latest);
    assert.equal(result.valid, false); assert.equal(result.days, null); assert.ok(result.error);
  }
  assert.throws(() => createRangeProject(fixture(), '2026-10-02', '2026-10-01'), RangeError);
});

test('range aggregation uses last valid UTC observation and preserves project and response data', () => {
  const p = fixture();
  const raw = response([['2026-10-01', 10], ['2026-10-01', 20], ['2026-10-02', 999]]);
  raw.totalDataChart.push([second('2026-10-01'), 'bad']);
  const before = structuredClone(p), rawBefore = structuredClone(raw);
  const ranged = createRangeProject(p, '2026-10-01', '2026-10-01', {fees: raw, revenue: raw, holders: raw});
  assert.equal(selected(ranged, 1).fees.usd, 20);
  assert.equal(selected(ranged, 1).fees.complete, true);
  assert.equal(selected(ranged, 1).fees.days, 1);
  assert.deepEqual(p, before); assert.deepEqual(raw, rawBefore);
  assert.equal(ranged.market, p.market); assert.equal(ranged.history, p.history); assert.equal(ranged.data_sources, p.data_sources);
  assert.equal(calculate(ranged, 1, 'reported').grossYieldMc, 20 * 365 / 1000);
});

test('missing days keep whole-window amount unknown; observed zero remains a real observation', () => {
  const raws = {fees: response([['2026-09-29', 5], ['2026-10-01', 0]]),
    revenue: response([['2026-09-29', 5], ['2026-09-30', 0], ['2026-10-01', 0]])};
  const window = selected(createRangeProject(fixture(), '2026-09-29', '2026-10-01', raws), 3);
  assert.equal(window.fees.usd, null); assert.equal(window.fees.observed_usd, 5);
  assert.equal(window.fees.coverage_days, 2); assert.deepEqual(window.fees.missing_dates, ['2026-09-30']);
  assert.equal(window.revenue.usd, 5); assert.equal(window.revenue.coverage_days, 3);
  assert.equal(window.holders.usd, null); assert.equal(window.holders.source_available, false);
  assert.equal(window.holders.coverage_days, 0); assert.equal(window.holders.recurring_usd, null);
});

test('confirmed pre-policy zeros only count after protocol evidence and never replace an unavailable response', () => {
  const p = {...fixture(), zero_before: {holders: '2026-10-01'}};
  const raws = {fees: response([['2026-09-29', 5], ['2026-09-30', 5], ['2026-10-01', 5]]),
    holders: response([['2026-10-01', 10]])};
  const within = selected(createRangeProject(p, '2026-09-29', '2026-10-01', raws), 3).holders;
  assert.equal(within.usd, 10); assert.equal(within.coverage_days, 3);
  assert.equal(within.observed_days, 1); assert.equal(within.documented_zero_days, 2);
  const before = selected(createRangeProject(p, '2026-09-28', '2026-10-01', raws), 4).holders;
  assert.equal(before.usd, null); assert.equal(before.coverage_days, 3);
  assert.deepEqual(before.missing_dates, ['2026-09-28']);
  const absent = selected(createRangeProject(p, '2026-09-29', '2026-09-30', {fees: raws.fees}), 2).holders;
  assert.equal(absent.usd, null); assert.equal(absent.documented_zero_days, 0);
  const noBirthEvidence = selected(createRangeProject(p, '2026-09-29', '2026-10-01', {holders: raws.holders}), 3).holders;
  assert.equal(noBirthEvidence.usd, null); assert.equal(noBirthEvidence.documented_zero_days, 0);
});

test('custom source audit cannot restore pre-protocol days through the documented-zero rule', () => {
  const p = {...fixture(), zero_before: {holders: '2026-10-01'}};
  const holders = response([['2026-10-01', 10]]);
  const ranged = createRangeProject(p, '2026-09-28', '2026-10-01', {
    fees: response([['2026-09-29', 5], ['2026-09-30', 5], ['2026-10-01', 5]]), holders,
  });
  const audit = auditResponse(holders, ranged, 4, 'holders');
  assert.equal(audit.complete, false); assert.equal(audit.total, null); assert.equal(audit.matches, null);
  assert.equal(audit.documentedZeros, 2);
  const noBirthEvidence = createRangeProject(p, '2026-09-28', '2026-10-01', {holders});
  const unknownAudit = auditResponse(holders, noBirthEvidence, 4, 'holders');
  assert.equal(unknownAudit.complete, false); assert.equal(unknownAudit.documentedZeros, 0);
});

const rule = {id: 'remove-duplicate-v1', valid_from: '2026-09-30', chain: 'Chain', child: 'Mobile',
  required_children: ['Main', 'Mobile'], allow_signed_components: true,
  expected_fee_methodologies: {Mobile: 'already included'}};
const duplicateResponse = () => ({
  ...response([['2026-09-30', 115], ['2026-10-01', 95]]),
  totalDataChartBreakdown: [
    [second('2026-09-30'), {Chain: {Main: 100, Mobile: 20, Rebates: -5}}],
    [second('2026-10-01'), {Chain: {Main: 100, Mobile: 20, Rebates: -5}}],
  ], childProtocols: [{name: 'Mobile', methodology: {Fees: 'already included'}}],
});

test('range normalization retains raw and removed amounts, provider exclusions and signed composition', () => {
  const p = {...fixture(), flow_normalizations: {fees: rule, revenue: rule}};
  const raw = duplicateResponse();
  const window = selected(createRangeProject(p, '2026-09-30', '2026-10-01', {fees: raw, revenue: raw, holders: raw}), 2);
  assert.equal(window.fees.usd, 190); assert.equal(window.fees.raw_usd, 210);
  assert.equal(window.fees.excluded_usd, 20); assert.equal(window.fees.already_excluded_days, 1);
  assert.equal(window.fees.normalization_rule, rule.id); assert.deepEqual(window.fees.normalization_issues, []);
  assert.deepEqual(window.fees.composition.products, [{label: 'Main', usd: 200}, {label: 'Rebates', usd: -10}]);
  assert.equal(window.fees.composition.complete, true); assert.equal(window.fees.composition.sum_usd, 190);
  assert.equal(window.fees.composition.difference_from_total_usd, 0);
  assert.equal(window.revenue.usd, 190);
});

test('a normalization gap or methodology change is not backfilled from raw or partial amounts', () => {
  for (const changed of ['breakdown', 'methodology']) {
    const raw = duplicateResponse();
    if (changed === 'breakdown') delete raw.totalDataChartBreakdown[0][1].Chain.Mobile;
    else raw.childProtocols[0].methodology.Fees = 'new method';
    const p = {...fixture(), fee_normalization: rule};
    const window = selected(createRangeProject(p, '2026-09-30', '2026-10-01', {fees: raw}), 2).fees;
    assert.equal(window.usd, null); assert.equal(window.complete, false);
    assert.equal(window.raw_usd, 210); assert.ok(window.normalization_issues.length);
    assert.equal(window.composition.complete, false);
    assert.equal(window.observed_usd, changed === 'breakdown' ? 95 : null);
  }
});

test('inclusive stock-event boundaries block recurring annualization but keep raw statistics', () => {
  const p = {...fixture(), holder_oneoff_dates: ['2026-09-29', '2026-10-01', '2026-10-02']};
  const raw = response([['2026-09-30', 10], ['2026-10-01', 1000]]);
  const ranged = createRangeProject(p, '2026-09-30', '2026-10-01', {fees: raw, revenue: raw, holders: raw});
  assert.equal(selected(ranged, 2).holders.usd, 1010);
  assert.deepEqual(selected(ranged, 2).holders.oneoff_dates, ['2026-10-01']);
  assert.equal(selected(ranged, 2).holders.recurring_usd, null);
  assert.equal(calculate(ranged, 2, 'reported').holderAnnual, null);
  assert.equal(calculate(ranged, 2, 'reported').grossYieldMc, null);
  const prior = createRangeProject(p, '2026-09-30', '2026-09-30', {fees: raw, revenue: raw, holders: raw});
  assert.equal(selected(prior, 1).holders.recurring_usd, 10);
});

test('supplemental allocation responses use the same exact range and keep pinned source metadata', () => {
  const sources = [{kind: 'supply', sha256: 'abc', response_path: '../data/responses/supply.json'},
    {kind: 'protocol', sha256: 'def', response_path: '../data/responses/protocol.json'}];
  const p = {...fixture(), windows: {'30': {flow_distributions: {sources}}}};
  const raw = response([['2026-09-30', 10], ['2026-10-01', 20]]);
  const partial = response([['2026-10-01', 3]]);
  const ranged = createRangeProject(p, '2026-09-30', '2026-10-01', {fees: raw, revenue: raw, holders: raw, supply: raw, protocol: partial});
  const extra = selected(ranged, 2).flow_distributions;
  assert.equal(extra.supply.usd, 30); assert.equal(extra.protocol.usd, null); assert.equal(extra.complete, false);
  assert.equal(extra.protocol.start, '2026-09-30'); assert.equal(extra.protocol.end, '2026-10-01');
  assert.deepEqual(extra.sources, sources); assert.notEqual(extra.sources, sources);
  assert.equal(p.windows['30'].flow_distributions.sources, sources);
  const missing = selected(createRangeProject(p, '2026-09-30', '2026-10-01', {fees: raw}), 2).flow_distributions;
  assert.equal(missing.supply.usd, null); assert.equal(missing.protocol.usd, null);
});

test('arbitrary range aggregation reproduces the saved thirty-day snapshot for all five tokens', () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('../data/dashboard.json', import.meta.url)));
  const webRoot = new URL('../web/', import.meta.url);
  for (const p of snapshot.projects) {
    const original = p.windows['30'];
    const sources = [...p.data_sources, ...(original.flow_distributions?.sources || [])];
    const kinds=p.flow?.mode==='reserve_and_gas_burn'?['chain_fees','gas_burn_policy_estimate']:['fees','revenue','holders','supply','protocol'];
    const raws = Object.fromEntries(sources.filter(source => kinds.includes(source.kind))
      .map(source => [source.kind, JSON.parse(fs.readFileSync(new URL(source.response_path, webRoot)))]));
    const before = structuredClone(p);
    const ranged = createRangeProject(p, original.fees.start, original.fees.end, raws);
    const window = selected(ranged, 30);
    for (const kind of ['fees', 'revenue', 'holders']) {
      const label = `${p.ticker} ${kind}`;
      assert.equal(window[kind].complete, original[kind].complete, label);
      assert.equal(window[kind].coverage_days, original[kind].coverage_days, label);
      close(window[kind].usd, original[kind].usd, label);
      close(window[kind].observed_usd, original[kind].observed_usd, label);
      if (original[kind].normalization_rule) {
        close(window[kind].raw_usd, original[kind].raw_usd, label);
        close(window[kind].excluded_usd, original[kind].excluded_usd, label);
        assert.deepEqual(window[kind].normalization_issues, original[kind].normalization_issues, label);
      }
      assert.equal(window[kind].composition.complete, original[kind].composition.complete, label);
      close(window[kind].composition.sum_usd, original[kind].composition.sum_usd, label);
    }
    assert.equal(window.holders.recurring_usd, original.holders.recurring_usd, p.ticker);
    if (p.flow?.mode==='reserve_and_gas_burn' && original.gas_burn_estimate) {
      const actual=window.gas_burn_estimate,expected=original.gas_burn_estimate;
      assert.equal(actual.complete,expected.complete,'BNB dedicated model complete');
      assert.equal(actual.covered_days,expected.covered_days,'BNB dedicated model coverage');
      close(actual.usd,expected.usd,'BNB dedicated model USD');
      close(actual.observed_usd,expected.observed_usd,'BNB dedicated model observed USD');
      assert.deepEqual(actual.missing_dates,expected.missing_dates,'BNB dedicated model gaps');
    }
    for (const kind of ['supply', 'protocol']) if (original.flow_distributions?.[kind]) {
      close(window.flow_distributions[kind].usd, original.flow_distributions[kind].usd, `${p.ticker} ${kind}`);
    }
    assert.deepEqual(p, before, p.ticker);
  }
});

const bscResponse=(rows,kind='fees')=>({...response(rows),id:'chain#bsc',category:'Chain',methodology:kind==='fees'?{Fees:'Transaction fees paid by users'}:{Revenue:'Amount of 10% BNB transaction fees that were burned'}});
const bnbFixture=()=>({...fixture(),ticker:'BNB',flow:{mode:'reserve_and_gas_burn',revenue_is_income:false},zero_before:{fees:'2026-10-02',revenue:'2026-10-02',holders:'2026-10-02'},
  data_sources:[{kind:'chain_fees'},{kind:'gas_burn_policy_estimate',assumed_ratio:.1,effective_from:'2021-11-30'}]});

test('custom BNB windows keep actual BSC gas fees separate from the provider policy model and protocol income',()=>{
  const p=bnbFixture(),before=structuredClone(p);
  const raws={chain_fees:bscResponse([['2026-09-30',100],['2026-10-01',200]]),
    gas_burn_policy_estimate:bscResponse([['2026-09-30',10],['2026-10-01',20]],'model'),
    revenue:response([['2026-09-30',10],['2026-10-01',20]]),holders:response([['2026-09-30',10],['2026-10-01',20]])};
  const w=selected(createRangeProject(p,'2026-09-30','2026-10-01',raws),2);
  assert.equal(w.fees.usd,300);assert.equal(w.fees.evidence,'indexed_transaction_gas_fees');
  assert.equal(w.gas_burn_estimate.usd,30);assert.equal(w.gas_burn_estimate.complete,true);assert.equal(w.gas_burn_estimate.covered_days,2);
  assert.equal(w.gas_burn_estimate.evidence,'provider_policy_estimate');assert.equal(w.gas_burn_estimate.actual_burn_verified,false);assert.equal(w.gas_burn_estimate.cash_buyback_usd,null);
  for(const kind of ['revenue','holders']) {assert.equal(w[kind].usd,null);assert.equal(w[kind].coverage_days,0);assert.equal(w[kind].documented_zero_days,0);}
  assert.deepEqual(p,before);
  const sameDay=selected(createRangeProject(p,'2026-10-01','2026-10-01',raws),1);
  assert.equal(sameDay.fees.usd,200);assert.equal(sameDay.gas_burn_estimate.usd,20);
});

test('BNB model rejects missing matching days, pre-policy zeros, mismatches and wrong registered assumptions',()=>{
  const fee=bscResponse([['2021-11-29',100],['2021-11-30',100],['2021-12-01',100]]);
  const gas=bscResponse([['2021-11-29',0],['2021-11-30',10],['2021-12-01',11]],'model');
  const w=selected(createRangeProject(bnbFixture(),'2021-11-29','2021-12-01',{fees:fee,gas_burn_policy_estimate:gas}),3);
  assert.equal(w.fees.usd,300);assert.equal(w.gas_burn_estimate.usd,null);assert.equal(w.gas_burn_estimate.observed_usd,21);
  assert.deepEqual(w.gas_burn_estimate.missing_dates,['2021-11-29']);assert.equal(w.gas_burn_estimate.documented_zero_days,0);
  for(const changed of ['missing_fee','wrong_amount','missing_model','wrong_ratio','wrong_effective_date']) {
    const p=bnbFixture(),fees=bscResponse([['2026-09-30',100],['2026-10-01',200]]),model=bscResponse([['2026-09-30',10],['2026-10-01',20]],'model');
    if(changed==='missing_fee') fees.totalDataChart.shift();
    if(changed==='wrong_amount') model.totalDataChart[0][1]=11.01;
    if(changed==='wrong_ratio') p.data_sources[1].assumed_ratio=.2;
    if(changed==='wrong_effective_date') p.data_sources[1].effective_from='2021-11-29';
    const result=selected(createRangeProject(p,'2026-09-30','2026-10-01',{fees,gas_burn_policy_estimate:changed==='missing_model'?undefined:model}),2).gas_burn_estimate;
    assert.equal(result.usd,null,changed);assert.equal(result.complete,false,changed);
  }
});

test('BSC chain scope, UTC grid, nonnegative amounts, methodology and duplicate conflicts are checked independently',()=>{
  for(const changed of ['scope','category','methodology','utc_time','conflict','negative']) {
    const fees=bscResponse([['2026-09-30',100],['2026-10-01',200]]),gas=bscResponse([['2026-09-30',10],['2026-10-01',20]],'model');
    if(changed==='scope') fees.id='chain#ethereum';
    if(changed==='category') fees.category='DEX';
    if(changed==='methodology') fees.methodology.Fees='New scope';
    if(changed==='utc_time') fees.totalDataChart[0][0]+=3600;
    if(changed==='negative') fees.totalDataChart[0][1]=-100;
    if(changed==='conflict') fees.totalDataChart.push([second('2026-09-30'),101],[second('2026-09-30'),100]);
    const w=selected(createRangeProject(bnbFixture(),'2026-09-30','2026-10-01',{fees,gas_burn_policy_estimate:gas}),2);
    assert.equal(w.fees.usd,null,changed);assert.equal(w.gas_burn_estimate.usd,null,changed);
  }
  const zeros=selected(createRangeProject(bnbFixture(),'2026-10-01','2026-10-01',{fees:bscResponse([['2026-10-01',0]]),gas_burn_policy_estimate:bscResponse([['2026-10-01',0]],'model')}),1);
  assert.equal(zeros.fees.usd,0);assert.equal(zeros.gas_burn_estimate.usd,0);assert.equal(zeros.gas_burn_estimate.complete,true);
  const fees=bscResponse([['2026-10-01',100]]),wrongMethod=bscResponse([['2026-10-01',10]],'model');wrongMethod.methodology.Revenue='actual collected treasury profit';
  assert.equal(selected(createRangeProject(bnbFixture(),'2026-10-01','2026-10-01',{fees,gas_burn_policy_estimate:wrongMethod}),1).gas_burn_estimate.usd,null);
});
