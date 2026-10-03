import {known} from './core.js';
import {buildFlow} from './flows.js';
import {isReserveBurn, statisticLabel} from './models.js';
import {quarterlyPlanMarkup, burnRecordsMarkup, burnObservationsMarkup, bnbChainMarkup} from './burns.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>!known(value)?'金额待核':Math.abs(value)>=1e8?`${(value/1e8).toFixed(2)}亿美元`:Math.abs(value)>=1e4?`${(value/1e4).toLocaleString('zh-CN',{maximumFractionDigits:1})}万美元`:`${value.toLocaleString('en-US',{maximumFractionDigits:2})}美元`;
const evidence={api:'API统计',estimate:'模型估算',provider_policy_estimate:'模型估算',difference:'统计差额',policy:'政策／待核',valuation:'代币估值',unknown:'缺数据／待核',mixed:'历史口径待核'};
const names={
  'Hyperliquid Perps':'永续交易','Hyperliquid Spot Orderbook':'现货与部署竞价','Hyperliquid HLP':'HLP（重复项）',
  'pump.fun':'发行平台','PumpSwap':'PumpSwap交易','Terminal':'Terminal交易','pump.fun Mobile App':'移动端（交易入口）',
  'Jupiter Aggregator':'聚合交易','Jupiter Perpetual Exchange':'永续交易','Ape Jupiter':'Ape',
  'Jupiter Staked SOL':'JupSOL质押管理','Jupiter DCA':'DCA／Trigger（有重叠）','Jupiter Studio':'Studio发行',
  'Jupiter Lend':'Lend借贷','Jupiter Prediction':'预测市场（外部平台）','Jupiter Limit':'限价订单',
  'Jupiter Offerbook':'Offerbook','Jupiter Lend DEX':'Lend DEX','Raydium AMM':'AMM／CLMM／CPMM','LaunchLab':'LaunchLab发行'
};
const link=(label,url)=>url?`<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`:'';

function compositionMarkup(node,project) {
  const c=node.composition;
  if (!c) return '';
  const valuation=node.id==='outcome' && project.flow?.mode!=='allocation';
  const axis=valuation ? project.flow?.composition_axis || (project.flow?.mode==='token_redemption_valuation'?'chains':'products') : 'products';
  const entries=(c[axis]||[]).filter(part=>known(part.usd)&&part.usd!==0);
  if (!entries.length) return '';
  const label=valuation?(axis==='chains'?'按执行链看兑换估值':node.evidence==='mixed'?'统计挂载位置（历史回购／销毁）':'统计挂载位置（全产品销毁）'):'按业务看这笔金额';
  const rows=entries.map(part=>`<div class="flow-part"><span>${esc(valuation&&project.ticker==='PUMP'?'全产品集中记录':names[part.label]||part.label)}</span><span>${money(part.usd)}</span></div>`).join('');
  return `<details class="flow-composition"${node.id==='revenue'||valuation?' open':''}><summary>${label}</summary>${rows}<p>${c.complete?'同窗分项记录完整':`分项仅覆盖${c.observed_days}/${c.days}天，不能视为完整构成`}。${known(c.difference_from_total_usd)&&Math.abs(c.difference_from_total_usd)>.01?`与总额差${money(c.difference_from_total_usd)}，保留差异。`:''}${valuation&&project.ticker==='UNI'?'v2／v4等兑换集中挂v3接口，按链展示不代表费用来自该版本。':''}</p></details>`;
}

