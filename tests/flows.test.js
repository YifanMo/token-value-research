import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlow} from '../web/flows.js';

const series = usd => ({usd, complete:true, start:'2026-09-02', end:'2026-10-01'});
const fixture = (ticker = 'HYPE', mode = 'allocation') => ({
  ticker,
  capture:{permanent_burn_proxy:true},
  flow:{mode, revenue_is_income:true, funding_rule:'协议收入分配规则', cautions:[]},
  windows:{'30':{fees:series(200), revenue:series(100), holders:series(40)}},
});
const node = (model, id) => model.nodes.find(n => n.id === id);

test('a historical window before the current policy keeps observed amounts and marks the rule as current',()=>{
  const project=fixture('PUMP','burn_valuation');
  project.flow.funding_effective_from='2026-04-28';
  for(const kind of ['fees','revenue','holders']) Object.assign(project.windows['30'][kind],{start:'2025-09-01',end:'2025-09-30'});
  const model=buildFlow(project,30);
  assert.equal(node(model,'outcome').usd,40);
  assert.ok(model.warnings.some(w=>w.includes('所选历史期间早于现行回购规则')));
});

test('allocation separates source income, policy budget and unknown token outcome', () => {
  const p = fixture();
  p.windows['30'].holders.recurring_usd = 12;
  p.windows['30'].fees.composition = {products:{A:200}, chains:{X:200}, complete:true, sum_usd:200, difference_from_total_usd:0};
  const m = buildFlow(p,30);
  assert.equal(m.start,'2026-09-02');
  assert.equal(m.end,'2026-10-01');
  assert.equal(node(m,'fees').usd,200);
  assert.equal(node(m,'revenue').usd,100);
  assert.equal(node(m,'other').usd,100);
  assert.equal(node(m,'other').evidence,'difference');
  assert.match(node(m,'other').note,/不是完整成本账/);
  assert.equal(node(m,'funding').usd,40); // Raw window, not recurring-only 12.
  assert.equal(node(m,'funding').evidence,'policy');
  assert.equal(node(m,'outcome').usd,null);
  assert.equal(m.unallocatedUsd,null);
  assert.equal(m.unallocatedRecord,null);
  assert.ok(m.warnings.some(w=>w.includes('独立协议分配记录')));
  assert.deepEqual(node(m,'fees').composition,p.windows['30'].fees.composition);
  assert.ok(m.edges.find(e=>e.to==='outcome').dashed);
});

test('matching independent supply and protocol endpoints establish allocation statistics', () => {
  const p = fixture('RAY');
  p.windows['30'].flow_distributions={supply:series(100),protocol:series(60)};
  const m=buildFlow(p,30);
  assert.equal(node(m,'other').usd,100);
  assert.equal(node(m,'other').evidence,'api');
  assert.match(node(m,'other').note,/分给LP等参与者的费用分配统计/);
  assert.equal(m.unallocatedUsd,60);
  assert.equal(m.unallocatedRecord,'独立分配接口对平');
  assert.equal(node(m,'funding').record,'独立分配接口对平');
});

test('nonmatching or incomplete independent allocations leave protocol distributions unknown', () => {
  const p=fixture('RAY');
  p.windows['30'].flow_distributions={supply:series(80),protocol:series(50)};
  const m=buildFlow(p,30);
  assert.equal(node(m,'other').usd,100);
  assert.equal(node(m,'other').evidence,'difference');
  assert.equal(m.unallocatedUsd,null);
  assert.equal(m.unallocatedRecord,null);
  assert.ok(m.warnings.some(w=>w.includes('供给侧分配接口')));
  assert.ok(m.warnings.some(w=>w.includes('协议分配接口')));
  p.windows['30'].flow_distributions={supply:{...series(100),complete:false},protocol:{...series(60),complete:false}};
  const incomplete=buildFlow(p,30);
  assert.equal(node(incomplete,'other').evidence,'difference');
  assert.equal(incomplete.unallocatedUsd,null);
  assert.equal(incomplete.unallocatedRecord,null);
});

