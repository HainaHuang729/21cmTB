import { CavityRenderer } from './cavity-renderer.js?v=density-translucent-20261017-2';
import { fetchJSON, validateManifest, VolumeStore, nearest, fieldColor, index3, FIELDS, availableFields, snapshotFieldAvailable, REVISION, fieldSize } from './data.js';
import { SAMPLE_FIELDS, sampleDefaults, structureValue, epochThreshold, densityNodeThreshold } from './field-presets.js?v=density-translucent-20261017-2';
import { SnapshotPlayer } from './snapshot-player.js';
import { BrowserVolumeCache, preloadVolumes, volumeKey } from './volume-cache.js';
import { PreparedFrames } from './prepared-frames.js';
import { publishedSnapshots, fieldGaps, nextPublishedIndex, stageIndices, sampleCacheTasks } from './field-series.js';

const $=id=>document.getElementById(id);
const requested=new URLSearchParams(location.search),requestedField=requested.get('field');
let modelKey=requested.get('model')==='bt'?'bt':'pl',displayedModel='';
let fieldKey=Object.hasOwn(SAMPLE_FIELDS,requestedField)?requestedField:'xH',frameIndex=0,displayedIndex=-1,displayedField='',loading=false,loadError='',seekTimer;
const settings=sampleDefaults(fieldKey),savedStates=new Map();
settings.threshold=epochThreshold(fieldKey,SAMPLE_FIELDS[fieldKey].defaultEpoch,modelKey);
let renderer,manifests,store,allFrames={},indicesByModel={},frames={},presetIndices={},volume,loadID=0,controller,gpuError='';
const persistent=new BrowserVolumeCache(REVISION),prepared=new PreparedFrames(),cachedKeys=new Set();
let allTasks=[],activePreparation,allPreparation,allCacheController,cacheError='',fieldCacheError='',playPreparing=false,playIntent=0,disposed=false;
const labels=['sample-threshold','sample-section','sample-shadow','sample-bloom'];
const keys=['threshold','section','shadowStrength','bloom'];
const preset=()=>({...SAMPLE_FIELDS[fieldKey],model:modelKey,source:`${modelKey.toUpperCase()} · 250 cMpc · ${fieldSize(manifests?.[modelKey],fieldKey)}³`});
const field=()=>FIELDS[fieldKey];
const modelRepaired=()=>!!manifests?.[modelKey]?.thermalEvolutionRepair;
const currentThreshold=(epoch,snapshot=frames[fieldKey]?.[frameIndex])=>epochThreshold(fieldKey,epoch,modelKey,modelRepaired()?snapshot:null);
const number=value=>Number(value.toFixed(Math.abs(value)<1?3:2)).toString();
for(const [selector,variable]of [['.sample-controls','--sample-dock'],['.sample-header','--sample-header']])new ResizeObserver(entries=>document.body.style.setProperty(variable,`${entries[0].target.getBoundingClientRect().height}px`)).observe(document.querySelector(selector));

