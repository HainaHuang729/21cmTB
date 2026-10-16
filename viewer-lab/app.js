import { axes, clamp, fetchJSON, index3, nearest, validateManifest, visibility, VolumeStore, DATASETS, FIELDS, availableFields, fieldColor, normalizedValue, paletteColor } from './data.js';
import { Renderer } from './renderer.js';
import { TransferEditor } from './transfer-editor.js';
import { samplePreset } from './transfer.js';

const $ = id => document.getElementById(id);
const defaults = { mode: 0, region: 'neutral', opacity: 4, center: .5, width: .3, light: .65, crop: 1 };
const settings = { ...defaults, points: samplePreset('neutral') };
const point = [32,32,32];
let manifests, store, current, requested, volume, renderer, requestID=0, controller, loadTimer, rendererError='';
let fieldKey='xH';
const fieldStates=new Map();
const config=()=>FIELDS[fieldKey];
const colorAt=t=>paletteColor(t,config().palette,config().middle);
const format=v=>Number(v.toFixed(Math.abs(v)<1?4:2)).toString();
function fieldDefaults(key){return key==='brightness_temperature'?{...defaults,region:'custom',points:[{x:0,y:1},{x:5/6,y:0},{x:1,y:1}]}:{...defaults,opacity:key==='density'?8:4,points:samplePreset('neutral')};}
function activateField(next){
  if(next!==fieldKey){fieldStates.set(fieldKey,{region:settings.region,opacity:settings.opacity,center:settings.center,width:settings.width,points:settings.points});fieldKey=next;
    const saved=fieldStates.get(next)||fieldDefaults(next);for(const k of ['region','opacity','center','width','points'])settings[k]=saved[k];editor.setPoints(settings.points);}
  const f=config();settings.valueRange=f.range;settings.palette=f.palette;settings.colorMiddle=f.middle;
  $('field').value=fieldKey;
  $('field-title').textContent=`${f.label} ${f.symbol}${f.unit?' / '+f.unit:''}`;$('mean-label').textContent=`全盒平均 ${f.symbol}`;
  $('legend-low').textContent=f.range[0];$('legend-high').textContent=`${f.range[1]}${f.unit?' '+f.unit:''}`;
  $('legend-mid').textContent=fieldKey==='brightness_temperature'?'0':format(f.range[0]+(f.range[1]-f.range[0])*f.middle);
  $('legend-mid').style.left=`${f.middle*100}%`;
  $('hist-low').textContent=f.range[0];$('hist-high').textContent=f.range[1];$('hist-field').textContent=`${f.symbol} ${f.unit}`;
  $('hist-note').textContent='柱高采用 log(1 + 网格数)，完整分布不因显示筛选而改变。';
  $('region').options[0].textContent=fieldKey==='xH'?'中性区域':'高值区域';$('region').options[1].textContent=fieldKey==='xH'?'电离区域':'低值区域';
  editor.setDomain({label:f.symbol,min:f.range[0],max:f.range[1],unit:f.unit});drawLegend();updateSettings();
}
function syncFields(model){
  const available=availableFields(manifests[model]);
  for(const option of $('field').options){option.disabled=!available.includes(option.value);option.textContent=option.value==='brightness_temperature'&&!available.includes(option.value)?'亮温 · 100 cMpc 可用':`${FIELDS[option.value].label} ${FIELDS[option.value].symbol}`;}
  const fallback=!available.includes(fieldKey);activateField(fallback?'xH':fieldKey);return fallback;
}
const descriptions = ['基础显示保留颜色与透明度映射，不添加光照。','轻度梯度光照突出场变化方向，帮助分辨结构前后。','混合梯度光照与短程体阴影，增加柔和的空间层次。'];

new ResizeObserver(entries=>document.documentElement.style.setProperty('--dock-height',`${entries[0].target.getBoundingClientRect().height}px`)).observe(document.querySelector('.controls'));

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function renderFailure(message){rendererError=message;$('load-overlay').hidden=false;$('load-overlay').textContent=message;status(message,true);}
try { renderer=new Renderer($('volume'),text=>$('render-state').textContent=text,renderFailure,p=>{
  if(!volume)return;p.forEach((v,i)=>point[i]=v);drawSlices();
}); } catch(e){renderFailure(e.message);}