test('JUP remains unknown despite an arithmetic match or independent protocol record', () => {
  const p=fixture('JUP');
  p.flow.cautions=['部分业务覆盖重叠，分配账尚未对平'];
  p.windows['30'].flow_distributions={supply:series(100),protocol:series(60)};
  const m=buildFlow(p,30);
  assert.equal(m.unallocatedUsd,null);
  assert.equal(m.unallocatedRecord,null);
  assert.ok(m.warnings.includes(p.flow.cautions[0]));
  assert.equal(buildFlow(fixture('JUP'),30).unallocatedUsd,null);
});

test('RAY independent distributions remain visible alongside general cash and policy cautions', () => {
  const p=fixture('RAY');
  p.flow.cautions=['金额是规则分配统计，不能替代实付现金。','LaunchLab实际销毁待核。'];
  p.windows['30']={fees:series(44969178),revenue:series(7511897),holders:series(4700219),
    flow_distributions:{supply:series(37457281),protocol:series(2811678)}};
  const m=buildFlow(p,30);
  assert.equal(node(m,'other').usd,37457281);
  assert.equal(node(m,'other').evidence,'api');
  assert.equal(m.unallocatedUsd,2811678);
  assert.equal(m.unallocatedRecord,'独立分配接口对平');
  assert.match(node(m,'funding').note,/不是已留存现金或净利润/);
  assert.ok(p.flow.cautions.every(c=>m.warnings.includes(c)));
});

test('protocol reconciliation requires matching complete dates, not just matching numbers', () => {
  for(const protocol of [
    {...series(60),start:'2026-09-01'},
    {...series(60),end:'2026-09-30'},
    {usd:60,complete:true},
    {...series(60),complete:false},
    series(61.01),
  ]) {
    const p=fixture('RAY');
    p.windows['30'].flow_distributions={protocol};
    assert.equal(buildFlow(p,30).unallocatedUsd,null,JSON.stringify(protocol));
  }
  const p=fixture('RAY');p.windows['30'].flow_distributions={protocol:series(61)};
  assert.equal(buildFlow(p,30).unallocatedUsd,61); // At most $1 integer-statistic tolerance.
});

test('PUMP burn valuation is independent of revenue and unknown repurchase cash', () => {
  const p=fixture('PUMP','burn_valuation');
  p.windows['30'].holders=series(250);
  const m=buildFlow(p,30);
  assert.equal(node(m,'revenue').usd,100);
  assert.equal(node(m,'funding').usd,null);
  assert.equal(node(m,'outcome').usd,250);
  assert.equal(node(m,'outcome').evidence,'valuation');
  assert.equal(m.unallocatedUsd,null);
  assert.match(node(m,'funding').note,/不从协议收入中相减/);
  assert.ok(m.edges.filter(e=>['funding','outcome'].includes(e.to)).every(e=>e.dashed));
  assert.ok(!m.warnings.some(w=>w.includes('持有人统计金额大于')));
});

test('a PUMP window crossing a stock event preserves the original number without claiming one uniform burn valuation',()=>{
  const p=fixture('PUMP','burn_valuation');
  p.holder_oneoff_dates=['2026-09-15'];
  p.flow.funding_effective_from='2026-09-15';
  const m=buildFlow(p,30);
  assert.equal(node(m,'outcome').usd,40);
  assert.equal(node(m,'outcome').evidence,'mixed');
  assert.match(node(m,'outcome').label,/口径待核/);
  assert.match(node(m,'outcome').note,/历史统计方法/);
  assert.ok(m.warnings.some(w=>w.includes('回购比例或范围变更')));
  assert.equal(node(m,'funding').usd,null);
});

test('UNI redemption valuation never substitutes for income or a precise LP split', () => {
  const p=fixture('UNI','token_redemption_valuation');
  p.flow.revenue_is_income=false;
  p.windows['30'].holders=series(250);
  p.windows['30'].revenue.composition={products:{V3:100},chains:{Ethereum:100},complete:true};
  p.windows['30'].holders.composition={products:{V3:250},chains:{Ethereum:250},complete:true};
  const m=buildFlow(p,30);
  assert.equal(node(m,'revenue').usd,null);
  assert.ok(!('composition' in node(m,'revenue')));
  assert.equal(node(m,'other').usd,null);
  assert.equal(node(m,'funding').usd,null);
  assert.equal(node(m,'outcome').usd,250);
  assert.deepEqual(node(m,'outcome').composition,p.windows['30'].holders.composition);
  assert.equal(m.unallocatedUsd,null);
  assert.ok(m.warnings.some(w=>w.includes('不能据此计算 P/S')));
  assert.ok(!('psRevenueMc' in m));
  assert.ok(m.edges.every(e=>e.dashed));
  // Mode remains protective even if a caller mislabels the revenue flag.
  p.flow.revenue_is_income=true;
  assert.equal(node(buildFlow(p,30),'revenue').usd,null);
});

