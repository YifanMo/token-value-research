import test from 'node:test';
import assert from 'node:assert/strict';
import {bnbChainWindow, bnbChainMarkup, burnStats, burnFinancialMarkup, burnObservationsMarkup, latestQuarterBurn, quarterlyPlanMarkup, quarterComparisonMarkup, historicalLedger, quarterHistoryMarkup} from '../web/burns.js';

const fixture = () => ({ticker:'BNB',market:{market_cap:10000,fully_diluted_valuation:20000},
  history:[
    {date:'2026-09-29',fees:100,gas_burn_estimate_usd:10},
    {date:'2026-09-30',fees:200,gas_burn_estimate_usd:20},
    {date:'2026-10-01',fees:300,gas_burn_estimate_usd:30},
    {date:'2026-10-02',fees:999,gas_burn_estimate_usd:999}],
  burns:{quarterly_records:[{date:'2026-09-30',tokens:1000,usd:50000,transaction_hash:'quarterly',verified:true}],
    realtime_observation:{last7_days_tokens:700,cumulative_tokens:70000,retrieved_at:'2026-10-03T10:00:00Z',latest_block_at:'2026-10-03T09:59:59Z'},
    gas_burn_policy_observation:{ratio:.1,burn_ratio:1000,ratio_scale:10000,evidence:'pinned_block_eth_call',
      block_number:123,observed_at:'2026-10-03T10:00:00Z',url:'https://example.com/rpc',response_path:'../data/responses/parameter.json',
      contract_source_url:'https://example.com/contract'}}});
const cached = (usd,patch={}) => ({start:'2026-09-29',end:'2026-10-01',days:3,expected_days:3,covered_days:3,
  missing_dates:[],complete:true,usd,observed_usd:usd,...patch});

test('inclusive UTC daily sums separate actual chain fees, gas policy estimates and quarterly records',()=>{
  const p=fixture(), before=structuredClone(p), result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.days,3);assert.equal(result.fees.usd,600);assert.equal(result.gasEstimate.usd,60);
  assert.equal(result.fees.coverage_days,3);assert.equal(result.gasShareOfFees,.1);
  assert.equal(result.actualDailyBurnVerified,false);assert.equal(result.cashBuybackUsd,null);
  assert.equal(burnStats(p,'2026-09-29','2026-10-01').tokens,1000);
  assert.equal(burnStats(p,'2026-09-29','2026-10-01').usd,50000);
  assert.deepEqual(p,before);
});

test('fee and gas gaps are independent and neither quarterly nor rolling data fills them',()=>{
  const p=fixture();p.history[1].gas_burn_estimate_usd=null;
  let result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,600);assert.equal(result.fees.complete,true);
  assert.equal(result.gasEstimate.usd,null);assert.equal(result.gasEstimate.observed_usd,40);
  assert.equal(result.gasEstimate.coverage_days,2);assert.deepEqual(result.gasEstimate.missing_dates,['2026-09-30']);
  assert.equal(result.gasShareOfFees,null);
  p.history[0].fees=null;result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,null);assert.equal(result.fees.observed_usd,500);
  assert.equal(result.gasEstimate.observed_usd,40);
  const html=bnbChainMarkup(p,'2026-09-29','2026-10-01');
  assert.match(html,/存在缺日/);assert.match(html,/手续费小计\$500/);assert.match(html,/Gas估算小计\$40/);
  assert.match(html,/没有补零或用滚动7日摘要填缺口/);
});

test('known zero observations are complete zero rather than missing, while division by zero stays unknown',()=>{
  const p=fixture();p.history=p.history.slice(0,3).map(row=>({...row,fees:0,gas_burn_estimate_usd:0}));
  const result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,0);assert.equal(result.gasEstimate.usd,0);
  assert.equal(result.fees.complete,true);assert.equal(result.gasEstimate.complete,true);
  assert.equal(result.gasShareOfFees,null);assert.equal(result.fees.missing_days,0);
  assert.match(bnbChainMarkup(p,'2026-09-29','2026-10-01'),/<strong>\$0<\/strong>/);
});

