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