function failure(message){gpuError=message;$('sample-loading').classList.remove('is-progress');$('sample-loading').hidden=false;$('sample-loading').textContent=message;$('sample-status').textContent=message;$('sample-status').classList.add('error');}
function renderSuccess(){
  syncCamera();
  if(!gpuError||!volume)return;gpuError='';if(!loading)$('sample-loading').hidden=true;verifiedStatus();
}
function syncCamera(){
  const close=renderer?.distance<2.;
  document.querySelectorAll('[data-framing]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.framing==='detail')===close)));
}
try{renderer=new CavityRenderer($('sample-volume'),renderSuccess,failure);}catch(e){failure(e.message);}

function configure(interactive=false){
  renderer?.configure(settings,interactive);
  const isSurface=settings.sampleMode!=='volume',energy=settings.sampleMode==='energy',p=preset(),f=field();
  document.body.classList.toggle('is-energy',energy);document.body.dataset.physicalField=fieldKey;
  const camera=$('sample-camera');if(camera)camera.hidden=fieldKey!=='density';syncCamera();
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===settings.sampleMode)));
  document.querySelectorAll('[data-field]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.field===fieldKey)));
  labels.forEach((id,i)=>{
    $(id).value=settings[keys[i]];$(id).disabled=!isSurface||(i===3&&!energy);
    $(`${id}-value`).textContent=i===1?`${Math.round(settings.section*100)}%`:i===0?number(settings.threshold)+(f.unit?' '+f.unit:''):settings[keys[i]].toFixed(2);
  });
  $('surface-label').textContent=isSurface?`${fieldKey==='brightness_temperature'?'|δTb|':f.symbol} = ${number(settings.threshold)}${f.unit?' '+f.unit:''} 界面`:`${f.label} · 原体显示`;
  if(energy&&fieldKey==='density')$('surface-label').textContent=`纤维 δ = ${number(settings.threshold)} · 节点 δ ≥ ${number(densityNodeThreshold(settings.threshold))}`;
  $('material-key').hidden=!isSurface;
  const names=energy?fieldKey==='density'?['金色高密节点','青色纤维轮廓']:fieldKey==='brightness_temperature'?['蓝色吸收','橙红发射']:['界面辉光','暖色剖切边缘']:['阈值界面','剖切边缘'];
  $('material-interface').textContent=names[0];$('material-cut').textContent=names[1];
  const explanation=fieldKey==='brightness_temperature'&&modelRepaired()?`蓝色表示负亮温吸收，橙红表示正亮温发射，零值透明。${modelKey.toUpperCase()} 已修复温度与电离递推，可播放完整的 85 个真实红移快照。`:p.explanation;
  $('sample-explainer').textContent=energy?explanation:isSurface?'按当前物理量的阈值展示界面；拖动旋转，剖开前侧查看内部。':`同一份 ${f.symbol} 数据与同一视角，使用原有梯度光照体渲染，色标与原值切片一致。`;
  updateEmptyNote();
}
function configureField(){
  const p=preset(),f=field(),threshold=$('sample-threshold');
  threshold.min=p.min;threshold.max=fieldKey==='brightness_temperature'&&modelRepaired()?Math.max(p.max,Math.ceil(Math.max(...publishedSnapshots(frames[fieldKey],fieldKey).map(s=>Math.max(Math.abs(s.fields[fieldKey].statistics.min),Math.abs(s.fields[fieldKey].statistics.max))))/10)*10):p.max;threshold.step=p.step;
  $('sample-threshold-title').textContent=fieldKey==='brightness_temperature'?'亮温幅度 |δTb|':fieldKey==='density'?'密度阈值 δ':`界面阈值 ${f.symbol}`;
  threshold.setAttribute('aria-label',$('sample-threshold-title').textContent);
  const sourceNote=modelRepaired()?' · 递推已修复':' · 原缓存，待更新';
  $('sample-title').textContent=p.title;$('sample-subtitle').textContent=p.subtitle+sourceNote+(frames[fieldKey]&&fieldKey==='brightness_temperature'?` · 已发布 ${publishedSnapshots(frames[fieldKey],fieldKey).length} / ${frames[fieldKey].length} 帧`:'');
  $('sample-model').value=modelKey;$('sample-source').textContent=p.source;$('sample-mean-title').textContent=`全盒平均 ${f.symbol}${f.unit?' / '+f.unit:''}`;
  $('sample-slice-title').textContent=`原值切片 · ${f.symbol}${f.unit?' / '+f.unit:''}`;
  $('sample-slice').setAttribute('aria-label',`XY ${f.label}原值切片`);
  $('sample-volume').setAttribute('aria-label',`真实${f.label}三维显示；拖动或方向键旋转，加减键缩放，Home 重置`);
  document.querySelector('[data-view="energy"]').textContent=p.effect;
  document.querySelectorAll('[data-epoch]').forEach(button=>button.textContent=p.epochs[Number(button.dataset.epoch)]);
  $('sample-convention').textContent=fieldKey==='brightness_temperature'?(!modelRepaired()?'BT 保留原缓存，尚未做这次递推修复。':'同一模型的三个场来自同组快照。')+'已发布亮温通过源温度与范围筛查，这不等于物理认证。辉光表达结构与正负号；PL / BT 未核实逐体素相位匹配。':`界面来自 ${fieldSize(manifests?.[modelKey],fieldKey)}³ 平均网格的阈值与空间插值。辉光用于辨认结构，不表示真实发射光度或精确物理边界；PL / BT 未核实逐体素相位匹配。`;
  drawQualityBand();
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
  const uniform=empty&&volume.max===volume.min;
  $('sample-empty').hidden=!uniform;
  $('sample-empty').textContent=uniform?`本帧是均匀场：${field().symbol} = ${number(volume.min)}${field().unit?' '+field().unit:''}，没有空间界面。`:'';
}
labels.forEach((id,i)=>{
  $(id).addEventListener('input',()=>{settings[keys[i]]=Number($(id).value);configure(true);});
  $(id).addEventListener('change',()=>configure());
});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{settings.sampleMode=button.dataset.view;configure();}));
$('sample-reset').addEventListener('click',()=>{Object.assign(settings,sampleDefaults(fieldKey));settings.threshold=currentThreshold(presetIndices[fieldKey]?.indexOf(frameIndex));renderer?.reset();configure();});
document.querySelectorAll('[data-framing]').forEach(button=>button.addEventListener('click',()=>{
  if(!renderer)return;
  renderer.distance=button.dataset.framing==='detail'?1.65:2.4;renderer.request();syncCamera();
}));

