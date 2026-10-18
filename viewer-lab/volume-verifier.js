import { verifyVolume } from './data.js?v=playback-20261018';

// Keep SHA-256, range and full-statistics validation, but move its float scan
// off the UI thread. Transfer a copy so persistent-cache writes retain bytes.
export class VolumeVerifier{
  constructor({workerFactory=()=>new Worker(new URL('./volume-verifier-worker.js',import.meta.url),{type:'module'})}={}){
    this.jobs=new Map();this.serial=0;this.disposed=false;
    try{
      this.worker=workerFactory();
      this.worker.onmessage=({data})=>{
        const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);
        if(data.error)job.reject(new Error(data.error));
        else job.resolve({...data.value,data:new Float32Array(data.value.data),bins:new Uint32Array(data.value.bins)});
      };
      this.worker.onerror=()=>{
        this.worker?.terminate();this.worker=null;
        for(const job of this.jobs.values())verifyVolume(job.buffer,job.field,job.key).then(job.resolve,job.reject);
        this.jobs.clear();
      };
    }catch{this.worker=null;}
  }
  verify(buffer,field,key){
    if(this.disposed)return Promise.reject(new DOMException('Aborted','AbortError'));
    if(!this.worker)return verifyVolume(buffer,field,key);
    return new Promise((resolve,reject)=>{
      const id=++this.serial;this.jobs.set(id,{resolve,reject,buffer,field,key});
      try{const copy=buffer.slice(0);this.worker.postMessage({id,buffer:copy,field,key},[copy]);}
      catch(error){this.jobs.delete(id);reject(error);}
    });
  }
  dispose(){
    this.disposed=true;this.worker?.terminate();this.worker=null;
    for(const job of this.jobs.values())job.reject(new DOMException('Aborted','AbortError'));
    this.jobs.clear();
  }
}
