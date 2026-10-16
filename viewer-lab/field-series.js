import { nearest, snapshotFieldAvailable } from './data.js';

export const publishedSnapshots=(sequence,field)=>sequence.filter(s=>snapshotFieldAvailable(s,field));
export function fieldGaps(sequence,field){
  const gaps=[];let start=-1;
  for(let i=0;i<=sequence.length;i++){
    if(i<sequence.length&&!snapshotFieldAvailable(sequence[i],field)){if(start<0)start=i;}
    else if(start>=0){gaps.push({start,end:i-1,count:i-start,firstZ:sequence[start].redshift,lastZ:sequence[i-1].redshift});start=-1;}
  }
  return gaps;
}
export function nextPublishedIndex(sequence,index,direction,field){
  for(let i=index+direction;i>=0&&i<sequence.length;i+=direction)if(snapshotFieldAvailable(sequence[i],field))return i;
  return -1;
}
export function stageIndices(sequence,field){
  const available=publishedSnapshots(sequence,field);
  if(!available.length)throw new Error('该物理场没有已发布快照');
  const selected=field==='brightness_temperature'?[
    available.reduce((a,b)=>a.fields[field].statistics.mean<=b.fields[field].statistics.mean?a:b),
    available.reduce((a,b)=>a.fields[field].statistics.mean>=b.fields[field].statistics.mean?a:b),
    available[nearest(available,.2,'meanNeutralFraction')],
  ]:[.8,.5,.2].map(mean=>available[nearest(available,mean,'meanNeutralFraction')]);
  return selected.map(s=>sequence.findIndex(frame=>frame.id===s.id));
}
export function sampleCacheTasks(manifests){
  return ['pl','bt'].flatMap(model=>['xH','density','brightness_temperature'].flatMap(field=>
    publishedSnapshots(manifests[model].snapshots,field).map(snapshot=>({model,field,snapshot}))));
}
