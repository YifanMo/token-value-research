import {calculate, calculateReferenceMultiples, known} from './core.js';
import {isReserveBurn} from './models.js';
import {bnbAnnualBurnStats} from './burns.js';

export const COMPARISON_SORT_KEYS = Object.freeze([
  'ticker', 'name', 'marketCap', 'fdv', 'revenue', 'yieldMc', 'yieldFdv',
  'psMc', 'psFdv', 'holderPeMc', 'holderPeFdv', 'projectPeMc',
  'projectPeFdv', 'revenueShare', 'holderCapture',
]);

const keys = new Set(COMPARISON_SORT_KEYS);
const textKeys = new Set(['ticker', 'name']);
const collator = new Intl.Collator('en', {numeric:true, sensitivity:'base'});

// Use the same calculations as the comparison cells. Quarterly burns have a
// separately labeled trailing-year valuation, never an income denominator.
export function comparisonSortValue(project, key, {days=30, end, valuationBasis='reported'}={}) {
  if (!keys.has(key)) return null;
  if (textKeys.has(key)) {
    const value=project[key];
    return typeof value==='string' && value.trim() ? value : null;
  }
  if (key==='marketCap') return known(project.market?.market_cap) ? project.market.market_cap : null;
  const metrics=calculate(project, days, valuationBasis);
  if (key==='fdv') return known(metrics.fdv) ? metrics.fdv : null;
  if (isReserveBurn(project)) {
    if (!['yieldMc','yieldFdv','holderPeMc','holderPeFdv'].includes(key)) return null;
    const cutoff=end || project.burns?.cutoff_utc || project.flow_end;
    if (!cutoff) return null;
    const annual=bnbAnnualBurnStats(project,cutoff,{fdv:metrics.fdv});
    const value=annual[{yieldMc:'yieldMc',yieldFdv:'yieldFdv',holderPeMc:'multipleMc',holderPeFdv:'multipleFdv'}[key]];
    return known(value) ? value : null;
  }

  let value;
  switch (key) {
    case 'revenue': value=metrics.revenue; break;
    case 'yieldMc': value=metrics.grossYieldMc; break;
    case 'yieldFdv': value=metrics.grossYieldFdv; break;
    case 'revenueShare': value=metrics.revenueShare; break;
    case 'holderCapture': value=metrics.holderCapture; break;
    case 'projectPeMc': value=metrics.netIncomeStatus==='positive' ? metrics.peMc : null; break;
    case 'projectPeFdv': value=metrics.netIncomeStatus==='positive' ? metrics.peFdv : null; break;
    default: {
      const reference=calculateReferenceMultiples(project, days, valuationBasis);
      value=reference[{
        psMc:'psMc', psFdv:'psFdv', holderPeMc:'peMc', holderPeFdv:'peFdv',
      }[key]];
    }
  }
  return known(value) ? value : null;
}

// Missing/not-applicable values remain last in either direction. Original
// positions resolve equal values so changing filters does not scramble ties.
export function sortProjects(projects, sort={}, context={}) {
  const {key, direction='desc'}=sort || {};
  if (!keys.has(key)) return [...projects];
  const sign=direction==='asc' ? 1 : -1;
  const isText=textKeys.has(key);
  return projects.map((project,index)=>({project,index,value:comparisonSortValue(project,key,context)}))
    .sort((a,b)=>{
      if (a.value===null || b.value===null) {
        if (a.value===null && b.value===null) return a.index-b.index;
        return a.value===null ? 1 : -1;
      }
      const order=isText ? collator.compare(a.value,b.value) : a.value===b.value ? 0 : a.value<b.value ? -1 : 1;
      return order*sign || a.index-b.index;
    })
    .map(row=>row.project);
}
