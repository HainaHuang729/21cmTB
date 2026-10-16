// Coordinates match the exported cell centres and the renderer's right-handed cube.
export const FOV_TANGENT = .3639702;
const EPSILON = 1e-9;
const PARALLEL_EPSILON = 1e-8;
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalized = a => { const length=Math.hypot(...a); return length>0 ? a.map(v=>v/length) : null; };
const finiteVector = v => v?.length===3 && Array.from(v).every(Number.isFinite);
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

function validateGrid(n) {
  if(!Number.isInteger(n)||n<1)throw new RangeError('Grid size must be a positive integer');
}
function validateCrop(crop) {
  if(!Number.isFinite(crop)||crop<0||crop>1)throw new RangeError('Crop must be between 0 and 1');
}
function selectedAxes(axes) {
  return [...new Set(Array.from(axes??[],axis=>typeof axis==='string'?'xyz'.indexOf(axis.toLowerCase()):axis))]
    .filter(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2);
}

export function cellToWorld(point,n=64) {
  validateGrid(n);
  if(!finiteVector(point)||!Array.from(point).every(v=>Number.isInteger(v)&&v>=0&&v<n)) {
    throw new RangeError('Point must contain three cell indices inside the grid');
  }
  return Array.from(point,v=>(v+.5)/n-.5);
}

export function cameraBasis(yaw,pitch,distance) {
  if(![yaw,pitch,distance].every(Number.isFinite)||distance<=0)throw new RangeError('Invalid camera');
  const eye=[Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance];
  const forward=normalized(eye.map(v=>-v));
  const horizontal=cross(forward,[0,1,0]);
  // The UI avoids the poles; this fallback keeps the pure API finite there as well.
  const right=Math.hypot(...horizontal)>EPSILON?normalized(horizontal):[Math.cos(yaw),0,-Math.sin(yaw)];
  return {eye,forward,right,up:cross(right,forward)};
}

export function screenRay(clientX,clientY,rect,camera) {
  if(![clientX,clientY,rect?.left,rect?.top,rect?.width,rect?.height].every(Number.isFinite)||rect.width<=0||rect.height<=0) {
    throw new RangeError('A nonempty canvas rectangle is required');
  }
  if(!['eye','forward','right','up'].every(key=>finiteVector(camera?.[key])))throw new RangeError('Invalid camera basis');
  // CSS pixels suffice: both device scaling and the interaction resolution cancel.
  const u=((clientX-rect.left)/rect.width*2-1)*(rect.width/rect.height);
  const v=1-(clientY-rect.top)/rect.height*2;
  const direction=normalized(camera.forward.map((f,i)=>f+FOV_TANGENT*(u*camera.right[i]+v*camera.up[i])));
  if(!direction)throw new RangeError('Invalid ray direction');
  return {origin:Array.from(camera.eye),direction};
}

export function pickSlice(ray,point,axes,crop=1,n=64) {
  const position=cellToWorld(point,n);
  validateCrop(crop);
  if(crop===0||!finiteVector(ray?.origin)||!finiteVector(ray?.direction))return null;
  const direction=normalized(Array.from(ray.direction));
  if(!direction)return null;
  const low=[-.5,-.5,-.5], high=[.5,.5,crop-.5];
  let nearest=null;
  for(const axis of selectedAxes(axes)) {
    if(position[axis]<low[axis]-EPSILON||position[axis]>high[axis]+EPSILON||Math.abs(direction[axis])<PARALLEL_EPSILON)continue;
    const distance=(position[axis]-ray.origin[axis])/direction[axis];
    if(distance<=EPSILON||(nearest&&distance>=nearest.distance))continue;
    const hit=ray.origin.map((v,i)=>v+distance*direction[i]);
    if(hit.some((v,i)=>v<low[i]-EPSILON||v>high[i]+EPSILON))continue;
    // Roundoff at the outer cube faces is clamped; interior cells use floor.
    const bounded=hit.map((v,i)=>clamp(v,low[i],high[i]));
    bounded[axis]=position[axis];
    const indices=bounded.map(v=>clamp(Math.floor((v+.5)*n),0,n-1));
    indices[axis]=point[axis];
    nearest={point:indices,axis,position:bounded,distance};
  }
  return nearest;
}

export function overlayGeometry(point,planeAxes,crop=1,n=64) {
  const position=cellToWorld(point,n);
  validateCrop(crop);
  const low=[-.5,-.5,-.5],high=[.5,.5,crop-.5],planes=[];
  if(crop===0)return {position,planes,marker:new Float32Array(),visible:false};
  for(const axis of selectedAxes(planeAxes)) {
    if(position[axis]>high[axis]+EPSILON)continue;
    const [u,v]=[0,1,2].filter(index=>index!==axis);
    const corners=[[low[u],low[v]],[high[u],low[v]],[high[u],high[v]],[low[u],high[v]]].map(([a,b])=>{
      const corner=position.slice();corner[u]=a;corner[v]=b;return corner;
    });
    const vertices=[];
    for(let i=0;i<4;i++)vertices.push(...corners[i],...corners[(i+1)%4]);
    planes.push({axis,vertices:new Float32Array(vertices)});
  }
  const visible=position.every((v,i)=>v>=low[i]-EPSILON&&v<=high[i]+EPSILON);
  const marker=[];
  if(visible)for(let axis=0;axis<3;axis++) {
    const a=position.slice(),b=position.slice(),halfLength=1.5/n;
    a[axis]=Math.max(low[axis],a[axis]-halfLength);b[axis]=Math.min(high[axis],b[axis]+halfLength);
    marker.push(...a,...b);
  }
  return {position,planes,marker:new Float32Array(marker),visible};
}
