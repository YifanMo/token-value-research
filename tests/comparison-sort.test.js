import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate, calculateReferenceMultiples} from '../web/core.js';
import {isReserveBurn} from '../web/models.js';
import {bnbAnnualBurnStats} from '../web/burns.js';
import {COMPARISON_SORT_KEYS, comparisonSortValue, sortProjects} from '../web/comparison-sort.js';

const fixture=(ticker, {marketCap=1000, fdv=2000, revenue=100, holders=20, fees=200, ...extra}={})=>({
  ticker, name:ticker,
  market:{market_cap:marketCap, fully_diluted_valuation:fdv, remaining_supply_fdv:fdv*2, original_cap_fdv:fdv*3},
  windows:{'30':{
    revenue:{usd:revenue, start:'2026-09-03', end:'2026-10-02', complete:true},
    holders:{usd:holders, start:'2026-09-03', end:'2026-10-02', complete:true},
    fees:{usd:fees, start:'2026-09-03', end:'2026-10-02', complete:true},
  }},
  ...extra,
});
const tickers=projects=>projects.map(project=>project.ticker);
const context={days:30, valuationBasis:'reported', asOf:'2026-10-03'};

test('zero participates in sorting, invalid numbers stay last in both directions, and ties remain stable',()=>{
  const projects=[fixture('FIRST',{marketCap:50}),fixture('NULL',{marketCap:null}),fixture('ZERO',{marketCap:0}),
    fixture('TIE',{marketCap:50}),fixture('NAN',{marketCap:NaN}),fixture('INF',{marketCap:Infinity}),
    fixture('UNDEFINED',{marketCap:undefined}),fixture('STRING',{marketCap:'99'}),fixture('LARGEST',{marketCap:100})];
  // The helper fixture's default value is convenient elsewhere; remove this
  // field explicitly here to test an actually absent market capitalization.
  delete projects[6].market.market_cap;
  const original=[...projects];
  Object.freeze(projects);
  assert.deepEqual(tickers(sortProjects(projects,{key:'marketCap',direction:'asc'},context)),
    ['ZERO','FIRST','TIE','LARGEST','NULL','NAN','INF','UNDEFINED','STRING']);
  assert.deepEqual(tickers(sortProjects(projects,{key:'marketCap',direction:'desc'},context)),
    ['LARGEST','FIRST','TIE','ZERO','NULL','NAN','INF','UNDEFINED','STRING']);
  assert.deepEqual(projects,original);
  assert.notEqual(sortProjects(projects,{key:'marketCap'},context),projects);
});

test('name and ticker support alphabetic ordering without moving equal labels or missing names to the front',()=>{
  const projects=[fixture('z'),fixture('AAA'),fixture('aaa'),fixture('B'),fixture('EMPTY',{name:''})];
  assert.deepEqual(tickers(sortProjects(projects,{key:'ticker',direction:'asc'},context)),['AAA','aaa','B','EMPTY','z']);
  assert.deepEqual(tickers(sortProjects(projects,{key:'name',direction:'desc'},context)),['z','B','AAA','aaa','EMPTY']);
});

test('unknown or cleared sort keys return an unchanged copy and future token quantities are not sortable',()=>{
  const projects=[fixture('A'),fixture('B')];
  for (const sort of [undefined,null,{}, {key:'future365'}, {key:'missing'}]) {
    const result=sortProjects(projects,sort,context);
    assert.deepEqual(result,projects);
    assert.notEqual(result,projects);
  }
  assert.equal(COMPARISON_SORT_KEYS.includes('future365'),false);
});

