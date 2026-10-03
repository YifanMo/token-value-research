import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate, calculateReferenceMultiples} from '../web/core.js';

const series = usd => ({usd, complete:true, start:'2026-09-25', end:'2026-10-01'});
const fixture = () => ({
  ticker:'JUP',flow:{revenue_is_income:true},capture:{permanent_burn_proxy:false},
  market:{market_cap:36500,fully_diluted_valuation:73000,remaining_supply_fdv:109500,original_cap_fdv:146000},
  windows:{'7':{holders:series(35),revenue:series(70)}},
});
const close = (actual, expected, label='') => assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*1e-12+1e-12,`${label}: ${actual} != ${expected}`);

test('reference PE uses holder statistics independently of missing audited profit', () => {
  const p=fixture();
  const strict=calculate(p,7,'reported');
  const reference=calculateReferenceMultiples(p,7);
  assert.equal(strict.peMc,null);
  assert.equal(strict.netIncomeStatus,'missing');
  assert.equal(reference.holderUsd,35);
  assert.equal(reference.holderAnnual,1825);
  assert.equal(reference.peMc,20);
  assert.equal(reference.peFdv,40);
  assert.equal(reference.revenueAnnual,3650);
  assert.equal(reference.psMc,10);
  assert.equal(reference.psFdv,20);
  assert.equal(reference.revenueStatus,'income');
  assert.ok(reference.notes.some(n=>n.includes('不是已扣除全部成本的净利润')));
  assert.deepEqual(calculate(p,7,'reported'),strict);
});

test('reference and strict PE use different denominators even with a qualified profit record', () => {
  const p=fixture();
  p.financials={net_income_windows:{'7':{usd:7,start:'2026-09-25',end:'2026-10-01',
    currency:'USD',same_protocol_scope:true,costs_complete:true,recurring_only:true,source_url:'https://example.com/report'}}};
  assert.equal(calculate(p,7,'reported').peMc,100);
  assert.equal(calculateReferenceMultiples(p,7).peMc,20);
});

test('UNI reference PS can display redemption valuation without changing strict income semantics', () => {
  const p=fixture();p.ticker='UNI';p.flow={revenue_is_income:false};
  const before=calculate(p,7,'reported');
  const reference=calculateReferenceMultiples(p,7);
  assert.equal(reference.psMc,10);
  assert.equal(reference.psFdv,20);
  assert.equal(reference.revenueStatus,'valuation_only');
  assert.equal(before.revenue,null);
  assert.equal(before.revenueAnnual,null);
  assert.equal(before.psRevenueMc,null);
  assert.equal(before.psRevenueFdv,null);
  assert.equal(before.revenueStatus,'valuation_only');
  assert.ok(reference.notes.some(n=>n.includes('代币兑换估值')));
  assert.deepEqual(calculate(p,7,'reported'),before);
});

test('reference PS uses normalized income and never fills missing days from raw or observed values', () => {
  const p=fixture();
  p.windows['7'].revenue={...series(70),raw_usd:700,observed_usd:90};
  assert.equal(calculateReferenceMultiples(p,7).revenueUsd,70);
  assert.equal(calculateReferenceMultiples(p,7).psMc,10);
  for(const revenue of [
    {...series(null),raw_usd:700,observed_usd:90},
    {...series(70),complete:false,raw_usd:700,observed_usd:90},
  ]) {
    p.windows['7'].revenue=revenue;
    const m=calculateReferenceMultiples(p,7);
    assert.equal(m.revenueUsd,null);
    assert.equal(m.revenueAnnual,null);
    assert.equal(m.psMc,null);
    assert.equal(m.psFdv,null);
    assert.equal(m.peMc,20); // Independent holder coverage remains usable.
  }
  assert.equal(calculateReferenceMultiples(p,7).revenueStatus,'incomplete');
  p.windows['7'].holders={...series(35),complete:false,observed_usd:35};
  assert.equal(calculateReferenceMultiples(p,7).peMc,null);
});

test('stock-event history uses raw holders while warning against recurring-profit interpretation', () => {
  const p=fixture();p.ticker='PUMP';
  p.capture={permanent_burn_proxy:true,pre_burn_kind:'retained',permanent_from:'2026-09-28'};
  p.windows['7'].holders={...series(35),recurring_usd:null,oneoff_dates:['2026-09-27']};
  const m=calculateReferenceMultiples(p,7);
  assert.equal(m.holderUsd,35);
  assert.equal(m.peMc,20);
  assert.equal(m.containsOneoff,true);
  assert.equal(m.crossesBurnPolicy,true);
  assert.ok(m.notes.some(n=>n.includes('存量或一次性')));
  assert.ok(m.notes.some(n=>n.includes('永久销毁政策生效日')));
  assert.equal(calculate(p,7,'reported').holderAnnual,null);
  p.windows['7'].holders.recurring_usd=7;
  assert.equal(calculate(p,7,'reported').holder,7);
  assert.equal(calculateReferenceMultiples(p,7).holderUsd,35);
  p.windows['7'].holders.oneoff_dates=[];
  p.holder_oneoff_dates=['2026-09-27','2026-11-01'];
  assert.equal(calculateReferenceMultiples(p,7).containsOneoff,true);
});

