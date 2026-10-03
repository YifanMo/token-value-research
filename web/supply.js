import {known} from './core.js';

const day = 86400000;
const dateValue = value => {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const result=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(result) && new Date(result).toISOString().slice(0,10)===value ? result : NaN;
};

// A dated schedule describes entitlement/budget, not a verified future sale or float.
// Windows are (asOf, asOf + days], in UTC dates. Categories are never summed blindly.
export function componentAmount(component, asOf, days) {
  const start=dateValue(asOf), end=start+days*day;
  if (!Number.isFinite(start) || !Number.isInteger(days) || days<=0) return null;
  if (component.mode==='unknown') return null;
  if (component.mode==='zero') return 0;
  if (component.mode==='capacity') return known(component.max_tokens)&&component.max_tokens>=0?component.max_tokens:null;
  if (component.mode==='events') {
    if (!Array.isArray(component.events) || component.events.some(x=>!Number.isFinite(dateValue(x.date)) || !known(x.tokens) || x.tokens<0)) return null;
    // Zero is known only inside the supplied schedule's explicit coverage interval.
    const coverageStart=dateValue(component.coverage_start), coverageEnd=dateValue(component.coverage_end);
    if (!Number.isFinite(coverageStart) || !Number.isFinite(coverageEnd) || start<coverageStart || end>coverageEnd) return null;
    return component.events.filter(x=>dateValue(x.date)>start && dateValue(x.date)<=end).reduce((sum,x)=>sum+x.tokens,0);
  }
  if (component.mode==='linear') {
    const a=dateValue(component.start), b=dateValue(component.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b<=a || !known(component.tokens) || component.tokens<0) return null;
    const overlap=Math.max(0,Math.min(end,b)-Math.max(start,a));
    return component.tokens*overlap/(b-a);
  }
  if (component.mode==='annual_rate') {
    if (!known(component.annual_tokens) || component.annual_tokens<0) return null;
    return component.annual_tokens*days/365;
  }
  return null;
}

// Describe ONE component's future window without extending its schedule or
// adding alternative/overlapping components. `amount` keeps componentAmount's
// full-window meaning. `known_amount` is only the sum within explicit dated
// coverage; it can be zero while the rest of the window is unknown.
// A rate projection or permission ceiling has an `amount`, but no dated known
// portion: check status/amount_kind rather than calling it confirmed release.
export function componentWindowSummary(component, asOf, days) {
  const anchor=dateValue(asOf), end=anchor+days*day;
  const validWindow=Number.isFinite(anchor) && Number.isInteger(days) && days>0 &&
    Number.isFinite(end) && end<=dateValue('9999-12-31');
  const result={mode:component?.mode || null,evidence:component?.evidence || 'unknown',
    amount:null,known_amount:null,status:validWindow?'unknown':'invalid',complete:false,
    amount_kind:'unknown',as_of:asOf,days,start:null,end:null,
    coverage_start:component?.coverage_start || null,coverage_end:component?.coverage_end || null,
    known_start:null,known_end:null,covered_days:validWindow?0:null,missing_days:validWindow?days:null,
    gaps:[],reason:validWindow?'schedule_unknown':'invalid_window'};
  if (!validWindow) return result;
  const date=time=>new Date(time).toISOString().slice(0,10);
  const first=anchor+day;
  result.start=date(first);result.end=date(end);
  const gap=(start,finish,reason)=>({start:date(start),end:date(finish),days:Math.round((finish-start)/day)+1,reason});
  const unknown=(reason,status='unknown')=>({...result,status,reason,gaps:[gap(first,end,reason)]});
  if (!component || typeof component!=='object' || component.mode==='unknown') return unknown('schedule_unknown');
  if (component.mode==='events') {
    const coverageStart=dateValue(component.coverage_start), coverageEnd=dateValue(component.coverage_end);
    if (!Number.isFinite(coverageStart) || !Number.isFinite(coverageEnd) || coverageStart>coverageEnd)
      return unknown('invalid_coverage','invalid');
    if (!Array.isArray(component.events) || component.events.some(event=>!event ||
      !Number.isFinite(dateValue(event.date)) || !known(event.tokens) || event.tokens<0))
      return unknown('invalid_events','invalid');
    // Dates outside a declared interval cannot establish that interval's full
    // schedule. Keep inconsistent source metadata visibly unknown.
    if (component.events.some(event=>event.date<component.coverage_start || event.date>component.coverage_end))
      return unknown('events_outside_coverage','invalid');
    const knownFirst=Math.max(first,coverageStart),knownLast=Math.min(end,coverageEnd);
    if (knownFirst>knownLast) return unknown('outside_coverage');
    const knownAmount=component.events.filter(event=>dateValue(event.date)>=knownFirst && dateValue(event.date)<=knownLast)
      .reduce((sum,event)=>sum+event.tokens,0);
    if (!known(knownAmount)) return unknown('nonfinite_amount','invalid');
    const amount=componentAmount(component,asOf,days);
    const coveredDays=Math.round((knownLast-knownFirst)/day)+1;
    const gaps=[];
    if (first<knownFirst) gaps.push(gap(first,knownFirst-day,'before_coverage'));
    if (knownLast<end) gaps.push(gap(knownLast+day,end,'after_coverage'));
    return {...result,amount:known(amount)?amount:null,known_amount:knownAmount,
      status:known(amount)?'complete':'partial',complete:known(amount),amount_kind:'scheduled',
      known_start:date(knownFirst),known_end:date(knownLast),covered_days:coveredDays,missing_days:days-coveredDays,
      gaps,reason:known(amount)?null:gaps.length?'incomplete_coverage':'anchor_before_coverage'};
  }
  if (!['zero','linear','annual_rate','capacity'].includes(component.mode)) return unknown('unsupported_mode');
  const amount=componentAmount(component,asOf,days);
  if (!known(amount)) return unknown('invalid_component','invalid');
  if (component.mode==='annual_rate' || component.mode==='capacity') return {...result,amount,
    status:component.mode==='annual_rate'?'projection':'upper_bound',amount_kind:component.mode==='annual_rate'?'projection':'upper_bound',
    covered_days:null,missing_days:null,reason:component.mode==='annual_rate'?'rate_projection':'permission_ceiling'};
  return {...result,amount,known_amount:amount,status:'complete',complete:true,
    amount_kind:component.mode==='zero'?'zero_component':'linear_model',known_start:result.start,known_end:result.end,
    covered_days:days,missing_days:0,reason:null};
}

export function nextEvent(component, asOf) {
  const start=dateValue(asOf);
  if (!Number.isFinite(start) || component.mode!=='events') return null;
  return [...(component.events||[])].filter(x=>dateValue(x.date)>start).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
}

// Alternative models for the same allocation are mutually exclusive, and mint
// authority is not a forecast of exercised minting. This helper is for scenarios.
export function scenarioAmount(forecast, ids, asOf, days=365) {
  if (!forecast || !Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length) return null;
  const components=ids.map(id=>forecast.components.find(c=>c.id===id));
  if (components.some(c=>!c || !c.usable_in_float_scenario)) return null;
  const groups=components.map(c=>c.overlap_group||c.id);
  if (new Set(groups).size!==groups.length) return null;
  const values=components.map(c=>componentAmount(c,asOf,days));
  return values.every(known)?values.reduce((sum,x)=>sum+x,0):null;
}