test('sort calculations honor the active window and FDV basis',()=>{
  const a=fixture('A',{fdv:1000,revenue:10}), b=fixture('B',{fdv:2000,revenue:20});
  a.market.remaining_supply_fdv=4000;
  b.market.remaining_supply_fdv=3000;
  a.windows['90']={...a.windows['30'],revenue:{usd:40}};
  b.windows['90']={...b.windows['30'],revenue:{usd:30}};
  assert.deepEqual(tickers(sortProjects([a,b],{key:'fdv',direction:'desc'},context)),['B','A']);
  assert.deepEqual(tickers(sortProjects([a,b],{key:'fdv',direction:'desc'},{...context,valuationBasis:'remaining'})),['A','B']);
  assert.deepEqual(tickers(sortProjects([a,b],{key:'revenue',direction:'desc'},context)),['B','A']);
  assert.deepEqual(tickers(sortProjects([a,b],{key:'revenue',direction:'desc'},{...context,days:90})),['A','B']);
});

test('reserve burns without verified annual history stay unknown, and redemption valuations are not revenue',()=>{
  const reserve=fixture('BNB',{revenue:1e9,holders:1e9,flow:{mode:'reserve_and_gas_burn'}});
  const redemption=fixture('REDEMPTION',{revenue:1e9,flow:{revenue_is_income:false}});
  const ordinary=fixture('ORDINARY',{revenue:0,holders:0});
  for (const key of COMPARISON_SORT_KEYS.filter(key=>!['name','ticker','marketCap','fdv'].includes(key))) {
    assert.equal(comparisonSortValue(reserve,key,context),null,key);
  }
  assert.equal(comparisonSortValue(redemption,'revenue',context),null);
  for (const direction of ['asc','desc']) {
    assert.deepEqual(tickers(sortProjects([reserve,redemption,ordinary],{key:'revenue',direction},context)),
      ['ORDINARY','BNB','REDEMPTION']);
    assert.deepEqual(tickers(sortProjects([reserve,ordinary],{key:'yieldMc',direction},context)),['ORDINARY','BNB']);
  }
  // The current P/S cell explicitly labels a redemption-value denominator.
  // Preserve that displayed value when sorting this separate, labeled column.
  assert.equal(comparisonSortValue(redemption,'psMc',context),calculateReferenceMultiples(redemption,30,'reported').psMc);
});

test('holder multiples use the displayed historical statistic while yield uses recurring buybacks',()=>{
  const event=fixture('EVENT',{holders:500});
  event.windows['30'].holders.recurring_usd=5;
  event.windows['30'].holders.oneoff_dates=['2026-09-05'];
  const regular=fixture('REGULAR',{holders:20});
  assert.deepEqual(tickers(sortProjects([event,regular],{key:'yieldMc',direction:'desc'},context)),['REGULAR','EVENT']);
  assert.deepEqual(tickers(sortProjects([regular,event],{key:'holderPeMc',direction:'asc'},context)),['EVENT','REGULAR']);
  assert.equal(comparisonSortValue(event,'holderPeMc',context),calculateReferenceMultiples(event,30,'reported').peMc);
});

test('project P/E requires verified positive net income; losses, zero and incomplete costs remain last',()=>{
  const earnings=usd=>({usd,start:'2026-09-03',end:'2026-10-02',currency:'USD',same_protocol_scope:true,
    costs_complete:true,recurring_only:true,source_url:'https://example.com/profit'});
  const profitable=fixture('PROFIT',{financials:{net_income_windows:{'30':earnings(10)}}});
  const largerProfit=fixture('LARGER',{financials:{net_income_windows:{'30':earnings(20)}}});
  const loss=fixture('LOSS',{financials:{net_income_windows:{'30':earnings(-10)}}});
  const zero=fixture('ZERO',{financials:{net_income_windows:{'30':earnings(0)}}});
  const incomplete=fixture('INCOMPLETE',{financials:{net_income_windows:{'30':{...earnings(100),costs_complete:false}}}});
  const projects=[loss,profitable,zero,largerProfit,incomplete];
  for (const key of ['projectPeMc','projectPeFdv']) {
    assert.deepEqual(tickers(sortProjects(projects,{key,direction:'asc'},context)),['LARGER','PROFIT','LOSS','ZERO','INCOMPLETE']);
    assert.deepEqual(tickers(sortProjects(projects,{key,direction:'desc'},context)),['PROFIT','LARGER','LOSS','ZERO','INCOMPLETE']);
  }
});