const editor=new TransferEditor($('transfer-editor'),{points:settings.points,colorAt,onChange:(points,interactive)=>{
  settings.points=points;settings.region='custom';$('curve-source').hidden=true;updateSettings(interactive);
}});
function showPanel(name,focus=false){
  for(const tab of ['locator','transfer']){
    const active=name===tab,button=$(`tab-${tab}`);
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(`panel-${tab}`).hidden=!active;
    if(active&&focus)button.focus();
  }
  if(name==='transfer'){editor.redraw();drawHistogram();}
}
for(const name of ['locator','transfer']){
  $(`tab-${name}`).addEventListener('click',()=>showPanel(name));
  $(`tab-${name}`).addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    showPanel(e.key==='Home'?'locator':e.key==='End'?'transfer':name==='locator'?'transfer':'locator',true);
  });
}
$('edit-curve').addEventListener('click',()=>{
  const fromBand=settings.region==='band';settings.points=samplePreset(settings.region,settings.center,settings.width);
  settings.region='custom';editor.setPoints(settings.points);updateSettings();
  $('curve-source').hidden=!fromBand;$('curve-source').textContent='过渡区间已转成分段线性近似，可继续调节。';
});

function updateLocator(interactive=false){
  const selection=$('planes').value,planes=selection==='all'?[0,1,2]:selection==='none'?[]:[Number(selection)];
  for(let axis=0;axis<3;axis++){$(`point-${axis}`).value=point[axis];$(`point-value-${axis}`).textContent=point[axis];}
  renderer?.setLocator({point,planes,showProbe:$('show-probe').checked},interactive);
  const clipped=(point[2]+.5)/64>settings.crop;
  $('locator-note').textContent=clipped?'探针位于 Z 裁切范围外；二维切片仍显示完整原值。':'白色十字定位探针；轮廓线可透视。切片开启后可直接点击定位。';
  $('locator-note').classList.toggle('clipped',clipped);
  $('volume-help').textContent=planes.length?'点击切片定位 · 拖动旋转 · 滚轮缩放':'拖动旋转 · 滚轮缩放';
}
$('planes').addEventListener('change',()=>updateLocator());
$('show-probe').addEventListener('change',()=>updateLocator());
for(let axis=0;axis<3;axis++){
  $(`point-${axis}`).addEventListener('input',()=>{point[axis]=Number($(`point-${axis}`).value);drawSlices(true);});
  $(`point-${axis}`).addEventListener('change',()=>updateLocator());
}

function updateSettings(interactive=false){
  for(const name of ['opacity','center','width','light','crop']){
    const value=settings[name];$(name).value=value;
    const span=config().range[1]-config().range[0];
    $(`${name}-value`).textContent=name==='crop'?`${Math.round(value*100)}%`:name==='center'?format(config().range[0]+value*span):name==='width'?format(value*span):value.toFixed(name==='opacity'?1:2);
  }
  $('region').value=settings.region;
  $('center').disabled=$('width').disabled=settings.region!=='band';$('light').disabled=settings.mode===0;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.mode)===settings.mode)));
  $('mode-description').textContent=descriptions[settings.mode];
  const custom=settings.region==='custom';$('preset-curve').hidden=custom;$('custom-curve').hidden=!custom;
  if(!custom)$('curve-source').hidden=true;
  renderer?.configure(settings,interactive);updateLocator(interactive);drawHistogram();if(custom)editor.redraw();updateUniformNote();
}
function updateUniformNote(){
  const uniform=volume && volume.max-volume.min<1e-6;
  $('uniform-note').hidden=!uniform;
  if(uniform)$('uniform-note').textContent=visibility(normalizedValue(volume.mean,fieldKey),settings)<.001?`本帧 ${config().symbol} = ${format(volume.mean)}，体显示权重为零`:`本帧为均匀场 · ${config().symbol} = ${format(volume.mean)} ${config().unit}`;
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=Number(b.dataset.mode);updateSettings();}));
for(const name of ['opacity','center','width','light','crop']){
  $(name).addEventListener('input',()=>{settings[name]=Number($(name).value);updateSettings(true);});
  $(name).addEventListener('change',()=>updateSettings());
}
$('region').addEventListener('change',()=>{settings.region=$('region').value;updateSettings();if(settings.region==='custom')showPanel('transfer');});
$('reset-display').addEventListener('click',()=>{Object.assign(settings,fieldDefaults(fieldKey));editor.setPoints(settings.points);updateSettings();});
$('reset-camera').addEventListener('click',()=>renderer?.reset());

