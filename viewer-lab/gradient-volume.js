// Unscaled central differences of the published linear scalar values. Clamped
// neighbours at the domain faces match the renderer's reconstruction boundary.
export function gradientVolume(data,n=64){
  if(!Number.isInteger(n)||n<2||data?.length!==n**3)throw new RangeError('Gradient volume requires a complete cubic grid');
  const result=new Float32Array(data.length*4),plane=n*n;
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=x+n*y+plane*z,j=i*4;
    const dx=data[i+(x<n-1?1:0)]-data[i-(x>0?1:0)];
    const dy=data[i+(y<n-1?n:0)]-data[i-(y>0?n:0)];
    const dz=data[i+(z<n-1?plane:0)]-data[i-(z>0?plane:0)];
    result[j]=dx;result[j+1]=dy;result[j+2]=dz;result[j+3]=Math.hypot(dx,dy,dz);
  }
  return result;
}
