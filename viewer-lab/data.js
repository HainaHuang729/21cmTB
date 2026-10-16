import { evaluateTransfer } from './transfer.js';
import { abortable, volumeKey } from './volume-cache.js';

export const REVISION = '72f803a60632f50efe73ba6a5e91e0036f3f301f';
export const REMOTE = `https://raw.githubusercontent.com/HainaHuang729/21cmTB/${REVISION}/viewer-data64/pl-bt-v1/`;
export const GITHUB_ROOT = `https://raw.githubusercontent.com/HainaHuang729/21cmTB/${REVISION}/`;
export const DATASETS = {
  pl: {label:'PL · 250 cMpc', base:REMOTE+'coeval-pl256-full-v2-display64/'},
  bt: {label:'BT · 250 cMpc', base:REMOTE+'coeval-bt256-full-v1-display64/'},
  legacy: {label:'PL · 100 cMpc', base:GITHUB_ROOT+'viewer/data/coeval-f-star10-m1p3-d2fb547ce0/'},
};
export const FIELDS = {
  xH:{label:'中性氢比例',symbol:'xH',unit:'',range:[0,1],middle:.5,palette:[[39,79,99],[77,143,156],[231,231,192]]},
  density:{label:'密度对比度',symbol:'δ',unit:'',range:[-1,20],middle:.5,palette:[[34,54,70],[65,130,137],[229,180,66]]},
  brightness_temperature:{label:'21 cm 亮温',symbol:'δTb',unit:'mK',range:[-150,30],middle:5/6,palette:[[43,80,121],[239,237,220],[184,75,62]]},
};
export function availableFields(manifest){
  return Object.keys(FIELDS).filter(key=>manifest.fields[key] && manifest.fields[key].qualityStatus!=='under-review' && manifest.snapshots.every(s=>s.fields[key]));
}
export const normalizedValue=(value,field='xH')=>{
  const [lo,hi]=(typeof field==='string'?FIELDS[field]:field).range;return clamp((value-lo)/(hi-lo),0,1);
};
export function paletteColor(t,palette=FIELDS.xH.palette,middle=.5){
  t=clamp(t,0,1);const side=middle<=0?1:middle>=1?0:t<middle?0:1,f=side?(t-middle)/(1-middle):t/middle;
  return palette[side].map((c,i)=>Math.round(c+(palette[side+1][i]-c)*f));
}
export const fieldColor=(value,field='xH')=>paletteColor(normalizedValue(value,field),FIELDS[field].palette,FIELDS[field].middle);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const index3 = (x, y, z, n) => x + n * (y + n * z);
export const axes = axis => axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
export function nearest(frames, value, key) {
  return frames.reduce((best, f, i) => Math.abs(f[key] - value) < Math.abs(frames[best][key] - value) ? i : best, 0);
}
export function validateManifest(m) {
  const fail = message => { throw new Error(`数据清单：${message}`); };
  if (m.schemaVersion !== 1 || m.geometry !== 'coeval') fail('需要真实 coeval 网格');
  if (!m.grid?.every(n => n === 64) || m.grid.length !== 3 || ![100,250].includes(m.boxLength) || m.boxUnit !== 'cMpc') fail('网格或盒长不匹配');
  if (m.coordinates?.exportFastestAxis !== 'grid-X') fail('数据轴顺序不匹配');
  if (m.fields?.xH?.displayRange?.join(',') !== '0,1') fail('xH 色标必须为 [0, 1]');
  if (!m.sourceIdentity || !m.simulationId || !m.snapshots?.length) fail('缺少来源或快照');
  let previous = -Infinity; const ids = new Set();
  for (const s of m.snapshots) {
    if (!Number.isFinite(s.redshift) || !Number.isFinite(s.scaleFactor) || s.scaleFactor <= previous || Math.abs(s.scaleFactor - 1 / (1 + s.redshift)) > 1e-9 || ids.has(s.id)) fail('快照时间或 ID 无效');
    previous = s.scaleFactor; ids.add(s.id);
    if(!s.fields?.xH)fail('缺少 xH');
    for(const [key,f] of Object.entries(s.fields)){
      if(!FIELDS[key] || f.byteLength!==64**3*4 || f.dtype!=='float32-le' || !/^[a-f0-9]{64}$/.test(f.sha256))fail('场文件描述无效');
      if(!new RegExp(`^snapshots/(?:coeval-)?z[\\d.]+/${key}\\.f32\\.bin$`).test(f.url))fail('场文件路径无效');
    }
    if (!Number.isFinite(s.meanNeutralFraction) || s.meanNeutralFraction < 0 || s.meanNeutralFraction > 1) fail('平均 xH 无效');
  }
  return m;
}
export async function verifyVolume(buffer, field, fieldKey='xH') {
  if (buffer.byteLength !== field.byteLength) throw new Error('快照文件长度不符');
  if (!globalThis.crypto?.subtle) throw new Error('需要 localhost 或 HTTPS 才能校验真实数据');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== field.sha256) throw new Error('快照校验值不符，已停止显示');
  const data = new Float32Array(buffer.byteLength / 4), view = new DataView(buffer);
  let sum = 0, min = Infinity, max = -Infinity; const bins = new Uint32Array(64);
  for (let i = 0; i < data.length; i++) {
    const v = view.getFloat32(i * 4, true);
    if (!Number.isFinite(v) || (fieldKey==='xH'&&(v<0||v>1)) || (fieldKey==='density'&&v< -1)) throw new Error('场存在非有限值或越界值，已停止显示');
    data[i] = v; sum += v; min = Math.min(min, v); max = Math.max(max, v); bins[Math.min(63, Math.floor(normalizedValue(v,fieldKey) * 64))]++;
  }
  const mean = sum / data.length, stats = field.statistics;
  if (!stats || stats.count !== data.length || stats.nonfinite !== 0 || Math.abs(stats.mean - mean) > 1e-6 || Math.abs(stats.min - min) > 1e-6 || Math.abs(stats.max - max) > 1e-6) throw new Error('快照统计与来源清单不符');
  return { data, bins, mean, min, max, hash };
}
// Fixed xH colors shared by every rendering mode, exact-cell slice and legend.
export const PALETTE = [[39, 79, 99], [77, 143, 156], [231, 231, 192]];
export function colorAt(v) {
  const t = clamp(v, 0, 1), side = t < .5 ? 0 : 1, f = t * 2 - side;
  return PALETTE[side].map((c, i) => Math.round(c + (PALETTE[side + 1][i] - c) * f));
}
export function visibility(v, settings) {
  if (settings.region === 'custom') return evaluateTransfer(v, settings.points);
  if (settings.region === 'ionized') return 1 - v;
  if (settings.region === 'band') return Math.exp(-.5 * ((v - settings.center) / (settings.width * .5)) ** 2);
  return v;
}
export async function fetchJSON(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`数据清单读取失败 (${response.status})`);
  return response.json();
}
export class VolumeStore {
  cache = new Map();
  constructor(manifests, localFiles,{persistent=null,onCached=()=>{}}={}) {
    Object.assign(this,{manifests,localFiles,persistent,onCached});this.pending=new Map();this.pinned=new Set();this.requests=new Set();
  }
  pinSequence(model,snapshots,fieldKey){this.pinned=new Set(snapshots.map(s=>volumeKey(model,s,fieldKey)));this.trim();}
  trim(){
    let unpinned=[...this.cache.keys()].filter(key=>!this.pinned.has(key));
    while(unpinned.length>8)this.cache.delete(unpinned.shift());
  }
  resident(model,snapshots,fieldKey){return snapshots.filter(s=>this.cache.has(volumeKey(model,s,fieldKey))).length;}
  load(model, snapshot, signal, fieldKey='xH') {
    if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
    const key = volumeKey(model,snapshot,fieldKey);
    if (this.cache.has(key)) { const v = this.cache.get(key); this.cache.delete(key); this.cache.set(key, v); return Promise.resolve(v); }
    if(!this.pending.has(key)){
      const pending=this.read(model,snapshot,fieldKey).then(value=>{
        this.cache.set(key,value);this.trim();this.onCached(key);return value;
      }).finally(()=>this.pending.delete(key));
      this.pending.set(key,pending);
    }
    // Seeking/pause cancels that subscriber, while a shared background cache
    // request may finish. Stale results cannot commit to the displayed frame.
    return abortable(this.pending.get(key),signal);
  }
  async read(model,snapshot,fieldKey){
    const manifest = this.manifests[model];
    if(!availableFields(manifest).includes(fieldKey))throw new Error('本数据集未发布该物理场，请选择其他物理量');
    const descriptor=snapshot.fields[fieldKey];
    const verify=async buffer=>{
      const value=await verifyVolume(buffer,descriptor,fieldKey);
      if(fieldKey==='xH'&&Math.abs(value.mean-snapshot.meanNeutralFraction)>1e-6)throw new Error('平均 xH 与快照描述不符');
      return value;
    };
    const cached=await this.persistent?.read(descriptor);
    if(cached){
      try{return await verify(cached);}
      catch{await this.persistent.remove(descriptor);}
    }
    const key=volumeKey(model,snapshot,fieldKey);
    const url = this.localFiles[key] || (fieldKey==='xH'?this.localFiles[`${model}/${snapshot.id}`]:null) || `${DATASETS[model].base}${snapshot.fields[fieldKey].url}`;
    const request=new AbortController();this.requests.add(request);
    try{
      const r=await fetch(url,{signal:request.signal});
      if(!r.ok)throw new Error(`快照下载失败 (${r.status})；请检查网络后重新选择`);
      const buffer=await r.arrayBuffer(),value=await verify(buffer);
      await this.persistent?.write(descriptor,buffer);return value;
    }finally{this.requests.delete(request);}
  }
  dispose(){for(const request of this.requests)request.abort();this.requests.clear();this.cache.clear();}
}