test('missing, incomplete and nonfinite statistics remain unknown while zero is valid', () => {
  const missing=buildFlow({ticker:'RAY',flow:{mode:'allocation',revenue_is_income:true}},30);
  assert.ok(missing.nodes.every(n=>n.usd===null));
  assert.ok(missing.warnings.every(w=>!/(fees|revenue|holders)/.test(w)));
  assert.ok(missing.warnings.some(w=>w.includes('费用统计')));
  assert.ok(missing.warnings.some(w=>w.includes('收入统计')));
  assert.ok(missing.warnings.some(w=>w.includes('代币回购或销毁统计')));
  for(const usd of [null,NaN,Infinity]) {
    const p=fixture();p.windows['30'].fees=series(usd);
    const m=buildFlow(p,30);
    assert.equal(node(m,'fees').usd,null);
    assert.equal(node(m,'other').usd,null);
  }
  const p=fixture();
  p.windows['30'].fees={...series(200),complete:false};
  p.windows['30'].holders={...series(40),complete:false};
  const incomplete=buildFlow(p,30);
  assert.equal(node(incomplete,'fees').usd,null);
  assert.equal(node(incomplete,'funding').usd,null);
  assert.equal(incomplete.unallocatedUsd,null);
  for(const kind of ['fees','revenue','holders'])p.windows['30'][kind]=series(0);
  p.windows['30'].flow_distributions={protocol:series(0)};
  const zero=buildFlow(p,30);
  assert.equal(node(zero,'fees').usd,0);
  assert.equal(node(zero,'other').usd,0);
  assert.equal(node(zero,'funding').usd,0);
  assert.equal(zero.unallocatedUsd,0);
});

test('funding note does not duplicate the rule rendered separately', () => {
  const p=fixture('RAY');
  p.flow.funding_rule='独立展示的12%交易费政策';
  p.flow.funding_note='兑换资金和实际买入需要进一步验证。';
  const m=buildFlow(p,30);
  assert.ok(!node(m,'funding').note.includes(p.flow.funding_rule));
  assert.ok(node(m,'funding').note.includes(p.flow.funding_note));
});

test('negative allocation differences are never clamped to zero', () => {
  const p=fixture('RAY');
  p.windows['30'].revenue=series(300);
  p.windows['30'].holders=series(400);
  const m=buildFlow(p,30);
  assert.equal(node(m,'other').usd,null);
  assert.equal(m.unallocatedUsd,null);
  assert.ok(m.warnings.some(w=>w.includes('费用总额小于')));
  assert.ok(m.warnings.some(w=>w.includes('持有人统计金额大于')));
});

test('oneoff stocks and permanent-policy crossings retain raw amounts with warnings', () => {
  const p=fixture('PUMP','burn_valuation');
  p.capture={permanent_burn_proxy:true,pre_burn_kind:'buyback_to_treasury',permanent_from:'2026-09-15'};
  p.windows['30'].holders={...series(250),recurring_usd:null,oneoff_dates:['2026-09-10']};
  const m=buildFlow(p,30);
  assert.equal(node(m,'outcome').usd,250);
  assert.ok(m.warnings.some(w=>w.includes('一次性代币事件')));
  assert.ok(m.warnings.some(w=>w.includes('永久销毁政策生效日')));
  const allocation=fixture('HYPE');
  allocation.holder_oneoff_dates=['2026-09-10'];
  assert.equal(buildFlow(allocation,30).unallocatedUsd,null);
});

