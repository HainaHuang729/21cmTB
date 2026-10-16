import { FIELDS } from './data.js';

export const SAMPLE_FIELDS={
  xH:{kind:0,model:'pl',tab:'中性氢',title:'再电离的空腔',subtitle:'真实中性氢场 · 辉光与剖切',effect:'电离辉光',threshold:.5,min:.1,max:.9,step:.01,section:.42,bandWidth:.065,gradientGain:1,epochs:['早期','中期','晚期'],defaultEpoch:2,source:'PL · 250 cMpc · 64³',explanation:'青色薄层勾出中性结构的边界，透过近处界面观察内部空腔。暖色切缘标出剖开的位置。'},
  density:{kind:1,model:'pl',tab:'密度',title:'物质的纤维',subtitle:'真实密度场 · 纤维与高密节点',effect:'密度辉光',threshold:.22,min:.02,max:2,step:.01,section:0,bandWidth:.035,gradientGain:1.8,epochs:['早期','中期','晚期'],defaultEpoch:2,source:'PL · 250 cMpc · 64³',explanation:'金色强调高密区域，较淡的青色保留低密度结构。纤维与节点均来自真实密度场，阈值以密度对比度 δ 表示。'},
  brightness_temperature:{kind:2,model:'pl',tab:'亮温',title:'21cm 的冷与暖',subtitle:'同组 250 cMpc 模拟 · 吸收与发射',effect:'冷暖辉光',threshold:8,min:.1,max:150,step:.1,section:.18,bandWidth:.02,gradientGain:3,epochs:['吸收片段','发射峰值','晚期结构'],epochThresholds:[8,8,5],defaultEpoch:1,source:'PL · 250 cMpc · 64³',explanation:'蓝色表示负亮温吸收，橙红表示正亮温发射，零值透明。红色时间段的源温度与亮温极值待审核，播放会在缺口暂停。'},
};
export function sampleDefaults(key){
  const preset=SAMPLE_FIELDS[key],field=FIELDS[key];
  return {threshold:preset.threshold,section:preset.section,shadowStrength:.8,contextOpacity:.12,bloom:.8,sampleMode:'energy',fieldKind:preset.kind,bandWidth:preset.bandWidth,gradientGain:preset.gradientGain,valueRange:field.range,palette:field.palette,colorMiddle:field.middle,region:key==='brightness_temperature'?'custom':'neutral',opacity:key==='density'?8:4,points:key==='brightness_temperature'?[{x:0,y:1},{x:field.middle,y:0},{x:1,y:1}]:[{x:0,y:0},{x:1,y:1}]};
}
// The shader applies these display mappings AFTER sampling the raw scalar.
// Units and signs of the source buffers, slices and statistics stay intact.
export function structureValue(value,key){
  if(key==='density')return Math.log1p(Math.max(value,0))/Math.log(4);
  if(key==='brightness_temperature')return Math.abs(value)/100;
  return value;
}
export function epochThreshold(key,index,model='pl'){return key==='brightness_temperature'&&index===0&&model==='bt'?50:SAMPLE_FIELDS[key].epochThresholds?.[index]??SAMPLE_FIELDS[key].threshold;}
