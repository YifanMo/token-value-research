import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate} from '../web/core.js';
import {auditResponse} from '../web/sources.js';

const project={
  market:{market_cap:36500,fully_diluted_valuation:73000,remaining_supply_fdv:109500,original_cap_fdv:146000},
  capture:{permanent_burn_proxy:false},
  windows:{'7':{revenue:{usd:70,start:'2026-09-25',end:'2026-10-01'},fees:{usd:140},holders:{usd:35}}},
};
const record={usd:35,start:'2026-09-25',end:'2026-10-01',currency:'USD',same_protocol_scope:true,costs_complete:true,recurring_only:true,source_url:'https://example.com/financial-statement'};
const withEarnings=changes=>({...project,financials:{net_income_windows:{'7':{...record,...changes}}}});

test('P/S divides valuation by annual protocol revenue and ratios are not annualized',()=>{
  const m=calculate(project,7,'reported');
  assert.equal(m.revenueAnnual,3650);
  assert.equal(m.psRevenueMc,10);
  assert.equal(m.psRevenueFdv,20);
  assert.equal(calculate(project,7,'remaining').psRevenueFdv,30);
  assert.equal(m.revenueShare,.5);
  assert.equal(m.holderCapture,.5);
  assert.equal(m.peMc,null);
  assert.equal(m.netIncomeStatus,'missing');
});
test('positive P/E requires matched, sourced, recurring profit with complete costs',()=>{
  const m=calculate(withEarnings({}),7,'reported');
  assert.equal(m.netIncomeAnnual,1825);
  assert.equal(m.peMc,20);
  assert.equal(m.peFdv,40);
  for(const change of [{start:'2026-09-24'},{currency:'SOL'},{same_protocol_scope:false},
    {costs_complete:false},{recurring_only:false},{source_url:null},{usd:null}]) {
    assert.equal(calculate(withEarnings(change),7,'reported').peMc,null,JSON.stringify(change));
  }
});
test('zero and losses remain distinct from unknown; no negative or infinite P/E',()=>{
  const loss=calculate(withEarnings({usd:-35}),7,'reported');
  assert.equal(loss.netIncomeStatus,'loss');
  assert.equal(loss.netIncomeAnnual,-1825);
  assert.equal(loss.peMc,null);
  const zero=calculate(withEarnings({usd:0}),7,'reported');
  assert.equal(zero.netIncomeStatus,'zero');
  assert.equal(zero.netIncomeAnnual,0);
  assert.equal(zero.peMc,null);
});
test('full-year P/E can use complete reported net income without short-window annualization',()=>{
  const p={...project,windows:{'365':{revenue:{usd:3650,start:'2025-10-02',end:'2026-10-01'}}},
    financials:{net_income_windows:{'365':{...record,usd:1825,start:'2025-10-02',recurring_only:false}}}};
  const m=calculate(p,365,'reported');
  assert.equal(m.netIncomeAnnual,1825);
  assert.equal(m.peMc,20);
});
test('missing or nonpositive revenue cannot generate a sales multiple',()=>{
  for(const usd of [null,0,-10]) {
    const p={...project,windows:{'7':{...project.windows['7'],revenue:{...project.windows['7'].revenue,usd}}}};
    assert.equal(calculate(p,7,'reported').psRevenueMc,null);
  }
});
test('UNI redemption valuation is preserved without becoming income or blocking independent sourced profit',()=>{
  const p={...project,flow:{mode:'token_redemption_valuation',revenue_is_income:false},
    capture:{permanent_burn_proxy:true},windows:{'30':{
      revenue:{usd:15e6,start:'2026-09-02',end:'2026-10-01'},
      fees:{usd:197e6},holders:{usd:15e6},
    }}};
  const m=calculate(p,30,'reported');
  assert.equal(m.reportedRevenue,15e6);
  assert.equal(m.revenueStatus,'valuation_only');
  assert.equal(m.revenue,null);
  assert.equal(m.revenueAnnual,null);
  assert.equal(m.psRevenueMc,null);
  assert.equal(m.psRevenueFdv,null);
  assert.equal(m.revenueShare,null);
  assert.equal(m.holderCapture,null);
  assert.equal(m.netIncomeStatus,'missing');
  assert.equal(m.holder,15e6);
  assert.equal(m.holderAnnual,182.5e6);
  assert.ok(m.grossYieldMc>0);
  assert.ok(m.permanentProxyYieldMc>0);
  const sourced={...p,financials:{net_income_windows:{'30':{
    ...record,usd:30,start:'2026-09-02',end:'2026-10-01',
  }}}};
  const profit=calculate(sourced,30,'reported');
  assert.equal(profit.netIncomeStatus,'positive');
  assert.equal(profit.netIncomeAnnual,365);
  assert.equal(profit.peMc,100);
  assert.equal(profit.peFdv,200);
  assert.equal(profit.netMargin,null);
});
test('the current snapshot has no substituted profits; PUMP missing duplicate data and stock event block annual ratios',()=>{
  const snapshot=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  for(const p of snapshot.projects) {
    assert.equal(calculate(p,30,'reported').netIncomeStatus,p.flow?.mode==='reserve_and_gas_burn'?'not_applicable':'missing');
    assert.equal(calculate(p,30,'reported').peMc,null);
    if(p.flow?.mode==='reserve_and_gas_burn') continue;
    for(const kind of ['fees','revenue']) {
      const source=p.data_sources.find(s=>s.kind===kind);
      const raw=JSON.parse(fs.readFileSync(new URL(source.response_path,new URL('../web/',import.meta.url))));
      assert.equal(auditResponse(raw,p,30,kind).matches,true,`${p.ticker} ${kind}`);
    }
  }
  const pump=snapshot.projects.find(p=>p.ticker==='PUMP');
  assert.equal(calculate(pump,365,'reported').psRevenueMc,null);
  assert.equal(pump.windows['365'].revenue.coverage_days,364);
  assert.ok(pump.windows['365'].revenue.normalization_issues.some(x=>x.date==='2026-05-21'));
  assert.equal(calculate(pump,365,'reported').holderCapture,null);
});
