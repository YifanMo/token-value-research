import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buybackSource,auditResponse} from '../web/sources.js';

const second = date => Date.parse(date+'T00:00:00Z')/1000;
const project = {windows:{'2':{holders:{start:'2026-09-30',end:'2026-10-01',usd:30}}}};

test('source audit uses UTC completed days, last duplicate, and skips incompatible rows',()=>{
  const raw={totalDataChart:[[second('2026-09-30'),9],[second('2026-09-30'),10],
    [second('2026-10-01'),20],[second('2026-10-02'),999],['bad',1],[second('2026-10-01'),'20']]};
  const audit=auditResponse(raw,project,2);
  assert.equal(audit.matches,true);
  assert.equal(audit.total,30);
  assert.equal(audit.rows.length,2);
});
test('source audit does not hide missing days or aggregate differences',()=>{
  assert.equal(auditResponse({totalDataChart:[[second('2026-10-01'),30]]},project,2).total,null);
  assert.equal(auditResponse({totalDataChart:[[second('2026-09-30'),10],[second('2026-10-01'),21]]},project,2).matches,false);
  assert.throws(()=>auditResponse({},project,2),/totalDataChart/);
});
test('only documented pre-activation zeros can fill absent API days',()=>{
  const p={...project,zero_before:{holders:'2026-10-01'},windows:{'2':{holders:{...project.windows['2'].holders,usd:20}}}};
  const audit=auditResponse({totalDataChart:[[second('2026-10-01'),20]]},p,2);
  assert.equal(audit.matches,true);
  assert.equal(audit.documentedZeros,1);
});
const feeRule={id:'exclude-hlp-duplicate-v1',valid_from:'2024-12-23',chain:'Hyperliquid L1',child:'Hyperliquid HLP',
  required_children:['Hyperliquid HLP','Hyperliquid Perps','Hyperliquid Spot Orderbook']};
const feeProject={fee_normalization:feeRule,windows:{'1':{fees:{start:'2026-10-01',end:'2026-10-01',usd:109,raw_usd:110,excluded_usd:1}}}};
const feeResponse=()=>({totalDataChart:[[second('2026-10-01'),110]],totalDataChartBreakdown:[[second('2026-10-01'),{
  'Hyperliquid L1':{'Hyperliquid HLP':1,'Hyperliquid Perps':99,'Hyperliquid Spot Orderbook':10}}]]});
test('fee audit independently checks raw, excluded and adjusted totals',()=>{
  const raw=feeResponse(), before=structuredClone(raw), audit=auditResponse(raw,feeProject,1,'fees');
  assert.equal(audit.matches,true);
  assert.equal(audit.rawTotal,110);
  assert.equal(audit.excludedTotal,1);
  assert.equal(audit.total,109);
  assert.deepEqual(raw,before);
  assert.equal(auditResponse(raw,{...feeProject,windows:{'1':{fees:{...feeProject.windows['1'].fees,raw_usd:111}}}},1,'fees').matches,false);
  raw.totalDataChart[0][1]=109;
  const p={...feeProject,windows:{'1':{fees:{...feeProject.windows['1'].fees,raw_usd:109,excluded_usd:0}}}};
  const already=auditResponse(raw,p,1,'fees');
  assert.equal(already.matches,true);
  assert.equal(already.excludedTotal,0);
  assert.equal(already.rows[0].normalization,'provider_already_excluded');
});
test('fee audit with missing children, changed methods or failed reconciliation stays unknown',()=>{
  for (const scenario of ['missing_breakdown','missing_child','only_hlp','invalid_child','mismatch','methodology_changed','ambiguous']) {
    const raw=feeResponse(), p=structuredClone(feeProject), children=raw.totalDataChartBreakdown[0][1]['Hyperliquid L1'];
    if(scenario==='missing_breakdown') delete raw.totalDataChartBreakdown;
    if(scenario==='missing_child') delete children['Hyperliquid HLP'];
    if(scenario==='only_hlp') {delete children['Hyperliquid Perps'];delete children['Hyperliquid Spot Orderbook'];children['Hyperliquid HLP']=110;}
    if(scenario==='invalid_child') children['Hyperliquid HLP']=true;
    if(scenario==='mismatch') raw.totalDataChart[0][1]=111;
    if(scenario==='methodology_changed') p.fee_normalization.expected_fee_methodologies={'Hyperliquid Perps':'Previously verified gross fees'};
    if(scenario==='ambiguous') {children['Hyperliquid HLP']=1e-8;raw.totalDataChart[0][1]=109+1e-8;}
    const audit=auditResponse(raw,p,1,'fees');
    assert.equal(audit.total,null,scenario);
    assert.equal(audit.matches,null,scenario);
    assert.equal(audit.issues.length,1,scenario);
  }
});
test('saved evidence hashes and daily sums reproduce all five projects and all three flow kinds',()=>{
  const snapshot=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  for(const p of snapshot.projects) {
    const source=buybackSource(p);
    assert.ok(source?.url.includes('dataType=dailyHoldersRevenue'));
    for(const kind of ['fees','revenue','holders']) {
      const s=p.data_sources.find(s=>s.kind===kind);
      const bytes=fs.readFileSync(new URL(s.response_path,new URL('../web/',import.meta.url)));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),s.stored_sha256);
      const raw=JSON.parse(bytes);
      for(const days of [7,30,90,365]) {
        const audit=auditResponse(raw,p,days,kind);
        assert.equal(audit.complete,p.windows[String(days)][kind].complete,`${p.ticker} ${days} ${kind} coverage`);
        assert.equal(audit.matches,audit.complete?true:null,`${p.ticker} ${days} ${kind} sum`);
        if (!audit.complete) assert.equal(p.windows[String(days)][kind].usd,null);
      }
    }
  }
});
