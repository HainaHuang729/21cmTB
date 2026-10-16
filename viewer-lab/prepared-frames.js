import { gradientVolume } from './gradient-volume.js';
import { abortable } from './volume-cache.js';

// Four nearby gradients: at most 128 MiB for the 128^3 density sequence.
export class PreparedFrames{
  constructor({limit=4,workerFactory=()=>new Worker(new URL('./gradient-worker.js',import.meta.url),{type:'module'})}={}){
    this.limit=limit;this.cache=new Map();this.pending=new Map();this.serial=0;this.jobs=new Map();
    try{
      this.worker=workerFactory();
      this.worker.onmessage=({data})=>{
        const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);
        if(data.error)job.reject(new Error(data.error));else job.resolve(new Float32Array(data.gradients));
      };
      this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;for(const job of this.jobs.values())job.resolve(gradientVolume(job.data,job.n));this.jobs.clear();};
    }catch{this.worker=null;}
  }
  get(key,data,signal){
    if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
    if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return abortable(Promise.resolve(value),signal);}
    if(!this.pending.has(key)){
      const n=Math.round(Math.cbrt(data.length));
      const computation=this.worker?new Promise((resolve,reject)=>{
        const id=++this.serial;this.jobs.set(id,{resolve,reject,data,n});
        // Transfer a copy; the verified raw volume must never be detached.
        const copy=data.slice();this.worker.postMessage({id,data:copy.buffer,n},[copy.buffer]);
      }):Promise.resolve().then(()=>gradientVolume(data,n));
      const pending=computation.then(value=>{
        this.cache.set(key,value);while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);
        return value;
      }).finally(()=>this.pending.delete(key));
      this.pending.set(key,pending);
    }
    return abortable(this.pending.get(key),signal);
  }
  dispose(){
    this.worker?.terminate();this.worker=null;
    for(const job of this.jobs.values())job.reject(new DOMException('Aborted','AbortError'));
    this.jobs.clear();this.cache.clear();
  }
}
