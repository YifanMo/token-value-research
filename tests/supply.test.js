import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {componentAmount, componentWindowSummary, nextEvent, scenarioAmount} from '../web/supply.js';

const quarterly={id:'budget',mode:'events',coverage_start:'2026-01-01',coverage_end:'2027-12-31',
  usable_in_float_scenario:true,events:['2026-10-01','2027-01-01','2027-04-01','2027-07-01','2027-10-01'].map(date=>({date,tokens:5e6}))};

test('rolling eligibility excludes already-due carry-in and includes four future UNI quarters',()=>{
  assert.equal(componentAmount(quarterly,'2026-10-02',30),0);
  assert.equal(componentAmount(quarterly,'2026-10-02',90),0);
  assert.equal(componentAmount(quarterly,'2026-10-02',365),20e6);
  assert.equal(nextEvent(quarterly,'2026-10-02').date,'2027-01-01');
  assert.equal(componentAmount(quarterly,'2027-01-01',1),0);
  assert.equal(componentAmount(quarterly,'2026-12-31',1),5e6);
});
test('finite schedules cannot produce false zero beyond their known coverage',()=>{
  assert.equal(componentAmount(quarterly,'2027-10-02',365),null);
  assert.equal(componentAmount({mode:'unknown'},'2026-10-02',365),null);
  assert.equal(componentAmount({...quarterly,events:[{date:'2026-02-31',tokens:10}]},'2026-10-02',365),null);
});
test('linear vesting and annual run rates are clipped and stay separate from new supply',()=>{
  const linear={mode:'linear',start:'2026-01-01',end:'2027-01-01',tokens:365};
  assert.equal(componentAmount(linear,'2026-12-01',90),31);
  assert.equal(componentAmount(linear,'2027-01-02',30),0);
  assert.equal(componentAmount({mode:'annual_rate',annual_tokens:365},'2026-10-02',30),30);
});
test('alternative vesting models cannot be added or treated as exercised mint permissions',()=>{
  const a={id:'a',mode:'annual_rate',annual_tokens:100,overlap_group:'same-pool',usable_in_float_scenario:true};
  const b={...a,id:'b',annual_tokens:200};
  const permission={id:'permission',mode:'annual_rate',annual_tokens:20,usable_in_float_scenario:false};
  const f={components:[a,b,permission]};
  assert.equal(scenarioAmount(f,['a','b'],'2026-10-02'),null);
  assert.equal(scenarioAmount(f,['a','a'],'2026-10-02'),null);
  assert.equal(scenarioAmount(f,['permission'],'2026-10-02'),null);
  assert.equal(scenarioAmount(f,['a'],'2026-10-02'),100);
});

test('dated forecasts preserve each project review date and known categories without asserting complete float',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/supply-forecasts.json',import.meta.url)));
  for(const ticker of ['HYPE','PUMP','UNI','JUP','RAY','CAKE','BNB','AAVE']) assert.ok(data.projects.some(project=>project.ticker===ticker));
  const by=Object.fromEntries(data.projects.map(p=>[p.ticker,p]));
  assert.equal(componentAmount(by.PUMP.components.find(c=>c.id==='pump-insiders-model'),by.PUMP.verified_on,365),82.5e9);
  assert.equal(componentAmount(by.UNI.components.find(c=>c.id==='uni-quarterly-budget'),by.UNI.verified_on,365),20e6);
  assert.equal(by.UNI.carry_in.tokens,null);
  assert.equal(scenarioAmount(by.HYPE,['hype-contributor-model','hype-october-subset'],data.verified_on),null);
  for (const p of data.projects) {
    assert.ok(p.components.find(c=>c.id===p.overview_component_id));
    assert.ok(p.components.some(c=>c.mode==='unknown'));
    for(const c of p.components.filter(c=>c.mode==='events'))
      assert.ok(c.events.every(e=>c.coverage_start<=e.date && e.date<=c.coverage_end));
  }
});