test('different date ranges cannot be subtracted or confirmed through matching numbers', () => {
  const p=fixture('RAY');
  p.windows['30'].holders={...series(40),start:'2026-09-01'};
  p.windows['30'].fees={...series(200),end:'2026-09-30'};
  p.windows['30'].flow_distributions={supply:series(100),protocol:series(60)};
  const m=buildFlow(p,30);
  assert.equal(node(m,'other').usd,null);
  assert.equal(m.unallocatedUsd,null);
  assert.ok(m.warnings.some(w=>w.includes('期间不一致')));
});

test('building a model does not mutate caller statistics or configuration', () => {
  const p=fixture();
  const before=structuredClone(p);
  Object.freeze(p.flow.cautions);Object.freeze(p.flow);
  for(const s of Object.values(p.windows['30']))Object.freeze(s);
  Object.freeze(p.windows['30']);Object.freeze(p.windows);Object.freeze(p);
  buildFlow(p,30);
  assert.deepEqual(p,before);
});

test('BNB actual chain fees and policy Gas estimate form a distinct path without becoming protocol income or quarterly buybacks',()=>{
  const p=fixture('BNB','reserve_and_gas_burn');
  p.windows['30'].gas_burn_estimate={...series(20),evidence:'provider_policy_estimate',assumed_ratio:.1,effective_from:'2021-11-30',actual_burn_verified:false};
  const m=buildFlow(p,30);
  assert.equal(node(m,'fees').usd,200);assert.equal(node(m,'fees').evidence,'api');
  assert.equal(node(m,'other').usd,20);assert.equal(node(m,'other').evidence,'estimate');
  assert.equal(node(m,'revenue').usd,180);assert.equal(node(m,'revenue').label,'其余Gas费用（估算）');assert.equal(node(m,'revenue').evidence,'estimate');
  assert.match(node(m,'revenue').note,/不能当作验证者实际收到/);
  assert.equal(node(m,'funding').usd,null);assert.equal(node(m,'outcome').usd,null);
  assert.ok(!m.edges.some(edge=>edge.from==='revenue'&&edge.to==='funding'));
  assert.equal(m.gasBurnEstimateUsd,20);assert.equal(m.unallocatedUsd,null);
  assert.ok(m.warnings.some(note=>note.includes('当前区块')&&note.includes('不能证明')));
});

test('BNB missing, nonmatching and pre-policy Gas model windows remain unknown while valid zero stays zero',()=>{
  for(const changed of ['incomplete_fee','incomplete_model','missing_model','wrong_dates','wrong_ratio','changed_source_ratio','wrong_amount','pre_policy']) {
    const p=fixture('BNB','reserve_and_gas_burn');
    p.windows['30'].gas_burn_estimate={...series(20),evidence:'provider_policy_estimate',assumed_ratio:.1,effective_from:'2021-11-30'};
    if(changed==='incomplete_fee') p.windows['30'].fees.complete=false;
    if(changed==='incomplete_model') p.windows['30'].gas_burn_estimate.complete=false;
    if(changed==='missing_model') delete p.windows['30'].gas_burn_estimate;
    if(changed==='wrong_dates') p.windows['30'].gas_burn_estimate.start='2026-09-01';
    if(changed==='wrong_ratio') p.windows['30'].gas_burn_estimate.assumed_ratio=.2;
    if(changed==='changed_source_ratio') p.data_sources=[{kind:'gas_burn_policy_estimate',assumed_ratio:.2}];
    if(changed==='wrong_amount') p.windows['30'].gas_burn_estimate.usd=100;
    if(changed==='pre_policy') for(const kind of ['fees','gas_burn_estimate']) Object.assign(p.windows['30'][kind],{start:'2021-11-29',end:'2021-12-28'});
    const m=buildFlow(p,30);
    assert.equal(node(m,'other').usd,null,changed);assert.equal(node(m,'revenue').usd,null,changed);
  }
  const p=fixture('BNB','reserve_and_gas_burn');p.windows['30'].fees=series(0);p.windows['30'].gas_burn_estimate={...series(0),evidence:'provider_policy_estimate'};
  const m=buildFlow(p,30);assert.equal(node(m,'fees').usd,0);assert.equal(node(m,'other').usd,0);assert.equal(node(m,'revenue').usd,0);
});
