import { CavityRenderer } from './cavity-renderer.js';
import { fetchJSON, validateManifest, VolumeStore, nearest, fieldColor, index3, FIELDS, availableFields, REVISION } from './data.js';
import { SAMPLE_FIELDS, sampleDefaults, structureValue, epochThreshold } from './field-presets.js';
import { SnapshotPlayer } from './snapshot-player.js';
import { BrowserVolumeCache, preloadVolumes, volumeKey } from './volume-cache.js';
import { PreparedFrames } from './prepared-frames.js';

const $=id=>document.getElementById(id);
const requested=new URLSearchParams(location.search),requestedField=requested.get('field');
let fieldKey=Object.hasOwn(SAMPLE_FIELDS,requestedField)?requestedField:'xH',frameIndex=0,displayedIndex=-1,displayedField='',loading=false,loadError='',seekTimer;
const settings=sampleDefaults(fieldKey),savedStates=new Map();
settings.threshold=epochThreshold(fieldKey,SAMPLE_FIELDS[fieldKey].defaultEpoch);
let renderer,manifests,store,frames={},presetIndices={},volume,loadID=0,controller,gpuError='';
const persistent=new BrowserVolumeCache(REVISION),prepared=new PreparedFrames(),cachedKeys=new Set();
let allTasks=[],activePreparation,allPreparation,allCacheController,cacheError='',fieldCacheError='',playPreparing=false,playIntent=0,disposed=false;
const labels=['sample-threshold','sample-section','sample-shadow','sample-bloom'];
const keys=['threshold','section','shadowStrength','bloom'];
const preset=()=>SAMPLE_FIELDS[fieldKey];
const field=()=>FIELDS[fieldKey];
const number=value=>Number(value.toFixed(Math.abs(value)<1?3:2)).toString();
new ResizeObserver(entries=>document.body.style.setProperty('--sample-dock',`${entries[0].target.getBoundingClientRect().height}px`)).observe(document.querySelector('.sample-controls'));

function failure(message){gpuError=message;$('sample-loading').classList.remove('is-progress');$('sample-loading').hidden=false;$('sample-loading').textContent=message;$('sample-status').textContent=message;$('sample-status').classList.add('error');}
function renderSuccess(){
  if(!gpuError||!volume)return;gpuError='';if(!loading)$('sample-loading').hidden=true;verifiedStatus();
}
try{renderer=new CavityRenderer($('sample-volume'),renderSuccess,failure);}catch(e){failure(e.message);}

