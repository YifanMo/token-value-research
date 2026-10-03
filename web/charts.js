import {known} from './core.js';

// Keep missing days on the x-axis so an absent observation breaks the line.
export function selectedChartData(project,start,end,mode) {
  const daily=new Map((project.history||[]).map(row=>[row.date,row]));
  const first=Date.parse(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z');
  const days=Math.round((last-first)/86400000)+1;
  const monthly=mode==='revenue' && days>90;
  const researchStart=project.custom_range?.research_start || project.history_coverage?.fees?.normalized?.first || (project.history||[]).find(row=>known(row.fees))?.date;
  const buckets=new Map();
  for(let time=first;time<=last;time+=86400000) {
    const date=new Date(time).toISOString().slice(0,10),row=daily.get(date)||{},key=monthly?date.slice(0,7):date;
    if(!buckets.has(key)) buckets.set(key,{date:key,expected:0,revenue:0,holders:0,revenueDays:0,holderDays:0,price:null,btc:null,sol:null});
    const bucket=buckets.get(key);bucket.expected++;
    for(const kind of ['revenue','holders']) {
      const confirmedZero=researchStart && date>=researchStart && project.zero_before?.[kind] && date<project.zero_before[kind];
      const value=known(row[kind])?row[kind]:confirmedZero?0:null;
      if(known(value)){bucket[kind]+=value;bucket[kind==='revenue'?'revenueDays':'holderDays']++;}
    }
    for(const kind of ['price','btc','sol']) if(known(row[kind]) && row[kind]>0) bucket[kind]=row[kind];
  }
  const rows=[...buckets.values()].map(row=>({...row,revenue:row.revenueDays===row.expected?row.revenue:null,holders:row.holderDays===row.expected?row.holders:null}));
  const seriesNames=mode==='price'?['price','btc','sol']:project.flow?.revenue_is_income===false?['holders']:['revenue','holders'];
  if(mode==='price') {
    const origin=rows.find(row=>known(row.price)&&known(row.btc)&&known(row.sol)) || rows.find(row=>known(row.price));
    const basis=origin?{...origin}:null;
    for(const row of rows) for(const kind of seriesNames) row[kind]=basis && row.date>=basis.date && known(row[kind]) && known(basis[kind]) && basis[kind]>0?row[kind]/basis[kind]*100:null;
    return {rows,seriesNames,monthly:false,origin:origin?.date||null};
  }
  return {rows,seriesNames,monthly,origin:null};
}
