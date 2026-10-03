import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bnbAnnualBurnStats, bnbAnnualBurnMarkup, burnStats, burnFinancialMarkup} from '../web/burns.js';
import {buildConclusion} from '../web/conclusions.js';

const hash = rank=>'0x'+rank.toString(16).padStart(64,'0');
const record = (rank,date,tokens=rank)=>({rank,date,reported_date:date,tokens,usd:tokens*20,
  status:'verified',verified:true,evidence:'successful_native_transfer_to_burn_address',
  transaction_hash:hash(rank),tx_url:'https://bscscan.com/tx/'+hash(rank),proof_source_keys:['tx-proof','block-proof']});
const fixture = () => {
  const rows=[record(1,'2024-01-01'),record(2,'2025-10-02'),record(3,'2025-10-03'),record(4,'2026-10-02')];
  return {ticker:'BNB',flow_end:'2026-10-02',market:{current_price:2,market_cap:100,fully_diluted_valuation:200,
    remaining_supply_fdv:300,original_cap_fdv:400},data_sources:[
    {source_key:'quarters',kind:'burns',role:'official_linked_indexer',retrieved_at:'2026-10-03T08:00:00Z',
      response_path:'../data/quarters.json',stored_sha256:'a'.repeat(64),url:'https://example.com/quarters'},
    {source_key:'tx-proof',kind:'burn_proof',role:'rpc_proof',url:'https://example.com/rpc'},
    {source_key:'block-proof',kind:'burn_proof',role:'rpc_proof',url:'https://example.com/rpc'}],
    burns:{cutoff_utc:'2026-10-02',quarterly_records:rows,
      quarterly_history_coverage:{reported_ranks:[1,2,3,4],missing_reported_ranks:[],earliest_reported_date:'2024-01-01',
        index_source_key:'quarters',amounts_not_combined_across_evidence_levels:true},
      official_history:{sources:rows.map(row=>({id:'official'+row.rank})),quarters:rows.map(row=>({
        rank:row.rank,announcement_date:row.date,reported_total_tokens:String(row.tokens),source_ids:['official'+row.rank],
        amount_status:'official_announcement_verified',tx_url:row.tx_url,announcement_url:'https://example.com/burn/'+row.rank}))}}};
};

test('BNB annual reference covers exactly 365 inclusive UTC days and uses current price rather than execution-day value',()=>{
  const p=fixture(), before=structuredClone(p), result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.start,'2025-10-03');assert.equal(result.end,'2026-10-02');assert.equal(result.days,365);
  assert.deepEqual(result.records.map(row=>row.rank),[3,4]);assert.equal(result.count,2);
  assert.equal(result.status,'complete');assert.equal(result.quarterlyComplete,true);
  assert.equal(result.tokens,7);assert.equal(result.annualUsd,14);assert.equal(result.historicalUsd,140);
  assert.equal(result.yieldMc,.14);assert.equal(result.yieldFdv,.07);
  assert.equal(result.multipleMc,100/14);assert.equal(result.multipleFdv,200/14);
  assert.equal(result.cashBuybackUsd,null);assert.equal(result.coverage.totalBnbBurnComplete,false);
  assert.deepEqual(p,before);
  const old=burnStats(p,'2025-10-03','2026-10-02');assert.equal(old.usd,140);assert.equal(old.complete,false);
  assert.match(old.note,/未年化/);
});

test('FDV selection is explicit and evidence URLs expose the index, transaction and original announcements',()=>{
  const p=fixture();assert.equal(bnbAnnualBurnStats(p,'2026-10-02',{fdv:500}).yieldFdv,14/500);
  assert.equal(bnbAnnualBurnStats(p,'2026-10-02',{basis:'original'}).yieldFdv,14/400);
  assert.equal(bnbAnnualBurnStats(p,'2026-10-02','remaining').yieldFdv,14/300);
  const coverage=bnbAnnualBurnStats(p,'2026-10-02').coverage;
  assert.deepEqual(coverage.sourceKeys,['quarters','tx-proof','block-proof']);
  assert.ok(coverage.sourceUrls.includes('https://example.com/quarters'));
  assert.ok(coverage.sourceUrls.includes('https://example.com/burn/3'));
  assert.ok(coverage.sourceUrls.includes('https://bscscan.com/tx/'+hash(4)));
});