function drawSlice(){
  const z=Number($('sample-slice-z').value),ctx=$('sample-slice').getContext('2d');
  $('sample-slice-label').textContent=`Z = ${z}`;ctx.clearRect(0,0,256,256);if(!volume)return;
  const n=volume.gridSize,image=new ImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)image.data.set([...fieldColor(volume.data[index3(x,n-1-y,z,n)],fieldKey),255],(x+n*y)*4);
  const source=document.createElement('canvas');source.width=n;source.height=n;source.getContext('2d').putImageData(image,0,0);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,256,256);
}
$('sample-slice-z').addEventListener('input',drawSlice);

function updateCacheStatus(){
  if(!store||disposed||!frames[fieldKey])return;
  const sequence=publishedSnapshots(frames[fieldKey],fieldKey),ready=store.resident(modelKey,sequence,fieldKey),total=sequence.length;
  const verified=sequence.filter(s=>cachedKeys.has(volumeKey(modelKey,s,fieldKey))).length;
  const progress=fieldSize(manifests?.[modelKey],fieldKey)>64?`缓存 ${verified} / ${total} · 内存 ${ready} 帧`:`预载 ${ready} / ${total}`;
  $('sample-cache-status').textContent=`${cachedKeys.size===allTasks.length?`全部 ${allTasks.length} 个数据体已${persistent.enabled?'缓存':'核验（浏览器缓存不可用）'}`:`缓存 ${cachedKeys.size} / ${allTasks.length}`} · ${modelKey.toUpperCase()} ${preset().tab}${progress}${cacheError||fieldCacheError?' · 部分失败':''}`;
  $('sample-cache-progress').max=allTasks.length;$('sample-cache-progress').value=cachedKeys.size;
  $('sample-cache-retry').hidden=!(cacheError||fieldCacheError);
  document.querySelector('.sample-cache').classList.toggle('has-error',!!(cacheError||fieldCacheError));
  $('sample-cache-status').title=cacheError||fieldCacheError||(persistent.enabled?'全部文件保存在本地，浏览器按 SHA-256 持久缓存；原值内存预算 256 MiB，提前准备临近帧。':`本地数据可用；浏览器持久缓存不可用：${persistent.error}`);
}
function prepareActiveField(force=false){
  const key=fieldKey,model=modelKey,sequence=publishedSnapshots(frames[key],key),sessionKey=`${model}/${key}`;
  if(!force&&activePreparation?.key===sessionKey&&!activePreparation.failed)return activePreparation.promise;
  activePreparation?.controller.abort();store.pinSequence(model,sequence,key);fieldCacheError='';
  const session={key:sessionKey,controller:new AbortController(),failed:false};activePreparation=session;
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
  const isCurrent=task=>task.field===fieldKey&&task.model===modelKey;
  const tasks=allTasks.filter(isCurrent).concat(allTasks.filter(task=>!isCurrent(task)));
  allPreparation=preloadVolumes(store,tasks,{signal:allCacheController.signal,onProgress:updateCacheStatus}).then(result=>{
    if(result.failures.length)cacheError=`${result.failures.length} 帧缓存失败，请重试。`;
  }).catch(error=>{if(error.name!=='AbortError')cacheError=error.message;}).finally(()=>{allPreparation=null;updateCacheStatus();});
  return allPreparation;
}
function warmActiveField(){prepareActiveField().then(cacheAll).catch(()=>cacheAll());}
$('sample-cache-retry').addEventListener('click',()=>{cacheError='';prepareActiveField(true).then(cacheAll).catch(()=>cacheAll());});
async function prepareAhead(model,key,index,count=2,signal){
  const sequence=allFrames[model][key];
  await Promise.all(publishedSnapshots(sequence.slice(index,index+count),key).map(async snapshot=>{
    const value=await store.load(model,snapshot,signal,key);
    await prepared.get(volumeKey(model,snapshot,key),value.data,signal);
  }));
}
function stopPlayback(cancel=false){playIntent++;playPreparing=false;player.pause(cancel);}
async function togglePlayback(){
  if(player.playing||playPreparing){stopPlayback(true);return;}
  if(!snapshotFieldAvailable(frames[fieldKey][frameIndex],fieldKey))return;
  const intent=++playIntent,key=fieldKey,model=modelKey;playPreparing=true;syncTimeline();
  try{
    await prepareActiveField();
    if(intent!==playIntent||fieldKey!==key||modelKey!==model)return;
    await prepareAhead(model,key,frameIndex===frames[key].length-1?0:frameIndex,3);
    if(intent!==playIntent||fieldKey!==key||modelKey!==model||document.hidden)return;
    playPreparing=false;await player.start();
  }catch(error){if(intent===playIntent&&error.name!=='AbortError'){$('sample-status').textContent=error.message;$('sample-status').classList.add('error');}}
  finally{if(intent===playIntent){playPreparing=false;syncTimeline();}}
}
function syncTimeline(){
  const sequence=frames[fieldKey];if(!sequence)return;
  const snapshot=sequence[frameIndex],slider=$('sample-redshift'),available=snapshotFieldAvailable(snapshot,fieldKey);
  slider.disabled=false;slider.max=sequence.length-1;slider.value=frameIndex;
  slider.style.setProperty('--fill',`${frameIndex/(sequence.length-1)*100}%`);
  slider.setAttribute('aria-valuetext',`红移 ${snapshot.redshift.toFixed(3)}，第 ${frameIndex+1} 帧，共 ${sequence.length} 帧${!available?'，待审核':loading?'，正在读取':''}`);
  $('sample-redshift-value').textContent=`${snapshot.redshift.toFixed(3)} · ${frameIndex+1} / ${sequence.length}${!available?' · 待审核':loading?' · 读取中':loadError?' · 未载入':''}`;
  $('sample-redshift-start').textContent=`${sequence[0].redshift.toFixed(2)} · 早`;
  $('sample-redshift-end').textContent=`晚 · ${sequence.at(-1).redshift.toFixed(2)}`;
  $('sample-previous').disabled=frameIndex<=0;$('sample-next').disabled=frameIndex>=sequence.length-1;
  $('sample-play').disabled=sequence.length<2||!available;
  $('sample-play').setAttribute('aria-pressed',String(player.playing||playPreparing));
  $('sample-play').textContent=!available?'待审核':playPreparing?'取消准备':player.playing?'暂停':frameIndex===sequence.length-1?'重播':'播放';
  document.querySelectorAll('[data-epoch]').forEach(button=>{
    const i=Number(button.dataset.epoch),s=sequence[presetIndices[fieldKey][i]];
    button.setAttribute('aria-pressed',String(presetIndices[fieldKey][i]===frameIndex));button.title=`z = ${s.redshift.toFixed(3)}，平均 xH = ${s.meanNeutralFraction.toFixed(3)}`;
  });
}
function recordSelection(snapshot){
  const url=new URL(location.href);url.searchParams.set('model',modelKey);url.searchParams.set('field',fieldKey);url.searchParams.set('z',snapshot.redshift);history.replaceState(null,'',url);
}
function clearDisplay(){
  volume=null;displayedIndex=-1;displayedField='';displayedModel='';renderer?.clearData();
  $('sample-mean').textContent='—';$('sample-z').textContent='—';drawSlice();updateEmptyNote();
}
function drawQualityBand(){
  const sequence=frames[fieldKey],band=$('sample-quality-band');band.replaceChildren();if(!sequence)return;
  const gaps=fieldGaps(sequence,fieldKey);$('sample-gap-key').hidden=!gaps.length;
  for(const gap of gaps){
    const marker=document.createElement('i'),left=Math.max(0,(gap.start-.5)/(sequence.length-1)),right=Math.min(1,(gap.end+.5)/(sequence.length-1));
    marker.style.left=`${left*100}%`;marker.style.width=`${(right-left)*100}%`;band.append(marker);
  }
}
function showGap(snapshot){
  clearDisplay();loading=false;$('sample-loading').hidden=true;$('sample-gap').hidden=false;document.body.classList.add('is-data-gap');
  const gaps=fieldGaps(frames[fieldKey],fieldKey),gap=gaps.find(g=>frameIndex>=g.start&&frameIndex<=g.end);
  $('sample-z').textContent=snapshot.redshift.toFixed(3);
  $('sample-gap-title').textContent=`${modelKey.toUpperCase()} · 此红移亮温暂缓发布`;
  $('sample-gap-detail').textContent=`z = ${snapshot.redshift.toFixed(3)} 位于 ${gap.firstZ.toFixed(3)}–${gap.lastZ.toFixed(3)} 的 ${gap.count} 帧审核段。源温度与亮温极值待复核，没有可显示的数据；播放在此暂停。`;
  $('sample-gap-back').disabled=nextPublishedIndex(frames[fieldKey],frameIndex,-1,fieldKey)<0;
  $('sample-gap-forward').disabled=nextPublishedIndex(frames[fieldKey],frameIndex,1,fieldKey)<0;
  $('sample-status').textContent=`${preset().source} · z = ${snapshot.redshift.toFixed(3)} · 亮温暂缓发布 · 可切换同红移的中性氢或密度查看已发布数据。`;
  $('sample-status').classList.remove('error');
}
function verifiedStatus(){
  if(!volume||displayedField!==fieldKey||displayedModel!==modelKey)return;
  const p=preset(),snapshot=frames[fieldKey][displayedIndex],m=manifests[p.model];
  const n=volume.gridSize;
  $('sample-status').textContent=`${p.source} · ${field().label} · z = ${snapshot.redshift.toFixed(3)} · SHA-256 与数值统计已校验 · ${m.source_grid_shape?.[0]===256?`原始 256³ 经 ${256/n}³ 体积平均为 ${n}³`:`原生 ${n}³ 网格`}${gpuError?' · '+gpuError:''}`;
  $('sample-status').classList.toggle('error',!!gpuError);
}
function pendingNote(snapshot){
  $('sample-loading').hidden=false;$('sample-loading').classList.toggle('is-progress',!!volume&&displayedField===fieldKey&&!gpuError);
  $('sample-loading').textContent=gpuError||`正在读取 z = ${snapshot.redshift.toFixed(3)} 并校验…${volume?' 当前画面保留上一帧。':''}`;
}
function cancelPending(restore=true){
  ++loadID;controller?.abort();clearTimeout(seekTimer);seekTimer=null;loading=false;loadError='';
  if(restore&&volume&&displayedField===fieldKey&&displayedModel===modelKey)frameIndex=displayedIndex;
  $('sample-loading').hidden=!gpuError;if(gpuError)$('sample-loading').textContent=gpuError;
  if(!volume&&!gpuError&&$('sample-gap').hidden){$('sample-loading').hidden=false;$('sample-loading').textContent='已暂停读取；选择快照或点击播放继续。';$('sample-status').textContent='尚未载入真实快照。';}
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
  if(thresholdEpoch!==null){settings.threshold=currentThreshold(thresholdEpoch,snapshot);configure();}
  const id=++loadID;controller?.abort();controller=new AbortController();loadError='';
  if(volume&&displayedModel===model&&displayedField===key&&displayedIndex===frameIndex){
    loading=false;$('sample-loading').hidden=!gpuError;verifiedStatus();syncTimeline();return true;
  }
  if(!snapshotFieldAvailable(snapshot,key)){showGap(snapshot);syncTimeline();recordSelection(snapshot);return false;}
  $('sample-gap').hidden=true;document.body.classList.remove('is-data-gap');
  if(displayedField!==key||displayedModel!==model){clearDisplay();}
  loading=true;pendingNote(snapshot);syncTimeline();
  try{
    const signal=controller.signal,result=await store.load(model,snapshot,signal,key);
    const gradients=await prepared.get(volumeKey(model,snapshot,key),result.data,signal);if(id!==loadID)return false;
    volume=result;displayedIndex=targetIndex;displayedField=key;displayedModel=model;loading=false;
    const slice=$('sample-slice-z'),previousN=Number(slice.max)+1;
    if(previousN!==result.gridSize){const next=Math.min(result.gridSize-1,Math.floor((Number(slice.value)+.5)*result.gridSize/previousN));slice.max=result.gridSize-1;slice.value=next;}
    try{renderer?.setData(result.data,gradients);}catch(e){failure(e.message);}
    $('sample-z').textContent=snapshot.redshift.toFixed(3);$('sample-mean').textContent=key==='brightness_temperature'?result.mean.toFixed(2):key==='density'&&Math.abs(result.mean)<.0005?'≈ 0':result.mean.toFixed(3);
    $('sample-loading').hidden=!gpuError;if(gpuError)$('sample-loading').textContent=gpuError;
    verifiedStatus();syncTimeline();drawSlice();updateEmptyNote();
    recordSelection(snapshot);
    prepareAhead(model,key,targetIndex+1).catch(()=>{});
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
  stopPlayback();cancelPending(false);frameIndex=index;
  if(!snapshotFieldAvailable(frames[fieldKey][index],fieldKey)){load(index);return;}
  loading=true;pendingNote(frames[fieldKey][frameIndex]);syncTimeline();
  seekTimer=setTimeout(()=>load(frameIndex),180);
});
$('sample-redshift').addEventListener('change',()=>{clearTimeout(seekTimer);seekTimer=null;load(Number($('sample-redshift').value));});
document.querySelectorAll('[data-epoch]').forEach(button=>button.addEventListener('click',()=>{stopPlayback();const i=Number(button.dataset.epoch);load(presetIndices[fieldKey][i],preset().epochThresholds?i:null);}));
function selectSource(model,key){
  if((key===fieldKey&&model===modelKey)||!store)return;
  stopPlayback(true);
  const z=frames[fieldKey][frameIndex].redshift;
  savedStates.set(`${modelKey}/${fieldKey}`,{...settings});modelKey=model;fieldKey=key;
  frames=allFrames[model];presetIndices=indicesByModel[model];
  const saved=savedStates.get(`${model}/${key}`);Object.assign(settings,saved??sampleDefaults(key));
  if(!saved)settings.threshold=epochThreshold(key,preset().defaultEpoch,model);
  frameIndex=nearest(frames[key],z,'redshift');clearDisplay();
  configureField();load(frameIndex);warmActiveField();
}
document.querySelectorAll('[data-field]').forEach(button=>button.addEventListener('click',()=>selectSource(modelKey,button.dataset.field)));
$('sample-model').addEventListener('change',()=>selectSource($('sample-model').value,fieldKey));
for(const [id,direction]of [['sample-gap-back',-1],['sample-gap-forward',1]])$(id).addEventListener('click',()=>{
  const index=nextPublishedIndex(frames[fieldKey],frameIndex,direction,fieldKey);
  if(index>=0){stopPlayback();load(index);}
});
async function init(){
  try{
    const [pl,bt,local]=await Promise.all([fetchJSON('./data/pl-manifest.json'),fetchJSON('./data/bt-manifest.json'),fetchJSON('./data/local-files.json?sample-fields=4')]);
    manifests={pl:validateManifest(pl),bt:validateManifest(bt)};store=new VolumeStore(manifests,local,{persistent,onCached:key=>{cachedKeys.add(key);updateCacheStatus();}});
    for(const model of ['pl','bt']){
      allFrames[model]={};indicesByModel[model]={};
      for(const key of Object.keys(SAMPLE_FIELDS)){
        if(!availableFields(manifests[model],{partial:true}).includes(key))throw new Error(`${model.toUpperCase()} ${FIELDS[key].label}未发布`);
        allFrames[model][key]=manifests[model].snapshots;
        indicesByModel[model][key]=stageIndices(manifests[model].snapshots,key);
      }
    }
    frames=allFrames[modelKey];presetIndices=indicesByModel[modelKey];allTasks=sampleCacheTasks(manifests);
    document.querySelectorAll('[data-epoch],[data-field],#sample-model').forEach(control=>control.disabled=false);
    const requestedZ=requested.has('z')?Number(requested.get('z')):NaN;
    frameIndex=Number.isFinite(requestedZ)?nearest(frames[fieldKey],requestedZ,'redshift'):presetIndices[fieldKey][preset().defaultEpoch];
    configureField();await load(frameIndex);warmActiveField();
  }catch(e){$('sample-loading').hidden=false;$('sample-loading').textContent=e.message;$('sample-status').textContent=e.message;$('sample-status').classList.add('error');}
}
configureField();init();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(player.playing||playPreparing))stopPlayback(true);});
window.addEventListener('pagehide',e=>{
  stopPlayback(true);if(e.persisted)return;disposed=true;
  activePreparation?.controller.abort();allCacheController?.abort();prepared.dispose();store?.dispose();renderer?.dispose();
});
