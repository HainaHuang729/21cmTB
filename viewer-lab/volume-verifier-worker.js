import { verifyVolume } from './data.js?v=playback-20261018';
self.onmessage=async({data:{id,buffer,field,key}})=>{
  try{
    const result=await verifyVolume(buffer,field,key);
    const value={...result,data:result.data.buffer,bins:result.bins.buffer};
    self.postMessage({id,value},[value.data,value.bins]);
  }catch(error){self.postMessage({id,error:error.message});}
};
