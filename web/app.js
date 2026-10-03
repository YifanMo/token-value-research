import {calculate, calculateReferenceMultiples, known, ratio} from './core.js';
import {componentAmount, componentWindowSummary, nextEvent} from './supply.js';
import {buybackSource, auditResponse, sourceIssueSummary} from './sources.js';
import {moneyFlowMarkup,connectMoneyFlow} from './flow-view.js';
import {buildConclusion} from './conclusions.js';
import {validateDateRange} from './periods.js';
import {selectedChartData} from './charts.js';
import {HistoryLoader} from './data-loader.js';
import {isReserveBurn, statisticLabel, isHypeFeeReconciliation, captureBadge} from './models.js';
import {burnFinancialMarkup, burnStats, quarterComparisonMarkup} from './burns.js';
import {feeReconciliationMarkup} from './fee-view.js';

const valuationBasis = 'reported';
const state = {days:30, ticker:'HYPE', event:null, preset:30, start:null, end:null};
let snapshot;
let baseSnapshot;
let historyLoader;
let rangeWorker;
const rangePending=new Map(), rangeCache=new Map(), chartRequests=new Map(), chartErrors=new Map();
const historyReadErrors=[];
let rangeRequestId=0;
let sourceRequest;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct = value => known(value) ? `${(value*100).toFixed(2)}%` : '—';
const amount = (value, currency = false) => {
  if (!known(value)) return '—';
  const prefix = currency ? '$' : '';
  const abs = Math.abs(value);
  return prefix+(abs >= 1e9 ? `${(value/1e9).toFixed(2)}B` : abs >= 1e6 ? `${(value/1e6).toFixed(2)}M` : abs >= 1e3 ? `${(value/1e3).toFixed(2)}K` : value.toLocaleString('en-US',{maximumFractionDigits:4}));
};
const price = value => known(value) ? '$'+value.toLocaleString('en-US',{maximumFractionDigits:value<.01?8:2}) : '—';
const signed = value => known(value) ? `${value>0?'+':''}${pct(value)}` : '缺数据';
const metricPair = (a,b) => `${pct(a)} <span class="number-sub">${pct(b)}</span>`;
const multiple = value => known(value) ? `${value.toFixed(2)}x` : '—';
const incomeLabels={missing:'缺完整净利润',not_applicable:'销毁机制，P/E不适用',period_mismatch:'利润期间不匹配',scope_unverified:'利润口径待核',costs_incomplete:'成本未完整扣除',oneoffs_unseparated:'一次性项目未拆分',source_missing:'缺利润数据来源',loss:'亏损，P/E不适用',zero:'净利为零，P/E不适用',positive:'净利润口径已核对'};
const incomeLabel=(project,status)=>status==='missing'&&!project.financials?.net_income_windows?'未接入净利润数据':incomeLabels[status];
const link = source => `<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)}</a>`;
const evidenceNames = {official:'官方排期',contract:'原合约资格',tracker:'第三方模型',run_rate:'当前速度外推',scenario:'情景假设',reported_plan:'二级报道拟执行',approved_policy:'已通过政策',ended:'原排期已结束',authority:'权限上限',protocol_policy:'现行协议规则',unknown:'尚未核实'};
const primaryComponent = project => project.supply_forecast?.components?.find(c=>c.id===project.supply_forecast.overview_component_id);
function supplyWindowMarkup(project, component, days, showRatio=false) {
  const summary=componentWindowSummary(component,snapshot.as_of,days);
  const value=known(summary.amount)?summary.amount:summary.known_amount;
  if (!known(value)) return '<span>未公布</span><span class="number-sub">'+esc(component?.missing_label||'缺少可用排期')+'</span>';
  const prefix=component?.display_prefix||(summary.status==='projection'||['scenario','tracker'].includes(component?.evidence)?'约':summary.status==='upper_bound'?'最多':'');
  const suffix=summary.status==='partial'?'（已列部分）':'';
  const detail=summary.status==='partial'?`${['scenario','tracker'].includes(component?.evidence)?'模型列至':'排期至'}${summary.known_end} · 未覆盖${summary.missing_days}天`
    :summary.status==='projection'?'政策／速率延续情景'
    :summary.status==='upper_bound'?'权限上限，不是预计释放'
    :evidenceNames[component?.evidence]||'已登记项目';
  return `${esc(prefix)}${amount(value)}${suffix}<span class="number-sub">${esc(detail)}</span>${showRatio?`<span class="number-sub">${pct(ratio(value,project.market.circulating_supply))} / 当前流通</span>`:''}`;
}

function supplyReference(project) {
  const component=primaryComponent(project);
  return `<button class="metric-button" data-supply="${esc(project.ticker)}" aria-label="${esc(project.ticker)} 查看未来释放依据">${supplyWindowMarkup(project,component,365,true)}<span class="stat-method">${esc(component?.label||'未来释放未披露')} ↗</span>${project.supply_forecast?.overview_note?`<span class="stat-method">${esc(project.supply_forecast.overview_note)}</span>`:''}</button>`;
}

function openSupply(ticker) {
  const project=snapshot.projects.find(item=>item.ticker===ticker),forecast=project?.supply_forecast;
  if(!project) return;
  $('#source-title').textContent=`${ticker} · 未来释放依据`;
  $('#source-content').innerHTML=`<div class="source-meaning"><p>未来窗口从${esc(snapshot.as_of)}起算；展示具体释放项目，不代表全年全部流通增量。模型、预算与实际分发分别标明。</p>${forecast?.response_path?`<p>${link({title:'本次排期 JSON ↗',url:forecast.response_path})}</p><p>保存文件 SHA-256：<code>${esc(forecast.stored_sha256)}</code></p>`:''}</div>${supplyDetailMarkup(project)}`;
  if(!$('#source-dialog').open) $('#source-dialog').showModal();
}