test('CAKE and AAVE rate scenarios and BNB routine issuance retain separate meaning and pinned source bytes',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/supply-forecasts.json',import.meta.url)));
  const expected={CAKE:8121250,AAVE:54750,BNB:0};
  for(const [ticker,amount] of Object.entries(expected)) {
    const p=data.projects.find(p=>p.ticker===ticker),c=p.components.find(c=>c.id===p.overview_component_id);
    assert.equal(p.verified_on,'2026-10-03');
    const summary=componentWindowSummary(c,p.verified_on,365);
    assert.equal(summary.amount,amount);
    assert.equal(summary.status,ticker==='BNB'?'complete':'projection');
    assert.ok(p.components.some(c=>c.mode==='unknown'));
    for(const source of p.components.flatMap(c=>c.sources||[]).filter(s=>s.response_path)) {
      const body=fs.readFileSync(new URL(source.response_path,new URL('../web/',import.meta.url)));
      assert.equal(createHash('sha256').update(body).digest('hex'),source.stored_sha256);
      assert.ok(source.retrieved_at);
    }
  }
});

test('the current research day keeps registered HYPE and PUMP portions without claiming a complete future year',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/supply-forecasts.json',import.meta.url)));
  const asOf='2026-10-03';
  const expected={HYPE:119e6,PUMP:82.5e9};
  for(const ticker of Object.keys(expected)) {
    const project=data.projects.find(project=>project.ticker===ticker);
    const component=project.components.find(component=>component.id===project.overview_component_id);
    const before=structuredClone(component), summary=componentWindowSummary(component,asOf,365);
    assert.equal(componentAmount(component,asOf,365),null);
    assert.equal(summary.amount,null);assert.equal(summary.complete,false);assert.equal(summary.status,'partial');
    assert.ok(Math.abs(summary.known_amount-expected[ticker])<1);
    assert.equal(summary.start,'2026-10-04');assert.equal(summary.end,'2027-10-03');
    assert.equal(summary.coverage_end,'2027-10-02');assert.equal(summary.known_end,'2027-10-02');
    assert.equal(summary.covered_days,364);assert.equal(summary.missing_days,1);
    assert.deepEqual(summary.gaps,[{start:'2027-10-03',end:'2027-10-03',days:1,reason:'after_coverage'}]);
    assert.deepEqual(component,before);
  }
});

test('complete zero, partially covered zero and unknown schedule remain distinct',()=>{
  const component={mode:'events',coverage_start:'2026-10-01',coverage_end:'2026-10-31',events:[]};
  const complete=componentWindowSummary(component,'2026-10-01',30);
  assert.equal(complete.complete,true);assert.equal(complete.amount,0);assert.equal(complete.known_amount,0);assert.equal(complete.missing_days,0);
  const partial=componentWindowSummary(component,'2026-10-30',30);
  assert.equal(partial.complete,false);assert.equal(partial.amount,null);assert.equal(partial.known_amount,0);assert.equal(partial.covered_days,1);assert.equal(partial.missing_days,29);
  const outside=componentWindowSummary(component,'2026-11-01',30);
  assert.equal(outside.known_amount,null);assert.equal(outside.covered_days,0);assert.equal(outside.missing_days,30);
  const unknown=componentWindowSummary({mode:'unknown'},'2026-10-01',30);
  assert.equal(unknown.status,'unknown');assert.equal(unknown.known_amount,null);assert.equal(unknown.amount,null);
  const zero=componentWindowSummary({mode:'zero',evidence:'ended'},'2026-10-01',30);
  assert.equal(zero.complete,true);assert.equal(zero.amount,0);assert.equal(zero.amount_kind,'zero_component');
});

