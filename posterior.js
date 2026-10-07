/* Real LF joint samples: isolated from the legacy one-at-a-time atlas. */
(() => {
  'use strict';
  let catalog=null, enabled=false, chosen=null, loadError=null, plData=null, plError=null;
  const lfNames=['F_STAR10','ALPHA_STAR','M_TURN','t_STAR'];
  function plForSample(sample){
    if(!sample || sample.rank!==0)return null;
    const prediction=plData?.models.find(m=>m.key===model()?.key);
    if(!prediction || !lfNames.every(k=>prediction.astrophysics[k]===sample.parameters[k]))return null;
    return {pl_id:prediction.source_id,astro_parameters:prediction.astrophysics,
      conditional_lf_reference:true,source_grid_shape:[prediction.simulation.HII_DIM, prediction.simulation.HII_DIM, prediction.simulation.HII_DIM],
      global:{redshift:prediction.redshifts,brightness_mk:prediction.global_brightness_mK,xhi:prediction.global_xHI},
      ionization_history:{redshift:prediction.redshifts,ionized_fraction:prediction.global_xHI.map(v=>1-v),tau_e:prediction.tau},
      luminosity_function:{redshift:[6,7,8,10],curves:[6,7,8,10].map(z=>({muv:prediction.LF[z].Muv,log10_phi:prediction.LF[z].log10_phi}))}};
  }
  const active=()=>enabled;
  const text=(en,zh)=>state.language==='zh'?zh:en;
  function model(){return catalog?.models.find(m=>m.KP_h_Mpc===state.parameters.KP_h_Mpc && m.MS===state.parameters.MS);}
  function render(){
    const box=document.getElementById('posterior-controls');if(!box)return;
    document.getElementById('posterior-mode-label').textContent=text('Data selection','数据选择');
    const mode=document.getElementById('posterior-mode');
    mode.options[0].textContent=text('Original parameter grid','原有参数网格');
    mode.options[1].textContent=text('LF posterior joint samples','LF 后验联合样本');
    document.getElementById('posterior-sample-label').textContent=text('Stored joint sample','已存联合样本');
    document.getElementById('posterior-sample').disabled=!enabled || !model();
    let note=text('LF constrains F★,10, α★, Mturn and t★. Escape and X-ray parameters are fixed assumptions.','LF 约束 F★,10、α★、Mturn、t★；逃逸率及 X-ray 参数为固定假设。');
    if(loadError)note=text('Posterior catalog unavailable: ','后验目录不可用：')+loadError;
    else if(enabled){
      note+=' '+text('Only actual joint rows are selectable; no independent interpolation. PL predictions are available for the best retained sample of each BPL group only; PL lightcone and slice arrays were not saved.','只选择实际联合样本，不独立插值参数；各 BPL 组最高似然样本已有 PL 预测，但没有保存 PL 光锥和切片数组。');
      if(chosen)note+=' '+text('Selected: ','已选：')+chosen.run_id+' · '+chosen.status+' · log LF = '+chosen.provenance.log_LF.toFixed(3);
      else note+=' '+text('No posterior models available for this kp/ms (including PL).','此 kp/ms 尚无后验模型（包括 PL）。');
      if(chosen?.status==='under_review')note+=' '+text('Extreme kinetic temperature: withheld for numerical review.','动温存在极端值：暂不展示，等待数值核查。');
      if(chosen?.status==='awaiting_validation')note+=' '+text('Computed; awaiting data validation.','计算完成，等待数据校验。');
      note+=' '+text('Static status as of ','静态状态更新时间：')+(catalog.status_as_of_utc||'—');
      document.getElementById('parameter-mode-note').textContent=text('Astrophysical values are locked to the selected joint row.','天体物理参数锁定为所选联合样本的真实值。');
      if(!state.result){
        document.getElementById('status-message').textContent=chosen
          ? text('No completed simulation loaded for this exact sample. No baseline substitution.','此确切样本尚无已加载的完整模拟，不以基准模型替代。')
          : text('No sample available for this model.','此模型暂无样本。');
      }
    }
    document.getElementById('posterior-note').textContent=note;
    let link=document.getElementById('posterior-pl-link');
    if(!link){link=document.createElement('a');link.id='posterior-pl-link';document.getElementById('posterior-note').after(link);}
    link.textContent=text('Saved PL predictions at BPL LF-best parameters →','BPL LF 最佳参数下的已存 PL 预测 →');
    const key=model()?.key;
    link.href='pl-lf-predictions.html'+(key?'?model='+encodeURIComponent(key):'');
    let warning=document.getElementById('posterior-pl-comparison-note');
    if(!warning){warning=document.createElement('p');warning.id='posterior-pl-comparison-note';warning.style.gridColumn='1 / -1';warning.style.borderLeft='2px solid #df5a2e';warning.style.padding='8px 14px';document.getElementById('analysis-section').prepend(warning);}
    warning.hidden=!enabled;
    warning.textContent=plError?text('PL comparison data unavailable: ','PL 对照数据不可用：')+plError
      :state.plReference?.conditional_lf_reference
        ?text('PL LF/Tb/τ: saved forward at the same four LF-constrained parameters only. PL: 128³, Fesc10=−1.5, αesc=−0.25, LX=40, EX=800 eV. BPL assumptions/grid differ; Δτ is not a controlled model difference. PL spatial data pending.','PL LF/Tb/τ：仅共享四个 LF 约束参数的已存预测。PL：128³，Fesc10=−1.5、αesc=−0.25、LX=40、EX=800 eV。BPL 假设及网格不同，Δτ 不构成受控模型差异；PL 空间数据待完成。')
        :text('No saved PL prediction for this exact sample; no best-sample substitution.','此确切样本没有已存 PL 预测，不以最佳样本结果替代。');
    document.querySelectorAll('[data-i18n="matchedPL"]').forEach(node=>{node.textContent=enabled?text('LF-CONDITIONAL PL','LF 条件 PL'):window.AtlasI18n.t('matchedPL');});
    document.querySelectorAll('[data-i18n="lfSubtitle"]').forEach(node=>{node.textContent=enabled?text('MODEL–OBSERVATION COMPARISON · BPL / LF-CONDITIONAL PL','模型与观测对比 · BPL / LF 条件 PL'):window.AtlasI18n.t('lfSubtitle');});
  }
  function applySample(sample){
    chosen=sample;
    for(const name of astroNames){
      const c=state.controls.get(name);
      c.slider.disabled=enabled;
      if(sample){
        state.parameters[name]=sample.parameters[name];
        c.valueNode.textContent=sample.parameters[name].toPrecision(6);
        c.slider.setAttribute('aria-valuetext',String(sample.parameters[name]));
        // Do not imply a nearest discrete atlas value is the posterior value.
        c.slider.style.visibility='hidden';
      }else{
        c.valueNode.textContent='—';c.slider.style.visibility=enabled?'hidden':'';
      }
    }
  }
  function resolve(changedName){
    const select=document.getElementById('posterior-sample');
    if(changedName==='KP_h_Mpc'||changedName==='MS'||changedName==='mode'){
      const m=model();select.replaceChildren();
      for(const s of m?.samples||[]){
        const option=document.createElement('option');option.value=s.run_id;
        option.textContent=s.rank===0?text('Best retained likelihood','最高似然已存样本'):text('Joint coverage sample ','联合代表样本 ')+s.rank;
        select.append(option);
      }
      select.value=m?.samples[0]?.run_id||'';
    }
    applySample(model()?.samples.find(s=>s.run_id===select.value)||null);
    render();return chosen?.run_id||'posterior-unavailable';
  }
  async function load(runId){
    const sample=chosen;
    showUnavailableRun(runId); // Cancel old requests and clear all old-model canvases.
    render();
    if(!sample || sample.status!=='completed' || !sample.file)return;
    const serial=++state.requestSerial;
    state.status={kind:'loading',runId};renderStatus();
    try{
      const result=await fetchJSON(versioned(sample.file));
      if(serial!==state.requestSerial)return;
      if(result.run_id!==sample.run_id || Object.keys(sample.parameters).some(k=>result.parameters[k]!==sample.parameters[k]))
        throw new Error('Posterior result identity mismatch');
      result.decodedPlane=decodePlane(result.lightcone);
      result.decodedSlices=await decodeSlices(result.slices,sample.file.slice(0,sample.file.lastIndexOf('/')));
      if(serial!==state.requestSerial)return;
      state.plReference=plForSample(sample);state.result=result;showResult();render();
    }catch(error){
      if(serial!==state.requestSerial)return;
      state.status={kind:'error',runId,error};renderStatus();render();
    }
  }
  async function initialize(){
    const mode=document.getElementById('posterior-mode');
    try{
      catalog=await fetchJSON('web_data/posterior/catalog.json');
      if(catalog.schema_version!==1 || !Array.isArray(catalog.models))throw new Error('Invalid posterior catalog');
      try{
        plData=await fetchJSON('web_data/pl_lf_predictions/index.json?v=20261007-1');
        if(plData.schemaVersion!==1 || plData.models.length!==25)throw new Error('Invalid PL prediction catalog');
      }catch(error){plError=error.message;}
      mode.disabled=false;
    }catch(error){loadError=error.message;mode.disabled=true;}
    mode.addEventListener('change',()=>{
      enabled=mode.value==='posterior';
      if(enabled){load(resolve('mode'));window.AtlasMCMC?.render(state.mcmc);}
      else{
        chosen=null;
        for(const name of astroNames){const c=state.controls.get(name);c.slider.disabled=false;c.slider.style.visibility='';}
        resetControls();
      }
      render();
    });
    document.getElementById('posterior-sample').addEventListener('change',()=>load(resolve('sample')));
    render();
  }
  window.AtlasPosterior={active,initialize,resolve,load,render,reset:()=>load(resolve('mode'))};
})();