function configure(interactive=false){
  renderer?.configure(settings,interactive);
  const isSurface=settings.sampleMode!=='volume',energy=settings.sampleMode==='energy',p=preset(),f=field();
  document.body.classList.toggle('is-energy',energy);document.body.dataset.physicalField=fieldKey;
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===settings.sampleMode)));
  document.querySelectorAll('[data-field]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.field===fieldKey)));
  labels.forEach((id,i)=>{
    $(id).value=settings[keys[i]];$(id).disabled=!isSurface||(i===3&&!energy);
    $(`${id}-value`).textContent=i===1?`${Math.round(settings.section*100)}%`:i===0?number(settings.threshold)+(f.unit?' '+f.unit:''):settings[keys[i]].toFixed(2);
  });
  $('surface-label').textContent=isSurface?`${fieldKey==='brightness_temperature'?'|δTb|':f.symbol} = ${number(settings.threshold)}${f.unit?' '+f.unit:''} 界面`:`${f.label} · 原体显示`;
  if(energy&&fieldKey==='density')$('surface-label').textContent=`δ 阈值 ${number(settings.threshold)} · 密度网络`;
  $('material-key').hidden=!isSurface;
  const names=energy?fieldKey==='density'?['金色高密结构','青色纤维背景']:fieldKey==='brightness_temperature'?['蓝色吸收','橙红发射']:['界面辉光','暖色剖切边缘']:['阈值界面','剖切边缘'];
  $('material-interface').textContent=names[0];$('material-cut').textContent=names[1];
  $('sample-explainer').textContent=energy?p.explanation:isSurface?'按当前物理量的阈值展示界面；拖动旋转，剖开前侧查看内部。':`同一份 ${f.symbol} 数据与同一视角，使用原有梯度光照体渲染，色标与原值切片一致。`;
  updateEmptyNote();
}
function configureField(){
  const p=preset(),f=field(),threshold=$('sample-threshold');
  threshold.min=p.min;threshold.max=p.max;threshold.step=p.step;
  $('sample-threshold-title').textContent=fieldKey==='brightness_temperature'?'亮温幅度 |δTb|':fieldKey==='density'?'密度阈值 δ':`界面阈值 ${f.symbol}`;
  threshold.setAttribute('aria-label',$('sample-threshold-title').textContent);
  $('sample-title').textContent=p.title;$('sample-subtitle').textContent=p.subtitle;
  $('sample-source').textContent=p.source;$('sample-mean-title').textContent=`全盒平均 ${f.symbol}${f.unit?' / '+f.unit:''}`;
  $('sample-slice-title').textContent=`原值切片 · ${f.symbol}${f.unit?' / '+f.unit:''}`;
  $('sample-slice').setAttribute('aria-label',`XY ${f.label}原值切片`);
  $('sample-volume').setAttribute('aria-label',`真实${f.label}三维显示；拖动或方向键旋转，加减键缩放，Home 重置`);
  document.querySelector('[data-view="energy"]').textContent=p.effect;
  document.querySelectorAll('[data-epoch]').forEach(button=>button.textContent=p.epochs[Number(button.dataset.epoch)]);
  $('sample-convention').textContent=fieldKey==='brightness_temperature'?'亮温使用独立的 100 cMpc 模拟，不能与 250 cMpc 结果作逐体素比较。辉光只表达场结构与正负号，不是预测的可见光颜色。':'界面来自 64³ 平均网格的阈值与空间插值。辉光与材质用于辨认结构，不表示真实发射光度或精确的物理边界；原值见切片色标。';
  const scale=$('sample-scale').getContext('2d');
  for(let x=0;x<256;x++){const v=f.range[0]+x/255*(f.range[1]-f.range[0]);scale.fillStyle=`rgb(${fieldColor(v,fieldKey).join(',')})`;scale.fillRect(x,0,1,5);}
  $('sample-scale-low').textContent=fieldKey==='xH'?'0 · 电离':f.range[0];
  $('sample-scale-high').textContent=fieldKey==='xH'?'1 · 中性':f.range[1];
  $('sample-scale-middle').textContent=number(f.range[0]+f.middle*(f.range[1]-f.range[0]));
  $('sample-scale-middle').style.left=`${f.middle*100}%`;
  configure();
}
function updateEmptyNote(){
  let empty=false;
  if(volume&&settings.sampleMode!=='volume'){
    const low=fieldKey==='brightness_temperature'&&volume.min<=0&&volume.max>=0?0:Math.min(structureValue(volume.min,fieldKey),structureValue(volume.max,fieldKey));
    const high=Math.max(structureValue(volume.min,fieldKey),structureValue(volume.max,fieldKey)),threshold=structureValue(settings.threshold,fieldKey);
    empty=threshold<low||threshold>high;
  }
  $('sample-empty').hidden=!empty;
  if(empty)$('sample-empty').textContent=volume.max===volume.min?`本帧是均匀场：${field().symbol} = ${number(volume.min)}${field().unit?' '+field().unit:''}，没有空间界面。`:'本帧没有当前阈值对应的界面，可调整阈值或切换真实快照。';
}
labels.forEach((id,i)=>{
  $(id).addEventListener('input',()=>{settings[keys[i]]=Number($(id).value);configure(true);});
  $(id).addEventListener('change',()=>configure());
});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{settings.sampleMode=button.dataset.view;configure();}));
$('sample-reset').addEventListener('click',()=>{Object.assign(settings,sampleDefaults(fieldKey));settings.threshold=epochThreshold(fieldKey,presetIndices[fieldKey]?.indexOf(frameIndex));renderer?.reset();configure();});

