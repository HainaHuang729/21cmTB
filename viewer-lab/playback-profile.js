// Playback changes sampling cost only. Scalar grids, thresholds, lighting,
// colours and bloom stay identical; pause restores the original fine profile.
export function needsPreparedGradient(fieldKind,sampleMode='energy'){
  return fieldKind!==1||sampleMode!=='energy';
}
export function cavityProfile({gridSize,fieldKind,playing=false,interactive=false,pixelRatio=1,width=1,height=1}){
  const density=fieldKind===1;
  if(interactive)return {scale:density?.85:.75,steps:gridSize===128?256:112};
  if(playing)return {scale:Math.min(pixelRatio,1.25,Math.sqrt(1100000/Math.max(1,width*height))),steps:gridSize===128?512:280};
  return {scale:Math.min(pixelRatio,density?2:1.5),steps:gridSize===128?640:280};
}
