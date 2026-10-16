import { FIELDS } from './data.js';

export const SAMPLE_FIELDS={
  xH:{kind:0,model:'pl',tab:'中性氢',title:'再电离的空腔',subtitle:'真实中性氢场 · 辉光与剖切',effect:'电离辉光',threshold:.5,min:.1,max:.9,step:.01,section:.42,bandWidth:.065,gradientGain:1,epochs:['早期','中期','晚期'],defaultEpoch:2,source:'PL · 250 cMpc · 64³',explanation:'青色薄层勾出中性结构的边界，透过近处界面观察内部空腔。暖色切缘标出剖开的位置。'},
  density:{kind:1,model:'pl',tab:'密度',title:'物质的纤维',subtitle:'真实密度场 · 纤维与高密节点',effect:'密度辉光',threshold:.22,min:.02,max:2,step:.01,section:0,bandWidth:.035,gradientGain:1.8,epochs:['早期','中期','晚期'],defaultEpoch:2,source:'PL · 250 cMpc · 64³',explanation:'金色强调高密区域，较淡的青色保留低密度结构。纤维与节点均来自真实密度场，阈值以密度对比度 δ 表示。'},
  brightness_temperature:{kind:2,model:'legacy',tab:'亮温',title:'21cm 的冷与暖',subtitle:'独立 100 cMpc 模拟 · 吸收与发射',effect:'冷暖辉光',threshold:8,min:.1,max:150,step:.1,section:.18,bandWidth:.02,gradientGain:3,epochs:['吸收期','转变期','发射期'],snapshotIDs:['coeval-z12.99303239','coeval-z10.10812026','coeval-z6.56000000'],epochThresholds:[75,7,8],defaultEpoch:1,source:'独立 PL · 100 cMpc · 64³',explanation:'负亮温用蓝光表示吸收，正亮温用橙红光表示发射，零值保持透明。“转变期”是一帧同时含有正负亮温的真实快照。'},
};
// Stable shortcuts: expanding the local cache must not silently change stages.
for(const key of ['xH','density'])SAMPLE_FIELDS[key].snapshotIDs=['z8.6094970605','z7.5329593443','z7.0407986210'];
export function sampleDefaults(key){
  const preset=SAMPLE_FIELDS[key],field=FIELDS[key];
  return {threshold:preset.threshold,section:preset.section,shadowStrength:.8,contextOpacity:.12,bloom:.8,sampleMode:'energy',fieldKind:preset.kind,bandWidth:preset.bandWidth,gradientGain:preset.gradientGain,valueRange:field.range,palette:field.palette,colorMiddle:field.middle,region:key==='brightness_temperature'?'custom':'neutral',opacity:key==='density'?8:4,points:key==='brightness_temperature'?[{x:0,y:1},{x:5/6,y:0},{x:1,y:1}]:[{x:0,y:0},{x:1,y:1}]};
}
// The shader applies these display mappings AFTER sampling the raw scalar.
// Units and signs of the source buffers, slices and statistics stay intact.
export function structureValue(value,key){
  if(key==='density')return Math.log1p(Math.max(value,0))/Math.log(4);
  if(key==='brightness_temperature')return Math.abs(value)/100;
  return value;
}
export function epochThreshold(key,index){return SAMPLE_FIELDS[key].epochThresholds?.[index]??SAMPLE_FIELDS[key].threshold;}
