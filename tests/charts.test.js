import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedChartData} from '../web/charts.js';

test('selected days and missing observations stay on the chart axis',()=>{
  const project={history:[{date:'2024-01-01',fees:5,revenue:2,holders:1},{date:'2024-01-03',fees:5,revenue:3,holders:2},{date:'2024-02-01',fees:99,revenue:99,holders:99}]};
  const data=selectedChartData(project,'2024-01-01','2024-01-03','revenue');
  assert.equal(data.rows.length,3);
  assert.equal(data.rows[1].revenue,null);
  assert.equal(data.rows[2].revenue,3);
  assert.equal(data.monthly,false);
});

test('partial boundary months use only selected days and each series has its own completeness',()=>{
  const history=[];
  for(let time=Date.parse('2024-01-31');time<=Date.parse('2024-05-01');time+=86400000){const date=new Date(time).toISOString().slice(0,10);history.push({date,fees:1,revenue:date==='2024-02-02'?null:1,holders:2});}
  const data=selectedChartData({history},'2024-01-31','2024-05-01','revenue');
  assert.equal(data.monthly,true);
  assert.equal(data.rows[0].expected,1);
  assert.equal(data.rows[0].revenue,1);
  assert.equal(data.rows[1].revenue,null);
  assert.equal(data.rows[1].holders,58);
  assert.equal(data.rows.at(-1).holders,2);
});

test('confirmed policy zeros cannot make pre-protocol days look observed',()=>{
  const project={zero_before:{holders:'2024-03-01'},history:[{date:'2024-01-02',fees:10,revenue:2}]};
  const data=selectedChartData(project,'2024-01-01','2024-01-02','revenue');
  assert.equal(data.rows[0].holders,null);
  assert.equal(data.rows[1].holders,0);
});

test('price comparison uses one common date and preserves missing days',()=>{
  const project={history:[{date:'2024-01-01',btc:5,sol:2},{date:'2024-01-02',price:10,btc:10,sol:5},{date:'2024-01-03',price:null,btc:12,sol:6},{date:'2024-01-04',price:12,btc:15,sol:10}]};
  const data=selectedChartData(project,'2024-01-01','2024-01-04','price');
  assert.equal(data.origin,'2024-01-02');
  assert.equal(data.rows[0].btc,null);
  assert.equal(data.rows[1].price,100);
  assert.equal(data.rows[2].price,null);
  assert.equal(data.rows[3].price,120);
  assert.equal(data.rows[3].btc,150);
});