test('identical transaction duplicates and different hash casing are counted once',()=>{
  const p=fixture();p.burns.quarterly_records.push({...p.burns.quarterly_records[2],transaction_hash:hash(3).toUpperCase()});
  const result=bnbAnnualBurnStats(p,'2026-10-02');assert.equal(result.status,'complete');
  assert.equal(result.count,2);assert.equal(result.tokens,7);assert.equal(result.historicalUsd,140);
});

test('forecasts and future-dated rows cannot become historical burns, even with a malformed verified flag',()=>{
  const p=fixture();p.burns.quarterly_records.push({...record(5,'2026-10-01',1000),status:'projected'});
  p.burns.quarterly_records.push(record(6,'2026-10-15',2000));
  let result=bnbAnnualBurnStats(p,'2026-10-02');assert.equal(result.status,'complete');assert.equal(result.tokens,7);
  result=bnbAnnualBurnStats(p,'2026-10-15');assert.equal(result.status,'outside_snapshot');
  assert.equal(result.tokens,null);assert.equal(result.annualUsd,null);assert.equal(result.observedTokens,4);
  assert.ok(result.records.every(row=>row.rank<5));
});

test('a live index rank clearly after the study cutoff is deferred without changing the completed annual total',()=>{
  const p=fixture();p.burns.quarterly_history_coverage.reported_ranks.push(5);
  p.burns.quarterly_records.push({...record(5,'2026-10-03',1000),status:'after_cutoff',verified:false});
  const before=structuredClone(p), result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'complete');assert.equal(result.tokens,7);assert.equal(result.count,2);
  assert.equal(result.annualUsd,14);assert.equal(result.coverage.registerMatches,true);
  assert.equal(result.coverage.indexContiguous,true);assert.deepEqual(result.coverage.deferredRanks,[5]);
  assert.deepEqual(result.coverage.unresolvedAfterCutoffRanks,[]);assert.deepEqual(result.coverage.unverifiedRanks,[]);
  assert.ok(result.records.every(row=>row.rank<5));assert.deepEqual(p,before);
});

test('an after-cutoff rank with unknown or contradictory dates remains incomplete instead of being silently deferred',()=>{
  for (const dates of [
    {date:null,reported_date:null},
    {date:'2026-10-03',reported_date:'2026-10-02'},
    {date:'2026-10-03',indexed_date:'2026-10-02',reported_date:'2026-10-03'},
    {date:'2026-10-03',reported_date:'invalid-date'},
  ]) {
    const p=fixture();p.burns.quarterly_history_coverage.reported_ranks.push(5);
    p.burns.quarterly_records.push({...record(5,'2026-10-03',1000),...dates,status:'after_cutoff',verified:false});
    const result=bnbAnnualBurnStats(p,'2026-10-02');
    assert.equal(result.status,'partial');assert.equal(result.tokens,null);assert.equal(result.observedTokens,7);
    assert.equal(result.yieldMc,null);assert.deepEqual(result.coverage.deferredRanks,[]);
    assert.deepEqual(result.coverage.unresolvedAfterCutoffRanks,[5]);assert.deepEqual(result.coverage.unverifiedRanks,[5]);
  }
});

test('every observation of a deferred rank must agree and removing it cannot hide a missing rank within the cutoff archive',()=>{
  const p=fixture();p.burns.quarterly_history_coverage.reported_ranks.push(5);
  p.burns.quarterly_records.push({...record(5,'2026-10-03',1000),status:'after_cutoff',verified:false});
  p.burns.quarterly_records.push(record(5,'2026-09-30',5));
  let result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'partial');assert.equal(result.tokens,null);assert.equal(result.observedTokens,12);
  assert.deepEqual(result.coverage.deferredRanks,[]);assert.deepEqual(result.coverage.unresolvedAfterCutoffRanks,[5]);
  const q=fixture();Object.assign(q.burns.quarterly_records[2],{date:'2026-10-03',reported_date:'2026-10-03',status:'after_cutoff',verified:false});
  result=bnbAnnualBurnStats(q,'2026-10-02');
  assert.deepEqual(result.coverage.deferredRanks,[3]);assert.equal(result.coverage.indexContiguous,false);
  assert.equal(result.status,'partial');assert.equal(result.tokens,null);
});

