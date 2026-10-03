import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate, calculateReferenceMultiples} from '../web/core.js';
import {buildFlow} from '../web/flows.js';
import {buildConclusion} from '../web/conclusions.js';
import {createRangeProject} from '../web/periods.js';
import {burnStats, burnRecordsMarkup, burnFinancialMarkup, burnObservationsMarkup} from '../web/burns.js';
import {feeReconciliationMarkup} from '../web/fee-view.js';
import {statisticLabel, isHypeFeeReconciliation} from '../web/models.js';

const series=usd=>({usd,start:'2026-07-01',end:'2026-07-30',complete:true,recurring_usd:usd});
const quarterly=(date,tokens,usd,hash)=>({date,tokens,usd,transaction_hash:hash,verified:true,source_url:'https://example.com/burns',tx_url:'https://example.com/tx/'+hash});
const bnb=()=>({ticker:'BNB',capture:{kind:'reserve_burn',permanent_burn_proxy:true},flow:{mode:'reserve_and_gas_burn',revenue_is_income:false},market:{market_cap:10000,fully_diluted_valuation:20000},
  windows:{30:{fees:series(100),revenue:series(100),holders:series(100)}},burns:{quarterly_records:[quarterly('2026-07-15',10,500,'proof')],limitations:['季度与Gas未建立完整合计']}});

test('reserve burns cannot become income, cash buybacks, profits or annualized yields even with populated API columns',()=>{
  const p=bnb();
  p.flow.revenue_is_income=true; // The dedicated mode is a second guard.
  p.financials={net_income_windows:{30:{...series(100),currency:'USD',costs_complete:true,same_protocol_scope:true,recurring_only:true,source_url:'https://example.com/profits'}}};
  const m=calculate(p,30,'reported'),ref=calculateReferenceMultiples(p,30,'reported');
  for(const key of ['holder','holderAnnual','holderCapture','feeCapture','revenue','grossYieldMc','grossYieldFdv','permanentProxyYieldMc','permanentProxyYieldFdv','peMc','psRevenueMc']) assert.equal(m[key],null,key);
  assert.equal(m.rawHolder,100);assert.equal(m.revenueStatus,'not_applicable');assert.equal(m.netIncomeStatus,'not_applicable');
  for(const key of ['peMc','peFdv','psMc','psFdv','holderAnnual','revenueAnnual']) assert.equal(ref[key],null,key);
});

test('quarterly sums use verified executions once, inclusive actual dates, and never annualize or include projected entries',()=>{
  const p=bnb();
  p.burns.quarterly_records=[quarterly('2026-07-01',5,250,'start'),quarterly('2026-07-30',10,500,'end'),quarterly('2026-07-30',10,500,'end'),quarterly('2026-07-31',20,1000,'outside'),{...quarterly('2026-07-15',100,5000,'forecast'),verified:false,status:'projected'}];
  const before=structuredClone(p),s=burnStats(p,'2026-07-01','2026-07-30');
  assert.equal(s.tokens,15);assert.equal(s.usd,750);assert.equal(s.count,2);assert.equal(s.unverifiedCount,1);assert.equal(s.shareMc,.075);assert.equal(s.shareFdv,.0375);assert.equal(s.complete,false);
  assert.deepEqual(p,before);
  const different=createRangeProject(p,'2026-07-02','2026-07-31');
  assert.equal(different.windows['30'].burns.tokens,30);assert.equal(different.windows['30'].burns.count,2);
  assert.equal(p.windows['30'].burns,undefined);
});

