/* Saved diagnostics only. No sampler, forward model, or live HPC requests. */
(function (root) {
  'use strict';
  const url = 'web_data/convergence/diagnostics-20261018.json';
  const limits = {rhat:1.05, length:50, ess:2000, drift:.2, stability:.3};
  const sampled = ['ETA_STAR','t_STAR','ALPHA_STAR','M_TURN','F_ESC10','ALPHA_ESC','L_X','NU_X_THRESH'];
  const names = {ETA_STAR:'η★',t_STAR:'t★',ALPHA_STAR:'α★',M_TURN:'log₁₀ Mturn',F_ESC10:'log₁₀ fesc,10',ALPHA_ESC:'αesc',L_X:'log₁₀ LX',NU_X_THRESH:'E₀ [eV]',log_posterior:'log posterior',tau:'τe',xHI_z5p9:'xHI(z=5.9)',F_STAR10:'log₁₀ f★,10'};
  function summarize(data) {
    if(data.status!=='EXPLORATORY_NOT_CONVERGED' || data.full.steps!==2000 || data.sources[0].shape[0]!==2000 || data.sources[1].shape[0]!==1000 || data.full.independent_rhat_available!==false) throw Error('Unexpected diagnostic schema or snapshot lengths.');
    const rows=Object.entries(data.full.parameters).map(([key,p])=>{
      const q=data.recent1000_vs_reference1000.parameters[key];
      const r=q.max_rank_folded_rhat_across_matching_walkers;
      const valid=v=>typeof v==='number' && Number.isFinite(v);
      const checks=[valid(r)&&r<=limits.rhat,valid(p.length_over_IAT)&&p.length_over_IAT>=limits.length,valid(p.estimated_ensemble_mean_ESS)&&p.estimated_ensemble_mean_ESS>=limits.ess,valid(p.half_median_shift_over_68_width)&&p.half_median_shift_over_68_width<=limits.drift,valid(p.iat_change_vs_last_half)&&p.iat_change_vs_last_half<=limits.stability];
      return {key,name:names[key]||key,sampled:sampled.includes(key),rhat:r,length:p.length_over_IAT,ess:p.estimated_ensemble_mean_ESS,drift:p.half_median_shift_over_68_width,stability:p.iat_change_vs_last_half,checks,target:valid(p.max_IAT_steps)?Math.ceil(limits.length*p.max_IAT_steps):null};
    });
    if(rows.length!==12 || rows.some(r=>![r.rhat,r.length,r.ess,r.drift,r.stability].every(Number.isFinite))) throw Error('Missing or nonfinite diagnostic values.');
    return {rows,sampled:rows.filter(r=>r.sampled),worstRhat:Math.max(...rows.map(r=>r.rhat)),minLength:Math.min(...rows.map(r=>r.length)),lengthOnlyTarget:Math.max(...rows.map(r=>r.target)),passCounts:[0,1,2,3,4].map(i=>rows.filter(r=>r.checks[i]).length),stuck:data.walkers.zero_movement_walkers_by_ensemble};
  }
  if(typeof module==='object' && module.exports) module.exports={summarize,limits,sampled,url};
  if(!root.document) return;
  const mounts=[...document.querySelectorAll('[data-convergence]')];
  if(!mounts.length) return;
  let data, result, failure;
  const zh=()=>document.documentElement.lang.startsWith('zh');
  const t=(en,cn)=>zh()?cn:en;
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):t('Unavailable','不可评估');
  function statistic(parent,label,value,note) {const block=el('div',undefined,'cv-stat');block.append(el('p',label,'technical-label'),el('strong',value),el('p',note,'cv-note'));parent.append(block);}
  function table(rows) {
    const wrap=el('div',undefined,'cv-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',t('Scrollable per-parameter diagnostics','可横向滚动的逐参数诊断'));
    const table=el('table'),caption=el('caption',t('Diagnostic windows are different: R̂ uses the equal-length cross-ensemble windows; all other columns use full ensemble 0.','诊断窗口不同：R̂ 使用跨组等长窗口，其余列使用 ensemble 0 完整链。'));table.append(caption);
    const head=el('thead'),tr=el('tr');
    [t('Parameter','参数'),'R̂¹ ≤ 1.05','N / IAT² ≥ 50','ESS² ≥ 2000',t('Half drift² ≤ 0.20','半链漂移² ≤ 0.20'),t('IAT change² ≤ 0.30','IAT 变化² ≤ 0.30')].forEach(label=>{const th=el('th',label);th.scope='col';tr.append(th);});head.append(tr);table.append(head);
    const body=el('tbody');
    for(const row of rows){const tr=el('tr');tr.dataset.parameter=row.key;const name=el('th',row.name);name.scope='row';name.title=row.key;tr.append(name);
      [row.rhat,row.length,row.ess,row.drift,row.stability].forEach((v,i)=>{const td=el('td',undefined,row.checks[i]?'cv-pass':'cv-fail');td.append(el('span',fmt(v,i===2?0:i===0||i>2?3:2)),el('small',row.checks[i]?t('PASS','达标'):t('FAIL','未达标')));tr.append(td);});body.append(tr);
    }table.append(body);wrap.append(table);return wrap;
  }
  function render(){
    for(const mount of mounts){
      mount.replaceChildren();mount.classList.add('cv-panel');
      if(!data){mount.append(el('p',failure?t('Diagnostics could not load: ','诊断加载失败：')+failure:t('Loading saved convergence diagnostics…','正在加载已保存的收敛诊断……')));continue;}
      const heading=el('div',undefined,'cv-heading');heading.append(el('p','DIAGNOSTICS / 2026-10-18 · REVIEW / 2026-10-20','technical-label'),el('h2',t('Convergence / still exploratory','收敛检查 / 仍属探索性结果')),el('p',t('Fixed kp = 10 h Mpc⁻¹, ms = 2.5 · LF + τ + xHI. This assessment does not apply to the LF-only archive, free-ms runs, or PL emulator.','固定 kp = 10 h Mpc⁻¹、ms = 2.5 · LF + τ + xHI。此诊断不适用于 LF-only 归档、自由 ms 或 PL emulator。')));mount.append(heading);
      if(mount.hasAttribute('data-convergence-archive')) mount.append(el('p',t('This is the newer 2000-step diagnostic assessment only. The corner plots and walker snapshots below remain the separately dated 1000-step archive; they have not been relabeled as 2000-step results.','此处仅新增 2000 步诊断评估。下方 corner 图和 walker 快照仍是单独标注日期的 1000 步归档，未改标成 2000 步结果。'),'cv-note'));
      const stats=el('div',undefined,'cv-stats');statistic(stats,t('Stored steps / E0 · E1','保存步数 / E0 · E1'),'2000 / 1000',t('32 walkers each; not 32 independent chains.','各 32 个 walker，不是 32 条独立链。'));statistic(stats,t('Sampled parameters passing all displayed gates','所有展示指标均达标的采样参数'),`${result.sampled.filter(r=>r.checks.every(Boolean)).length} / 8`,t('Passing a single gate is not convergence.','单项达标不代表收敛。'));statistic(stats,t('Worst equal-window R̂¹','最差等长窗口 R̂¹'),fmt(result.worstRhat,3),'≤ 1.05');statistic(stats,t('Minimum full-chain N / IAT²','完整链最小 N / IAT²'),fmt(result.minLength),'≥ 50');mount.append(stats);
      mount.append(el('p',t('¹ R̂: E0 steps 1001–2000 versus E1 steps 1–1000. No independent 2000-step R̂ exists. ² N/IAT, ESS, half-chain drift and IAT change: E0 steps 1–2000. Estimates remain provisional under nonstationarity.','¹ R̂：E0 第 1001–2000 步对比 E1 第 1–1000 步。没有两组独立 2000 步的 R̂。² N/IAT、ESS、半链漂移及 IAT 变化：E0 第 1–2000 步。非平稳状态下，这些估计仍属暂定。'),'cv-note'));
      if(mount.dataset.convergence==='summary'){
        const link=el('a',t('Per-parameter pass / fail and remaining gap →','查看逐参数达标状态与剩余差距 →'),'system-action');link.href='convergence.html?v=20261020-1#convergence';mount.append(link);continue;
      }
      mount.append(table(result.sampled));
      const details=el('details'),summary=el('summary',t('Derived and likelihood diagnostics / 4 additional quantities','派生量及似然诊断 / 另 4 项'));details.append(summary,table(result.rows.filter(r=>!r.sampled)));mount.append(details);
      const gates=el('section',undefined,'cv-gates');gates.append(el('h3',t('Which checks pass?','哪些单项已经达标？')));
      const lines=[
        t(`R̂: ${result.passCounts[0]}/12 pass; all eight sampled parameters fail.`,`R̂：${result.passCounts[0]}/12 项达标；8 个采样参数均未通过。`),
        t(`Chain length ≥ 50 IAT: ${result.passCounts[1]}/12 pass.`,`链长 ≥ 50 IAT：${result.passCounts[1]}/12 项达标。`),
        t(`ESS ≥ 2000: ${result.passCounts[2]}/12 pass — αesc only.`,`ESS ≥ 2000：${result.passCounts[2]}/12 项达标，仅 αesc。`),
        t(`Full-chain half drift ≤ 0.20: ${result.passCounts[3]}/12 pass; late-window checks still fail.`,`完整链半链漂移 ≤ 0.20：${result.passCounts[3]}/12 项达标；尾窗口检查仍有失败。`),
        t(`IAT stability ≤ 0.30: ${result.passCounts[4]}/12 pass — α★, LX and τ.`,`IAT 稳定性 ≤ 0.30：${result.passCounts[4]}/12 项达标，为 α★、LX 和 τ。`),
        t(`Fully motionless walkers: E0 ${result.stuck[0]}, E1 ${result.stuck[1]}. This is not a mixing certificate.`,`完全不移动的 walker：E0 ${result.stuck[0]}、E1 ${result.stuck[1]}。这不代表混合良好。`),
      ];const ul=el('ul');lines.forEach(line=>ul.append(el('li',line)));gates.append(ul);mount.append(gates);
      const gap=el('aside',undefined,'cv-gap');gap.append(el('h3',t('How far from the thresholds?','距离阈值还差多少？')),el('p',t(`The worst R̂ is ${fmt(result.worstRhat,3)} against 1.05. The weakest length/IAT is ${fmt(result.minLength)}, about ${Math.round(result.minLength/limits.length*100)}% of its threshold. R̂ cannot be translated into a reliable number of remaining steps.`,`最差 R̂ 为 ${fmt(result.worstRhat,3)}，目标为 1.05。最小链长/IAT 为 ${fmt(result.minLength)}，约为阈值的 ${Math.round(result.minLength/limits.length*100)}%。不能由 R̂ 可靠推算剩余步数。`)),el('p',t(`If every current IAT stayed unchanged, the length criterion alone would require approximately ${result.lengthOnlyTarget.toLocaleString('en-US')} total E0 steps, +${(result.lengthOnlyTarget-data.full.steps).toLocaleString('en-US')} beyond 2000. This is a conditional length-only extrapolation, not a convergence forecast or a submitted continuation.`,`仅假设当前各项 IAT 不变，链长条件约需 E0 累计 ${result.lengthOnlyTarget.toLocaleString('en-US')} 步，比 2000 步再增加 ${ (result.lengthOnlyTarget-data.full.steps).toLocaleString('en-US')} 步。这只是有条件的链长外推，不是收敛预测，也未因此提交续跑。`)));mount.append(gap);
      mount.append(el('p',t('Caution: some xHI(z=5.9) walker sequences are constant in the late half of the equal-window comparison. Its IAT/ESS in that window is unavailable, not a pass. Full-chain values above are a separate, provisional estimate. Saved rows are never removed.','注意：等长比较窗口的后半段中，部分 xHI(z=5.9) walker 序列恒定。该窗口的 IAT/ESS 不可评估，不算通过。上表完整链数值是另一窗口的暂定估计。未删除任何保存记录。'),'cv-note'));
      const download=el('a',t('Download source diagnostics / JSON ↗','下载源诊断 / JSON ↗'),'system-action');download.href=url;mount.append(download);
    }
  }
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  render();fetch(url+'?v=20261020-1').then(r=>{if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.json();}).then(d=>{result=summarize(d);data=d;render();}).catch(e=>{failure=e.message;data=null;render();});
})(typeof window==='undefined'?globalThis:window);