test('an indexed quarter never becomes independently verified and known executions remain a partial subtotal',()=>{
  const p=fixture(), row=p.burns.quarterly_records[3];Object.assign(row,{verified:false,status:'indexed_verified',
    evidence:'indexed_beacon_burn_transaction',indexed_date:row.date,indexed_tokens:row.tokens});
  const result=bnbAnnualBurnStats(p,'2026-10-02');assert.equal(result.status,'partial');assert.equal(result.complete,false);
  assert.equal(result.tokens,null);assert.equal(result.annualUsd,null);assert.equal(result.yieldMc,null);
  assert.equal(result.observedTokens,3);assert.equal(result.observedAnnualUsd,6);assert.equal(result.observedHistoricalUsd,60);
  assert.deepEqual(result.coverage.unverifiedRanks,[4]);
});

test('removing a registered record or losing archived index coverage does not prove the remaining annual total complete',()=>{
  let p=fixture();p.burns.quarterly_records.pop();let result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'partial');assert.equal(result.coverage.registerMatches,false);assert.equal(result.tokens,null);
  p=fixture();p.data_sources[0].stored_sha256=null;result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'partial');assert.equal(result.coverage.archiveKnown,false);assert.equal(result.observedTokens,7);
  p=fixture();p.burns.quarterly_history_coverage.missing_reported_ranks=[2];
  assert.equal(bnbAnnualBurnStats(p,'2026-10-02').status,'partial');
  p=fixture();p.data_sources[0].retrieved_at='2026-10-01T23:00:00Z';
  assert.equal(bnbAnnualBurnStats(p,'2026-10-02').status,'outside_snapshot');
});

test('four executions alone cannot prove completeness, and conflicting amounts retain no fabricated total',()=>{
  const p=fixture();p.burns.quarterly_history_coverage=null;
  assert.equal(bnbAnnualBurnStats(p,'2026-10-02').status,'outside_snapshot');
  const q=fixture();q.burns.quarterly_records.push({...q.burns.quarterly_records[3],tokens:999});
  const result=bnbAnnualBurnStats(q,'2026-10-02');assert.equal(result.status,'partial');assert.equal(result.tokens,null);
  assert.equal(result.observedTokens,3);assert.deepEqual(result.coverage.unverifiedRanks,[4]);
});

test('missing current price keeps native counts and execution-day value, while ratios remain unknown',()=>{
  const p=fixture();p.market.current_price=null;let result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'missing_price');assert.equal(result.tokens,7);assert.equal(result.historicalUsd,140);
  assert.equal(result.annualUsd,null);assert.equal(result.yieldMc,null);assert.equal(result.multipleMc,null);
  p.market.current_price=0;assert.equal(bnbAnnualBurnStats(p,'2026-10-02').annualUsd,null);
  p.market.current_price=2;p.market.market_cap=null;result=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(result.status,'missing_valuation');assert.equal(result.annualUsd,14);assert.equal(result.yieldMc,null);
  assert.equal(result.yieldFdv,.07);
});

test('missing historical price does not get replaced by current price in the separate historical estimate',()=>{
  const p=fixture();p.burns.quarterly_records[3].usd=null;
  const result=bnbAnnualBurnStats(p,'2026-10-02');assert.equal(result.status,'complete');
  assert.equal(result.annualUsd,14);assert.equal(result.historicalUsd,null);assert.equal(result.observedHistoricalUsd,null);
});