test('missing quarterly events and prices remain unknown and gas snapshots remain independent of chosen periods',()=>{
  const p=bnb();
  assert.equal(burnStats(p,'2026-08-01','2026-08-30').tokens,null);
  assert.equal(burnStats(p,'2026-08-01','2026-08-30').usd,null);
  p.burns.quarterly_records[0].usd=null;
  const stats=burnStats(p,'2026-07-15','2026-07-15');
  assert.equal(stats.tokens,10);assert.equal(stats.usd,null);assert.equal(stats.shareMc,null);
  p.burns.realtime_observation={last7_days_tokens:70,cumulative_tokens:700,retrieved_at:'2026-10-03T01:00:00Z',latest_block_at:'2026-10-03T00:00:00Z'};
  const text=burnObservationsMarkup(p);
  assert.match(text,/最近滚动7天/);assert.match(text,/独立于上方日期筛选/);assert.match(text,/2026-10-03/);
  assert.equal(burnStats(p,'2026-07-15','2026-07-15').tokens,10);
});

test('BNB presents two unconnected burn paths and source JSON without a daily-income audit schema',()=>{
  const p=bnb(),flow=buildFlow(p,30);
  assert.equal(flow.mode,'reserve_and_gas_burn');assert.ok(flow.nodes.every(node=>node.usd===null));
  assert.ok(!flow.edges.some(edge=>edge.from==='revenue'&&edge.to==='funding'));
  p.burns.data_sources=[{kind:'burn_proof',url:'https://example.com/rpc',response_path:'../data/proof.json',sha256:'proof-hash'}];
  p.burns.quarterly_records[0].usd_basis='executed_native_tokens_times_same_utc_date_price; not_cash_cost';
  const html=burnFinancialMarkup(p,'2026-07-01','2026-07-30');
  assert.match(html,/proof.json/);assert.match(html,/proof-hash/);assert.match(html,/执行日UTC采样价/);assert.doesNotMatch(html,/executed_native_tokens|totalDataChart/);
  assert.match(burnRecordsMarkup(p,'2026-08-01','2026-08-30'),/不能推定实际销毁为零/);
  const conclusion=buildConclusion(p,30,'2026-10-03');
  assert.match(conclusion.text,/已核1笔季度销毁/);assert.match(conclusion.text,/未年化/);assert.match(conclusion.text,/P\/S和P\/E均不适用/);
});

test('new DeFi conclusions use reviewed profile fields and a configured or latest registered policy study',()=>{
  const p={ticker:'NEW',capture:{stat_label:'政策回购额度'},flow:{revenue_is_income:true},market:{},windows:{30:{revenue:series(100),holders:series(30)}},
    analysis:{headline:'经过复核的判断',business:'借贷手续费',supply_effect:'完整台账待核'},events:[{date:'2025-01-01',title:'收入路径变化'}],
    event_studies:[{date:'2025-01-01',source:'https://example.com/event',studies:[{days:30,pre:{complete:true},post:{complete:true},revenue_change:.1}]}]};
  let c=buildConclusion(p,30,'2026-10-03');
  assert.equal(c.headline,'经过复核的判断');assert.equal(c.sentences[0],'借贷手续费');assert.match(c.sentences[1],/政策回购额度÷协议收入为30\.00%/);assert.match(c.observation.text,/2025-01-01.*收入\+10\.00%/);assert.match(c.text,/完整台账待核/);
  p.analysis.event_date='2025-02-01';c=buildConclusion(p,30,'2026-10-03');assert.equal(c.observation.event,undefined);assert.match(c.observation.text,/尚缺完整/);
});

test('generic normalization and nonincome labels do not inherit HYPE99% or UNI semantics',()=>{
  const p={ticker:'OTHER',capture:{stat_label:'销毁代币估值'},flow:{revenue_is_income:false},fee_normalization:{child:'Duplicate',note:'去重'},windows:{30:{fees:series(100)}}};
  assert.equal(statisticLabel(p),'销毁代币估值');assert.equal(isHypeFeeReconciliation(p),false);
  const html=feeReconciliationMarkup(p,{coverage:p.windows[30],fees:100});
  assert.match(html,/费用去重与表格比例/);assert.doesNotMatch(html,/99%|HLP|AF|UNI/);
});