test('light snapshots use compiled windows only when UTC dates and duration exactly match',()=>{
  const p=fixture();delete p.history;
  // Removed full history dictionaries must never supply a fake observation.
  p.burns.chain_fee_history={'2026-09-29':99999};p.burns.gas_burn_estimate_history={'2026-09-29':9999};
  p.burns.chain_fee_windows={3:cached(600)};p.burns.gas_burn_estimate_windows={3:cached(60)};
  const result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,600);assert.equal(result.gasEstimate.usd,60);assert.equal(result.fees.source,'compiled_window');
  assert.equal(bnbChainWindow(p,'2026-09-28','2026-09-30').fees.usd,null);
  p.burns.chain_fee_windows[3].days=30;
  assert.equal(bnbChainWindow(p,'2026-09-29','2026-10-01').fees.usd,null);
});

test('cached partial coverage never becomes a complete total and can retain its known subtotal',()=>{
  const p=fixture();delete p.history;
  p.burns.chain_fee_windows={3:cached(600,{complete:true,covered_days:2,observed_usd:400,missing_dates:['2026-09-30']})};
  const result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.complete,false);assert.equal(result.fees.usd,null);
  assert.equal(result.fees.observed_usd,400);assert.equal(result.fees.missing_days,1);
});

test('custom worker windows work before full history loads and take priority only for matching UTC bounds',()=>{
  const p=fixture();delete p.history;
  p.burns.chain_fee_windows={3:cached(600)};p.burns.gas_burn_estimate_windows={3:cached(60)};
  const start='2025-01-01',end='2025-01-03';
  p.windows={3:{fees:cached(1200,{start,end,covered_days:undefined,coverage_days:3}),
    gas_burn_estimate:cached(120,{start,end})}};
  let result=bnbChainWindow(p,start,end);
  assert.equal(result.fees.usd,1200);assert.equal(result.fees.coverage_days,3);
  assert.equal(result.gasEstimate.usd,120);assert.equal(result.gasEstimate.covered_days,3);
  assert.equal(result.gasShareOfFees,.1);
  assert.match(bnbChainMarkup(p,start,end),/\$1,200/);
  result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,600);assert.equal(result.gasEstimate.usd,60);
  p.windows[3].fees= cached(null,{start,end,covered_days:undefined,coverage_days:2,complete:false,
    observed_usd:700,missing_dates:['2025-01-02']});
  result=bnbChainWindow(p,start,end);
  assert.equal(result.fees.usd,null);assert.equal(result.fees.observed_usd,700);
  assert.equal(result.fees.coverage_days,2);assert.deepEqual(result.fees.missing_dates,['2025-01-02']);
  p.windows[3].gas_burn_estimate.end='2025-01-04';
  assert.equal(bnbChainWindow(p,start,end).gasEstimate.usd,null);
});

test('custom loaded histories reject invalid numbers and conflicting duplicate days without double counting',()=>{
  const p=fixture();p.history.push({...p.history[0]});
  assert.equal(bnbChainWindow(p,'2026-09-29','2026-10-01').fees.usd,600);
  p.history.push({date:'2026-09-30',fees:201,gas_burn_estimate_usd:20});
  p.history.push({date:'2026-02-30',fees:500,gas_burn_estimate_usd:50});
  const result=bnbChainWindow(p,'2026-09-29','2026-10-01');
  assert.equal(result.fees.usd,null);assert.deepEqual(result.fees.conflicting_dates,['2026-09-30']);
  assert.equal(result.gasEstimate.usd,60);
  p.history[0].fees=-1;p.history[2].fees=Infinity;
  assert.equal(bnbChainWindow(p,'2026-09-29','2026-10-01').fees.usd,null);
  assert.throws(()=>bnbChainWindow(p,'2026-02-30','2026-10-01'),RangeError);
  assert.throws(()=>bnbChainWindow(p,'2026-10-02','2026-10-01'),RangeError);
});

test('current block parameters are independent of the historical supplier assumption and need RPC evidence',()=>{
  const p=fixture();p.burns.gas_burn_policy_observation.ratio=.2;
  p.burns.gas_burn_policy_observation.burn_ratio=2000;
  let html=bnbChainMarkup(p,'2026-09-29','2026-10-01');
  assert.match(html,/20\.00%/);assert.match(html,/供应商历史模型固定比例/);assert.match(html,/10\.00%/);
  assert.match(html,/当前已核参数与供应商固定10%模型不同/);
  assert.match(html,/本区块的比例不能证明整个历史观察窗口/);
  assert.equal(bnbChainWindow(p,'2026-09-29','2026-10-01').gasEstimate.usd,60);
  p.burns.gas_burn_policy_observation.evidence='provider_policy_estimate';
  html=bnbChainMarkup(p,'2026-09-29','2026-10-01');
  assert.match(html,/尚缺可核验的当前区块参数/);assert.doesNotMatch(html,/<strong>20\.00%<\/strong>/);
  p.burns.gas_burn_policy_observation.evidence='pinned_block_eth_call';
  p.burns.gas_burn_policy_observation.ratio_scale=0;
  assert.match(bnbChainMarkup(p,'2026-09-29','2026-10-01'),/尚缺可核验的当前区块参数/);
});

