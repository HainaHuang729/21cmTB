import { FIELDS, GITHUB_ROOT, clamp, paletteColor } from './data.js';

const viridis=[[68,1,84],[33,145,140],[253,231,37]];
export const ATLAS_FIELDS={
  brightness:{...FIELDS.brightness_temperature,key:'brightness_i16_le',scale:'brightness_quantization_mk'},
  density:{...FIELDS.density,key:'density_i16_le',scale:'density_quantization'},
  ionized:{label:'电离氢比例',symbol:'xHII',unit:'',range:[0,1],middle:.5,palette:[...FIELDS.xH.palette].reverse(),key:'ionized_fraction_i16_le',scale:'ionized_fraction_quantization'},
  spin:{label:'自旋温度',symbol:'Ts',unit:'K',range:[1,100000],middle:.5,palette:viridis,log:true,key:'spin_temperature_log10_i16_le',scale:'temperature_log10_quantization'},
  kinetic:{label:'气体温度',symbol:'Tk',unit:'K',range:[1,100000],middle:.5,palette:viridis,log:true,key:'kinetic_temperature_log10_i16_le',scale:'temperature_log10_quantization'},
};
export const atlasColor=(value,field,range=ATLAS_FIELDS[field].range)=>{
  const f=ATLAS_FIELDS[field],[lo,hi]=range;
  const t=f.log?(Math.log10(value)-Math.log10(lo))/(Math.log10(hi)-Math.log10(lo)):(value-lo)/(hi-lo);
  const middle=field==='brightness'?clamp(-lo/(hi-lo),0,1):f.middle;
  return paletteColor(clamp(t,0,1),f.palette,middle);
};
export async function checkHash(buffer,hash){
  if(!/^[a-f\d]{64}$/.test(hash||''))throw new Error('缺少文件校验值');
  if(!crypto.subtle)throw new Error('需要 localhost 或 HTTPS 才能校验数据');
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(actual!==hash)throw new Error('切片文件 SHA-256 校验失败');
}
export function validateSlices(slices,byteLength){
  if(slices.shape?.join(',')!=='32,256,256'||slices.box_len_mpc!==250||slices.binary_compression!=='deflate')throw new Error('切片形状或压缩格式不匹配');
  if(slices.redshift?.length!==32||!slices.redshift.every((z,i)=>Number.isFinite(z)&&(!i||z<slices.redshift[i-1])))throw new Error('切片红移表无效');
  let end=0;
  for(const f of Object.values(ATLAS_FIELDS)){
    const d=slices.binary_fields?.[f.key],scale=slices[f.scale];
    if(!d||!Number.isInteger(d.offset)||!Number.isInteger(d.compressed_bytes)||d.offset!==end||d.compressed_bytes<1||d.uncompressed_bytes!==32*256*256*2||!(scale>0&&Number.isFinite(scale)))throw new Error('切片字段描述无效');
    end=d.offset+d.compressed_bytes;if(end>byteLength)throw new Error('切片字段超出文件长度');
  }
  if(end!==byteLength)throw new Error('切片二进制长度不匹配');
  return slices;
}
export async function decodeAtlasField(buffer,slices,field){
  validateSlices(slices,buffer.byteLength);
  const f=ATLAS_FIELDS[field];if(!f)throw new Error('未知物理量');
  const d=slices.binary_fields[f.key];
  const stream=new Blob([new Uint8Array(buffer,d.offset,d.compressed_bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw=await new Response(stream).arrayBuffer();if(raw.byteLength!==d.uncompressed_bytes)throw new Error('切片解压长度不匹配');
  const view=new DataView(raw),values=new Int16Array(raw.byteLength/2);
  for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);
  return {values,scale:slices[f.scale],log:!!f.log};
}
export function atlasValue(decoded,frame,column,row){
  if(![frame,column,row].every(Number.isInteger)||frame<0||frame>=32||column<0||column>=256||row<0||row>=256)throw new RangeError('切片坐标超出范围');
  const encoded=decoded.values[frame*256*256+row*256+column]*decoded.scale;
  return decoded.log?10**encoded:encoded;
}
export class AtlasStore{
  records=new Map();
  constructor(base){this.base=base;}
  async load(entry,kind,field,signal){
    const id=kind==='runs'?entry.run_id:entry.pl_id;if(!/^(run|pl)_[a-f\d]+$/.test(id))throw new Error('模型标识无效');
    const key=`${kind}/${id}`;let record=this.records.get(key);
    if(!record){
      const response=await fetch(`${this.base}${key}.json`,{signal});if(!response.ok)throw new Error(`模型清单读取失败 (${response.status})`);
      const raw=await response.arrayBuffer();await checkHash(raw,entry.web_sha256);const meta=JSON.parse(new TextDecoder().decode(raw));
      if(meta.slices.binary_file!==`${id}.slices.bin`)throw new Error('切片路径不匹配');
      const data=await fetch(`${this.base}${kind}/${meta.slices.binary_file}`,{signal});if(!data.ok)throw new Error(`切片读取失败 (${data.status})`);
      const buffer=await data.arrayBuffer();if(buffer.byteLength!==entry.slice_binary_bytes)throw new Error('切片文件长度不匹配');
      await checkHash(buffer,entry.slice_binary_sha256);validateSlices(meta.slices,buffer.byteLength);
      if(signal.aborted)throw new DOMException('Aborted','AbortError');record={meta,buffer,fields:new Map()};
      this.records.set(key,record);while(this.records.size>2)this.records.delete(this.records.keys().next().value);
    }
    this.records.delete(key);this.records.set(key,record);
    if(!record.fields.has(field)){
      const decoded=await decodeAtlasField(record.buffer,record.meta.slices,field);if(signal.aborted)throw new DOMException('Aborted','AbortError');
      record.fields.set(field,decoded);while(record.fields.size>2)record.fields.delete(record.fields.keys().next().value);
    }
    return {meta:record.meta,decoded:record.fields.get(field)};
  }
}
export async function loadAtlasIndex(){
  let base,response;
  for(const candidate of ['./atlas-data/','../web_data/',GITHUB_ROOT+'web_data/']){
    base=candidate;
    try{response=await fetch(base+'index.json');if(response.ok)break;}catch{response=null;}
  }
  if(!response?.ok)throw new Error('切片库索引读取失败，请检查本地数据目录或网络');
  const index=await response.json();if(index.inventory?.length!==55||index.pl_inventory?.length!==32)throw new Error('切片库索引数量不匹配');
  return {index,base};
}