function drawLegend(){
  const c=$('legend'),ctx=c.getContext('2d');
  for(let x=0;x<c.width;x++){ctx.fillStyle=`rgb(${colorAt(x/(c.width-1)).join(',')})`;ctx.fillRect(x,0,1,c.height);}
}
function drawHistogram(){
  const c=$('histogram'),ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  if(!volume)return;
  const max=Math.log1p(Math.max(...volume.bins));
  volume.bins.forEach((n,i)=>{const height=max?Math.log1p(n)/max*(h-15):0;ctx.fillStyle=`rgb(${colorAt((i+.5)/64).join(',')})`;ctx.globalAlpha=.75;ctx.fillRect(i*w/64,h-height,w/64-1,height);});
  ctx.globalAlpha=1;ctx.strokeStyle='#b84b3e';ctx.lineWidth=3;ctx.beginPath();
  for(let x=0;x<=w;x++){const y=h-8-visibility(x/w,settings)*(h-20);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
}
function drawSlices(interactive=false){
  updateLocator(interactive);
  for(let axis=0;axis<3;axis++){
    const c=$(`slice-${axis}`),ctx=c.getContext('2d');c.width=256;c.height=256;
    if(!volume){ctx.clearRect(0,0,256,256);continue;}
    const [h,v]=axes(axis),image=new ImageData(64,64);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const xyz=[...point];xyz[h]=x;xyz[v]=63-y;
      image.data.set([...fieldColor(volume.data[index3(...xyz,64)],fieldKey),255],(x+64*y)*4);
    }
    const scratch=document.createElement('canvas');scratch.width=64;scratch.height=64;scratch.getContext('2d').putImageData(image,0,0);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(scratch,0,0,256,256);
    const cx=(point[h]+.5)*4,cy=(63-point[v]+.5)*4;
    ctx.strokeStyle='rgba(20,30,30,.8)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,256);ctx.moveTo(0,cy);ctx.lineTo(256,cy);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,240,.9)';ctx.lineWidth=1;ctx.stroke();
    $(`slice-label-${axis}`).textContent=`${'XYZ'[axis]} = ${point[axis]}`;
  }
  if(volume){
    const value=volume.data[index3(...point,64)],position=point.map(n=>((n+.5)*manifests[current.model].boxLength/64).toFixed(2));
    $('probe').replaceChildren();const strong=document.createElement('strong');strong.textContent=`${config().symbol} = ${value.toFixed(6)} ${config().unit}`;
    $('probe').append(strong,document.createElement('br'),`网格 [${point.join(', ')}] · 中心 [${position.join(', ')}] cMpc`);
  }else $('probe').textContent='等待快照校验完成…';
}
for(let axis=0;axis<3;axis++){
  const c=$(`slice-${axis}`),[h,v]=axes(axis);
  c.addEventListener('click',e=>{if(!volume)return;const r=c.getBoundingClientRect();point[h]=clamp(Math.floor((e.clientX-r.left)/r.width*64),0,63);point[v]=63-clamp(Math.floor((e.clientY-r.top)/r.height*64),0,63);drawSlices();});
  c.addEventListener('keydown',e=>{
    if(!volume||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key))return;e.preventDefault();
    if(e.key==='ArrowLeft')point[h]--;if(e.key==='ArrowRight')point[h]++;if(e.key==='ArrowUp')point[v]++;if(e.key==='ArrowDown')point[v]--;
    if(e.key==='PageUp')point[axis]++;if(e.key==='PageDown')point[axis]--;point.forEach((n,i)=>point[i]=clamp(n,0,63));drawSlices();
  });
}

