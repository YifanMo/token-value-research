import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate, calculateReferenceMultiples, ledger} from '../web/core.js';
import {buildFlow} from '../web/flows.js';
import {HOLDER_RETURN_RULE, passiveHolderScope} from '../web/models.js';

const fixture = (start = '2026-09-03') => {
  const series = usd => ({usd, complete:true, start, end:'2026-10-02'});
  return {
    ticker:'TEST',
    market:{market_cap:10000, fully_diluted_valuation:20000, remaining_supply_fdv:20000,
      circulating_supply:1000, total_supply:2000},
    capture:{kind:'burn', permanent_burn_proxy:true},
    flow:{mode:'allocation', revenue_is_income:true},
    windows:{'30':{fees:series(200), revenue:series(100), holders:{...series(40),
      composition:{products:{A:40}, complete:true}}}},
    financials:{net_income_windows:{'30':{usd:25,start,end:'2026-10-02',currency:'USD',
      same_protocol_scope:true,costs_complete:true,recurring_only:true,source_url:'https://example.com/profit'}}},
    supply_ledger:{circulating:1000,total:2000,burnTokens:10,burnFromFloatTokens:10,
      buybackToLockTokens:0,unlockTokens:20,reserveRewardsTokens:0,newEconomicSupplyTokens:0,
      newEconomicTokensToFloat:0,treasuryReleaseTokens:0,relockTokens:0,knownComplete:true},
  };
};

test('plain native-token buybacks remain eligible without extra scope metadata', () => {
  const p=fixture();
  const scope=passiveHolderScope(p,p.windows['30']);
  assert.deepEqual(scope,{eligible:true,status:'eligible',note:HOLDER_RETURN_RULE});
  assert.equal(calculate(p,30,'reported').holder,40);
  assert.ok(calculate(p,30,'reported').grossYieldMc>0);
  assert.ok(calculateReferenceMultiples(p,30).peMc>0);
  assert.equal(buildFlow(p,30).holderUsd,40);
  assert.match(HOLDER_RETURN_RULE,/不计转换、包装、质押、锁仓参与或提供流动性/);
});

test('action-dependent yield is excluded without changing revenue, profit, supply or original evidence', () => {
  const original=fixture();
  const p=structuredClone(original);
  p.capture.holder_requires_action=true;
  p.capture.passive_scope_note='示例收益需要包装并质押。';
  const saved=structuredClone(p);
  const baseline=calculate(original,30,'reported');
  const result=calculate(p,30,'reported');
  assert.equal(result.holderScope.status,'requires_action');
  for(const field of ['holder','holderAnnual','grossYieldMc','grossYieldFdv','burnProxyAnnual',
    'permanentProxyYieldMc','permanentProxyYieldFdv','holderCapture','feeCapture']) assert.equal(result[field],null,field);
  assert.equal(result.rawHolder,40);
  for(const field of ['revenue','reportedRevenue','fees','psRevenueMc','psRevenueFdv','netIncome','peMc','floatRatio'])
    assert.equal(result[field],baseline[field],field);
  const multiples=calculateReferenceMultiples(p,30);
  const baseMultiples=calculateReferenceMultiples(original,30);
  for(const field of ['holderUsd','holderAnnual','peMc','peFdv']) assert.equal(multiples[field],null,field);
  assert.equal(multiples.rawHolderUsd,40);
  assert.equal(multiples.psMc,baseMultiples.psMc);
  assert.equal(multiples.psFdv,baseMultiples.psFdv);
  assert.ok(multiples.notes.some(note=>note.includes('示例收益需要包装并质押')));
  assert.ok(!multiples.notes.some(note=>note.includes('缺少有效的持有人统计')));
  assert.deepEqual(ledger(p.supply_ledger),ledger(original.supply_ledger));
  const flow=buildFlow(p,30);
  assert.equal(flow.holderUsd,null);
  assert.equal(flow.nodes.find(node=>node.id==='funding').usd,null);
  assert.equal(flow.nodes.find(node=>node.id==='outcome').usd,null);
  assert.ok(!('composition' in flow.nodes.find(node=>node.id==='funding')));
  assert.equal(flow.nodes.find(node=>node.id==='revenue').usd,100);
  assert.equal(flow.nodes.find(node=>node.id==='other').usd,100);
  assert.ok(flow.warnings.some(note=>note.includes('需额外操作')));
  assert.deepEqual(p,saved);
});

test('the passive-scope cutoff is inclusive and historical mixed returns stay unknown instead of zero', () => {
  const p=fixture('2025-05-07');
  p.capture.passive_scope_from='2025-05-07';
  p.capture.passive_scope_note='旧 veCAKE 分享尚未从历史来源拆分。';
  assert.equal(passiveHolderScope(p,p.windows['30']).status,'eligible');
  assert.equal(calculate(p,30).holder,40);
  assert.ok(calculateReferenceMultiples(p,30).peMc>0);
  p.windows['30'].holders.start='2025-05-06';
  assert.equal(passiveHolderScope(p,p.windows['30']).status,'historical_unseparated');
  assert.equal(calculate(p,30).holder,null);
  const multiples=calculateReferenceMultiples(p,30);
  assert.equal(multiples.rawHolderUsd,40);
  assert.equal(multiples.holderUsd,null);
  assert.equal(multiples.peMc,null);
  assert.ok(multiples.psMc>0);
  const flow=buildFlow(p,30);
  assert.equal(flow.holderUsd,null);
  assert.ok(flow.warnings.some(note=>note.includes('历史统计尚未拆分')));
  assert.ok(flow.warnings.some(note=>note.includes('旧 veCAKE')));
});

test('a cutoff without a holder-window start cannot establish historical eligibility', () => {
  const p=fixture();
  p.capture.passive_scope_from='2025-05-07';
  delete p.windows['30'].holders.start;
  assert.equal(passiveHolderScope(p,p.windows['30']).status,'historical_unseparated');
  assert.equal(calculate(p,30).holder,null);
  assert.equal(calculateReferenceMultiples(p,30).peMc,null);
  delete p.capture.passive_scope_from;
  assert.equal(passiveHolderScope(p,p.windows['30']).status,'eligible');
});

test('valuation-mode diagrams cannot expose excluded holder totals or composition as passive returns', () => {
  const p=fixture();
  p.capture.holder_requires_action=true;
  p.flow.mode='burn_valuation';
  const flow=buildFlow(p,30);
  const outcome=flow.nodes.find(node=>node.id==='outcome');
  assert.equal(outcome.usd,null);
  assert.ok(!('composition' in outcome));
  assert.match(outcome.note,/不计入原币持有收益/);
});
