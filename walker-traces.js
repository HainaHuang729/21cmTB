(() => {
 'use strict';
 const host=document.querySelector('[data-walker-traces]');if(!host)return;
 const base='web_data/walkers1000/';const find=id=>host.querySelector(`[data-walker="${id}"]`);
 const controls={parameter:find('parameter'),ensemble:find('ensemble'),walker:find('walker'),start:find('start'),end:find('end')};
 const status=find('status'),tip=find('tip'),legend=find('legend'),download=find('download'),retry=find('retry');
 const plots=[...host.querySelectorAll('[data-walker-ensemble]')];
 const cache=new Map();let metadata,data,selectedKey='NU_X_THRESH',generation=0,lastPlot=[];
 const zh=()=>document.documentElement.lang.startsWith('zh');const t=(en,cn)=>zh()?cn:en;
 const color=i=>`hsl(${(i*137.508)%360} 60% 38%)`;
 const number=x=>Math.abs(x)>=10000||Math.abs(x)>0&&Math.abs(x)<.001?x.toExponential(2):Number(x.toPrecision(4)).toString();
 function copy(){
  host.querySelectorAll('[data-walker-en]').forEach(e=>e.textContent=e.dataset[zh()?'walkerZh':'walkerEn']);
  [...controls.ensemble.options].forEach((e,i)=>e.textContent=i===0?t('Both ensembles','两条链'):t(`Ensemble ${i-1}`,`链 ${i-1}`));
  controls.walker.options[0].textContent=t('All 32 walkers','全部32个walker');
  legend.querySelectorAll('button').forEach(b=>b.setAttribute('aria-label',t(`Highlight walker ${b.dataset.id}`,`突出显示walker ${b.dataset.id}`)));
  plots.forEach((p,i)=>p.querySelector('canvas').setAttribute('aria-label',t(`Ensemble ${i} saved walker trajectories`,`链 ${i}已保存的walker轨迹`)));
  for(const k of Object.keys(controls)){const label=controls[k].parentElement.querySelector('span');if(label)controls[k].setAttribute('aria-label',label.textContent);}
  if(metadata)show();
 }
 function validate(d,key){
  if(d.parameter!==key||d.steps!==metadata.steps||d.walkers!==metadata.walkers||d.ensembles.length!==2)throw Error('Invalid trajectory shape');
  for(const ensemble of d.ensembles){if(ensemble.length!==32)throw Error('Invalid walker count');for(const row of ensemble)if(row.length!==d.steps||!row.every(Number.isFinite))throw Error('Invalid trajectory');}
  return d;
 }
 async function load(){
  if(!metadata)return;const key=controls.parameter.value;selectedKey=key;const token=++generation;data=undefined;plots.forEach(p=>{p.hidden=true;});retry.hidden=true;status.textContent=t('Loading full saved trajectories…','正在加载完整已保存轨迹…');download.hidden=true;find('png').disabled=true;
  try{
   if(!cache.has(key)){const file=metadata.parameters.find(x=>x.key===key).file;cache.set(key,fetch(base+file).then(r=>{if(!r.ok)throw Error('Trajectory unavailable');return r.json();}).then(d=>validate(d,key)).catch(e=>{cache.delete(key);throw e;}));}
   const loaded=await cache.get(key);if(token!==generation)return;data=loaded;download.href=base+metadata.parameters.find(x=>x.key===key).file;download.hidden=false;find('png').disabled=false;tip.textContent='';show();
  }catch(e){if(token!==generation)return;status.textContent=t('Trajectories unavailable. Retry to reload.','轨迹暂不可用，可点击重试。');retry.hidden=false;plots.forEach(p=>{p.hidden=true;});}
 }
 function selection(){const a=Math.max(1,Math.min(metadata.steps-1,Math.floor(Number(controls.start.value)||1)));const b=Math.max(a+1,Math.min(metadata.steps,Math.floor(Number(controls.end.value)||metadata.steps)));controls.start.value=a;controls.end.value=b;return {start:a,end:b,walker:controls.walker.value,ensemble:controls.ensemble.value};}
 function show(){
  if(!metadata||!data)return;const s=selection(),param=metadata.parameters.find(x=>x.key===selectedKey);const visible=s.ensemble==='both'?[0,1]:[Number(s.ensemble)];
  let lo=Infinity,hi=-Infinity;for(const e of visible)for(const row of data.ensembles[e])for(let k=s.start-1;k<s.end;k++){lo=Math.min(lo,row[k]);hi=Math.max(hi,row[k]);}
  const pad=(hi-lo)*.05||Math.max(Math.abs(lo)*.02,.001);lo-=pad;hi+=pad;
  const focused=s.walker==='all'?null:Number(s.walker);
  status.textContent=t(`Closed snapshot: ${metadata.steps} steps × 32 walkers per ensemble. Showing steps ${s.start}–${s.end}. Ensemble 0 is continuing separately; these charts are not live.`,`已关闭快照：每条${metadata.steps}步、32个walker。显示第${s.start}–${s.end}步。链0正在另行续跑，本图不是实时数据。`);
  legend.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===s.walker)));
  lastPlot=[];
  plots.forEach((figure,e)=>{
   figure.hidden=!visible.includes(e);if(figure.hidden)return;
   const canvas=figure.querySelector('canvas'),width=Math.max(260,Math.round(canvas.getBoundingClientRect().width)),height=Math.round(canvas.getBoundingClientRect().height)||300,dpr=Math.min(devicePixelRatio||1,2);
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
   const left=66,right=18,top=40,bottom=44,w=width-left-right,h=height-top-bottom;
   const px=step=>left+(step-s.start)/(s.end-s.start)*w,py=value=>top+(hi-value)/(hi-lo)*h;
   ctx.font='12px sans-serif';ctx.fillStyle='#26363b';ctx.fillText(t(`Ensemble ${e} · ${param.label}`,`链 ${e} · ${param.label}`),left,20);ctx.font='11px sans-serif';
   for(let n=0;n<=4;n++){const y=top+n*h/4,v=hi-n*(hi-lo)/4;ctx.strokeStyle='#e4e9e7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke();ctx.textAlign='right';ctx.fillStyle='#536369';ctx.fillText(number(v),left-7,y+4);}
   for(let n=0;n<=4;n++){const step=Math.round(s.start+n*(s.end-s.start)/4),x=px(step);ctx.strokeStyle='#edf0ee';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+h);ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#536369';ctx.fillText(String(step),x,top+h+18);}
   const order=[...Array(32).keys()].filter(i=>i!==focused);if(focused!==null)order.push(focused);
   ctx.save();ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();
   for(const walker of order){const row=data.ensembles[e][walker];ctx.strokeStyle=color(walker);ctx.globalAlpha=focused===null?.50:walker===focused?1:.07;ctx.lineWidth=walker===focused?2:1;ctx.beginPath();for(let k=s.start-1;k<s.end;k++){const x=px(k+1),y=py(row[k]);if(k===s.start-1)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
   ctx.restore();ctx.globalAlpha=1;ctx.strokeStyle='#84918e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,top+h);ctx.lineTo(left+w,top+h);ctx.stroke();ctx.fillStyle='#536369';ctx.textAlign='center';ctx.fillText(t('Stored step after 20-step burn-in','已保存步数（预热20步之后）'),left+w/2,height-7);
   figure.querySelector('figcaption').textContent=t(`Ensemble ${e}: ${focused===null?'all 32 walkers':`walker ${focused} highlighted`}. Same y-axis range in both panels.`,`链 ${e}：${focused===null?'全部32个walker':`突出显示walker ${focused}`}。两个面板采用相同纵轴范围。`);
   const info={canvas,e,left,w,top,h,lo,hi,start:s.start,end:s.end,focused,width,height};lastPlot.push(info);
   canvas.onpointermove=event=>hover(event,info);canvas.onpointerdown=event=>hover(event,info);
  });
 }
 function hover(event,p){
  if(!data)return;
  const rect=p.canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(x<p.left||x>p.left+p.w||y<p.top||y>p.top+p.h)return;
  const step=Math.max(p.start,Math.min(p.end,Math.round(p.start+(x-p.left)/p.w*(p.end-p.start))));let walker=p.focused;
  if(walker===null){const v=p.hi-(y-p.top)/p.h*(p.hi-p.lo);walker=0;for(let i=1;i<32;i++)if(Math.abs(data.ensembles[p.e][i][step-1]-v)<Math.abs(data.ensembles[p.e][walker][step-1]-v))walker=i;}
  const value=data.ensembles[p.e][walker][step-1];tip.textContent=t(`Ensemble ${p.e} · walker ${walker} · step ${step} · ${selectedKey} = ${value.toPrecision(8)}`,`链 ${p.e} · walker ${walker} · 第${step}步 · ${selectedKey} = ${value.toPrecision(8)}`);
 }
 function png(){
  if(!lastPlot.length)return;const c=document.createElement('canvas');c.width=Math.max(...lastPlot.map(p=>p.canvas.width));c.height=lastPlot.reduce((n,p)=>n+p.canvas.height,0)+110;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#26363b';ctx.font='24px sans-serif';ctx.fillText(`MCMC walker trajectories · ${selectedKey} · closed1000 snapshot`,20,36);ctx.font='16px sans-serif';ctx.fillText('Correlated ensemble walkers; exploratory, not converged. Full stored states; no thinning.',20,65);let y=100;for(const p of lastPlot){ctx.drawImage(p.canvas,0,y);y+=p.canvas.height;}c.toBlob(blob=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`walkers_${selectedKey}_1000.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 }
 controls.parameter.addEventListener('change',load);for(const k of ['ensemble','walker','start','end'])controls[k].addEventListener('change',()=>{tip.textContent='';show();});retry.addEventListener('click',()=>metadata?load():init());find('png').addEventListener('click',png);
 let timer;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(show,80);}).observe(host);new MutationObserver(copy).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 async function init(){
  retry.hidden=true;status.textContent=t('Loading walker snapshot…','正在加载walker快照…');
  try{const r=await fetch(base+'index.json');if(!r.ok)throw Error('Snapshot unavailable');metadata=await r.json();if(metadata.steps!==1000||metadata.walkers!==32||metadata.live!==false)throw Error('Unexpected snapshot');controls.parameter.replaceChildren(...metadata.parameters.map(p=>{const o=document.createElement('option');o.value=p.key;o.textContent=p.label;return o;}));controls.parameter.value=selectedKey;
   controls.walker.replaceChildren(...['all',...Array.from({length:32},(_,i)=>String(i))].map(v=>{const o=document.createElement('option');o.value=v;o.textContent=v==='all'?t('All 32 walkers','全部32个walker'):`Walker ${v}`;return o;}));
   legend.replaceChildren(...Array.from({length:32},(_,i)=>{const b=document.createElement('button');b.type='button';b.dataset.id=String(i);b.style.setProperty('--walker-color',color(i));b.textContent=`W${i}`;b.setAttribute('aria-label',t(`Highlight walker ${i}`,`突出显示walker ${i}`));b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{controls.walker.value=String(i);tip.textContent='';show();});return b;}));copy();await load();
  }catch(e){status.textContent=t('Walker snapshot unavailable. Retry to reload.','walker快照暂不可用，可点击重试。');retry.hidden=false;}
 }
 copy();init();
})();
