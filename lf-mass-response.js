/* Analytic annotation response only. Never evaluates a new LF or simulation. */
"use strict";
const responseState = {cosmology:null, design:null, fstar:-1.3, tstar:.5, language:'en'};
const redshifts = [6,7,8,10];
const colors = ['#a54636','#357b84','#6d648c','#907124'];
const responsePanels = [
  {key:'ALPHA_STAR',title:'α★',label:'α★',min:-.5,max:1,ticks:[-.5,0,.5,1]},
  {key:'F_STAR10',title:'f★,10',label:'f★,10 (log scale)',min:-3,max:0,ticks:[-3,-2,-1,0]},
  {key:'KP_h_Mpc',title:'kp',label:'kp [h Mpc⁻¹]',min:1,max:30,ticks:[1,10,20,30]},
  {key:'MS',title:'ms',label:'ms',min:1.5,max:4,ticks:[1.5,2,2.5,3,3.5,4]},
];
const byId=id=>document.getElementById(id);
const words={
  back:['← Back to LF','← 返回 LF'],heading:['One halo mass.<br>Four parameter responses.','一个暗物质晕质量。<br>四个参数响应。'],
  intro:['UV absolute magnitude of a 10¹⁰ M☉ halo, using the same 21cmFAST relation as the LF reference lines.','10¹⁰ M☉ 暗物质晕对应的 UV 绝对星等，使用与 LF 参考线一致的 21cmFAST 转换关系。'],
  note:['Controlled parameter sweeps, not MCMC correlations or new simulations. At this pivot mass, α★ cancels; kp and ms affect halo abundance but do not enter this mass–UV relation. Horizontal curves are expected.','这是固定其余参数的单参数响应，不是 MCMC 相关性或新模拟。在此定义质量处，α★ 的影响抵消；kp、ms 影响暗物质晕丰度，但不直接进入质量–UV 转换关系，因此水平线是预期结果。'],
  'f-label':['Fixed log₁₀ f★,10','固定 log₁₀ f★,10'],'t-label':['Fixed t★','固定 t★'],reset:['Reset defaults','恢复默认'],download:['Download CSV','下载 CSV'],
  'readout-heading':['Current reference values','当前参考数值'],
  hover:['Move over a plot to read its values.','移动到图上可查看数值。'],
  scope:['kp is in h Mpc⁻¹. f★,10 is shown on a logarithmic axis; MUV is not logarithmically transformed again. Smaller MUV means brighter. The f★ panel varies f★; the other three panels hold it fixed. All panels share one magnitude scale.','kp 的单位是 h Mpc⁻¹。f★,10 使用对数横轴，MUV 不再取对数；MUV 越小越亮。f★ 面板改变 f★，另三个面板固定 f★。所有面板共用同一星等纵轴。'],
  flat:['No direct dependence at this mass','此质量处无直接依赖'],slope:['Brighter UV with higher stellar efficiency','恒星形成效率越高，UV 越亮'],
  ready:['Source relation loaded · no new simulation','已加载模型转换关系 · 无新模拟'],
};
function text(key){return words[key][responseState.language==='zh'?1:0];}
function uv(panel,x,z){
  const astro={F_STAR10:responseState.fstar,t_STAR:responseState.tstar,ALPHA_STAR:.5};
  astro[panel.key]=x;
  return window.AtlasLFMass.magnitude(astro,responseState.cosmology,z);
}
function ticks(panel,x){return panel.key==='F_STAR10' ? [0.001,.01,.1,1][x+3] : String(x);}
function renderResponse(){
  if(!responseState.cosmology)return;
  document.documentElement.lang=responseState.language==='zh'?'zh-CN':'en';
  for(const id of Object.keys(words))if(byId(id))byId(id).innerHTML=text(id);
  byId('language').textContent=responseState.language==='zh'?'English':'中文';
  byId('status').textContent=text('ready');
  byId('f-value').textContent=responseState.fstar.toFixed(2);
  byId('t-value').textContent=responseState.tstar.toFixed(2);
  window.AtlasStellarFraction.render(responseState);
  byId('legend').innerHTML=redshifts.map((z,i)=>`<span><i style="border-color:${colors[i]}"></i>z = ${z}</span>`).join('');
  const extrema=redshifts.flatMap(z=>responsePanels.flatMap(p=>[uv(p,p.min,z),uv(p,p.max,z)]));
  const ymin=Math.floor(Math.min(...extrema)-.4),ymax=Math.ceil(Math.max(...extrema)+.4);
  const W=640,H=420,L=80,R=20,T=35,B=68,PW=W-L-R,PH=H-T-B;
  byId('plots').replaceChildren();
  for(const panel of responsePanels){
    const px=x=>L+(x-panel.min)/(panel.max-panel.min)*PW;
    const py=y=>T+(y-ymin)/(ymax-ymin)*PH;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="MUV versus ${panel.title}"><title>MUV versus ${panel.title}; Mhalo = 10¹⁰ M☉</title>`;
    for(let y=Math.ceil(ymin/2)*2;y<=ymax;y+=2){
      svg+=`<path d="M${L} ${py(y)}H${W-R}" stroke="#181a19" stroke-opacity=".10"/><text x="${L-14}" y="${py(y)+6}" text-anchor="end" font-size="17" fill="#686b67">${y}</text>`;
    }
    for(const x of panel.ticks)svg+=`<path d="M${px(x)} ${H-B}v6" stroke="#181a19"/><text x="${px(x)}" y="${H-B+30}" text-anchor="middle" font-size="17" fill="#686b67">${ticks(panel,x)}</text>`;
    svg+=`<path d="M${L} ${T}V${H-B}H${W-R}" fill="none" stroke="#181a19"/><text x="${L+PW/2}" y="${H-12}" text-anchor="middle" font-size="20">${panel.label}</text><text transform="translate(24 ${T+PH/2}) rotate(-90)" text-anchor="middle" font-size="19">MUV at 10¹⁰ M☉ [AB mag]</text>`;
    redshifts.forEach((z,i)=>{
      const points=Array.from({length:101},(_,j)=>{const x=panel.min+(panel.max-panel.min)*j/100;return `${j?'L':'M'}${px(x).toFixed(2)} ${py(uv(panel,x,z)).toFixed(2)}`;}).join(' ');
      svg+=`<path class="response-curve" data-redshift="${z}" d="${points}" fill="none" stroke="${colors[i]}" stroke-width="2"/>`;
    });
    if(panel.key==='F_STAR10')svg+=`<path d="M${px(responseState.fstar)} ${T}V${H-B}" stroke="#686b67" stroke-dasharray="3 5"/>`;
    svg+=`<rect class="probe" x="${L}" y="${T}" width="${PW}" height="${PH}" fill="transparent"/></svg>`;
    const article=document.createElement('article');article.className='plot';article.dataset.parameter=panel.key;
    article.innerHTML=`<h2>${panel.title}</h2><p>${text(panel.key==='F_STAR10'?'slope':'flat')}</p>${svg}`;
    article.querySelector('.probe').addEventListener('pointermove',event=>{
      const bounds=article.querySelector('svg').getBoundingClientRect();
      const fraction=Math.max(0,Math.min(1,((event.clientX-bounds.left)*W/bounds.width-L)/PW));
      const x=panel.min+fraction*(panel.max-panel.min);
      const value=panel.key==='F_STAR10'?(10**x).toPrecision(4):x.toFixed(3);
      byId('hover').textContent=`${panel.title} = ${value} | `+redshifts.map(z=>`z=${z}: ${uv(panel,x,z).toFixed(3)}`).join(' · ')+' AB mag';
    });
    byId('plots').append(article);
  }
  byId('values').innerHTML=redshifts.map(z=>`<tr><td>${z}</td><td>${uv(responsePanels[0],.5,z).toFixed(4)}</td></tr>`).join('');
  const c=responseState.cosmology;
  byId('provenance').textContent=`21cmFAST ComputeLF / component 1 · Ωm=${c.OMm}, Ωb=${c.OMb}, h=${c.hlittle} · ${responseState.design.design_version}.`;
}
byId('language').addEventListener('click',()=>{responseState.language=responseState.language==='en'?'zh':'en';renderResponse();});
for(const [id,key] of [['fstar','fstar'],['tstar','tstar']])byId(id).addEventListener('input',()=>{responseState[key]=Number(byId(id).value);renderResponse();});
byId('reset').addEventListener('click',()=>{responseState.fstar=-1.3;responseState.tstar=.5;byId('fstar').value=-1.3;byId('tstar').value=.5;renderResponse();});
byId('download').addEventListener('click',()=>{
  if(!responseState.cosmology)return;
  const rows=['parameter,parameter_value,redshift,halo_mass_msun,MUV_AB_mag,fixed_fstar10,fixed_tstar'];
  for(const panel of responsePanels)for(let j=0;j<=100;j++)for(const z of redshifts){
    const x=panel.min+(panel.max-panel.min)*j/100;
    rows.push([panel.key==='F_STAR10'?'fstar10':panel.key,panel.key==='F_STAR10'?10**x:x,z,1e10,uv(panel,x,z),panel.key==='F_STAR10'?'':10**responseState.fstar,responseState.tstar].join(','));
  }
  const url=URL.createObjectURL(new Blob([rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='halo-1e10-uv-parameter-response.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
(async()=>{
  try{
    const response=await fetch('web_data/index.json');if(!response.ok)throw new Error(`web_data/index.json: HTTP ${response.status}`);
    const design=await response.json();const c=design.cosmology;
    if(!c||!['OMm','OMb','hlittle'].every(k=>Number.isFinite(c[k])&&c[k]>0))throw new Error('Invalid atlas cosmology');
    responseState.design=design;responseState.cosmology=c;
    const query=new URLSearchParams(location.search);
    for(const [key,min,max] of [['fstar',-3,0],['tstar',.01,1]])if(query.has(key)){
      const value=Number(query.get(key));if(Number.isFinite(value)&&value>=min&&value<=max){responseState[key]=value;byId(key).value=value;}
    }
    try{if(localStorage.getItem('21cm-atlas-language')==='zh')responseState.language='zh';}catch{}
    renderResponse();
  }catch(error){byId('status').textContent=`Load failed / 加载失败: ${error.message}`;byId('status').setAttribute('role','alert');}
})();
