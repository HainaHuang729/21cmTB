/* Saved physical predictions: no synthetic slices, interpolation or online simulation. */
(() => {
  'use strict';
  let lang='en', data=null;
  try{if(localStorage.getItem('21cm-atlas-language')==='zh')lang='zh';}catch(_){/* Storage optional. */}
  const $=id=>document.getElementById(id), t=(en,zh)=>lang==='zh'?zh:en;
  const requested=new URLSearchParams(location.search).get('model');
  const finitePairs=(x,y)=>x.map((v,i)=>[v,y[i]]).filter(p=>p.every(Number.isFinite));
  function chart(title,xlabel,ylabel,series,range={}) {
    const all=series.flatMap(s=>finitePairs(s.x,s.y));
    if(!all.length)throw new Error('No finite chart values: '+title);
    let xmin=range.xmin??Math.min(...all.map(p=>p[0])), xmax=range.xmax??Math.max(...all.map(p=>p[0]));
    let ymin=range.ymin??Math.min(...all.map(p=>p[1])), ymax=range.ymax??Math.max(...all.map(p=>p[1]));
    if(ymax===ymin){ymin-=.5;ymax+=.5;} if(xmax===xmin)xmax=xmin+1;
    const px=x=>82+(x-xmin)/(xmax-xmin)*470, py=y=>280-(y-ymin)/(ymax-ymin)*230;
    const fmt=v=>Math.abs(v)>=1000?v.toExponential(1):Number(v.toPrecision(3)).toString();
    let svg='<svg viewBox="0 0 600 350" role="img" aria-label="'+title+'"><title>'+title+'</title><defs><clipPath id="plot-area"><rect x="82" y="50" width="470" height="230"/></clipPath></defs>';
    for(let i=0;i<=4;i++){
      const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;
      svg+=`<path d="M82 ${py(y)}H552" stroke="#181a19" opacity=".1"/><text x="72" y="${py(y)+5}" text-anchor="end">${fmt(y)}</text><text x="${px(x)}" y="303" text-anchor="middle">${fmt(x)}</text>`;
    }
    series.forEach((s,i)=>{
      // Invalid cells split a curve; they are never joined across a missing interval.
      let path='',pen=false;
      s.x.forEach((x,j)=>{const y=s.y[j];if(!Number.isFinite(x)||!Number.isFinite(y)){pen=false;return;}path+=`${pen?'L':'M'}${px(x)},${py(y)} `;pen=true;});
      svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" clip-path="url(#plot-area)"/><text x="${90+i*95}" y="30" fill="${s.color}">${s.label||''}</text>`;
    });
    svg+=`<path d="M82 50V280H552" fill="none" stroke="#181a19"/><text x="317" y="338" text-anchor="middle">${xlabel}</text><text transform="translate(21 165) rotate(-90)" text-anchor="middle">${ylabel}</text></svg>`;
    const section=document.createElement('section');section.className='ms-card';
    const heading=document.createElement('h2');heading.textContent=title;section.append(heading);
    const plot=document.createElement('div');plot.innerHTML=svg;plot.style.fontFamily='monospace';plot.style.fontSize='14px';section.append(plot);$('charts').append(section);
  }
  function render(){
    document.documentElement.lang=lang;
    $('en').setAttribute('aria-pressed',String(lang==='en'));$('zh').setAttribute('aria-pressed',String(lang==='zh'));
    $('title').textContent=t('PL at LF-constrained parameters','LF 约束参数下的 PL 预测');
    $('scope').textContent=t('25 completed PL forwards using the frozen best retained LF sample of each BPL group. These are conditional comparisons, not refitted PL posterior samples.','25 组已完成的 PL 计算，使用各 BPL 组冻结的最高 LF 似然样本。它们是条件对照，不是重新拟合的 PL 后验样本。');
    $('warning').textContent=t('These jobs did not save lightcone or slice arrays. Only saved global histories, LF, τ and coeval power are shown. Escape and X-ray parameters are fixed assumptions, not LF constraints.','这些任务没有保存光锥或切片数组。这里只展示已保存的全局历史、LF、τ 和共时功率谱。逃逸率及 X-ray 参数为固定假设，不是 LF 约束。');
    $('selector-label').textContent=t('Source BPL LF group','来源 BPL LF 参数组');$('metadata-title').textContent=t('Actual configuration & provenance','实际配置与来源');
    if(!data)return;
    const m=data.models.find(m=>m.key===$('model').value);if(!m)return;
    $('status').textContent=`${m.source_id} · PL · HII_DIM=${m.simulation.HII_DIM} · DIM=${m.simulation.DIM} · ${m.simulation.BOX_LEN} cMpc · z=${m.redshifts[0]}–${m.redshifts.at(-1)} · τ=${m.tau.toFixed(5)} · xHI(5.9)=${m.xHI_z5p9.toFixed(5)}`;
    $('charts').replaceChildren();
    const single=(y)=>[{x:m.redshifts,y,color:'#B84B3E',label:'PL'}];
    chart(t('Neutral hydrogen history','中性氢演化'),'Redshift z','〈xHI〉',single(m.global_xHI),{ymin:0,ymax:1});
    chart(t('Mean 21-cm brightness temperature','平均 21-cm 亮温'),'Redshift z','〈Tb〉 [mK]',single(m.global_brightness_mK));
    const colors=['#B84B3E','#4D8F9C','#686b67','#a8873d'];
    [6,7,8,10].forEach((z,i)=>chart(`LF · z=${z}`,'MUV','log10 φ [Mpc⁻³ mag⁻¹]',[{x:m.LF[z].Muv,y:m.LF[z].log10_phi,color:colors[i],label:`z=${z}`}],{xmin:-24,xmax:-10,ymin:-10,ymax:0}));
    chart(t('Coeval 21-cm power','共时 21-cm 功率谱'),'log10 k [Mpc⁻¹]','log10 Δ²21 [mK²]',[6,8,10].map((z,i)=>({x:m.k_1_Mpc.map(Math.log10),y:m.Delta21_mK2[m.redshifts.indexOf(z)].map(v=>v>0?Math.log10(v):NaN),color:colors[i],label:`z=${z}`})));
    $('parameters').textContent=JSON.stringify({astrophysics:m.astrophysics,cosmology:m.cosmology,physics:m.physics,seed:m.seed,source_sample:m.source_ensemble_step_walker,source_report_sha256:m.source_report_sha256,prediction_sha256:m.prediction_sha256,PL_log_LF:m.PL_log_LF,PL_LF_domain_error:m.PL_LF_domain_error},null,2);
  }
  ['en','zh'].forEach(l=>$(l).onclick=()=>{lang=l;try{localStorage.setItem('21cm-atlas-language',l);}catch(_){}render();});
  $('model').onchange=()=>{history.replaceState(null,'',`?model=${encodeURIComponent($('model').value)}`);render();};
  render();
  fetch('web_data/pl_lf_predictions/index.json?v=20261007-1').then(async response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();if(data.schemaVersion!==1||data.models.length!==25)throw new Error('Invalid saved prediction catalog');for(const m of data.models){const option=document.createElement('option');option.value=m.key;option.textContent=m.key;$('model').append(option);}if(data.models.some(m=>m.key===requested))$('model').value=requested;$('model').disabled=false;render();}).catch(error=>{$('status').textContent=t('Data unavailable','数据不可用');$('error').textContent=error.message;});
})();