test('real dashboard sort values match the comparison table for every numeric column and observation window',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  for (const days of [30,365]) for (const project of data.projects) {
    const ctx={days,end:data.completed_day_cutoff_utc,valuationBasis:'reported',asOf:data.as_of};
    const m=calculate(project,days,'reported'), ref=calculateReferenceMultiples(project,days,'reported');
    const financial=isReserveBurn(project)?null:true;
    const annual=isReserveBurn(project)?bnbAnnualBurnStats(project,ctx.end,{fdv:m.fdv}):null;
    const expected={marketCap:project.market.market_cap,fdv:m.fdv,
      revenue:financial&&m.revenue, yieldMc:annual?annual.yieldMc:financial&&m.grossYieldMc, yieldFdv:annual?annual.yieldFdv:financial&&m.grossYieldFdv,
      psMc:financial&&ref.psMc, psFdv:financial&&ref.psFdv,
      holderPeMc:annual?annual.multipleMc:financial&&ref.peMc, holderPeFdv:annual?annual.multipleFdv:financial&&ref.peFdv,
      projectPeMc:financial&&m.netIncomeStatus==='positive'?m.peMc:null,
      projectPeFdv:financial&&m.netIncomeStatus==='positive'?m.peFdv:null,
      revenueShare:financial&&m.revenueShare, holderCapture:financial&&m.holderCapture};
    for (const [key,value] of Object.entries(expected)) {
      assert.equal(comparisonSortValue(project,key,ctx),typeof value==='number'&&Number.isFinite(value)?value:null,
        `${project.ticker} ${days} ${key}`);
    }
  }
  for (const key of COMPARISON_SORT_KEYS.filter(key=>!['name','ticker'].includes(key))) {
    for (const direction of ['asc','desc']) {
      const sorted=sortProjects(data.projects,{key,direction},context);
      assert.equal(new Set(sorted).size,data.projects.length);
      const values=sorted.map(project=>comparisonSortValue(project,key,context));
      const firstMissing=values.indexOf(null);
      if (firstMissing>=0) assert.ok(values.slice(firstMissing).every(value=>value===null),`${key} ${direction} missing tail`);
      const finite=values.filter(value=>value!==null);
      assert.ok(finite.every((value,index)=>!index || (direction==='asc'?value>=finite[index-1]:value<=finite[index-1])),
        `${key} ${direction} monotonic`);
    }
  }
});

test('BNB sorting follows the selected trailing-year end, independent of short window, and never fills income',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  const p=data.projects.find(project=>project.ticker==='BNB');
  const end=data.completed_day_cutoff_utc;
  const annual=bnbAnnualBurnStats(p,end);
  assert.equal(annual.complete,true);
  for(const days of [7,30,90,365]) {
    assert.equal(comparisonSortValue(p,'yieldMc',{...context,days,end}),annual.yieldMc);
    assert.equal(comparisonSortValue(p,'holderPeFdv',{...context,days,end}),annual.multipleFdv);
  }
  assert.equal(comparisonSortValue(p,'revenue',{...context,end}),null);
  assert.equal(comparisonSortValue(p,'psMc',{...context,end}),null);
  assert.equal(comparisonSortValue(p,'projectPeMc',{...context,end}),null);
  const historical=bnbAnnualBurnStats(p,'2026-07-14');
  assert.notEqual(historical.yieldMc,annual.yieldMc);
  assert.equal(comparisonSortValue(p,'yieldMc',{...context,end:'2026-07-14'}),historical.yieldMc);
  assert.equal(comparisonSortValue(p,'yieldMc',{...context,end:'2026-10-04'}),null);
});