test('each new source kind exposes its API and immutable response, and legacy signature remains compatible',()=>{
  const p=fixture(), kinds=['chain_fees','gas_burn_policy_estimate','policy_block','gas_burn_policy','gas_burn_snapshot','burn_proof'];
  p.data_sources=kinds.map((kind,index)=>({kind,source_key:'key-'+index,url:'https://example.com/api/'+kind,
    response_path:'../data/responses/'+kind+'.json',stored_sha256:'sha-'+index}));
  p.burns.data_sources=[p.data_sources[0]];
  const html=burnFinancialMarkup(p,{days:3,start:'2026-09-29',end:'2026-10-01',yearFactor:100});
  for(const kind of kinds) {assert.ok(html.includes('https://example.com/api/'+kind));assert.ok(html.includes('../data/responses/'+kind+'.json'));}
  assert.match(html,/BSC日手续费/);assert.match(html,/供应商10%模型/);assert.match(html,/当前区块Gas销毁参数/);
  assert.match(html,/季度Auto-Burn另列/);assert.match(html,/不是实际现金回购或项目净利润/);
  assert.equal(html,burnFinancialMarkup(p,'2026-09-29','2026-10-01'));
  assert.match(burnObservationsMarkup(p),/最近滚动7天/);assert.match(burnObservationsMarkup(p),/独立于上方日期筛选/);
});

test('latest executed quarter stays visible outside the selected window and excludes forecasts beyond the snapshot',()=>{
  const p=fixture();p.flow_end='2026-10-02';p.burns.cutoff_utc='2026-10-02';
  p.burns.quarterly_records=[
    {rank:36,date:'2026-07-15',tokens:1615827.795,transaction_hash:'executed',verified:true},
    {rank:37,date:'2026-10-15',tokens:2000000,transaction_hash:'future',verified:true},
    {rank:37,date:'2026-10-01',tokens:3000000,transaction_hash:'estimate',verified:false},
    {rank:35,date:'2026-04-15',tokens:1500000,transaction_hash:'previous',verified:true}];
  p.quarterly_burn_plan={target_supply_tokens:100000000,verified_on:'2026-10-03',
    description:'每季度按价格、区块数和参数销毁',cash_note:'独立于Binance收入',history_note:'旧利润比例不能沿用'};
  p.events=[{date:'2026-07-15',title:'第36次季度销毁已执行',source:'https://example.com/36th'}];
  assert.equal(latestQuarterBurn(p).rank,36);
  assert.equal(burnStats(p,'2026-09-03','2026-10-02').count,0);
  const html=quarterlyPlanMarkup(p), cell=quarterComparisonMarkup(p,'2026-09-03','2026-10-02');
  assert.match(html,/1,615,827\.795 BNB/);assert.match(html,/100,000,000 BNB/);
  assert.match(html,/https:\/\/example.com\/36th/);assert.match(html,/不受上方日期筛选影响/);
  assert.doesNotMatch(html,/3,000,000|2,000,000|第37次/);
  assert.match(cell,/所选期间没有已核事件/);assert.match(cell,/最近一笔 1,615,827\.795 BNB/);
  assert.doesNotMatch(cell,/<strong>0/);
  p.burns.quarterly_records=[];
  assert.equal(latestQuarterBurn(p),null);assert.match(quarterlyPlanMarkup(p),/尚未取得/);
});

