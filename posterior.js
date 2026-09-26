/* Real LF joint samples: isolated from the legacy one-at-a-time atlas. */
(() => {
  'use strict';
  let catalog=null, enabled=false, chosen=null, loadError=null;
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
      note+=' '+text('Only actual joint rows are selectable; no independent interpolation. No matching PL simulation has been computed for these new samples.','只选择实际联合样本，不独立插值参数；这些新样本尚无同参数 PL 模拟。');
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
      state.plReference=null;state.result=result;showResult();render();
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
