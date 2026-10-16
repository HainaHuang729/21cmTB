import { clamp } from './data.js';
import { ATLAS_FIELDS, AtlasStore, atlasColor, atlasValue, loadAtlasIndex } from './atlas-data.js';

const $=id=>document.getElementById(id),pair=document.querySelector('.atlas-pair');
let index,store,primary,reference,controller,serial=0,field='brightness',frame=20,playing=0;
let colorRange=ATLAS_FIELDS.brightness.range;
let comparePreference=true;
const point=[128,128];
const fmt=value=>Number(value.toPrecision(6)).toString();
const kind=()=>$('atlas-collection').value;
const entries=()=>kind()==='runs'?index.inventory:index.pl_inventory;
function status(text,error=false){$('atlas-status').textContent=text;$('atlas-status').classList.toggle('error',error);}
new ResizeObserver(entries=>document.documentElement.style.setProperty('--dock-height',`${entries[0].target.getBoundingClientRect().height}px`)).observe(document.querySelector('.atlas-controls'));

function parametersLabel(entry,collection){
  const baseline=index.inventory.find(e=>e.run_id===index.baseline_run_id);
  if(collection==='runs'){
    if(entry.role.kind==='baseline')return '基准 · KP = 1，MS = 1.5';
    if(entry.role.kind==='astro_oat')return `${entry.role.parameter} = ${entry.parameters[entry.role.parameter]}`;
    return `KP = ${entry.parameters.KP_h_Mpc}，MS = ${entry.parameters.MS}`;
  }
  const source=index.inventory.find(e=>entry.source_run_ids.includes(e.run_id));
  if(!source)return entry.pl_id;
  const differences=Object.entries(source.parameters).filter(([key,value])=>!['KP_h_Mpc','MS'].includes(key)&&value!==baseline.parameters[key]);
  return differences.length?differences.map(([key,value])=>`${key} = ${value}`).join('，'):'基准天体物理参数';
}
function populate(){
  $('atlas-model').replaceChildren(...entries().map((entry,i)=>{
    const option=document.createElement('option');option.value=kind()==='runs'?entry.run_id:entry.pl_id;option.textContent=`${String(i+1).padStart(2,'0')} · ${parametersLabel(entry,kind())}`;return option;
  }));
  if(kind()==='runs')$('atlas-model').value=index.baseline_run_id;
  else{$('atlas-model').value=index.pl_inventory.find(e=>e.source_run_ids.includes(index.baseline_run_id))?.pl_id||index.pl_inventory[0].pl_id;}
  $('atlas-compare').disabled=kind()==='pl';$('atlas-compare').checked=kind()==='runs'&&comparePreference;$('atlas-model').disabled=false;
}
function stop(){clearInterval(playing);playing=0;$('atlas-play').textContent='播放';$('atlas-play').setAttribute('aria-pressed','false');}
function drawOne(canvas,result){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,512);if(!result)return;
  const image=new ImageData(256,256),f=ATLAS_FIELDS[field];let min=Infinity,max=-Infinity,sum=0,clipped=0;
  for(let row=0;row<256;row++)for(let col=0;col<256;col++){
    const value=atlasValue(result.decoded,frame,col,row);min=Math.min(min,value);max=Math.max(max,value);sum+=value;
    if(value<colorRange[0]||value>colorRange[1])clipped++;
    image.data.set([...atlasColor(value,field,colorRange),255],(row*256+col)*4);
  }
  const offscreen=document.createElement('canvas');offscreen.width=offscreen.height=256;offscreen.getContext('2d').putImageData(image,0,0);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(offscreen,0,0,512,512);
  const x=point[0]*2+1,y=point[1]*2+1;ctx.strokeStyle='#17262dc9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();ctx.strokeStyle='#fffdf1';ctx.lineWidth=1;ctx.stroke();
  $(canvas.id+'-probe').textContent=`${f.symbol} = ${fmt(atlasValue(result.decoded,frame,...point))} ${f.unit}　[列 ${point[0]}, 行 ${point[1]}]`;
  $(canvas.id+'-range').textContent=`单帧范围 ${fmt(min)} 至 ${fmt(max)} ${f.unit} · 平均 ${fmt(sum/65536)}${clipped?` · 色标饱和 ${(clipped/65536*100).toFixed(2)}%`:''}`;
}
function drawLegend(){
  const f=ATLAS_FIELDS[field],canvas=$('atlas-legend'),ctx=canvas.getContext('2d');
  for(let x=0;x<canvas.width;x++){
    const t=x/(canvas.width-1),v=f.log?10**(Math.log10(colorRange[0])+t*Math.log10(colorRange[1]/colorRange[0])):colorRange[0]+t*(colorRange[1]-colorRange[0]);
    ctx.fillStyle=`rgb(${atlasColor(v,field,colorRange).join(',')})`;ctx.fillRect(x,0,1,12);
  }
  $('atlas-field-name').textContent=`${f.label} ${f.symbol}${f.unit?' / '+f.unit:''}`;
  $('scale-low').textContent=fmt(colorRange[0]);$('scale-high').textContent=`${fmt(colorRange[1])} ${f.unit}`;
  const mid=field==='brightness'?clamp(-colorRange[0]/(colorRange[1]-colorRange[0]),0,1):f.middle;
  $('scale-mid').textContent=f.log?fmt(Math.sqrt(colorRange[0]*colorRange[1])):fmt(colorRange[0]+(colorRange[1]-colorRange[0])*mid);
  $('scale-mid').style.left=`${mid*100}%`;$('scale-mid').hidden=mid<.1||mid>.9;
  $('scale-note').textContent=`${$('atlas-scale').value==='frame'?'本帧共同':'跨模型固定'} · ${f.log?'对数':'线性'}`;
}
function draw(){
  if(!primary)return;
  colorRange=ATLAS_FIELDS[field].range;
  if($('atlas-scale').value==='frame'&&field!=='ionized'){
    let min=Infinity,max=-Infinity;
    for(const result of [primary,reference])if(result)for(let row=0;row<256;row++)for(let col=0;col<256;col++){
      const v=atlasValue(result.decoded,frame,col,row);min=Math.min(min,v);max=Math.max(max,v);
    }
    if(field==='brightness'){min=Math.min(min,0);max=Math.max(max,0);}
    if(max>min)colorRange=[min,max];
  }
  drawLegend();
  drawOne($('primary'),primary);drawOne($('reference'),reference);
  const z=primary.meta.slices.redshift[frame];$('atlas-z').textContent=`z = ${z.toFixed(3)} · ${frame+1} / 32`;$('atlas-redshift').value=frame;
  $('atlas-redshift-display').textContent=z.toFixed(3);$('atlas-frame-display').textContent=`${String(frame+1).padStart(2,'0')} / 32`;
  $('atlas-redshift').style.setProperty('--fill',`${frame/31*100}%`);
  $('atlas-frame').textContent=`z = ${z.toFixed(3)} · ${ATLAS_FIELDS[field].label}`;
  $('atlas-prev').disabled=frame===0;$('atlas-next').disabled=frame===31;
}
async function load(){
  if(!index)return;stop();controller?.abort();controller=new AbortController();const id=++serial;
  const selected=entries().find(e=>(kind()==='runs'?e.run_id:e.pl_id)===$('atlas-model').value),collection=kind(),wantedField=field;
  const compare=collection==='runs'&&$('atlas-compare').checked;
  primary=null;reference=null;pair.setAttribute('aria-busy','true');pair.classList.toggle('single',!compare);$('reference-figure').hidden=!compare;
  $('atlas-overlay').hidden=false;$('atlas-overlay').textContent='读取数值切片并检查校验值…';$('atlas-redshift').disabled=true;$('atlas-play').disabled=true;
  for(const prefix of ['primary','reference']){$(`${prefix}-probe`).textContent='等待数据校验…';$(`${prefix}-range`).textContent='—';}
  $('primary-title').textContent=collection==='runs'?'BPL 参数扫描':'PL 参考';$('primary-meta').textContent=parametersLabel(selected,collection);
  document.querySelectorAll('[data-field]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.field===field)));colorRange=ATLAS_FIELDS[field].range;drawLegend();status('按需读取所选模型；首次载入会校验清单与数值文件。');
  try{
    const value=await store.load(selected,collection,wantedField,controller.signal);if(id!==serial)return;
    let matched=null;
    if(compare){
      const plID=value.meta.pl_reference?.pl_id,entry=index.pl_inventory.find(e=>e.pl_id===plID);if(!entry)throw new Error('缺少匹配 PL 参考');
      $('atlas-overlay').textContent='读取并校验匹配 PL…';matched=await store.load(entry,'pl',wantedField,controller.signal);if(id!==serial)return;
      if(value.meta.slices.redshift.some((z,i)=>z!==matched.meta.slices.redshift[i]))throw new Error('对照红移表不一致');
      $('reference-meta').textContent=plID;
    }
    primary=value;reference=matched;pair.setAttribute('aria-busy','false');$('atlas-overlay').hidden=true;$('atlas-redshift').disabled=false;$('atlas-play').disabled=false;draw();
    const identity=collection==='runs'?selected.run_id:selected.pl_id;
    status(`${identity} · 清单与数值文件 SHA-256 已校验 · 32 个真实红移 · ${ATLAS_FIELDS[field].label}${compare?' · 匹配 PL 同步对照':''}。点击切片读取量化后的数值。`);
  }catch(e){if(id!==serial||e.name==='AbortError')return;$('atlas-overlay').textContent=e.message;status(`${e.message}；重新选择模型或物理量可重试。`,true);}
}
$('atlas-model').addEventListener('change',load);
$('atlas-compare').addEventListener('change',()=>{comparePreference=$('atlas-compare').checked;load();});
$('atlas-scale').addEventListener('change',()=>{stop();draw();});
$('atlas-collection').addEventListener('change',()=>{populate();load();});
document.querySelectorAll('[data-field]').forEach(b=>b.addEventListener('click',()=>{field=b.dataset.field;load();}));
$('atlas-redshift').addEventListener('input',()=>{stop();frame=Number($('atlas-redshift').value);draw();});
$('atlas-prev').addEventListener('click',()=>{stop();frame=clamp(frame-1,0,31);draw();});
$('atlas-next').addEventListener('click',()=>{stop();frame=clamp(frame+1,0,31);draw();});
$('atlas-play').addEventListener('click',()=>{
  if(playing){stop();return;}if(!primary)return;if(frame===31){frame=0;draw();}
  $('atlas-play').textContent='暂停';$('atlas-play').setAttribute('aria-pressed','true');
  playing=setInterval(()=>{frame++;draw();if(frame===31)stop();},600);
});
for(const id of ['primary','reference']){
  const canvas=$(id);canvas.addEventListener('click',e=>{if(!primary)return;const r=canvas.getBoundingClientRect();point[0]=clamp(Math.floor((e.clientX-r.left)/r.width*256),0,255);point[1]=clamp(Math.floor((e.clientY-r.top)/r.height*256),0,255);draw();});
  canvas.addEventListener('keydown',e=>{if(!primary||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')point[0]--;if(e.key==='ArrowRight')point[0]++;if(e.key==='ArrowUp')point[1]--;if(e.key==='ArrowDown')point[1]++;point.forEach((n,i)=>point[i]=clamp(n,0,255));draw();});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',e=>{stop();if(!e.persisted)controller?.abort();});
async function init(){
  try{const result=await loadAtlasIndex();index=result.index;store=new AtlasStore(result.base);populate();await load();}
  catch(e){$('atlas-overlay').textContent=e.message;status(e.message,true);}
}
init();
