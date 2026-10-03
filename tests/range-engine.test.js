import test from 'node:test';
import assert from 'node:assert/strict';
import {createRangeEngine} from '../web/range-engine.js';
import {createVerifiedReader} from '../web/data-loader.js';

const time=date=>Date.parse(date+'T00:00:00Z')/1000;
const payload=(amount,model=false)=>({id:'chain#bsc',category:'Chain',methodology:model?{Revenue:'Amount of 10% BNB transaction fees that were burned'}:{Fees:'Transaction fees paid by users'},totalDataChart:[[time('2026-10-01'),amount]]});
const project=()=>({ticker:'BNB',flow:{mode:'reserve_and_gas_burn'},windows:{},data_sources:[
  {kind:'chain_fees',response_path:'fees.json',sha256:'f'.repeat(64)},
  {kind:'gas_burn_policy_estimate',response_path:'model.json',sha256:'e'.repeat(64),assumed_ratio:.1,effective_from:'2021-11-30'},
  {kind:'burn_proof',response_path:'quarter-proof.json',sha256:'a'.repeat(64)},
  {kind:'gas_burn_policy',response_path:'current-getter.json',sha256:'b'.repeat(64)},
]});

test('custom worker loads only the two dedicated daily BNB responses and reuses pinned fetches across ranges',async()=>{
  const reads=[];
  const reader=createVerifiedReader(async path=>{reads.push(path);return new Response(JSON.stringify(payload(path==='fees.json'?100:10,path==='model.json')));},async bytes=>JSON.parse(new TextDecoder().decode(bytes)).methodology.Fees?'f'.repeat(64):'e'.repeat(64));
  const engine=createRangeEngine(reader),p=project(),before=structuredClone(p);
  const first=await engine([p],'2026-10-01','2026-10-01');
  assert.deepEqual(reads.sort(),['fees.json','model.json']);assert.deepEqual(first.errors,[]);
  assert.equal(first.projects[0].window.fees.usd,100);assert.equal(first.projects[0].window.gas_burn_estimate.usd,10);
  assert.equal(first.projects[0].window.revenue.usd,null);assert.equal(first.projects[0].window.holders.usd,null);
  const longer=await engine([p],'2026-09-30','2026-10-01');
  assert.equal(reads.length,2);assert.equal(longer.projects[0].window.gas_burn_estimate.usd,null);assert.deepEqual(p,before);
});

test('a failed model source leaves fees usable and other projects present; retry recomputes the dedicated window',async()=>{
  let fail=true;const p=project();
  const engine=createRangeEngine(async source=>{if(fail&&source.kind==='gas_burn_policy_estimate')throw Error('model fixture failed');return payload(source.kind==='chain_fees'?100:10,source.kind==='gas_burn_policy_estimate');});
  const another={ticker:'OTHER',data_sources:[],windows:{}};
  const first=await engine([p,another],'2026-10-01','2026-10-01');
  assert.equal(first.projects.length,2);assert.equal(first.errors.length,1);assert.match(first.errors[0],/BNB gas_burn_policy_estimate/);
  assert.equal(first.projects[0].window.fees.usd,100);assert.equal(first.projects[0].window.gas_burn_estimate.usd,null);
  fail=false;const retry=await engine([p,another],'2026-10-01','2026-10-01');assert.deepEqual(retry.errors,[]);assert.equal(retry.projects[0].window.gas_burn_estimate.usd,10);
});