function updateTimeline(model,index){
  const m=manifests[model],s=m.snapshots[index];$('model').value=model;$('snapshot').value=index;$('snapshot').max=m.snapshots.length-1;
  $('timeline-value').textContent=`z = ${s.redshift.toFixed(3)} · ${index+1} / ${m.snapshots.length}`;
  $('scene-redshift').textContent=s.redshift.toFixed(3);
  $('snapshot').style.setProperty('--fill',`${index/(m.snapshots.length-1)*100}%`);
}
async function load(model,index,reason=''){
  clearTimeout(loadTimer);const id=++requestID;controller?.abort();controller=new AbortController();
  const m=manifests[model],s=m.snapshots[index];
  volume=null;const fallback=syncFields(model);requested={model,index,field:fieldKey};const loadingField=fieldKey;updateTimeline(model,index);
  $('box-length').textContent=`盒长 ${m.boxLength} cMpc`;
  editor.setHistogram([]);drawSlices();drawHistogram();updateUniformNote();$('mean-xh').textContent='—';$('frame-counter').textContent='校验中';$('model-name').textContent=model==='legacy'?'PL · 100':model.toUpperCase();$('frame-meta').textContent=`z = ${s.redshift.toFixed(3)} · 正在校验`;
  $('load-overlay').hidden=false;$('load-overlay').textContent='读取并校验真实快照…';document.body.classList.add('loading');status('正在读取快照并检查 SHA-256 与数值统计…');
  try{
    const result=await store.load(model,s,controller.signal,loadingField);if(id!==requestID)return;
    volume=result;current={model,index,snapshot:s,field:loadingField};
    try{renderer?.setData(result.data);}catch(e){renderFailure(e.message);}
    $('frame-meta').textContent=`z = ${s.redshift.toFixed(3)} · ${config().symbol} · ⟨xH⟩ = ${s.meanNeutralFraction.toFixed(4)}`;
    $('mean-xh').textContent=format(result.mean);$('frame-counter').textContent=`${index+1} / ${m.snapshots.length}`;
    $('load-overlay').hidden=!rendererError;if(rendererError)$('load-overlay').textContent=rendererError;
    editor.setHistogram(result.bins);drawSlices();drawHistogram();updateUniformNote();
    const uniform=result.max-result.min<1e-6?' 当前快照为均匀场，光照不会生成不存在的结构。':'';
    const grid=m.source_grid_shape?.[0]||64;
    status(`${DATASETS[model].label} · ${config().label} · ${s.id} · 64³ / 原始 ${grid}³ · SHA-256 与统计已校验。${fallback?' 该数据集未发布所选场，已切换至 xH。':''}${reason}${uniform}${rendererError?' '+rendererError:''}`,!!rendererError);
  }catch(e){if(id!==requestID||e.name==='AbortError')return;$('load-overlay').textContent=e.message;$('frame-counter').textContent='载入失败';status(e.message,true);}
  finally{if(id===requestID)document.body.classList.remove('loading');}
}
$('model').addEventListener('change',()=>{
  if(!manifests)return;const target=$('model').value,source=requested||current;
  const old=manifests[source.model].snapshots[source.index],key=$('match').value==='stage'?'meanNeutralFraction':'scaleFactor';
  const index=nearest(manifests[target].snapshots,old[key],key),s=manifests[target].snapshots[index];
  const reason=key==='meanNeutralFraction'?` 按相近平均 xH 选择：${old.meanNeutralFraction.toFixed(4)} → ${s.meanNeutralFraction.toFixed(4)}，两者红移可能不同。`:' 按相同红移选择；只切换真实快照。';
  load(target,index,reason);
});
$('field').addEventListener('change',()=>{
  volume=null;activateField($('field').value);const target=requested||current;if(target)load(target.model,target.index);
});
$('snapshot').addEventListener('input',()=>{
  if(!manifests)return;const model=$('model').value,index=Number($('snapshot').value);updateTimeline(model,index);clearTimeout(loadTimer);
  // Invalidate in-flight loads immediately so a late old response cannot overwrite this selection.
  requestID++;controller?.abort();requested={model,index};
  volume=null;editor.setHistogram([]);drawSlices();drawHistogram();updateUniformNote();$('mean-xh').textContent='—';$('frame-counter').textContent='待载入';$('load-overlay').hidden=false;$('load-overlay').textContent='松开滑块，载入选中的真实快照';
  loadTimer=setTimeout(()=>load(model,index),180);
});
$('snapshot').addEventListener('change',()=>load($('model').value,Number($('snapshot').value)));
document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>{
  if(!manifests)return;const model=$('model').value,target=Number(b.dataset.stage),index=nearest(manifests[model].snapshots,target,'meanNeutralFraction');
  load(model,index,` 目标平均 xH ≈ ${target}，使用最接近的真实快照。`);
}));
activateField('xH');
async function init(){
  try{
    const [pl,bt,legacy,local]=await Promise.all([fetchJSON('./data/pl-manifest.json'),fetchJSON('./data/bt-manifest.json'),fetchJSON('./data/legacy-manifest.json'),fetchJSON('./data/local-files.json')]);
    manifests={pl:validateManifest(pl),bt:validateManifest(bt),legacy:validateManifest(legacy)};store=new VolumeStore(manifests,local);
    $('snapshot').disabled=false;
    await load('pl',nearest(pl.snapshots,.5,'meanNeutralFraction'));
  }catch(e){$('load-overlay').hidden=false;$('load-overlay').textContent=e.message;status(e.message,true);}
}
window.addEventListener('pagehide',e=>{if(e.persisted)return;controller?.abort();renderer?.dispose();editor.dispose();});
init();
