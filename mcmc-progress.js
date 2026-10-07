(() => {
  let data;
  const containers=[...document.querySelectorAll('[data-mcmc-progress]')];
  const zh=()=>document.documentElement.lang.startsWith('zh');
  const label=(en,cn)=>zh()?cn:en;
  const states={RUNNING:['Running','运行中'],PENDING:['Queued','排队中'],COMPLETED:['Completed','已完成'],FAILED:['Failed','失败'],UNKNOWN:['Unknown','待核验']};
  function render(){
    if(!data)return;
    for(const container of containers){
      container.replaceChildren();
      const heading=document.createElement('h3');heading.textContent=label('Fixed KP/MS · cached MCMC progress','固定KP/MS · 缓存MCMC进度');container.append(heading);
      const meta=document.createElement('p');meta.className='cp-meta';meta.textContent=label(`Static snapshot: ${data.snapshot_hkt}`,`静态快照：${data.snapshot_hkt}`);container.append(meta);
      const grid=document.createElement('div');grid.className='cp-grid';
      for(const chain of data.chains){
        const card=document.createElement('article'),title=document.createElement('p'),value=document.createElement('strong'),details=document.createElement('p'),bar=document.createElement('progress');
        title.textContent=label(`Ensemble ${chain.ensemble} · ${(states[chain.scheduler_state]||states.UNKNOWN)[0]}`,`链 ${chain.ensemble} · ${(states[chain.scheduler_state]||states.UNKNOWN)[1]}`);
        value.textContent=`${chain.stored_steps} / ${chain.target_steps}`;
        bar.max=chain.target_steps;bar.value=chain.stored_steps;bar.setAttribute('aria-label',label('Committed steps / target steps','已提交步数 / 目标步数'));
        details.textContent=label(`job ${chain.job_id} · +${chain.segment_steps}/${chain.segment_target_steps||200} this segment · previous ${(chain.previous_seconds_per_step/60).toFixed(2)} min/step`,`job ${chain.job_id} · 本段 +${chain.segment_steps}/${chain.segment_target_steps||200} · 上段 ${(chain.previous_seconds_per_step/60).toFixed(2)} 分钟/步`);
        card.append(title,value,bar,details);grid.append(card);
      }
      container.append(grid);
      const scope=document.createElement('p');scope.className='cp-note';scope.textContent=label('KP=10 · MS=2.5 · 128/512 · 16 workers × 16 threads · COMBINED. Continue full sampler/RNG state; preserve original 400/600-step files. New workers build cold caches, then reuse them. Completion does not establish convergence.','KP=10 · MS=2.5 · 128/512 · 16 workers × 16线程 · COMBINED。恢复完整采样器及RNG状态，保留原400/600步文件。新worker先建立冷缓存，再持续复用。完成步数不代表已收敛。');container.append(scope);
      const incident=document.createElement('p');incident.className='cp-note';incident.textContent=label('Startup update: job 2176955 failed at filesystem locking before sampling; fixed and replaced by 2176971. Original samples were unchanged.','启动记录：2176955在文件系统加锁阶段失败，尚未采样；已修正并由2176971续跑，原样本未改变。');container.append(incident);
      const plots=document.createElement('p');plots.className='cp-note';plots.textContent=label('Repaired fixed-model plots and downloads now contain 600 stored steps per ensemble: 38,400 correlated rows. Convergence gates failed (max R̂≈2.30); the 200-step historical archive remains separate.','修复版固定参数图与下载现为每条600步，共38,400条相关记录。收敛检查未通过（最大R̂约2.30），200步历史图谱仍独立保留。');container.append(plots);
      if(data.next_segment&&!data.next_segment.submitted){const next=document.createElement('p');next.className='cp-note';next.textContent=label('Next: +400 steps to 1000 per ensemble; submit after this completed600 snapshot is published.','下一段：每条续跑400步到1000步；先发布本次600步结果，再提交。');container.append(next);}
      const link=document.createElement('a');link.href='web_data/cache_comparison/progress.json';link.textContent=label('Download progress snapshot ↗','下载进度快照 ↗');container.append(link);
    }
  }
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  fetch('web_data/cache_comparison/progress.json?v=20261007-1',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('progress snapshot unavailable');return r.json();}).then(result=>{data=result;render();}).catch(()=>containers.forEach(c=>{c.textContent=label('Progress snapshot unavailable.','进度快照暂不可用。');}));
})();