test('all historical quarters stay visible independently of selection without converting unverified or projected rows to actual burns',()=>{
  const p=fixture();p.burns.cutoff_utc='2026-10-02';
  p.burns.quarterly_records=Array.from({length:36},(_,index)=>({rank:index+1,quarter:'Historical quarter',
    reported_date:index===35 ? '2026-07-16' : '2020-01-01',reported_amount:String(1000+index),
    source_key:'quarter-index',source_url:'https://example.com/quarters',tx_url:'https://example.com/tx/'+index,
    verified:false,status:'unverified_legacy'}));
  Object.assign(p.burns.quarterly_records[35],{date:'2026-07-15',tokens:1035,transaction_hash:'known-36',verified:true});
  p.burns.quarterly_records.push({rank:37,reported_date:null,reported_amount:'9999',status:'projected',verified:false});
  const before=structuredClone(p), ledger=historicalLedger(p);
  assert.equal(ledger.totalCount,36);assert.equal(ledger.chainVerifiedCount,1);assert.equal(ledger.unverifiedCount,35);
  assert.equal(ledger.officialReviewedCount,0);assert.deepEqual(ledger.missingRanks,[]);
  assert.equal(ledger.rows[0].rank,36);assert.equal(ledger.rows[0].date,'2026-07-15');
  assert.equal(ledger.rows.at(-1).chainTokens,null);assert.equal(ledger.rows.at(-1).pioneerTokens,null);
  assert.equal(burnStats(p,'2026-09-03','2026-10-02').count,0);
  const html=burnFinancialMarkup(p,'2026-09-03','2026-10-02');
  assert.match(html,/全部季度销毁历史/);assert.match(html,/36期/);assert.match(html,/第1次/);assert.match(html,/第36次/);
  assert.doesNotMatch(html,/第37次|9,999/);assert.match(html,/官文金额待核/);
  assert.deepEqual(p,before);
});

test('read announcements, their Pioneer splits and independent chain proofs retain separate evidence and saved responses',()=>{
  const p=fixture();p.burns.cutoff_utc='2026-10-02';
  p.burns.quarterly_records=[{rank:34,reported_date:'2026-01-16',reported_amount:'1100',reported_pioneer:'',
    date:'2026-01-15',tokens:1000,transaction_hash:'known-34',verified:true,source_key:'quarter-index',
    tx_url:'https://example.com/tx/34',proof_source_keys:['proof34']}];
  p.burns.data_sources=[{kind:'burns',source_key:'quarter-index',url:'https://example.com/quarters',response_path:'../data/tracker.json'},
    {kind:'burn_proof',source_key:'proof34',response_path:'../data/proof34.json'},
    {kind:'burn_proof',source_key:'unrelated',response_path:'../data/unrelated.json'}];
  p.burns.official_history={reviewed_at_utc:'2026-10-03T10:00:00Z',sources:[{id:'official34',
    url:'https://example.com/announcement34',response_path:'../data/official34.html',sha256:'official-sha'}],quarters:[{
    rank:34,announcement_date:'2026-01-15',reported_total_tokens:'1005',pioneer_tokens:'5',actual_tokens:'1000',
    actual_tokens_method:'total_minus_pioneer',amount_status:'official_announcement_verified',
    announcement_url:'https://example.com/announcement34',source_ids:['official34'],evidence_notes:['Read official statement.']}]} ;
  let ledger=historicalLedger(p), row=ledger.rows[0];
  assert.equal(ledger.totalCount,1);assert.equal(ledger.officialReviewedCount,1);assert.equal(ledger.chainVerifiedCount,1);
  assert.equal(row.reportedTokens,1005);assert.equal(row.trackerTokens,1100);assert.equal(row.pioneerTokens,5);
  assert.equal(row.officialActualTokens,1000);assert.equal(row.chainTokens,1000);assert.equal(row.usd,null);
  const html=quarterHistoryMarkup(p);
  for (const url of ['../data/official34.html','../data/tracker.json','../data/proof34.json','https://example.com/announcement34']) assert.ok(html.includes(url));
  assert.doesNotMatch(html,/unrelated.json/);assert.match(html,/总量减Pioneer/);
  assert.match(html,/未取得历史价格/);assert.match(html,/链上UTC执行日/);
  p.burns.official_history.quarters[0].pioneer_tokens=null;
  p.burns.official_history.quarters[0].actual_tokens=null;
  ledger=historicalLedger(p);assert.equal(ledger.rows[0].pioneerTokens,null);assert.equal(ledger.rows[0].officialActualTokens,null);
  assert.equal(ledger.rows[0].chainTokens,1000);
  p.burns.official_history.quarters[0].amount_status='official_announcement_pending';
  assert.equal(historicalLedger(p).officialReviewedCount,0);
  assert.equal(historicalLedger(p).rows[0].reportedTokens,null);
  p.burns.official_history.quarters[0].amount_status='official_announcement_verified';
  p.burns.official_history.quarters[0].source_ids=['missing-source'];
  assert.equal(historicalLedger(p).officialReviewedCount,0);
});

