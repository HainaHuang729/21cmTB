// A hash-addressed persistent cache, independent of the selected source URL.
// Every read still passes verifyVolume before it can reach a renderer.
export class BrowserVolumeCache{
  constructor(revision,{storage=globalThis.caches,origin=globalThis.location?.origin??'http://localhost'}={}){
    this.storage=storage;this.origin=origin;this.name=`21cm-volumes-${revision}`;this.enabled=!!storage;this.error='';
  }
  key(descriptor){return `${this.origin}/.21cm-volume-cache/${descriptor.sha256}`;}
  async open(){
    if(!this.enabled)return null;
    try{return await (this.opening??=this.storage.open(this.name));}
    catch(error){this.enabled=false;this.error=error.message;return null;}
  }
  async read(descriptor){
    const cache=await this.open();if(!cache)return null;
    try{const response=await cache.match(this.key(descriptor));return response?.ok?await response.arrayBuffer():null;}
    catch(error){this.error=error.message;return null;}
  }
  async write(descriptor,buffer){
    const cache=await this.open();if(!cache)return false;
    try{await cache.put(this.key(descriptor),new Response(buffer,{headers:{'Content-Type':'application/octet-stream'}}));return true;}
    catch(error){this.enabled=false;this.error=error.message;return false;}
  }
  async remove(descriptor){const cache=await this.open();if(cache)try{await cache.delete(this.key(descriptor));}catch(error){this.error=error.message;}}
}

export const volumeKey=(model,snapshot,field)=>`${model}/${snapshot.id}/${field}`;
export function abortable(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',abort);if(!signal.aborted)resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}

// Bound concurrency and retain no extra references to decoded data. The store
// pins the active sequence; other frames can leave RAM after reaching disk.
export async function preloadVolumes(store,tasks,{signal,onProgress=()=>{},concurrency=2}={}){
  let cursor=0,completed=0;const failures=[];
  await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},async()=>{
    while(cursor<tasks.length){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      const task=tasks[cursor++];
      try{await store.load(task.model,task.snapshot,signal,task.field);completed++;}
      catch(error){if(error.name==='AbortError')throw error;failures.push({task,error});}
      if(!signal?.aborted)onProgress({completed,total:tasks.length,failed:failures.length});
    }
  }));
  return {completed,total:tasks.length,failures};
}