test('partial schedules report both gaps and only sum dates within explicit coverage',()=>{
  const component={mode:'events',coverage_start:'2027-01-03',coverage_end:'2027-01-07',events:[{date:'2027-01-03',tokens:5},{date:'2027-01-07',tokens:7}]};
  const summary=componentWindowSummary(component,'2027-01-01',10);
  assert.equal(summary.amount,null);assert.equal(summary.known_amount,12);
  assert.equal(summary.known_start,'2027-01-03');assert.equal(summary.known_end,'2027-01-07');
  assert.equal(summary.covered_days,5);assert.equal(summary.missing_days,5);
  assert.deepEqual(summary.gaps,[{start:'2027-01-02',end:'2027-01-02',days:1,reason:'before_coverage'},{start:'2027-01-08',end:'2027-01-11',days:4,reason:'after_coverage'}]);
});

test('leap days and inclusive future endpoints are counted without including already-due events',()=>{
  const component={...quarterly,coverage_start:'2027-01-01',coverage_end:'2028-02-28',events:[{date:'2027-03-01',tokens:99},{date:'2028-02-28',tokens:5}]};
  const summary=componentWindowSummary(component,'2027-03-01',365);
  assert.equal(summary.end,'2028-02-29');assert.equal(summary.known_amount,5);assert.equal(summary.covered_days,364);assert.equal(summary.missing_days,1);
  const leap={mode:'events',coverage_start:'2028-02-28',coverage_end:'2028-03-01',events:[{date:'2028-02-28',tokens:99},{date:'2028-02-29',tokens:7},{date:'2028-03-01',tokens:3}]};
  assert.equal(componentWindowSummary(leap,'2028-02-28',2).amount,10);
});

test('invalid dates, coverage and event values cannot become a known partial amount',()=>{
  for(const [asOf,days] of [['2026-02-30',30],['2026-10-03',0],['2026-10-03',1.5],['2026-10-03',true],['9999-12-31',1]])
    assert.equal(componentWindowSummary(quarterly,asOf,days).status,'invalid');
  for(const change of [{coverage_start:'2027-12-31',coverage_end:'2026-01-01'},{coverage_end:'2027-02-30'},
    {events:[{date:'2027-02-30',tokens:5}]},{events:[{date:'2027-01-01',tokens:-5}]},{events:[{date:'2027-01-01',tokens:Infinity}]},
    {events:[{date:'2028-01-01',tokens:5}]}]) {
    const summary=componentWindowSummary({...quarterly,...change},'2026-10-03',365);
    assert.equal(summary.status,'invalid');assert.equal(summary.amount,null);assert.equal(summary.known_amount,null);
  }
});

test('rate projections and permission ceilings do not become confirmed dated releases or known-zero gaps',()=>{
  const projection=componentWindowSummary({mode:'annual_rate',annual_tokens:365,evidence:'run_rate'},'2026-10-03',30);
  assert.equal(projection.amount,30);assert.equal(projection.known_amount,null);assert.equal(projection.complete,false);assert.equal(projection.status,'projection');
  assert.equal(projection.covered_days,null);assert.equal(projection.missing_days,null);
  const ceiling=componentWindowSummary({mode:'capacity',max_tokens:20e6,evidence:'authority'},'2026-10-03',365);
  assert.equal(ceiling.amount,20e6);assert.equal(ceiling.known_amount,null);assert.equal(ceiling.complete,false);assert.equal(ceiling.status,'upper_bound');
  const linear=componentWindowSummary({mode:'linear',start:'2026-01-01',end:'2027-01-01',tokens:365},'2026-12-01',90);
  assert.equal(linear.amount,31);assert.equal(linear.complete,true);assert.equal(linear.amount_kind,'linear_model');
});

test('summaries describe each alternative independently and preserve the overlap guard',()=>{
  const a={id:'a',...quarterly,overlap_group:'same-pool'},b={...a,id:'b',events:quarterly.events.map(event=>({...event,tokens:event.tokens*2}))};
  assert.equal(componentWindowSummary(a,'2026-10-02',365).amount,20e6);
  assert.equal(componentWindowSummary(b,'2026-10-02',365).amount,40e6);
  assert.equal(scenarioAmount({components:[a,b]},['a','b'],'2026-10-02'),null);
});