function drawSlice(){
  const z=Number($('sample-slice-z').value),ctx=$('sample-slice').getContext('2d');
  $('sample-slice-label').textContent=`Z = ${z}`;ctx.clearRect(0,0,256,256);if(!volume)return;
  const image=new ImageData(64,64);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)image.data.set([...fieldColor(volume.data[index3(x,63-y,z,64)],fieldKey),255],(x+64*y)*4);
  const source=document.createElement('canvas');source.width=64;source.height=64;source.getContext('2d').putImageData(image,0,0);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,256,256);
}
$('sample-slice-z').addEventListener('input',drawSlice);

function updateCacheStatus(){
  if(!store||disposed||!frames[fieldKey])return;
  const ready=store.resident(preset().model,frames[fieldKey],fieldKey),total=frames[fieldKey].length;
  $('sample-cache-status').textContent=`${cachedKeys.size===allTasks.length?`全部 ${allTasks.length} 帧已缓存`:`缓存 ${cachedKeys.size} / ${allTasks.length}`} · ${preset().tab}预载 ${ready} / ${total}${cacheError||fieldCacheError?' · 部分失败':''}`;
  $('sample-cache-progress').max=allTasks.length;$('sample-cache-progress').value=cachedKeys.size;
  $('sample-cache-retry').hidden=!(cacheError||fieldCacheError);
  document.querySelector('.sample-cache').classList.toggle('has-error',!!(cacheError||fieldCacheError));
  $('sample-cache-status').title=cacheError||fieldCacheError||(persistent.enabled?'全部文件保存在本地，浏览器按 SHA-256 持久缓存；当前场的完整序列保留在内存。':`本地数据可用；浏览器持久缓存不可用：${persistent.error}`);
}
function prepareActiveField(force=false){
  const key=fieldKey,model=preset().model,sequence=frames[key];
  if(!force&&activePreparation?.key===key&&!activePreparation.failed)return activePreparation.promise;
  activePreparation?.controller.abort();store.pinSequence(model,sequence,key);fieldCacheError='';
  const session={key,controller:new AbortController(),failed:false};activePreparation=session;
  session.promise=preloadVolumes(store,sequence.map(snapshot=>({model,snapshot,field:key})),{signal:session.controller.signal,onProgress:updateCacheStatus}).then(result=>{
    if(result.failures.length)throw new Error(`${FIELDS[key].label}还有 ${result.failures.length} 帧未缓存，请重试。`);
    return true;
  }).catch(error=>{
    session.failed=true;if(activePreparation===session&&error.name!=='AbortError')fieldCacheError=error.message;
    throw error;
  }).finally(updateCacheStatus);
  session.promise.catch(()=>{});updateCacheStatus();return session.promise;
}
function cacheAll(){
  if(disposed)return Promise.resolve();
  if(allPreparation)return allPreparation;
  if(cachedKeys.size===allTasks.length&&!cacheError)return Promise.resolve();
  cacheError='';allCacheController=new AbortController();
  const tasks=allTasks.filter(task=>task.field===fieldKey).concat(allTasks.filter(task=>task.field!==fieldKey));
  allPreparation=preloadVolumes(store,tasks,{signal:allCacheController.signal,onProgress:updateCacheStatus}).then(result=>{
    if(result.failures.length)cacheError=`${result.failures.length} 帧缓存失败，请重试。`;
  }).catch(error=>{if(error.name!=='AbortError')cacheError=error.message;}).finally(()=>{allPreparation=null;updateCacheStatus();});
  return allPreparation;
}
function warmActiveField(){prepareActiveField().then(cacheAll).catch(()=>cacheAll());}
$('sample-cache-retry').addEventListener('click',()=>{cacheError='';prepareActiveField(true).then(cacheAll).catch(()=>cacheAll());});
async function prepareAhead(key,index,count=2,signal){
  const model=SAMPLE_FIELDS[key].model,sequence=frames[key];
  await Promise.all(sequence.slice(index,index+count).map(async snapshot=>{
    const value=await store.load(model,snapshot,signal,key);
    await prepared.get(volumeKey(model,snapshot,key),value.data,signal);
  }));
}
function stopPlayback(cancel=false){playIntent++;playPreparing=false;player.pause(cancel);}
async function togglePlayback(){
  if(player.playing||playPreparing){stopPlayback(true);return;}
  const intent=++playIntent,key=fieldKey;playPreparing=true;syncTimeline();
  try{
    await prepareActiveField();
    if(intent!==playIntent||fieldKey!==key)return;
    await prepareAhead(key,frameIndex===frames[key].length-1?0:frameIndex,3);
    if(intent!==playIntent||fieldKey!==key||document.hidden)return;
    playPreparing=false;await player.start();
  }catch(error){if(intent===playIntent&&error.name!=='AbortError'){$('sample-status').textContent=error.message;$('sample-status').classList.add('error');}}
  finally{if(intent===playIntent){playPreparing=false;syncTimeline();}}
}
function syncTimeline(){
  const sequence=frames[fieldKey];if(!sequence)return;
  const snapshot=sequence[frameIndex],slider=$('sample-redshift');
  slider.disabled=false;slider.max=sequence.length-1;slider.value=frameIndex;
  slider.style.setProperty('--fill',`${frameIndex/(sequence.length-1)*100}%`);
  slider.setAttribute('aria-valuetext',`红移 ${snapshot.redshift.toFixed(3)}，第 ${frameIndex+1} 帧，共 ${sequence.length} 帧${loading?'，正在读取':''}`);
  $('sample-redshift-value').textContent=`${snapshot.redshift.toFixed(3)} · ${frameIndex+1} / ${sequence.length}${loading?' · 读取中':loadError?' · 未载入':''}`;
  $('sample-redshift-start').textContent=`${sequence[0].redshift.toFixed(2)} · 早`;
  $('sample-redshift-end').textContent=`晚 · ${sequence.at(-1).redshift.toFixed(2)}`;
  $('sample-previous').disabled=frameIndex<=0;$('sample-next').disabled=frameIndex>=sequence.length-1;
  $('sample-play').disabled=sequence.length<2;
  $('sample-play').setAttribute('aria-pressed',String(player.playing||playPreparing));
  $('sample-play').textContent=playPreparing?'取消准备':player.playing?'暂停':frameIndex===sequence.length-1?'重播':'播放';
  document.querySelectorAll('[data-epoch]').forEach(button=>{
    const i=Number(button.dataset.epoch),s=sequence[presetIndices[fieldKey][i]];
    button.setAttribute('aria-pressed',String(presetIndices[fieldKey][i]===frameIndex));button.title=`z = ${s.redshift.toFixed(3)}，平均 xH = ${s.meanNeutralFraction.toFixed(3)}`;
  });
}
function verifiedStatus(){
  if(!volume||displayedField!==fieldKey)return;
  const p=preset(),snapshot=frames[fieldKey][displayedIndex],m=manifests[p.model];
  $('sample-status').textContent=`${p.source} · ${field().label} · z = ${snapshot.redshift.toFixed(3)} · SHA-256 与数值统计已校验 · ${m.source_grid_shape?.[0]===256?'原始 256³ 经 4³ 体积平均为 64³':'原生 64³ 网格'}${gpuError?' · '+gpuError:''}`;
  $('sample-status').classList.toggle('error',!!gpuError);
}
function pendingNote(snapshot){
  $('sample-loading').hidden=false;$('sample-loading').classList.toggle('is-progress',!!volume&&displayedField===fieldKey&&!gpuError);
  $('sample-loading').textContent=gpuError||`正在读取 z = ${snapshot.redshift.toFixed(3)} 并校验…${volume?' 当前画面保留上一帧。':''}`;
}
function cancelPending(restore=true){
  ++loadID;controller?.abort();clearTimeout(seekTimer);seekTimer=null;loading=false;loadError='';
  if(restore&&volume&&displayedField===fieldKey)frameIndex=displayedIndex;
  $('sample-loading').hidden=!gpuError;if(gpuError)$('sample-loading').textContent=gpuError;
  if(!volume&&!gpuError){$('sample-loading').hidden=false;$('sample-loading').textContent='已暂停读取；选择快照或点击播放继续。';$('sample-status').textContent='尚未载入真实快照。';}
  verifiedStatus();syncTimeline();
}
const player=new SnapshotPlayer({
  getIndex:()=>frameIndex,getCount:()=>frames[fieldKey]?.length??0,load:index=>load(index),cancelPending,
  delay:()=>Number($('sample-speed').value),
  onChange:playing=>{$('sample-play').setAttribute('aria-pressed',String(playing));$('sample-play').textContent=playing?'暂停':'播放';syncTimeline();},
  onError:error=>{$('sample-status').textContent=error.message;$('sample-status').classList.add('error');},
});
async function load(index,thresholdEpoch=null){
  clearTimeout(seekTimer);seekTimer=null;
  frameIndex=Math.max(0,Math.min(frames[fieldKey].length-1,index));
  const key=fieldKey,p=preset(),model=p.model,snapshot=frames[key][frameIndex],targetIndex=frameIndex;
  if(thresholdEpoch!==null){settings.threshold=epochThreshold(key,thresholdEpoch);configure();}
  const id=++loadID;controller?.abort();controller=new AbortController();loadError='';
  if(volume&&displayedField===key&&displayedIndex===frameIndex){
    loading=false;$('sample-loading').hidden=!gpuError;verifiedStatus();syncTimeline();return true;
  }
  if(displayedField!==key){volume=null;displayedIndex=-1;$('sample-mean').textContent='—';$('sample-z').textContent='—';drawSlice();updateEmptyNote();}
  loading=true;pendingNote(snapshot);syncTimeline();
  try{
    const signal=controller.signal,result=await store.load(model,snapshot,signal,key);
    const gradients=await prepared.get(volumeKey(model,snapshot,key),result.data,signal);if(id!==loadID)return false;
    volume=result;displayedIndex=targetIndex;displayedField=key;loading=false;
    try{renderer?.setData(result.data,gradients);}catch(e){failure(e.message);}
    $('sample-z').textContent=snapshot.redshift.toFixed(3);$('sample-mean').textContent=key==='brightness_temperature'?result.mean.toFixed(2):key==='density'&&Math.abs(result.mean)<.0005?'≈ 0':result.mean.toFixed(3);
    $('sample-loading').hidden=!gpuError;if(gpuError)$('sample-loading').textContent=gpuError;
    verifiedStatus();syncTimeline();drawSlice();updateEmptyNote();
    const url=new URL(location.href);url.searchParams.set('field',key);url.searchParams.set('z',snapshot.redshift);history.replaceState(null,'',url);
    prepareAhead(key,targetIndex+1).catch(()=>{});
    return true;
  }catch(e){
    if(id!==loadID||e.name==='AbortError')return false;
    loading=false;loadError=e.message;syncTimeline();
    $('sample-loading').textContent=`z = ${snapshot.redshift.toFixed(3)} 读取失败：${e.message}${volume?'；画面仍为 z = '+frames[key][displayedIndex].redshift.toFixed(3):''}`;
    $('sample-status').textContent=$('sample-loading').textContent;$('sample-status').classList.add('error');return false;
  }
}
$('sample-play').addEventListener('click',togglePlayback);
$('sample-speed').addEventListener('change',()=>player.reschedule());
for(const [id,step]of [['sample-previous',-1],['sample-next',1]])$(id).addEventListener('click',()=>{stopPlayback();load(frameIndex+step);});
$('sample-redshift').addEventListener('input',()=>{
  const index=Number($('sample-redshift').value);
  stopPlayback();cancelPending(false);frameIndex=index;loading=true;pendingNote(frames[fieldKey][frameIndex]);syncTimeline();
  seekTimer=setTimeout(()=>load(frameIndex),180);
});
$('sample-redshift').addEventListener('change',()=>{clearTimeout(seekTimer);seekTimer=null;load(Number($('sample-redshift').value));});
document.querySelectorAll('[data-epoch]').forEach(button=>button.addEventListener('click',()=>{stopPlayback();const i=Number(button.dataset.epoch);load(presetIndices[fieldKey][i],preset().epochThresholds?i:null);}));
document.querySelectorAll('[data-field]').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.field;if(key===fieldKey||!store)return;
  stopPlayback(true);savedStates.set(fieldKey,{settings:{...settings},frameIndex});fieldKey=key;
  const saved=savedStates.get(key);Object.assign(settings,saved?.settings??sampleDefaults(key));frameIndex=saved?.frameIndex??presetIndices[key][preset().defaultEpoch];
  if(!saved)settings.threshold=epochThreshold(key,preset().defaultEpoch);
  volume=null;configureField();load(frameIndex);warmActiveField();
}));
async function init(){
  try{
    const [pl,legacy,local]=await Promise.all([fetchJSON('./data/pl-manifest.json'),fetchJSON('./data/legacy-manifest.json'),fetchJSON('./data/local-files.json?sample-fields=3')]);
    manifests={pl:validateManifest(pl),legacy:validateManifest(legacy)};store=new VolumeStore(manifests,local,{persistent,onCached:key=>{cachedKeys.add(key);updateCacheStatus();}});
    for(const [key,p]of Object.entries(SAMPLE_FIELDS)){
      if(!availableFields(manifests[p.model]).includes(key))throw new Error(`${FIELDS[key].label}未发布或尚未通过数据核验`);
      const cached=manifests[p.model].snapshots.filter(s=>local[`${p.model}/${s.id}/${key}`]||(key==='xH'&&local[`${p.model}/${s.id}`]));
      if(!cached.length)throw new Error(`${FIELDS[key].label}缺少本地真实快照`);
      frames[key]=manifests[p.model].snapshots;
      const representatives=p.snapshotIDs?p.snapshotIDs.map(id=>{
        const snapshot=cached.find(s=>s.id===id);if(!snapshot)throw new Error(`缺少本地真实快照 ${id}`);return snapshot;
      }):[.8,.5,.2].map(value=>cached[nearest(cached,value,'meanNeutralFraction')]);
      presetIndices[key]=representatives.map(s=>frames[key].findIndex(frame=>frame.id===s.id));
      allTasks.push(...frames[key].map(snapshot=>({model:p.model,snapshot,field:key})));
    }
    document.querySelectorAll('[data-epoch],[data-field]').forEach(button=>button.disabled=false);
    const requestedZ=requested.has('z')?Number(requested.get('z')):NaN;
    frameIndex=Number.isFinite(requestedZ)?nearest(frames[fieldKey],requestedZ,'redshift'):presetIndices[fieldKey][preset().defaultEpoch];
    await load(frameIndex);
    warmActiveField();
  }catch(e){$('sample-loading').hidden=false;$('sample-loading').textContent=e.message;$('sample-status').textContent=e.message;$('sample-status').classList.add('error');}
}
configureField();init();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(player.playing||playPreparing))stopPlayback(true);});
window.addEventListener('pagehide',e=>{
  stopPlayback(true);if(e.persisted)return;disposed=true;
  activePreparation?.controller.abort();allCacheController?.abort();prepared.dispose();store?.dispose();renderer?.dispose();
});