const startForDays=(end,days)=>new Date(Date.parse(end+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
const earliestHistory=()=>baseSnapshot.history_earliest || baseSnapshot.projects.flatMap(project=>project.history||[]).map(row=>row.date).sort()[0];

function calculateRangeInWorker(start,end,id) {
  const key=`${start}:${end}`;
  if (rangeCache.has(key)) return Promise.resolve(rangeCache.get(key));
  if (!rangeWorker) {
    try {rangeWorker=new Worker(new URL('./range-worker.js',import.meta.url),{type:'module'});}
    catch {return Promise.reject(Error('浏览器无法启动后台计算，请使用支持模块 Worker 的浏览器'));}
    const worker=rangeWorker;
    rangeWorker.addEventListener('message',event=>{
      const pending=rangePending.get(event.data.id);
      if (!pending) return;
      rangePending.delete(event.data.id);
      if (event.data.error) pending.reject(Error(event.data.error));
      else pending.resolve(event.data.result);
    });
    const failed=()=>{
      if(rangeWorker!==worker) return;
      for(const pending of rangePending.values()) pending.reject(Error('后台历史计算失败，请重试'));
      rangePending.clear();rangeWorker?.terminate();rangeWorker=null;
    };
    rangeWorker.addEventListener('error',failed);
    rangeWorker.addEventListener('messageerror',failed);
  }
  return new Promise((resolve,reject)=>{
    rangePending.set(id,{resolve:result=>{
      if (!result.errors.length) {
        if(rangeCache.size>=8) rangeCache.delete(rangeCache.keys().next().value);
        rangeCache.set(key,result);
      }
      resolve(result);
    },reject});
    const projects=baseSnapshot.projects.map(({history,...project})=>project);
    try {rangeWorker.postMessage({id,start,end,projects});}
    catch(error){rangePending.delete(id);reject(error);}
  });
}

function setRangeBusy(busy) {
  $('#research-controls').setAttribute('aria-busy',busy);
  document.querySelectorAll('.period button,#custom-range-form button,#custom-range-form input').forEach(control=>control.disabled=busy);
  if (busy) $('#range-error').textContent='正在加载并核对所选时间段，请稍候…';
}

async function applyRange(start,end,preset=null) {
  const valid=validateDateRange(start,end,earliestHistory(),baseSnapshot.completed_day_cutoff_utc);
  if (!valid.valid) {$('#range-error').textContent=valid.error;return false;}
  const requestId=++rangeRequestId;
  const cachedPreset=preset && [7,30,90,365].includes(preset) && end===baseSnapshot.completed_day_cutoff_utc;
  setRangeBusy(true);
  try {
    const result=cachedPreset?null:await calculateRangeInWorker(start,end,requestId);
    if (requestId!==rangeRequestId) return false;
    historyReadErrors.splice(0,historyReadErrors.length,...(result?.errors||[]));
    const byTicker=new Map(result?.projects.map(project=>[project.ticker,project])||[]);
    snapshot=cachedPreset?baseSnapshot:{...baseSnapshot,projects:baseSnapshot.projects.map(project=>{
      const computed=byTicker.get(project.ticker);
      return {...project,windows:{...project.windows,[String(valid.days)]:computed.window},custom_range:computed.custom_range};
    })};
    Object.assign(state,{start,end,days:valid.days,preset,event:null});
    $('#range-error').textContent='';
    render();
    return true;
  } catch(error) {
    if(requestId===rangeRequestId) $('#range-error').textContent=error.message;
    return false;
  } finally {
    if (requestId===rangeRequestId) setRangeBusy(false);
  }
}

function toggleCustomRange(open) {
  $('#custom-range-form').hidden=!open;
  $('#custom-range-toggle').setAttribute('aria-expanded',open);
  if (open) {$('#range-start').value=state.start;$('#range-end').value=state.end;}
}

function financialCells(project,m) {
  const ticker=esc(project.ticker);
  if (isReserveBurn(project)) return ['收入倍数','持币者回报倍数','净利润P/E','协议收入占手续费','回购占收入'].map(label=>`<td class="financial-value"><button class="metric-button" data-financial="${ticker}" aria-label="${ticker} ${label}为什么不适用">不适用<span class="number-sub">储备 / Gas销毁</span></button></td>`).join('');
  const ref=calculateReferenceMultiples(project,state.days,valuationBasis);
  const holderPe=`${multiple(ref.peMc)}<span class="number-sub">${multiple(ref.peFdv)}</span>${ref.containsOneoff?'<span class="stat-method">历史统计，库存事件未对账</span>':''}`;
  const projectPe=m.netIncomeStatus==='positive' ? `${multiple(m.peMc)}<span class="number-sub">${multiple(m.peFdv)}</span>` : `${['loss','zero'].includes(m.netIncomeStatus)?'不适用':'—'}<span class="number-sub">${esc(incomeLabel(project,m.netIncomeStatus))}</span>`;
  const ps=`${multiple(ref.psMc)}<span class="number-sub">${multiple(ref.psFdv)}</span>${ref.revenueStatus==='valuation_only'?'<span class="stat-method">兑换估值分母，非营业收入</span>':''}`;
  const share=project.fee_normalization?`<button class="metric-button" data-financial="${ticker}" aria-label="${ticker} 手续费分成与去重口径">${pct(m.revenueShare)}<span class="number-sub">总手续费分母 · 已去重<br>${isHypeFeeReconciliation(project)?'99%规则与拆分':'费用去重核对'} ↗</span></button>`:pct(m.revenueShare);
  return `<td class="financial-value"><button class="metric-button" data-financial="${ticker}" aria-label="${ticker} P/S计算口径">${ps}</button></td><td class="financial-value"><button class="metric-button" data-financial="${ticker}" aria-label="${ticker} 持币者回报倍数计算口径">${holderPe}</button></td><td class="financial-value"><button class="metric-button" data-financial="${ticker}" aria-label="${ticker} 项目净利润P/E计算口径">${projectPe}</button></td><td class="financial-value">${share}</td><td class="financial-value">${pct(m.holderCapture)}</td>`;
}

const feeReconciliation = feeReconciliationMarkup;

function render() {
  $('#snapshot-date').textContent = `研究截至 ${snapshot.as_of} · 收入截至已完成UTC日 ${snapshot.completed_day_cutoff_utc}`;
  $('#period-note').textContent = `${state.start} → ${state.end} · ${state.days}天 · UTC`;
  $('#token-count').textContent = `共 ${snapshot.projects.length} 个代币`;
  $('#token-selector').value = state.ticker;
  document.querySelectorAll('[data-days]').forEach(button => button.setAttribute('aria-pressed',Number(button.dataset.days)===state.preset));
  $('#custom-range-toggle').setAttribute('aria-pressed',state.preset===null);
  if($('#custom-range-form').hidden) {$('#range-start').value=state.start;$('#range-end').value=state.end;}
  $('#range-context').textContent=`${state.start} → ${state.end} · ${state.days}个UTC日（含首尾）；市值、供应和未来排期仍采用当前快照。`;
  $('#comparison-body').innerHTML = snapshot.projects.map(project => {
    const m = calculate(project,state.days,valuationBasis);
    const source=buybackSource(project);
    return `<tr class="${state.ticker===project.ticker?'selected':''}"><td><button class="token-select" data-token="${esc(project.ticker)}" aria-pressed="${state.ticker===project.ticker}"><strong>${esc(project.ticker)} <span class="number-sub">${esc(project.name)}</span></strong><span>${esc(project.capture.label)}</span></button></td><td>${amount(project.market.market_cap,true)}</td><td>${amount(m.fdv,true)}</td><td>${isReserveBurn(project)?'不适用':m.revenueStatus==='valuation_only'?'待核收入':amount(m.revenue,true)}<span class="number-sub">${isReserveBurn(project)?'BSC链手续费 '+amount(m.fees,true)+' · '+state.days+'天':m.revenueStatus==='valuation_only'?statisticLabel(project)+' '+amount(m.reportedRevenue,true):`${state.days}天 / ${esc(state.end)}`}</span>${!isReserveBurn(project)&&m.coverage?.revenue?.complete===false?`<span class="stat-method">仅覆盖${m.coverage.revenue.coverage_days}/${state.days}天</span>`:''}${project.ticker==='JUP'?'<span class="number-sub">含覆盖重叠，待去重</span>':''}${project.flow_normalizations?'<span class="number-sub">已剔除已核重复项</span>':''}</td><td>${isReserveBurn(project)?quarterComparisonMarkup(project,state.start,state.end):metricPair(m.grossYieldMc,m.grossYieldFdv)}${isReserveBurn(project)?'':`<span class="stat-method">${esc(project.capture.stat_label)}</span>`}</td><td class="accent">${supplyReference(project)}</td>${financialCells(project,m)}<td class="source-cell"><span class="source-provider">${esc(project.ticker)} · ${esc(source?.provider || (isReserveBurn(project)?'链上核验记录':'DefiLlama'))}</span><button class="source-open" data-source="${esc(project.ticker)}" aria-label="${esc(project.ticker)} 查看本次 API 返回">${isReserveBurn(project)?'查看已核销毁记录':'查看本次 API 返回'}</button>${source?link({title:'在线 API ↗',url:source.url}):isReserveBurn(project)?link({title:'季度记录在线 API ↗',url:project.burns?.quarterly_records?.find(record=>record.verified)?.source_url}):'<span class="muted">来源缺失</span>'}</td></tr>`;
  }).join('');
  const missing = Object.entries(snapshot.source_status).filter(([,value])=>value.status==='missing');
  const stale = snapshot.projects.filter(p=>(!isReserveBurn(p)&&p.flow_lag_days>0) || p.market_lag_days>0);
  const failed = Object.entries(snapshot.source_status).filter(([,value])=>value.refresh_error && value.status!=='missing').map(([key,value])=>sourceIssueSummary(key,value,snapshot.projects));
  $('#errors').innerHTML = (missing.length ? `<p class="alert">${missing.length}个来源暂缺，相应价格、基准或链上供应字段显示缺数据；不会推定为0。</p>` : '')+(stale.length ? `<p class="alert">${stale.map(p=>esc(p.ticker)).join('、')}有滞后数据，查看项目来源时间；不能作为实时估值。</p>` : '')+(failed.length ? `<div class="alert">${failed.map(issue=>`<p><strong>${esc(issue.name)}更新未成功：${esc(issue.cause)}</strong><br>${esc(issue.impact)} 上次成功抓取：${esc(issue.lastSuccess || '未知')}。 ${link({title:'查看接口 ↗',url:issue.url})}</p>`).join('')}</div>` : '')+(snapshot!==baseSnapshot&&historyReadErrors.length?`<details class="alert"><summary>${historyReadErrors.length}份历史归档未通过读取或哈希核对，相应金额显示缺数据</summary><p>${historyReadErrors.map(esc).join('<br>')}</p></details>`:'');
  renderSupplyOverview();
  document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',()=>openSource(button.dataset.source)));
  document.querySelectorAll('[data-supply]').forEach(button=>button.addEventListener('click',()=>openSupply(button.dataset.supply)));
  document.querySelectorAll('[data-financial]').forEach(button=>button.addEventListener('click',()=>openFinancial(button.dataset.financial)));
  document.querySelectorAll('[data-token]').forEach(button => button.addEventListener('click',()=>selectToken(button.dataset.token,true)));
  document.querySelectorAll('[data-quarter-plan]').forEach(button=>button.addEventListener('click',()=>{
    selectToken(button.dataset.quarterPlan);
    $('#bnb-quarterly-plan')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  renderDetail();
}

function selectToken(ticker,scrollToDetail=false) {
  if (!snapshot.projects.some(project=>project.ticker===ticker)) return;
  state.ticker=ticker;
  state.event=null;
  $('#token-selector').value=ticker;
  document.querySelectorAll('[data-token]').forEach(button=>{
    const selected=button.dataset.token===ticker;
    button.setAttribute('aria-pressed',selected);
    button.closest('tr')?.classList.toggle('selected',selected);
  });
  renderDetail();
  if (scrollToDetail) $('#detail').scrollIntoView({behavior:'auto',block:'start'});
}

async function openFinancial(ticker) {
  const project=snapshot.projects.find(p=>p.ticker===ticker), days=state.days;
  if (isReserveBurn(project)) {
    sourceRequest?.abort();
    $('#source-title').textContent=`${ticker} · 已核销毁记录与估值口径`;
    $('#source-content').innerHTML=burnFinancialMarkup(project,state.start,state.end);
    if (!$('#source-dialog').open) $('#source-dialog').showModal();
    $('#source-dialog').scrollTop=0;
    return;
  }
  const m=calculate(project,days,valuationBasis), w=m.coverage?.revenue;
  const ref=calculateReferenceMultiples(project,days,valuationBasis);
  const exactUsd=value=>known(value)?'$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const earnings=project.financials?.net_income_windows?.[String(days)];
  sourceRequest?.abort();
  const request=new AbortController();sourceRequest=request;
  $('#source-title').textContent=`${ticker} · 财务指标与计算口径`;
  $('#source-content').innerHTML=`<div class="financial-dialog-summary"><div><span>协议收入倍数 P/S</span><strong>${multiple(ref.psMc)}</strong><small>FDV ${multiple(ref.psFdv)}</small></div><div><span>持币者回报倍数 · 回购／销毁统计</span><strong>${multiple(ref.peMc)}</strong><small>FDV ${multiple(ref.peFdv)}</small></div><div><span>项目净利润 P/E</span><strong>${m.netIncomeStatus==='positive'?multiple(m.peMc):['loss','zero'].includes(m.netIncomeStatus)?'不适用':'待核'}</strong><small>${esc(incomeLabel(project,m.netIncomeStatus))}</small></div></div>
  <div class="source-formula"><h3>持币者回报倍数：市值 ÷ 年化回购／销毁统计</h3><p>期间 ${esc(w?.start)} → ${esc(w?.end)}；API持有人统计 ${exactUsd(ref.holderUsd)} × 365 ÷ ${days} = 年化 ${exactUsd(ref.holderAnnual)}。流通市值 ÷ 年化统计 = <strong>${multiple(ref.peMc)}</strong>；FDV ÷ 年化统计 = <strong>${multiple(ref.peFdv)}</strong>。回购或销毁不代表持币人直接收到现金。</p><p>${esc(project.capture.stat_note)} ${ref.containsOneoff?'所选窗口跨存量事件，历史API总额仍可求倍数，但不能当成持续盈利或未来回购能力。':''}</p></div>
  <div class="source-formula"><h3>参考 P/S：收入字段倍数</h3><p>同窗API收入字段（采用本地归一化金额）${exactUsd(ref.revenueUsd)} × 365 ÷ ${days} = 年化 ${exactUsd(ref.revenueAnnual)}。流通市值 / FDV ÷ 该金额 = <strong>${multiple(ref.psMc)} / ${multiple(ref.psFdv)}</strong>。</p><p>${ref.revenueStatus==='valuation_only'?statisticLabel(project)+'仅作原字段倍数；独立营业收入的P/S仍未知。':ref.revenueStatus==='incomplete'?'窗口缺少完整归一化收入，未用原始重复额或已观察部分补齐。':'以当前统计范围计算，未扣完整经营成本。'} ${project.ticker==='JUP'?'JUP仍含业务覆盖重叠，未宣称完全去重。':''} ${ref.notes.map(esc).join(' ')}</p></div>
  ${m.revenueStatus==='valuation_only'?`<div class="source-meaning"><h3>${esc(project.ticker)}的真实手续费收入尚未独立取得</h3><p>本次API revenue字段 ${exactUsd(m.reportedRevenue)} 属于${esc(statisticLabel(project))}，不能拿来作为独立营业收入口径P/S的分母。已收费用资产、兑换价值与现金买入成本需要分别对账。${link({title:'源码与核对依据',url:project.flow.source_note_url})}</p></div>`:''}
  ${feeReconciliation(project,m)}
  <div class="source-formula"><h3>市销率 P/S：用收入衡量价格</h3><p>收入期间 ${esc(w?.start)} → ${esc(w?.end)}；${w?.complete===false?'窗口缺完整金额，不补齐或年化':days===365?'完整365天总额':'按所选'+days+'天收入折算一年，属于该期间的平均统计速度'}。</p><p>年收入 = ${exactUsd(m.revenue)} × 365 ÷ ${days} = <strong>${exactUsd(m.revenueAnnual)}</strong>。</p><p>流通市值 ${exactUsd(project.market.market_cap)} ÷ 年收入 = <strong>${multiple(m.psRevenueMc)}</strong>；CoinGecko FDV ${exactUsd(m.fdv)} ÷ 同一年收入 = <strong>${multiple(m.psRevenueFdv)}</strong>。</p><p>分母使用协议自己得到的收入，扣除了部分 LP、creator 等分成；它还没有扣完整经营成本。协议收入的统计范围与上市公司营业收入可能不同，横向比较时须核对范围。</p></div>
  <div class="source-formula"><h3>项目净利润 P/E：市值 ÷ 年化项目净利润</h3><p>流通市值 / FDV ÷ 同窗年化净利润；当前净利润 ${exactUsd(m.netIncome)}，年化 ${exactUsd(m.netIncomeAnnual)}。${esc(incomeLabel(project,m.netIncomeStatus))}。</p><p>${known(m.netIncome)?`本次流通 / FDV 的 P/E：${multiple(m.peMc)} / ${multiple(m.peFdv)}。`:'当前快照没有满足要求的净利润记录；这不表示净利润为零，也不能据此判断亏损。协议收入、回购额度、销毁估值均不代替净利润。'}</p><p>需要补齐同一期间、同一协议范围的成本与费用（包括激励、运营及其他应计项目），短窗年化须分离一次性项目；完整365天可使用该年度净利润，并保留财报来源。亏损或净利为零时，P/E不适用。</p>${earnings?.source_url?`<div class="sources">${link({title:'利润记录来源',url:earnings.source_url})}</div>`:''}</div>
  <div class="source-formula"><h3>协议收入占手续费 / 回购与销毁占收入</h3><p>协议所得收入 ${exactUsd(m.revenue)} ÷ 用户手续费 ${exactUsd(m.fees)} = <strong>${pct(m.revenueShare)}</strong>，表示用户付费中协议拿到的比例，不是利润率。</p><p>可比较的回购 / 销毁统计金额 ${exactUsd(m.holder)} ÷ 协议所得收入 ${exactUsd(m.revenue)} = <strong>${pct(m.holderCapture)}</strong>。这是同窗比例，不再年化，也不是按净利润计算的派息率。</p><p>${esc(project.capture.stat_note)} ${esc(m.coverage?.holders?.recurring_note||'')}估值与执行时差可能使比例超过100%，不强行截断。</p></div>
  <section class="source-policy"><h3>本次使用的数据与保存响应</h3><p>市值与FDV：${link({title:'CoinGecko 市场快照',url:project.market.source})} · ${esc(project.market.last_updated)}。当前采集器未接入成本和净利润数据源。</p><div class="financial-data-sources">${['fees','revenue','holders'].map(kind=>{
    const source=project.data_sources.find(s=>s.kind===kind), name={fees:'用户手续费',revenue:statisticLabel(project),holders:'回购 / 销毁统计金额'}[kind];
    return `<article><strong>${name}</strong><span class="number-sub">抓取 ${esc(source?.retrieved_at||'未知')}</span><div class="source-links">${source?link({title:'在线 API ↗',url:source.url}):'来源缺失'}${source?.response_path?link({title:'本次 JSON ↗',url:source.response_path}):''}</div><p id="financial-proof-${kind}" role="status">正在核对保存响应…</p></article>`;
  }).join('')}</div><p class="source-explanation">文件哈希和逐日加总匹配只能证明表格可复算，不代表净利润或现金回购已审计。${link({title:'完整计算口径',url:'../research/framework.md'})}</p></section>`;
  if (!$('#source-dialog').open) $('#source-dialog').showModal();
  $('#source-dialog').scrollTop=0;
  await Promise.allSettled(['fees','revenue','holders'].map(async kind=>{
    const source=project.data_sources.find(s=>s.kind===kind);
    try {
      if (!source?.response_path) throw Error('未保存本次响应');
      const response=await fetch(source.response_path,{cache:'no-store',signal:request.signal});
      if(!response.ok) throw Error('保存响应读取失败 ('+response.status+')');
      const body=await response.arrayBuffer();
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(digest!==(source.stored_sha256||source.sha256)) throw Error('保存文件与快照哈希不一致');
      const audit=auditResponse(JSON.parse(new TextDecoder().decode(body)),project,days,kind);
      if(request.signal.aborted||sourceRequest!==request)return;
      const result=$('#financial-proof-'+kind);
      result.className=audit.matches===true?'positive':audit.matches===false?'error':'muted';
      const norm=project.flow_normalizations?.[kind]||(kind==='fees'?project.fee_normalization:null);
      result.textContent='文件哈希一致 · '+(audit.matches===true?(audit.normalization?'原始总额 '+exactUsd(audit.rawTotal)+' − 重复项 '+esc(norm?.child||'')+' '+exactUsd(audit.excludedTotal)+' = 去重总额匹配 '+exactUsd(audit.total):'逐日总额匹配 '+exactUsd(audit.total)):audit.matches===false?'逐日总额不匹配，请核对':audit.issues.length?'去重子项或统计方法缺失，请核对':'窗口缺失，不补零');
    }catch(error){
      if(request.signal.aborted||sourceRequest!==request)return;
      const result=$('#financial-proof-'+kind);result.className='error';result.textContent=error.message;
    }
  }));
}

async function openSource(ticker) {
  const project=snapshot.projects.find(p=>p.ticker===ticker);
  if (isReserveBurn(project)) return openFinancial(ticker);
  const source=buybackSource(project), m=calculate(project,state.days,valuationBasis), days=state.days;
  const dialog=$('#source-dialog');
  sourceRequest?.abort();
  const request=new AbortController();sourceRequest=request;
  $('#source-title').textContent=`${ticker} · 回购 / 销毁数据来源`;
  const rawLink=source?.response_path?link({title:'完整保存 JSON ↗',url:source.response_path}):'';
  const exactUsd=value=>known(value)?'$'+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const sourceStatus={'offline-cache':'使用已保存响应',fresh:'抓取成功',cached:'保留旧响应',missing:'未取得响应'}[source?.status]||source?.status||'未知状态';
  $('#source-content').innerHTML=`<div class="source-meaning"><span class="evidence">统计方法 · 人工核对上游计算规则</span><h3>${esc(project.capture.stat_label)}</h3><p>${esc(project.capture.stat_note)}</p></div>
  <div class="source-links">${source?link({title:'打开在线 API ↗',url:source.url}):''}${rawLink}</div>
  <p class="source-explanation">本次保存的数据用于当前表格；在线接口以后可能修订历史值或加入当天数据。返回 JSON 是第三方统计，不等于项目已审计的现金支出。</p>
  <dl class="source-metadata"><dt>请求接口</dt><dd>${esc(source?.url||'缺失')}</dd><dt>读取字段 / 单位</dt><dd><code>totalDataChart</code> → [UTC Unix 秒, 每日 USD 金额]；请求类型 <code>dailyHoldersRevenue</code></dd><dt>本次抓取时间</dt><dd>${esc(source?.retrieved_at||'未知')} · ${esc(sourceStatus)}</dd><dt>表格观察窗口</dt><dd>${esc(m.coverage?.holders?.start)} → ${esc(m.coverage?.holders?.end)} · ${days}天（完整 UTC 日）</dd></dl>
  <section class="source-check" id="source-check"><p role="status">正在读取本次保存的 API 返回…</p></section>
  <div class="source-formula"><h3>表格中的比例怎么算</h3><p>窗口统计金额 ${exactUsd(m.rawHolder)}；可年化部分 ${exactUsd(m.holder)}。</p><p>年化金额 = 可年化部分 × 365 ÷ ${days} = ${exactUsd(m.holderAnnual)}。</p><p>÷ 流通市值 ${exactUsd(project.market.market_cap)} = <strong>${pct(m.grossYieldMc)}</strong>；÷ CoinGecko FDV ${exactUsd(m.fdv)} = <strong>${pct(m.grossYieldFdv)}</strong>。</p><p>${esc(project.capture.annualization_note)} ${esc(m.coverage?.holders?.recurring_note||'')}</p></div>
  <details class="source-detail"><summary>抓取文件与哈希</summary><p>保存文件：${esc(source?.response_path||'未保存')}</p><p>保存文件 SHA-256：<code>${esc(source?.stored_sha256||source?.sha256||'未知')}</code></p>${source?.original_response_sha256?`<p>早期抓取曾对 JSON 重新排版；下载响应字节哈希：<code>${esc(source.original_response_sha256)}</code>。归档和上面的文件哈希对应保存版本。</p>`:''}${source?.refresh_error?`<p class="error">更新错误：${esc(source.refresh_error)}</p>`:''}</details>
  <section class="source-policy"><h3>规则依据</h3><div class="sources">${(project.sources||[]).map(link).join('')}</div></section>`;
  if (!dialog.open) dialog.showModal();
  $('#source-content').scrollTop=0;
  dialog.scrollTop=0;
  try {
    if (!source?.response_path) throw Error('本次快照尚无保存响应，请运行更新脚本后再核对。');
    const response=await fetch(source.response_path,{cache:'no-store',signal:request.signal});
    if (!response.ok) throw Error(`保存响应读取失败 (${response.status})`);
    const body=await response.arrayBuffer();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if (digest!==(source.stored_sha256||source.sha256)) throw Error('文件哈希与快照不一致，不能当作本次表格的数据。');
    const raw=JSON.parse(new TextDecoder().decode(body));
    const audit=auditResponse(raw,project,days);
    if (request.signal.aborted || sourceRequest!==request) return;
    const status=audit.matches===true?'逐日金额与窗口统计总额一致':audit.matches===false?'逐日金额与窗口统计总额不一致':audit.complete?'窗口统计总额缺失，无法比对':'窗口缺日，不补零、不年化';
    const preview={name:raw.name,displayName:raw.displayName,totalDataChart:audit.rows.slice(-7).map(row=>[row.timestamp,row.usd])};
    $('#source-check').innerHTML=`<div class="source-verified ${audit.matches===false?'error':'positive'}">文件哈希一致 · ${esc(status)}</div><p>API 原始记录 ${audit.rows.length}天${audit.documentedZeros?` + 政策确认生效前为零 ${audit.documentedZeros}天`:''} / 所需 ${days}天；重算窗口总额 ${exactUsd(audit.total)}。</p><h3>API 返回字段节选 · 所选窗口最后7条</h3><pre class="json-preview">${esc(JSON.stringify(preview,null,2))}</pre><details class="source-detail"><summary>逐日金额（UTC 日期 / USD）</summary><div class="table-wrap"><table><thead><tr><th>日期</th><th>时间戳（秒）</th><th>USD 金额</th></tr></thead><tbody>${audit.rows.map(row=>`<tr><td>${esc(row.date)}</td><td>${row.timestamp}</td><td>${exactUsd(row.usd)}</td></tr>`).join('')}</tbody></table></div></details><p class="source-explanation">JSON 节选保留原字段值，完整返回见上方链接。API 自带的 total30d 等字段随请求时点变化；本表按所选完整 UTC 日重算。</p>`;
  } catch(error) {
    if (request.signal.aborted || sourceRequest!==request) return;
    $('#source-check').innerHTML=`<p class="error">${esc(error.message)} 可通过上方链接查看保存文件与在线接口。</p>`;
  }
}

$('#source-close').addEventListener('click',()=>$('#source-dialog').close());
$('#source-dialog').addEventListener('close',()=>sourceRequest?.abort());

function fdvDetailMarkup(project) {
  const market=project.market;
  return `<details class="fdv-detail"><summary>FDV与供应量估值</summary><dl>
    <div><dt>CoinGecko FDV · 主表采用</dt><dd>${amount(market.fully_diluted_valuation,true)}<small>直接读取 fully_diluted_valuation</small></dd></div>
    <div><dt>价格 × 数据源总量 · 参考</dt><dd>${amount(market.remaining_supply_fdv,true)}<small>${price(market.current_price)} × ${amount(market.total_supply)}（total_supply）</small></dd></div>
    <div><dt>价格 × 初始分配量 · 参考</dt><dd>${amount(market.original_cap_fdv,true)}<small>${price(market.current_price)} × ${amount(project.initial_supply)}（研究档案记录）</small></dd></div>
  </dl><p>两项参考值用于比较供应量分母。数据源总量未经独立链上核验；初始分配量是历史起点，可能包含后来销毁的币，也不等于最大供应量。</p><p>行情时间：${esc(market.last_updated)}。${link({title:'CoinGecko 市场快照 ↗',url:market.source})} · ${link({title:'字段说明 ↗',url:'https://docs.coingecko.com/reference/coins-markets'})}</p></details>`;
}

function historyCoverageMarkup(project) {
  const coverage=project.history_coverage;
  if(!coverage) return '';
  const labels={fees:isReserveBurn(project)?'BSC链上Gas手续费':'用户手续费',...(isReserveBurn(project)?{gas_burn_estimate_usd:'Gas销毁美元估算（10%模型）'}:{}),revenue:statisticLabel(project),holders:'回购／销毁统计',price:project.ticker+'价格',btc:'BTC价格',sol:'SOL价格'};
  const rows=Object.entries(labels).map(([kind,label])=>{
    const item=coverage[kind]?.normalized || coverage[kind] || {};
    return `<tr><td>${esc(label)}</td><td>${esc(item.first||'未知')} → ${esc(item.last||'未知')}</td><td>${esc(item.observations??'未知')} / ${esc(item.calendar_days??'未知')}天</td><td>${esc(item.missing_days??'未知')}天</td></tr>`;
  }).join('');
  const supplemental=project.price_source?.supplemental;
  return `<details class="source-detail history-coverage"><summary>历史数据覆盖与价格来源</summary><div class="table-wrap"><table><thead><tr><th>数据项</th><th>实际有记录的起止日期</th><th>观察天数 / 跨度</th><th>跨度内缺日</th></tr></thead><tbody>${rows}</tbody></table></div><p>以上为归一化后的实际记录覆盖；起止范围不表示中间每天齐全。已确认政策生效前为零的日期仅在计算窗口时单列，不伪装成API观测。自定义时间段缺日则总额与年化显示未知。</p><p>近一年价格优先采用CoinGecko；更早部分采用${esc(supplemental?.provider||'尚未接入补充源')}，目标${esc(supplemental?.target_time||'未知')}、容差${esc(supplemental?.tolerance_seconds??'未知')}秒，保留实际采样时间，不做缺日插值，也不是交易所收盘价。</p>${supplemental?.sources?.length?`<details class="source-detail"><summary>查看历史价格的${supplemental.sources.length}份API返回与抓取时间</summary><p>${link({title:'补充接口官方说明',url:supplemental.documentation})}</p><ul>${supplemental.sources.map(source=>`<li>${esc(source.source_key)} · ${esc(source.retrieved_at||'未知')} · ${esc(source.status)}<br>${link({title:'本次JSON',url:source.response_path})} · ${link({title:'对应在线API',url:source.url})}${source.refresh_error?` · ${esc(source.refresh_error)}`:''}</li>`).join('')}</ul></details>`:''}</details>`;
}

function renderDetail() {
  const project = snapshot.projects.find(p=>p.ticker===state.ticker);
  const m = calculate(project,state.days,valuationBasis);
  const burn=isReserveBurn(project)?burnStats(project,state.start,state.end):null;
  $('#detail').innerHTML = `<div class="detail-head"><div><span class="eyebrow">${esc(project.sector)}</span><h2>${esc(project.ticker)} / ${esc(project.name)}</h2></div><span class="badge">${esc(captureBadge(project))}</span></div>
  <div class="mini-stats"><div><span>当前价格</span><strong>${price(project.market.current_price)}</strong></div><div><span>${burn?'所选期间已核季度销毁枚数':'回购 / 销毁金额 ÷ 协议收入'}</span><strong>${burn?amount(burn.tokens):pct(m.holderCapture)}</strong></div><div><span>${burn?'已核季度估值 ÷ 当前流通市值（未年化）':'回购 / 销毁金额 ÷ 用户手续费'}</span><strong>${burn?pct(burn.shareMc):pct(m.feeCapture)}</strong></div><div><span>流通 / 数据源总量</span><strong>${pct(m.floatRatio)}</strong></div></div>
  ${moneyFlowMarkup(project,state.days)}
  ${project.fee_normalization?`<details class="card"><summary>${isHypeFeeReconciliation(project)?'费用去重与99%的核对细节':'费用去重的核对细节'}</summary>${feeReconciliation(project,m)}</details>`:''}
  <div class="grid-2"><article class="card"><h3>收入从哪里来</h3><p>${esc(project.business)}</p><h3>持续性与周期</h3><p>${esc(project.sustainability)}</p><h3>进入代币的路径</h3><p>${esc(project.capture.policy)}</p><p><strong>分母：</strong>${esc(project.capture.denominator)}</p><p><strong>数据口径：</strong>${esc(project.capture.basis)}</p></article>
  <article class="card"><h3>供应与稀释</h3><div class="mini-stats"><div><span>数据源流通量</span><strong>${amount(project.market.circulating_supply)}</strong></div><div><span>数据源总量</span><strong>${amount(project.market.total_supply)}</strong></div><div><span>数据源最大供应量</span><strong>${amount(project.market.max_supply)}</strong></div><div><span>初始分配量</span><strong>${amount(project.initial_supply)}</strong></div></div><p>${esc(project.allocation_note)}</p><div class="allocation" aria-label="初始分配">${(project.allocations||[]).map((x,i)=>`<span style="width:${x.pct}%;--opacity:${.35+i*.11}" title="${esc(x.label)} ${x.pct}%"></span>`).join('')}</div><div class="allocation-labels">${(project.allocations||[]).map(x=>`<span>${esc(x.label)} ${x.pct}%</span>`).join('')}</div><div class="rule"></div><p>${esc(project.supply_note)}</p><p class="accent">${esc(project.supply_ledger?.note)}</p>${fdvDetailMarkup(project)}</article></div>
  ${project.onchain_supply?`<article class="card"><h3>独立链上供应核验</h3><p>实际mint supply：${esc(project.onchain_supply.exact_tokens)} ${esc(project.ticker)} · mint / freeze authority：${project.onchain_supply.mint_authority===null?'null':esc(project.onchain_supply.mint_authority)} / ${project.onchain_supply.freeze_authority===null?'null':esc(project.onchain_supply.freeze_authority)} · finalized slot ${project.onchain_supply.slot}</p><p>${esc(project.onchain_supply.note)}${project.ticker==='PUMP'?' Token-2022可能仍有其他扩展权限；不能概括所有权限已撤销。':''}</p><p class="data-status">RPC抓取时间：${esc(project.onchain_supply.retrieved_at)}</p></article>`:''}
  ${supplyDetailMarkup(project)}
  <div id="analysis-surface"></div>
  <article class="card"><h3>来源与口径检查</h3><p>${esc(project.capture.annualization_note)}</p><div class="sources">${(project.sources||[]).map(link).join('')} ${link({title:'市场快照',url:project.market.source})}</div><div class="data-status">市场供应商时间：${esc(project.market.last_updated)} · 来源数据截至：${esc(project.flow_end)} · 所选统计期间：${esc(state.start)} → ${esc(state.end)} · ${isReserveBurn(project)?'已核季度记录 '+burn.count+' 笔；手续费日序列与Gas模型已接入，逐日实际销毁未核，实时观察另标时点':'数据完整性：'+Object.entries(m.coverage||{}).filter(([key])=>['fees','revenue','holders'].includes(key)).map(([key,w])=>`${key} ${w.coverage_days}/${w.days}天`).join(' / ')}</div>${historyCoverageMarkup(project)}<details class="source-detail"><summary>数据抓取状态与来源</summary><ul>${[...(project.data_sources||[]),project.price_source||{},{kind:'market',...snapshot.source_status['coingecko-markets']}].map(source=>`<li>${esc(source.kind||'price')} · ${esc(source.status||'unknown')} · ${esc(source.retrieved_at||'未知抓取时间')}<br><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.url)}</a>${source.refresh_error?`<br>${esc(source.refresh_error)}`:''}</li>`).join('')}</ul></details></article>`;
  $('#detail').insertAdjacentHTML('beforeend', conclusionMarkup(project));
  renderAnalysis(project);
  connectMoneyFlow(project,state.days);
}

function conclusionMarkup(project) {
  const conclusion=buildConclusion(project,state.days,snapshot.as_of);
  return `<article class="card conclusion-card" id="token-conclusion" aria-labelledby="conclusion-heading"><h3 id="conclusion-heading">${esc(project.ticker)} · 分析结论</h3><p class="conclusion-text"><strong>研究判断：${esc(conclusion.headline)}</strong> ${esc(conclusion.text)}</p><p class="conclusion-note">所选流量期间${esc(state.start)}至${esc(state.end)}；估值、供应和政策说明仍截至当前快照，不是当年估值回测。未来释放从${esc(snapshot.as_of)}起看90天，事件对照固定前后各30天。供应排期复核日：${esc(conclusion.policyVerifiedOn||'尚缺复核日期')}。</p><details class="conclusion-proof"><summary>查看结论依据</summary><p>开头与持续性评价是基于业务和供应风险的研究判断；比例、估值及事件变化来自本次保存数据。团队与投资人比例是初始或历史分配，当前钱包持仓并未完整取得；解锁模型、奖励外推与实际执行分别标明。</p><div class="sources">${conclusion.sources.map(link).join('')}</div></details></article>`;
}

function renderSupplyOverview() {
  $('#supply-overview').innerHTML=`<div class="section-title"><h2 id="supply-heading">总量、流通与未来释放</h2><span>从 ${esc(snapshot.as_of)} 起算 · 与收入窗口独立</span></div>
  <div class="supply-definitions"><div><span>当前总量 · 存量</span><p>数据源统计的当前总量；对销毁和储备的处理方式可能不同。</p></div><div><span>未来解锁 / 释放 · 流量</span><p>解除处置限制或从储备转出。不一定增发，也不等于当日卖出。</p></div><div><span>净供应变化 · 期间差额</span><p>新增减去退出；总量与流通分别算。例如销毁10M、解锁30M：总量−10M，流通可能+20M。</p></div></div>
  <div class="table-wrap"><table class="supply-summary"><thead><tr><th>项目 / 展示的释放项目</th><th>当前流通 / 数据源总量</th><th>两者差额<br><small>并非全都即将解锁</small></th><th>未来30天</th><th>未来90天</th><th>未来365天<br><small>枚数 / 当前流通</small></th></tr></thead><tbody>${snapshot.projects.map(project=>{
    const c=primaryComponent(project), f=project.supply_forecast;
    return `<tr class="${state.ticker===project.ticker?'selected':''}"><td><button class="token-select" data-token="${esc(project.ticker)}" aria-pressed="${state.ticker===project.ticker}"><strong>${esc(project.ticker)}</strong><span>${esc(c?.label||'未取得排期')}</span></button><span class="evidence ${esc(c?.evidence||'unknown')}">${esc(evidenceNames[c?.evidence]||'尚未核实')}</span></td><td>${amount(project.market.circulating_supply)}<span class="number-sub">${amount(project.market.total_supply)}</span></td><td>${known(project.market.total_supply)&&known(project.market.circulating_supply)?amount(project.market.total_supply-project.market.circulating_supply):'—'}</td>${[30,90,365].map(days=>`<td>${supplyWindowMarkup(project,c,days,days===365)}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div><p class="footnote">数量单位：K=千、M=百万、B=十亿，均为对应代币枚数。每行只展示一个主要释放项目，其他类别见下方项目明细。官方预算、第三方归属模型、奖励速度外推不可当作同一置信度；均不是已核实未来流通增量。部分计划可用，不代表完整净供应已知。排期只覆盖部分日期时保留已列数量，另外标明截止日期和缺口，不用零填满剩余日期。</p>`;
}

function supplySourcesMarkup(sources=[]) {
  return sources.map(source=>`${link(source)}${source.response_path?' · '+link({title:'保存响应 ↗',url:source.response_path}):''}${source.retrieved_at?'<span class="number-sub">取证 '+esc(source.retrieved_at)+'</span>':''}`).join(' ');
}

function supplyDetailMarkup(project) {
  const f=project.supply_forecast;
  if (!f) return '<article class="card"><h3>未来释放排期</h3><p>暂无结构化排期数据。</p></article>';
  return `<article class="card supply-detail"><div class="section-title"><h3>${esc(project.ticker)} · 未来释放排期与证据</h3><span>复核日 ${esc(f.verified_on)} · 完整流通台账未齐</span></div><p>${esc(f.summary)}</p>${f.carry_in?`<div class="carry-in"><strong>已到期、仍可能释放的余额：${amount(f.carry_in.tokens)} ${esc(project.ticker)}</strong><p>${esc(f.carry_in.note)}</p>${f.carry_in.retrieved_at?`<p class="data-status">余额来源抓取：${esc(f.carry_in.retrieved_at)}</p>`:''}<div class="sources">${(f.carry_in.sources||[]).map(link).join('')}</div></div>`:''}<div class="table-wrap"><table class="forecast-table"><thead><tr><th>供应项目 / 事件类型</th><th>依据</th><th>30天</th><th>90天</th><th>365天</th></tr></thead><tbody>${f.components.map(c=>`<tr><td><strong>${esc(c.label)}</strong><span class="number-sub">${esc(c.effect_label)}</span></td><td><span class="evidence ${esc(c.evidence)}">${esc(evidenceNames[c.evidence])}</span></td>${[30,90,365].map(days=>`<td>${supplyWindowMarkup(project,c,days)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <div class="forecast-evidence">${f.components.map(c=>{const upcoming=nextEvent(c,snapshot.as_of);return `<div><strong>${esc(c.label)}</strong>${upcoming?`<span class="next-unlock">下一事件 ${esc(upcoming.date)} · ${amount(upcoming.tokens)} ${esc(project.ticker)}${upcoming.time_utc?' · '+esc(upcoming.time_utc)+' UTC':''}</span>`:''}<p>${esc(c.note)}</p><div class="sources">${supplySourcesMarkup(c.sources)}</div></div>`;}).join('')}</div>
  ${f.inventory?`<div class="forecast-inventory"><h3>已有库存，未来日期未定</h3><div class="inventory-values">${f.inventory.rows.map(row=>`<div><span>${esc(row.label)}</span><strong>${row.approximate?'约':''}${amount(row.tokens)} ${esc(project.ticker)}</strong></div>`).join('')}</div><p>${esc(f.inventory.note)}</p><div class="sources">${f.inventory.sources.map(link).join('')}</div></div>`:''}
  <div class="forecast-gaps"><h3>尚缺什么，为什么不能直接报净通缩</h3><ul>${(f.gaps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><p class="data-status">排期来自人工复核的政策与模型，行情更新不会自动刷新政策。零仅适用于标明已结束或无权限的具体类别；不代表其他储备释放为零。</p></article>`;
}

function chartMarkup(project, mode) {
  const data=selectedChartData(project,state.start,state.end,mode);
  const {rows,seriesNames}=data;
  if(!rows.some(row=>seriesNames.some(key=>known(row[key])))) return '<p class="muted">所选时间段暂无可绘制的历史数据；缺日不补零。</p>';
  const colors = {fees:'var(--blue)',gas_burn_estimate_usd:'var(--gold)',revenue:'var(--blue)',holders:'var(--gold)',price:'var(--gold)',btc:'var(--blue)',sol:'var(--mint)'};
  const names = {fees:'BSC链手续费',gas_burn_estimate_usd:'Gas销毁估算 · 10%模型',revenue:statisticLabel(project),holders:project.capture.stat_label,price:project.ticker,btc:'BTC',sol:'SOL'};
  const first = Object.fromEntries(seriesNames.map(key=>[key,rows.find(row=>known(row[key]))?.[key]]));
  const points = rows;
  const values=points.flatMap(row=>seriesNames.map(key=>row[key])).filter(known);
  const maximum = Math.max(...values,1)*1.12;
  const minimum = Math.min(...values,0)*1.12;
  const width=850,height=240,left=66,right=18,top=14,bottom=32;
  const x = index => points.length===1?(left+width-right)/2:left+index/(points.length-1)*(width-left-right);
  const y = value => height-bottom-(value-minimum)/(maximum-minimum)*(height-top-bottom);
  const ticks = [0,.25,.5,.75,1].map(r=>{const value=minimum+(maximum-minimum)*r;return `<line class="grid" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left-8}" y="${y(value)+4}" text-anchor="end">${mode==='price'?Math.round(value):amount(value,true)}</text>`;}).join('');
  const paths = seriesNames.map(key=>{
    let connected=false;
    const d=points.map((row,index)=>{
      if (!known(row[key])) {connected=false;return '';}
      const segment=`${connected?'L':'M'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`;
      connected=true;return segment;
    }).join(' ');
    const dots=points.map((row,index)=>known(row[key])&&!known(points[index-1]?.[key])&&!known(points[index+1]?.[key])?`<circle cx="${x(index)}" cy="${y(row[key])}" r="3" fill="${colors[key]}"/>`:'').join('');
    return `<path d="${d}" fill="none" stroke="${colors[key]}" stroke-width="2.2"/>${dots}`;
  }).join('');
  const labelIndices = [...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])];
  const labels = labelIndices.map((index,i)=>`<text x="${x(index)}" y="${height-7}" text-anchor="${i===0?'start':i===labelIndices.length-1?'end':'middle'}">${esc(rows[index].date)}</text>`).join('');
  return `<div class="legend">${seriesNames.filter(key=>known(first[key])).map(key=>`<span style="--c:${colors[key]}">${esc(names[key])}</span>`).join('')}</div><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${mode==='price'?'所选期间价格与BTC SOL基准':mode==='chain_fees'?'所选期间BSC链手续费与Gas销毁估算':project.flow?.revenue_is_income===false?'所选期间'+esc(statisticLabel(project)):'所选期间协议收入与回购或销毁规模'}">${ticks}${paths}${labels}</svg><p class="footnote">${mode==='chain_fees'?`${data.monthly?'按所选日期逐月加总，首末月可能不足整月；缺日月份断开。':'按所选UTC日展示，缺日断开。'}手续费为BSC交易Gas索引；销毁线为供应商10%模型估算，未逐日核验实际销毁，也不含季度储备销毁。`:mode==='revenue'?`${data.monthly?'按所选日期逐月加总，首末月可能不足整月；缺日月份断开。':'按所选UTC日展示，缺日断开。'}${project.flow?.revenue_is_income===false?'当前统计不是独立营业收入，只画代币统计，不推算现金回购。':'统计金额可能涉及一次性事件，不能直接视为持续收入。'}`:`USD采样价以${esc(data.origin)}同日起点100；缺日断开。CoinGecko已有日期优先，更早价格由DeFiLlama补充（UTC零点±1小时采样，非收盘价）。来源与覆盖可在下方查看；表现对照不证明因果。`}</p>`;
}

function renderAnalysis(project) {
  const chartKey=`${project.ticker}:${state.start}:${state.end}`;
  const ready=historyLoader.ready(project.ticker,state.start,state.end);
  const chartProject=ready?{...project,history:historyLoader.rows(project.ticker)}:project;
  const loading=chartErrors.has(chartKey)?`<p class="error">${esc(chartErrors.get(chartKey))}</p><button data-retry-history>重新加载历史</button>`:'<p class="history-loading" role="status">正在加载所选时间段的历史图表…</p>';
  const index = state.event === null ? (project.event_studies||[]).length-1 : Math.min(state.event,(project.event_studies||[]).length-1);
  const selected = (project.event_studies||[])[index];
  $('#analysis-surface').innerHTML = `<div class="grid-2"><article class="card"><h3>${isReserveBurn(project)?'BSC手续费与Gas销毁估算':project.flow?.revenue_is_income===false?statisticLabel(project):'收入与回购 / 销毁'} · ${state.days>90?'月度':'日度'}</h3>${ready?chartMarkup(chartProject,isReserveBurn(project)?'chain_fees':'revenue'):loading}</article><article class="card"><h3>价格与市场对照 · 所选期间</h3>${ready?chartMarkup(chartProject,'price'):loading}</article></div>
  <article class="card"><div class="section-title"><h3>经济模型变更与观察结果</h3><span>事件前后各30/90天 · 与筛选期间独立</span></div><div class="event-grid"><div class="timeline">${(project.event_studies||[]).map((event,i)=>`<button data-event="${i}" aria-pressed="${i===index}"><time>${esc(event.date)}</time><span>${esc(event.title)}<small>${esc(event.status)}</small></span></button>`).join('')}</div><div id="study-result">${studyMarkup(selected,project)}</div></div></article>`;
  document.querySelectorAll('[data-event]').forEach(button=>button.addEventListener('click',()=>{state.event=Number(button.dataset.event);renderAnalysis(project);}));
  document.querySelectorAll('[data-retry-history]').forEach(button=>button.addEventListener('click',()=>{chartErrors.delete(chartKey);renderAnalysis(project);}));
  if(!ready && !chartErrors.has(chartKey) && !chartRequests.has(chartKey)) {
    const start=state.start,end=state.end;
    const request=historyLoader.load(project.ticker,start,end);
    chartRequests.set(chartKey,request);
    request.catch(error=>chartErrors.set(chartKey,error.message)).finally(()=>{
      chartRequests.delete(chartKey);
      if(state.ticker===project.ticker && state.start===start && state.end===end) {
        renderAnalysis(snapshot.projects.find(current=>current.ticker===state.ticker));
      }
    });
  }
}

function studyMarkup(event,project) {
  if (!event) return '<p>本次未取得可核实生效事件。</p>';
  const complete = event.studies.filter(study=>study.pre);
  const incomeName=project.flow?.revenue_is_income===false?statisticLabel(project):'协议收入';
  const cell = value => `<td>${esc(value)}</td>`;
  const row = (name, callback) => `<tr><td>${esc(name)}</td>${event.studies.map(study=>cell(study.pre?callback(study):'后窗口未结束')).join('')}</tr>`;
  return `<h3>${esc(event.title)}</h3><p>${esc(event.note)}</p><p>${link({title:'事件证据',url:event.source})}</p><table class="study-table"><thead><tr><th>指标</th>${event.studies.map(study=>`<th>${study.days}天窗口</th>`).join('')}</tr></thead><tbody>
    ${isReserveBurn(project)?'':row('变更前'+incomeName,s=>amount(s.pre.usd,true))+row('变更后'+incomeName,s=>amount(s.post.usd,true))+row(incomeName+'变化',s=>signed(s.revenue_change))+row('变更前 / 后回购或销毁金额',s=>`${amount(s.pre_holder.usd,true)} / ${amount(s.post_holder.usd,true)}`)}${row('代币价格回报',s=>signed(s.token_return))}${row('相对 BTC 表现',s=>signed(s.relative_btc))}${row('相对 SOL 表现',s=>signed(s.relative_sol))}${row('有效总量 / 流通变化',()=> '历史供应快照待补')}
  </tbody></table><p class="footnote">${isReserveBurn(project)?'BNB仅作币价与市场对照；季度记录单独列示，不把销毁估值称为同窗收入。':''}${isReserveBurn(project)?'':incomeName+'前窗为事件前N天，后窗为事件后第1至N天，排除事件当天。'}价格从事件前一天至事件后N天，使用已登记的UTC采样价格；较早日期来自单列的DeFiLlama补充源，不是交易所收盘价。相对回报=(1+代币回报)/(1+基准回报)−1。${complete.some(s=>s.pre_holder?.oneoff_dates?.length)?'跨存量burn事件的统计须另行核对。':''}公告、实施、会计确认各有含义；同步市场变化不能证明回购导致收入或价格改善。${project.flow?.revenue_is_income===false?'代币统计的估值可能受币价和机制影响，不代表独立协议收入变化。':''}</p>`;
}

document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',async()=>{
  const days=Number(button.dataset.days),end=baseSnapshot.completed_day_cutoff_utc;
  if (await applyRange(startForDays(end,days),end,days)) toggleCustomRange(false);
}));
$('#custom-range-toggle').addEventListener('click',()=>toggleCustomRange($('#custom-range-form').hidden));
$('#more-history-toggle').addEventListener('click',()=>{
  const open=$('#extended-periods').hidden;
  $('#extended-periods').hidden=!open;
  $('#more-history-toggle').setAttribute('aria-expanded',open);
});
$('#custom-range-cancel').addEventListener('click',()=>toggleCustomRange(false));
$('#custom-range-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(await applyRange($('#range-start').value,$('#range-end').value)) toggleCustomRange(false);
});
$('#token-selector').addEventListener('change',event=>selectToken(event.target.value));
const controlsObserver=new ResizeObserver(()=>{
  const timeHeight=$('#research-controls').getBoundingClientRect().height;
  const tokenHeight=$('#token-controls').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--research-controls-height',`${timeHeight}px`);
  document.documentElement.style.setProperty('--detail-controls-height',`${timeHeight+tokenHeight}px`);
});
controlsObserver.observe($('#research-controls'));
controlsObserver.observe($('#token-controls'));
$('#show-business').addEventListener('click',()=>$('#comparison-scroll').scrollTo({left:0,behavior:'auto'}));
$('#show-financial').addEventListener('click',()=>{
  const table=$('#comparison-scroll'), target=$('#financial-start');
  const firstWidth=$('#comparison-body td').getBoundingClientRect().width;
  table.scrollTo({left:table.scrollLeft+target.getBoundingClientRect().left-table.getBoundingClientRect().left-(innerWidth>700?firstWidth:0),behavior:'auto'});
});
$('#show-flows').addEventListener('click',()=>$('#money-flow-section').scrollIntoView({behavior:'smooth',block:'start'}));
setRangeBusy(true);
try {
  const response = await fetch('../data/dashboard-lite.json',{cache:'no-cache'});
  if (!response.ok) throw Error(`读取数据失败 (${response.status})`);
  snapshot = await response.json();
  if (!snapshot.projects?.length) throw Error('快照没有项目，请运行更新脚本。');
  if (snapshot.delivery?.version!==1) throw Error('轻量快照尚未生成，请运行 scripts/web_assets.py');
  baseSnapshot=snapshot;
  historyLoader=new HistoryLoader(baseSnapshot);
  state.end=snapshot.completed_day_cutoff_utc;
  state.start=startForDays(state.end,state.days);
  for (const input of [$('#range-start'),$('#range-end')]) {input.min=earliestHistory();input.max=state.end;}
  if (!snapshot.projects.some(project=>project.ticker===state.ticker)) state.ticker=snapshot.projects[0].ticker;
  $('#token-selector').innerHTML=snapshot.projects.map(project=>`<option value="${esc(project.ticker)}">${esc(project.ticker)} · ${esc(project.name)}</option>`).join('');
  $('#token-selector').disabled=false;
  $('#range-error').textContent='';
  setRangeBusy(false);
  render();
  registerResearchTools();
} catch (error) {
  $('#snapshot-date').textContent = '快照暂不可用';
  $('#errors').innerHTML = `<p class="alert">${esc(error.message)} · 请通过本地服务打开，使用 README 中的启动方式。</p>`;
}

function viewSummary() {
  return {as_of:snapshot.as_of,flow_end:snapshot.completed_day_cutoff_utc,start:state.start,end:state.end,days:state.days,preset:state.preset,history_earliest:earliestHistory(),basis:valuationBasis,ticker:state.ticker,chart_history_loaded:historyLoader.ready(state.ticker,state.start,state.end),financial_columns:['ps','holder_return_multiple','project_net_income_pe'],
    rows:snapshot.projects.map(p=>{const m=calculate(p,state.days,valuationBasis),ref=calculateReferenceMultiples(p,state.days,valuationBasis);return {ticker:p.ticker,gross_proxy_yield_mc:m.grossYieldMc,
      gross_proxy_yield_fdv:m.grossYieldFdv,
      ps_revenue_mc:m.psRevenueMc,ps_revenue_fdv:m.psRevenueFdv,pe_mc:m.peMc,pe_fdv:m.peFdv,net_income_status:m.netIncomeStatus,revenue_status:m.revenueStatus,reported_api_revenue_usd:m.reportedRevenue,protocol_revenue_share:m.revenueShare,buyback_burn_share_of_revenue:m.holderCapture,
      reference_pe_mc:ref.peMc,reference_pe_fdv:ref.peFdv,reference_ps_mc:ref.psMc,reference_ps_fdv:ref.psFdv,reference_revenue_status:ref.revenueStatus,reference_contains_oneoff:ref.containsOneoff,
      supply_ledger_complete:p.supply_ledger?.complete,
      economic_model:p.flow?.mode,burn_records:isReserveBurn(p)?burnStats(p,state.start,state.end):null,
      future_supply_components:(p.supply_forecast?.components||[]).map(c=>({id:c.id,label:c.label,evidence:c.evidence,effect:c.effect_label,days30:componentAmount(c,snapshot.as_of,30),days90:componentAmount(c,snapshot.as_of,90),days365:componentAmount(c,snapshot.as_of,365),window365:componentWindowSummary(c,snapshot.as_of,365)}))};}),
    limitations:'Statistic definitions differ by project; reserve burns are separate from income-funded buybacks. Future supply ledgers remain incomplete. No trading or cash dividend claim.'};
}

function registerResearchTools() {
  const context=document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle=new AbortController();
  const tools=[{
    name:'read_token_research_view',title:'读取当前研究口径',
    description:'Read the current local snapshot, dated comparison metrics and incomplete-supply flags. No source refresh or state change.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(input){if(input && Object.keys(input).length) throw Error('No arguments accepted');return viewSummary();}
  },{
    name:'configure_token_research_view',title:'选择研究项目与窗口',
    description:'Change only the visible project and observation window on this local research dashboard. Valuation always uses CoinGecko FDV. No trading, publishing or source edits.',
    inputSchema:{type:'object',properties:{ticker:{type:'string',enum:snapshot.projects.map(project=>project.ticker)},days:{type:'integer',enum:[7,30,90,365,1095,1825]},start:{type:'string',format:'date'},end:{type:'string',format:'date'}},required:['ticker'],oneOf:[{required:['days']},{required:['start','end']}],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:true},
    async execute(input){
      if(!input || Object.keys(input).some(key=>!['ticker','days','start','end'].includes(key)) || !snapshot.projects.some(p=>p.ticker===input.ticker)) throw Error('Invalid project or period');
      const preset=Object.hasOwn(input,'days');
      if(preset && (!['ticker','days'].every(key=>Object.hasOwn(input,key)) || Object.hasOwn(input,'start') || Object.hasOwn(input,'end') || ![7,30,90,365,1095,1825].includes(input.days))) throw Error('Invalid days');
      const end=preset?baseSnapshot.completed_day_cutoff_utc:input.end;
      const start=preset?startForDays(end,input.days):input.start;
      const validation=validateDateRange(start,end,earliestHistory(),baseSnapshot.completed_day_cutoff_utc);
      if(!validation.valid) throw Error(validation.error);
      if(!await applyRange(start,end,preset?input.days:null)) throw Error('Range could not be applied');
      selectToken(input.ticker);toggleCustomRange(false);return viewSummary();
    }
  }];
  for(const tool of tools) {
    try {Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch {}
  }
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
