import { gradientVolume } from './gradient-volume.js';
self.onmessage=({data:{id,data}})=>{
  try{
    const gradients=gradientVolume(new Float32Array(data));
    self.postMessage({id,gradients:gradients.buffer},[gradients.buffer]);
  }catch(error){self.postMessage({id,error:error.message});}
};