export function moneyFlowMarkup(project,days) {
  const model=buildFlow(project,days);
  const rule=project.flow || {};
  const warnings=[...new Set(model.warnings||[])];
  const window=project.windows?.[String(days)] || {};
  const sources=[...(project.data_sources || []),...(window.flow_distributions?.sources||[])];
  const normalizations={...(project.fee_normalization?{fees:project.fee_normalization}:{}),...project.flow_normalizations};
  return `${isReserveBurn(project)?quarterlyPlanMarkup(project)+burnRecordsMarkup(project,model.start,model.end):''}<article class="card money-flow-section" id="money-flow-section" aria-labelledby="money-flow-title">
    <div class="section-title"><h3 id="money-flow-title">${esc(project.ticker)} · ${isReserveBurn(project)?'两条销毁路径':'钱从哪里来，又去了哪里'}</h3><span>${esc(model.start)} → ${esc(model.end)} · ${days}天${isReserveBurn(project)?'':' · USD'}</span></div>
    <p class="flow-origins"><strong>${isReserveBurn(project)?'链上业务：':'收费业务：'}</strong>${esc(rule.origins)}</p>
    ${rule.direct_path_note?`<p class="flow-bypass">${esc(rule.direct_path_note)}</p>`:''}
    <div class="flow-map" role="group" aria-label="${esc(project.ticker)}收入与回购去向" data-flow-mode="${esc(model.mode)}">
      <svg class="flow-paths" aria-hidden="true"></svg>
      ${model.nodes.map(node=>`<section class="flow-node flow-node-${esc(node.id)}" data-flow-node="${esc(node.id)}"><div class="flow-node-heading"><span>${esc(node.label)}</span><small class="flow-evidence flow-evidence-${esc(node.evidence)}">${esc(evidence[node.evidence]||node.evidence)}</small></div><strong class="flow-amount">${isReserveBurn(project)?known(node.usd)?money(node.usd):node.id==='outcome'?'记录见下表':node.id==='funding'?'按季度规则执行':'同窗金额待核':node.id==='outcome'&&model.mode==='allocation'?'代币去向，枚数待核':money(node.usd)}</strong><p>${esc(node.note)}</p>${node.id==='funding'?`<p class="flow-policy">${esc(rule.funding_rule)}</p>`:''}${node.id==='funding'&&known(model.unallocatedUsd)?`<p>其他协议收入分配：${money(model.unallocatedUsd)}（统计金额，尚未扣完整经营成本）。</p>`:''}${compositionMarkup(node,project)}</section>`).join('')}
    </div>
    <p class="flow-legend"><span class="flow-line-sample"></span>同窗统计关系 <span class="flow-line-sample is-dashed"></span>政策路径或金额未对账 · 箭头不表示已经现金成交</p>
    ${warnings.length?`<details class="flow-warnings" open><summary>数据性质与待核部分</summary><ul>${warnings.map(note=>`<li>${esc(note)}</li>`).join('')}</ul></details>`:''}
    <details class="flow-proof"><summary>数据来源、费用去重与构成依据</summary><p>${isReserveBurn(project)?'链手续费为交易Gas索引，Gas销毁为10%模型估算，季度销毁记录独立核验。三者分别列出API与保存响应，日期和依据不同，不混成企业收入。':'构成来自同一保存响应的逐日子项，没有把子协议再次加回总额。两统计额的差值不能自动称为净利润或全部运营成本。'}</p>${Object.entries(normalizations).map(([kind,norm])=>{const w=window[kind] || {};return `<p>${kind==='fees'?'手续费':'收入'}原始${money(w.raw_usd)} − 重复${money(w.excluded_usd)} → 去重${money(w.usd)}。${esc(norm.note)} ${link('去重依据',norm.source_url)}</p>`;}).join('')}<div class="flow-source-list">${sources.map(source=>`<div><strong>${esc({fees:'用户费用',chain_fees:'BSC链手续费',gas_burn_policy_estimate:'Gas销毁10%模型',gas_burn_policy:'当前链上销毁参数',policy_block:'参数核验区块',gas_burn_snapshot:'滚动Gas销毁摘要',burns:'季度销毁记录',burn_proof:'季度交易核验',supply:'供给侧分配',revenue:statisticLabel(project),holders:'回购／销毁统计',supply:'供给侧分配',protocol:'其他协议收入分配'}[source.kind]||source.kind)}</strong><span>抓取：${esc(source.retrieved_at||'未知')} · ${link('在线API',source.url)} · ${link('本次JSON',source.response_path)}</span></div>`).join('')}</div><p>${link('本项目流向与证据说明',rule.source_note_url)}</p>${window.flow_distributions?'<p>补充分配接口随在线刷新更新，保留独立抓取时间；失败保留旧响应，窗口缺日时显示未知。</p>':''}</details>
  </article>${isReserveBurn(project)?bnbChainMarkup(project,model.start,model.end)+burnObservationsMarkup(project):''}`;
}

let observer;
export function connectMoneyFlow(project,days) {
  observer?.disconnect();
  const map=document.querySelector('#money-flow-section .flow-map');
  if (!map) return;
  const model=buildFlow(project,days), svg=map.querySelector('.flow-paths'), ns='http://www.w3.org/2000/svg';
  const draw=()=>{
    const bounds=map.getBoundingClientRect(), vertical=window.innerWidth<=850;
    if (!bounds.width||!bounds.height) return;
    svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    svg.replaceChildren();
    const defs=document.createElementNS(ns,'defs'), marker=document.createElementNS(ns,'marker');
    marker.id='money-flow-arrow';marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('orient','auto-start-reverse');
    const triangle=document.createElementNS(ns,'path');triangle.setAttribute('d','M 0 0 L 10 5 L 0 10 z');triangle.setAttribute('class','flow-arrowhead');marker.append(triangle);defs.append(marker);svg.append(defs);
    for (const edge of model.edges) {
      const a=map.querySelector(`[data-flow-node="${edge.from}"]`).getBoundingClientRect(), b=map.querySelector(`[data-flow-node="${edge.to}"]`).getBoundingClientRect();
      const down=vertical||edge.from==='funding';
      const x1=(down?a.left+a.width/2:a.right)-bounds.left, y1=(down?a.bottom:a.top+a.height/2)-bounds.top;
      const x2=(down?b.left+b.width/2:b.left)-bounds.left, y2=(down?b.top:b.top+b.height/2)-bounds.top;
      const path=document.createElementNS(ns,'path'), mid=down?(y1+y2)/2:(x1+x2)/2;
      path.setAttribute('d',down?`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2-3}`:`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2-3},${y2}`);
      path.setAttribute('class',`flow-edge${edge.dashed?' is-dashed':''}`);path.setAttribute('marker-end','url(#money-flow-arrow)');svg.append(path);
    }
  };
  observer=new ResizeObserver(draw);observer.observe(map);map.querySelectorAll('.flow-node').forEach(node=>observer.observe(node));
  draw();
}
