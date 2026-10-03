import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildConclusion} from '../web/conclusions.js';

const snapshot=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url),'utf8'));
const project=ticker=>structuredClone(snapshot.projects.find(p=>p.ticker===ticker));

test('UNI identical valuation fields never become verified income or a 100% cash capture claim',()=>{
  const p=project('UNI');
  p.windows['30'].revenue.usd=100;
  p.windows['30'].holders.usd=100;
  p.windows['30'].holders.recurring_usd=100;
  const conclusion=buildConclusion(p,30,snapshot.as_of);
  assert.equal(conclusion.metrics.holderCapture,null);
  assert.match(conclusion.sentences[1],/真实收入比例未知/);
  assert.doesNotMatch(conclusion.sentences[1],/为100\.00%/);
  assert.equal(conclusion.netSupplyStatus,'unverified');
});

test('stock-event windows cannot publish recurring yields from historical burn values',()=>{
  const p=project('PUMP');
  p.windows['30'].holders={...p.windows['30'].holders,usd:1000000,recurring_usd:null,oneoff_dates:['2026-04-28']};
  const conclusion=buildConclusion(p,30,snapshot.as_of);
  assert.equal(conclusion.metrics.grossYieldMc,null);
  assert.equal(conclusion.metrics.grossYieldFdv,null);
  assert.match(conclusion.sentences[5],/跨存量销毁事件/);
  assert.match(conclusion.sentences[5],/两种.*均无法可靠计算/);
});

test('selected-window amounts and new market values update both valuation ratios without reapplying a policy percentage',()=>{
  const p=project('PUMP');
  p.market.market_cap=1000;
  p.market.fully_diluted_valuation=2000;
  for(const days of [7,30]) p.windows[String(days)].holders={usd:days,recurring_usd:days,oneoff_dates:[]};
  for(const days of [7,30]) {
    const conclusion=buildConclusion(p,days,snapshot.as_of);
    assert.equal(conclusion.metrics.grossYieldMc,.365);
    assert.equal(conclusion.metrics.grossYieldFdv,.1825);
    assert.match(conclusion.sentences[5],/36\.50%.*18\.25%/);
    assert.ok(conclusion.sentences[5].includes(`所选${days}天`));
  }
});

test('finite forecasts stay unknown outside coverage and cannot establish net deflation',()=>{
  const p=project('HYPE');
  const c=p.supply_forecast.components.find(c=>c.id===p.supply_forecast.overview_component_id);
  c.coverage_end=snapshot.as_of;
  const conclusion=buildConclusion(p,30,snapshot.as_of);
  assert.equal(conclusion.future.tokens,null);
  assert.match(conclusion.future.text,/覆盖缺口仍未知/);
  assert.doesNotMatch(conclusion.future.text,/约0/);
  assert.equal(conclusion.netSupplyStatus,'unverified');
});

test('incomplete event observations cannot be called revenue growth even if a stale percentage exists',()=>{
  const p=project('JUP');
  const study=p.event_studies.find(e=>e.date==='2026-02-22').studies.find(s=>s.days===30);
  study.pre.complete=false;
  study.revenue_change=1;
  const conclusion=buildConclusion(p,7,snapshot.as_of);
  assert.match(conclusion.observation.text,/前后各30天/);
  assert.match(conclusion.observation.text,/收入因缺日无法比较/);
  assert.doesNotMatch(conclusion.observation.text,/收入\+100\.00%/);
});

test('a dated PUMP commitment is not silently presented as current after its end',()=>{
  const conclusion=buildConclusion(project('PUMP'),30,'2027-04-29');
  assert.match(conclusion.sentences[1],/承诺期已结束/);
  assert.match(conclusion.sentences[1],/后续政策需复核/);
});
