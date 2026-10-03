import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {componentAmount, nextEvent, scenarioAmount} from '../web/supply.js';

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

test('dated five-token forecasts preserve known parts without asserting complete float',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/supply-forecasts.json',import.meta.url)));
  for(const ticker of ['HYPE','PUMP','UNI','JUP','RAY']) assert.ok(data.projects.some(project=>project.ticker===ticker));
  const by=Object.fromEntries(data.projects.map(p=>[p.ticker,p]));
  assert.equal(componentAmount(by.PUMP.components.find(c=>c.id==='pump-insiders-model'),data.verified_on,365),82.5e9);
  assert.equal(componentAmount(by.UNI.components.find(c=>c.id==='uni-quarterly-budget'),data.verified_on,365),20e6);
  assert.equal(by.UNI.carry_in.tokens,null);
  assert.equal(scenarioAmount(by.HYPE,['hype-contributor-model','hype-october-subset'],data.verified_on),null);
  for (const p of data.projects) {
    assert.ok(p.components.find(c=>c.id===p.overview_component_id));
    assert.ok(p.components.some(c=>c.mode==='unknown'));
    for(const c of p.components.filter(c=>c.mode==='events'))
      assert.ok(c.events.every(e=>c.coverage_start<=e.date && e.date<=c.coverage_end));
  }
});
