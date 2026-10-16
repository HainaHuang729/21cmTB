// Advance only after a frame has finished loading. A generation prevents an
// old asynchronous completion from restarting playback after pause or a seek.
export class SnapshotPlayer{
  constructor({getIndex,getCount,load,cancelPending=()=>{},onChange=()=>{},onError=()=>{},delay=()=>1200,schedule=(fn,ms)=>globalThis.setTimeout(fn,ms),unschedule=id=>globalThis.clearTimeout(id)}){
    Object.assign(this,{getIndex,getCount,load,cancelPending,onChange,onError,delay,schedule,unschedule});
    this.playing=false;this.generation=0;this.timer=null;
  }
  pause(cancel=false){
    this.playing=false;this.generation++;if(this.timer!==null)this.unschedule(this.timer);this.timer=null;
    if(cancel)this.cancelPending();this.onChange(false);
  }
  async start(){
    if(this.playing||this.getCount()<2)return;
    this.playing=true;const generation=++this.generation;this.onChange(true);
    const index=this.getIndex()>=this.getCount()-1?0:Math.max(0,this.getIndex());
    if(await this.show(index,generation))this.queue(generation);
  }
  async show(index,generation){
    try{
      const success=await this.load(index);
      if(generation!==this.generation||!this.playing)return false;
      if(!success){this.pause();return false;}
      if(index>=this.getCount()-1){this.pause();return false;}
      return true;
    }catch(error){if(generation===this.generation){this.pause();this.onError(error);}return false;}
  }
  queue(generation=this.generation){
    if(!this.playing||generation!==this.generation)return;
    this.timer=this.schedule(async()=>{
      this.timer=null;if(!this.playing||generation!==this.generation)return;
      if(await this.show(this.getIndex()+1,generation))this.queue(generation);
    },this.delay());
  }
  reschedule(){if(this.playing&&this.timer!==null){this.unschedule(this.timer);this.timer=null;this.queue();}}
}
