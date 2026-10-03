import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate, ledger, stress, annual, ratio} from '../web/core.js';

const emptyLedger = {circulating:1000,total:2000,burnTokens:0,burnFromFloatTokens:0,
  buybackToLockTokens:0,unlockTokens:0,reserveRewardsTokens:0,newEconomicSupplyTokens:0,
  newEconomicTokensToFloat:0,treasuryReleaseTokens:0,relockTokens:0,knownComplete:true};

test('unknown is not zero and zero is a valid cash flow',()=>{
  assert.equal(annual(null,30),null);
  assert.equal(annual(0,30),0);
  assert.equal(ratio(0,100),0);
  assert.equal(ratio(1,0),null);
  assert.equal(ledger({...emptyLedger,unlockTokens:null}).complete,false);
});
test('treasury stock burn reduces economic supply without reducing the float',()=>{
  const result=ledger({...emptyLedger,burnTokens:100,burnFromFloatTokens:0});
  assert.equal(result.totalChange,-100);
  assert.equal(result.floatChange,0);
});
test('burn can coexist with rising float; mint into a reserve does not enter the float',()=>{
  const result=ledger({...emptyLedger,burnTokens:100,burnFromFloatTokens:100,unlockTokens:250,
    newEconomicSupplyTokens:50,newEconomicTokensToFloat:0});
  assert.equal(result.totalChange,-50);
  assert.equal(result.floatChange,150);
});
test('booked but unminted reserve release changes float without increasing economic cap',()=>{
  const result=ledger({...emptyLedger,reserveRewardsTokens:75});
  assert.equal(result.totalChange,0);
  assert.equal(result.floatChange,75);
});
test('invalid float burn greater than economic burn is rejected',()=>{
  assert.equal(ledger({...emptyLedger,burnTokens:5,burnFromFloatTokens:10}).complete,false);
});
test('stress uses token units and changing buy price, not current price to invent burn units',()=>{
  const s=stress({baseAnnualUsd:1000,revenueFactor:.5,repurchasePrice:2,dilutionTokens:300,denominator:10000});
  assert.equal(s.purchased,250);
  assert.equal(s.netTokens,-50);
  assert.equal(s.netYield,-.01);
});
test('cash retention is not permanent burn; stocks are excluded from annualization',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  const ray=data.projects.find(x=>x.ticker==='RAY');
  const pump=data.projects.find(x=>x.ticker==='PUMP');
  const hype=data.projects.find(x=>x.ticker==='HYPE');
  assert.equal(calculate(ray,30,'reported').permanentProxyYieldMc,null);
  assert.equal(calculate({...ray,capture:{permanent_burn_proxy:false}},30,'reported').permanentProxyYieldMc,0);
  assert.equal(calculate(pump,365,'reported').holderAnnual,null);
  assert.equal(calculate(pump,365,'reported').permanentProxyYieldMc,null);
  assert.equal(calculate(hype,365,'reported').permanentProxyYieldMc,null);
  assert.ok(calculate(pump,30,'reported').permanentProxyYieldMc>0);
});
test('all projects share the same dated observation window and no false complete supply',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/dashboard.json',import.meta.url)));
  assert.equal(data.projects.length,5);
  for(const project of data.projects) {
    assert.equal(project.flow_end,data.completed_day_cutoff_utc);
    assert.equal(project.supply_ledger.complete,false);
    assert.equal(project.windows['30'].holders.end,data.completed_day_cutoff_utc);
  }
});