test('Gas models, rolling snapshots, Pioneer and asBNB APY are not added to quarterly native units',()=>{
  const p=fixture();p.burns.gas_burn_estimate_windows={365:{complete:true,usd:900000}};
  p.burns.realtime_observation={last7_days_tokens:500,cumulative_tokens:100000};
  p.burns.asbnb_yield_percent=100;p.asbnb={apy:1,income_usd:1000000};p.burns.quarterly_records[3].reported_pioneer='10000';
  const result=bnbAnnualBurnStats(p,'2026-10-02');assert.equal(result.tokens,7);assert.equal(result.annualUsd,14);
  assert.equal(result.coverage.gasBurnIncluded,false);assert.equal(result.coverage.stakingOrConversionIncomeIncluded,false);
});

test('invalid dates and a period preceding the registered archive do not create an annual estimate',()=>{
  const p=fixture();assert.throws(()=>bnbAnnualBurnStats(p,'2026-02-30'),RangeError);
  assert.throws(()=>bnbAnnualBurnStats(p,'not-a-date'),RangeError);
  const result=bnbAnnualBurnStats(p,'2024-01-01');assert.equal(result.status,'partial');
  assert.equal(result.coverage.startsWithinArchive,false);assert.equal(result.tokens,null);assert.equal(result.observedTokens,1);
});

test('the saved BNB snapshot has a verified annual quarterly register without claiming complete Gas history',()=>{
  const dashboard=JSON.parse(readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  const p=dashboard.projects.find(project=>project.ticker==='BNB');
  const result=bnbAnnualBurnStats(p,dashboard.completed_day_cutoff_utc);
  assert.equal(result.status,'complete');assert.equal(result.coverage.totalBnbBurnComplete,false);
  assert.equal(result.count,4);assert.ok(result.tokens>0);assert.ok(result.yieldMc>0);
  assert.equal(result.annualUsd,result.tokens*p.market.current_price);
  assert.ok(result.records.every(row=>row.verified && row.evidence==='successful_native_transfer_to_burn_address'));
});

test('an independently complete annual register with no executions has zero yield and no finite multiple',()=>{
  const p=fixture();
  p.flow={mode:'reserve_and_gas_burn'};
  p.burns.quarterly_records.forEach(row=>{if(row.rank>=3) row.date='2025-10-02';});
  p.windows={'30':{fees:{start:'2026-09-03',end:'2026-10-02',complete:true,usd:0}}};
  const annual=bnbAnnualBurnStats(p,'2026-10-02');
  assert.equal(annual.complete,true);assert.equal(annual.tokens,0);assert.equal(annual.yieldMc,0);
  assert.equal(annual.multipleMc,null);assert.equal(annual.multipleFdv,null);
  const conclusion=buildConclusion(p,30,'2026-10-03');
  assert.match(conclusion.text,/流通市值0\.00%/);
  assert.match(conclusion.text,/销毁估值倍数不适用／不适用/);
});

test('the BNB popup puts annual native burn valuation first, retains selected-period history and labels both denominators',()=>{
  const p=fixture(), annual=bnbAnnualBurnMarkup(p,'2026-10-02',{fdv:500});
  assert.match(annual,/近365天季度销毁 · 历史年化/);assert.match(annual,/2025-10-03 → 2026-10-02/);
  assert.match(annual,/14\.00%/);assert.match(annual,/2\.80%/);
  assert.match(annual,/流通市值口径/);assert.match(annual,/FDV口径/);
  assert.match(annual,/展开算式与证据/);assert.match(annual,/执行日历史价格估值合计\$140/);
  assert.match(annual,/不是现金回购支出/);assert.match(annual,/https:\/\/example.com\/quarters/);
  const html=burnFinancialMarkup(p,{start:'2026-09-03',end:'2026-10-02'},undefined,{fdv:500});
  assert.ok(html.indexOf('近365天季度销毁')<html.indexOf('全部季度销毁历史'));
  assert.match(html,/2026-09-03 → 2026-10-02/);assert.match(html,/收入 P\/S、经营净利润 P\/E 不适用/);
  assert.doesNotMatch(html,/持币者回报倍数和年化回购收益率均不适用/);
  assert.match(html,/2\.80%/);
});