test('zero, negative, missing and nonfinite denominators never produce infinite or negative multiples', () => {
  for(const usd of [0,-35,null,NaN,Infinity,-Infinity]) {
    const p=fixture();
    p.windows['7'].holders=series(usd);p.windows['7'].revenue=series(usd);
    const m=calculateReferenceMultiples(p,7);
    for(const key of ['peMc','peFdv','psMc','psFdv'])assert.equal(m[key],null,`${key} ${usd}`);
    if(usd===0)assert.equal(m.holderAnnual,0);
    if(usd===-35)assert.equal(m.holderAnnual,-1825);
  }
  const missing=calculateReferenceMultiples({market:{market_cap:100}},30);
  assert.equal(missing.peMc,null);assert.equal(missing.psMc,null);
  assert.equal(missing.revenueStatus,'missing');
  assert.equal(missing.containsOneoff,false);assert.equal(missing.crossesBurnPolicy,false);
  const overflow=fixture();overflow.windows['7'].holders=series(Number.MIN_VALUE);
  assert.equal(calculateReferenceMultiples(overflow,7).peMc,null);
});

test('reference FDV matches all calculate bases; full-year data is not multiplied again', () => {
  const p=fixture();
  for(const [basis,peFdv,psFdv] of [['reported',40,20],['remaining',60,30],['original',80,40]]) {
    const m=calculateReferenceMultiples(p,7,basis);
    assert.equal(m.peFdv,peFdv);assert.equal(m.psFdv,psFdv);
    assert.equal(m.peFdv,calculate(p,7,basis).fdv/m.holderAnnual);
  }
  p.windows['365']={holders:{...series(1825),start:'2025-10-02'},revenue:{...series(3650),start:'2025-10-02'}};
  const annual=calculateReferenceMultiples(p,365);
  assert.equal(annual.holderAnnual,1825);assert.equal(annual.revenueAnnual,3650);
  assert.equal(annual.peMc,20);assert.equal(annual.psMc,10);
  p.windows['0']={holders:series(35),revenue:series(70)};
  assert.equal(calculateReferenceMultiples(p,0).peMc,null);
  assert.equal(calculateReferenceMultiples(p,0).psMc,null);
});

test('reference compatibility permits absent complete flag but never an explicitly incomplete window', () => {
  const p=fixture();delete p.windows['7'].holders.complete;delete p.windows['7'].revenue.complete;
  assert.equal(calculateReferenceMultiples(p,7).peMc,20);
  assert.equal(calculateReferenceMultiples(p,7).psMc,10);
  p.windows['7'].holders.complete=false;p.windows['7'].revenue.complete=false;
  assert.equal(calculateReferenceMultiples(p,7).peMc,null);
  assert.equal(calculateReferenceMultiples(p,7).psMc,null);
});

test('all five saved 30-day projects produce reproducible reference multiples without invented profits', () => {
  const snapshot=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  assert.equal(snapshot.projects.length,5);
  for(const p of snapshot.projects) {
    const before=structuredClone(p);
    const w=p.windows['30'];
    const m=calculateReferenceMultiples(p,30,'reported');
    close(m.peMc,p.market.market_cap/(w.holders.usd*365/30),`${p.ticker} reference PE mc`);
    close(m.peFdv,p.market.fully_diluted_valuation/(w.holders.usd*365/30),`${p.ticker} reference PE fdv`);
    close(m.psMc,p.market.market_cap/(w.revenue.usd*365/30),`${p.ticker} reference PS mc`);
    close(m.psFdv,p.market.fully_diluted_valuation/(w.revenue.usd*365/30),`${p.ticker} reference PS fdv`);
    assert.equal(calculate(p,30,'reported').peMc,null);
    assert.equal(m.revenueStatus,p.ticker==='UNI'?'valuation_only':'income');
    assert.deepEqual(p,before);
  }
  const pump=snapshot.projects.find(p=>p.ticker==='PUMP');
  const year=calculateReferenceMultiples(pump,365,'reported');
  assert.ok(year.peMc>0);
  assert.equal(year.containsOneoff,true);
  assert.equal(year.psMc,null);
  assert.equal(year.revenueStatus,'incomplete');
});