test('rankless transaction evidence joins its official rank, while conflicting proofs remain unverified',()=>{
  const p=fixture(), hash='0x'+'a'.repeat(64);p.burns.cutoff_utc='2026-10-02';
  p.burns.quarterly_records=[{date:'2018-01-15',tokens:1000,transaction_hash:hash,verified:true}];
  p.burns.official_history={sources:[{id:'source',response_path:'../data/official.html'}],quarters:[
    {rank:2,announcement_date:'2018-01-15',reported_total_tokens:'1000',pioneer_tokens:'0',actual_tokens:'1000',
      amount_status:'official_announcement_verified',source_ids:['source'],tx_url:'https://etherscan.io/tx/'+hash}]};
  let ledger=historicalLedger(p);
  assert.equal(ledger.totalCount,1);assert.equal(ledger.rows[0].rank,2);assert.equal(ledger.rows[0].pioneerTokens,0);
  assert.equal(ledger.chainVerifiedCount,1);assert.deepEqual(ledger.missingRanks,[1]);
  p.burns.quarterly_records.push({rank:2,date:'2018-01-15',tokens:1001,tx_url:'https://etherscan.io/tx/'+hash,verified:true});
  ledger=historicalLedger(p);assert.equal(ledger.totalCount,1);assert.equal(ledger.chainVerifiedCount,0);
  assert.equal(ledger.rows[0].chainConflict,true);assert.equal(ledger.rows[0].chainTokens,null);
  assert.match(quarterHistoryMarkup(p),/相互冲突的已核交易/);
});

test('official Beacon explorer observations display indexed amounts without becoming independent RPC evidence or window totals',()=>{
  const p=fixture();p.burns.cutoff_utc='2026-10-02';
  p.burns.data_sources=[{kind:'burn_proof',source_key:'beacon8',role:'official_explorer_indexer',
    url:'https://example.com/explorer/tx8',response_path:'../data/beacon8.json'}];
  p.burns.quarterly_records=[{rank:8,reported_date:'2019-07-12',reported_amount:'808888',verified:false,
    status:'indexed_verified',evidence:'indexed_beacon_burn_transaction',indexed_tokens:808888,indexed_date:'2019-07-12',
    indexed_source_key:'beacon8',tx_url:'https://explorer.binance.org/tx/8'}];
  let ledger=historicalLedger(p), html=quarterHistoryMarkup(p);
  assert.equal(ledger.totalCount,1);assert.equal(ledger.chainVerifiedCount,0);assert.equal(ledger.indexVerifiedCount,1);
  assert.equal(ledger.unverifiedCount,1);assert.equal(ledger.rows[0].indexedTokens,808888);
  assert.equal(ledger.rows[0].chainTokens,null);assert.equal(burnStats(p,'2019-07-01','2019-07-31').tokens,null);
  assert.match(html,/808,888/);assert.match(html,/官方浏览器索引UTC日/);assert.match(html,/非独立RPC核验/);
  assert.ok(html.includes('../data/beacon8.json'));assert.ok(html.includes('https://example.com/explorer/tx8'));
  p.burns.data_sources=[];ledger=historicalLedger(p);assert.equal(ledger.indexVerifiedCount,0);
  assert.equal(ledger.rows[0].indexedTokens,null);
});

test('announcement hash mismatches cannot upgrade a tracker transaction to that quarter, and early Pioneer is not applicable',()=>{
  const p=fixture(), hash='0x'+'a'.repeat(64), other='0x'+'b'.repeat(64);
  p.burns.cutoff_utc='2026-10-02';
  p.burns.quarterly_records=[{rank:1,date:'2017-10-18',tokens:986000,verified:true,transaction_hash:hash}];
  p.burns.official_history={sources:[{id:'official1',response_path:'../data/official1.html'}],quarters:[
    {rank:1,announcement_date:'2017-10-18',reported_total_tokens:'986000',pioneer_tokens:null,
      pioneer_status:'not_applicable',actual_tokens:'986000',amount_status:'official_announcement_verified',
      source_ids:['official1'],tx_url:'https://etherscan.io/tx/'+other}]};
  const ledger=historicalLedger(p), html=quarterHistoryMarkup(p);
  assert.equal(ledger.chainVerifiedCount,0);
  assert.equal(ledger.officialReviewedCount,1);
  assert.match(html,/官方公告所列交易与跟踪器已核交易不一致/);
  assert.match(html,/不适用（机制尚未启动）/);
  p.burns.official_history.quarters[0].tx_url='https://etherscan.io/tx/'+hash;
  assert.equal(historicalLedger(p).chainVerifiedCount,1);
});
