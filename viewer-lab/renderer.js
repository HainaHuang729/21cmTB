import { clamp, PALETTE } from './data.js';
import { cameraBasis, screenRay, pickSlice, overlayGeometry } from './locator.js';
import { MAX_POINTS, normalizePoints } from './transfer.js';

const vertex = `#version 300 es
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.); }`;

const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
out vec4 outColor;
uniform sampler3D volume;
uniform vec2 resolution;
uniform float gridSize;
uniform vec2 valueRange;
uniform float colorMiddle;
uniform vec3 eye, rightAxis, upAxis, forwardAxis;
uniform vec3 lowColor, midColor, highColor;
uniform float opacity, center, width, lightStrength, crop;
uniform int region, mode, steps, pointCount;
uniform vec2 transferPoints[${MAX_POINTS}];
uniform ivec3 sliceCell, planeEnabled;
uniform bool hardwareLinear;
const vec3 lightDir=vec3(-.486664,.811107,.324443);
float normalizeValue(float v){return clamp((v-valueRange.x)/(valueRange.y-valueRange.x),0.,1.);}
float sampleRaw(vec3 p){
  p=clamp(p,vec3(.5/gridSize),vec3(1.-.5/gridSize));
  if(hardwareLinear) return texture(volume,p).r;
  vec3 q=p*gridSize-.5; ivec3 a=ivec3(floor(q)),b=min(a+1,ivec3(int(gridSize)-1));vec3 f=fract(q);
  float z0=mix(mix(texelFetch(volume,a,0).r,texelFetch(volume,ivec3(b.x,a.yz),0).r,f.x),mix(texelFetch(volume,ivec3(a.x,b.y,a.z),0).r,texelFetch(volume,ivec3(b.xy,a.z),0).r,f.x),f.y);
  float z1=mix(mix(texelFetch(volume,ivec3(a.xy,b.z),0).r,texelFetch(volume,ivec3(b.x,a.y,b.z),0).r,f.x),mix(texelFetch(volume,ivec3(a.x,b.yz),0).r,texelFetch(volume,b,0).r,f.x),f.y);
  return mix(z0,z1,f.z);
}
float sampleField(vec3 p){return normalizeValue(sampleRaw(p));}
float weight(float v){
  if(region==1) return 1.-v;
  if(region==2){float d=(v-center)/max(.02,width*.5);return exp(-.5*d*d);}
  if(region==3){
    float x=clamp(v,0.,1.);
    if(pointCount<2)return x;
    if(x<=transferPoints[0].x)return transferPoints[0].y;
    for(int i=1;i<${MAX_POINTS};i++){
      if(i>=pointCount)break;
      vec2 a=transferPoints[i-1],b=transferPoints[i];
      if(x<=b.x){float span=b.x-a.x;return span>0.?mix(a.y,b.y,(x-a.x)/span):b.y;}
    }
    return transferPoints[pointCount-1].y;
  }
  return v;
}
vec3 fieldColor(float v){return v<colorMiddle?mix(lowColor,midColor,v/colorMiddle):mix(midColor,highColor,(v-colorMiddle)/(1.-colorMiddle));}
float visibleWeight(vec3 p){
  if(any(lessThan(p,vec3(0.)))||any(greaterThan(p,vec3(1.,1.,crop))))return 0.;
  return weight(sampleField(p));
}
bool intersectBox(vec3 ro,vec3 rd,out float nearT,out float farT){
  nearT=-1e20;farT=1e20;
  for(int a=0;a<3;a++){
    float hi=a==2?crop-.5:.5;
    if(abs(rd[a])<1e-7){if(ro[a]<-.5||ro[a]>hi)return false;}
    else{float x=(-.5-ro[a])/rd[a],y=(hi-ro[a])/rd[a];nearT=max(nearT,min(x,y));farT=min(farT,max(x,y));}
  }
  return farT>max(nearT,0.);
}
void composite(inout vec4 acc,vec3 rgb,float alpha){
  acc.rgb+=(1.-acc.a)*alpha*rgb;acc.a+=(1.-acc.a)*alpha;
}
void integrateSegment(inout vec4 acc,vec3 rd,float startT,float endT){
  float ds=endT-startT;
  if(ds<=0.||opacity<=0.||acc.a>.995)return;
  vec3 p=eye+rd*((startT+endT)*.5)+.5;
  float v=sampleField(p),w=weight(v);
  if(w<.001)return;
  vec3 rgb=fieldColor(v);
  if(mode>0 && lightStrength>0.){
    float h=1./gridSize;
    vec3 g=vec3(sampleField(p+vec3(h,0,0))-sampleField(p-vec3(h,0,0)),sampleField(p+vec3(0,h,0))-sampleField(p-vec3(0,h,0)),sampleField(p+vec3(0,0,h))-sampleField(p-vec3(0,0,h)));
    // Orient lighting by the displayed weight, including decreasing/custom bands.
    // A flat transfer segment has no invented gradient normal.
    float lo=max(0.,v-.001),hi=min(1.,v+.001);
    float slope=(weight(hi)-weight(lo))/max(hi-lo,1e-6);
    g*=slope;
    float magnitude=length(g);vec3 normal=-g/max(magnitude,1e-6);
    float diffuse=max(dot(normal,lightDir),0.);
    float structure=smoothstep(.002,.04,magnitude);
    float lighting=mix(1.,.53+.92*diffuse,structure);
    if(mode==2){
      float shadow=0.;
      for(int j=1;j<=4;j++)shadow+=visibleWeight(p+lightDir*float(j)*.035);
      float transmittance=exp(-shadow*.035*opacity);
      lighting=mix(1.,lighting,.4)*(.52+.48*transmittance);
    }
    rgb*=mix(1.,lighting,lightStrength);
  }
  // Step-length corrected display extinction also applies to split intervals.
  composite(acc,rgb,1.-exp(-w*opacity*ds));
}
void compositeSlice(inout vec4 acc,vec3 rd,float t,int axis){
  vec3 p=eye+rd*t+.5;
  ivec3 cell=clamp(ivec3(floor(p*gridSize)),ivec3(0),ivec3(int(gridSize)-1));
  cell[axis]=sliceCell[axis];
  // Fixed colour mapping and an exact source voxel, just like the 2D slice.
  composite(acc,fieldColor(normalizeValue(texelFetch(volume,cell,0).r)),.68);
}
void main(){
  vec2 uv=(gl_FragCoord.xy/resolution)*2.-1.;uv.x*=resolution.x/resolution.y;
  vec3 rd=normalize(forwardAxis+.3639702*(uv.x*rightAxis+uv.y*upAxis));
  float t0,t1;if(!intersectBox(eye,rd,t0,t1))discard;t0=max(0.,t0);
  vec3 eventT=vec3(1e20);ivec3 eventAxis=ivec3(0);int eventCount=0;
  for(int axis=0;axis<3;axis++){
    if(planeEnabled[axis]==0||abs(rd[axis])<1e-8)continue;
    float plane=(float(sliceCell[axis])+.5)/gridSize-.5;
    float t=(plane-eye[axis])/rd[axis];
    if(t<t0||t>t1)continue;
    eventT[eventCount]=t;eventAxis[eventCount]=axis;eventCount++;
  }
  // Plane hits are composited in true ray order, never painted over the volume.
  for(int a=0;a<3;a++)for(int b=a+1;b<3;b++){
    if(a<eventCount&&b<eventCount&&eventT[b]<eventT[a]){
      float t=eventT[a];eventT[a]=eventT[b];eventT[b]=t;
      int axis=eventAxis[a];eventAxis[a]=eventAxis[b];eventAxis[b]=axis;
    }
  }
  float ds=(t1-t0)/float(steps);vec4 acc=vec4(0.);int nextEvent=0;
  for(int i=0;i<512;i++){
    if(i>=steps||acc.a>.995)break;
    float cursor=t0+float(i)*ds,endT=i==steps-1?t1:t0+float(i+1)*ds;
    for(int j=0;j<3;j++){
      if(nextEvent>=eventCount)break;
      float planeT=eventT[nextEvent];
      if(planeT>endT)break;
      integrateSegment(acc,rd,cursor,planeT);
      compositeSlice(acc,rd,planeT,eventAxis[nextEvent]);
      cursor=planeT;nextEvent++;
    }
    integrateSegment(acc,rd,cursor,endT);
  }
  if(acc.a<.001)discard;
  outColor=vec4(acc.rgb/acc.a,acc.a);
}`;

const lineVertex = `#version 300 es
precision highp float;
layout(location=0)in vec3 position;
uniform vec3 eye,rightAxis,upAxis,forwardAxis;
uniform float aspect;
void main(){vec3 d=position-eye;float z=dot(d,forwardAxis);gl_Position=vec4(dot(d,rightAxis)/(.3639702*aspect),dot(d,upAxis)/.3639702,1.002002*z-.02002002,z);}`;
const lineFragment = `#version 300 es
precision highp float;uniform vec4 lineColor;out vec4 color;void main(){color=lineColor;}`;
const PLANE_COLORS = [[184/255,75/255,62/255,.95],[214/255,166/255,46/255,.95],[77/255,143/255,156/255,.95]];

export class Renderer {
  gridSize = 64;
  settings = { mode: 0, region: 'neutral', opacity: 4, center: .5, width: .3, light: .65, crop: 1, points: normalizePoints() };
  locator = { point: [32,32,32], planes: [], showProbe: true };
  yaw = .68; pitch = .42; distance = 2.65; ready = false; raf = 0; settle = 0; destroyed = false;
  constructor(canvas, onState, onFailure, onProbe = null) {
    this.canvas = canvas; this.onState = onState; this.onFailure = onFailure; this.onProbe = onProbe;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 不可用；右侧原值切片仍可查看');
    this.gl = gl;
    this.linear = !!gl.getExtension('OES_texture_float_linear');
    this.program = this.makeProgram(vertex, fragment); this.lineProgram = this.makeProgram(lineVertex, lineFragment);
    this.uniforms = new Map(); this.lineUniforms = new Map();
    this.vao = gl.createVertexArray(); this.lineVao = gl.createVertexArray(); this.locatorVao = gl.createVertexArray();
    const points = [], corners = [];
    for (let z=0;z<2;z++) for(let y=0;y<2;y++) for(let x=0;x<2;x++)corners.push([x-.5,y-.5,z-.5]);
    for(let i=0;i<8;i++) for(const bit of [1,2,4])if(!(i&bit))points.push(...corners[i],...corners[i|bit]);
    gl.bindVertexArray(this.lineVao);this.lineBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    gl.bindVertexArray(this.locatorVao);this.locatorBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.locatorBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindVertexArray(null);
    this.updateLocatorGeometry();
    this.events = new AbortController(); const options = { signal: this.events.signal };
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0||this.pointer!=null)return;
      this.pointer=e.pointerId;this.drag=[e.clientX,e.clientY];this.dragStart=this.drag.slice();this.maxTravel=0;
      canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
    },options);
    canvas.addEventListener('pointermove',e=>{
      if(this.pointer!==e.pointerId)return;
      const previousTravel=this.maxTravel;
      this.maxTravel=Math.max(this.maxTravel,Math.hypot(e.clientX-this.dragStart[0],e.clientY-this.dragStart[1]));
      if(this.maxTravel>=4){
        const from=previousTravel<4?this.dragStart:this.drag;
        this.yaw-=(e.clientX-from[0])*.007;this.pitch=clamp(this.pitch+(e.clientY-from[1])*.007,-1.45,1.45);this.request(true);
      }
      this.drag=[e.clientX,e.clientY];
    },options);
    const release=e=>{
      if(this.pointer!==e.pointerId)return;
      const travel=Math.max(this.maxTravel,Math.hypot(e.clientX-this.dragStart[0],e.clientY-this.dragStart[1]));
      this.pointer=null;
      if(e.type==='pointerup'&&travel<4&&this.ready&&typeof this.onProbe==='function'&&this.locator.planes.length){
        const camera=cameraBasis(this.yaw,this.pitch,this.distance);
        const ray=screenRay(e.clientX,e.clientY,canvas.getBoundingClientRect(),camera);
        const hit=pickSlice(ray,this.locator.point,this.locator.planes,this.settings.crop,this.gridSize);
        if(hit)this.onProbe(hit.point.slice());
      }
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      this.request();
    };
    canvas.addEventListener('pointerup',release,options);canvas.addEventListener('pointercancel',release,options);canvas.addEventListener('lostpointercapture',release,options);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=clamp(this.distance*Math.exp(e.deltaY*.001),1.0,6);this.request(true);},{...options,passive:false});
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
      e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.1;if(e.key==='ArrowRight')this.yaw+=.1;
      if(e.key==='ArrowUp')this.pitch=clamp(this.pitch+.1,-1.45,1.45);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch-.1,-1.45,1.45);
      if(e.key==='+'||e.key==='=')this.distance=clamp(this.distance*.9,1,6);if(e.key==='-')this.distance=clamp(this.distance/ .9,1,6);
      if(e.key==='Home')this.reset();this.request(true);
    },options);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;onFailure('GPU 上下文已丢失；切片可继续查看，刷新页面可恢复三维视图');},options);
    this.observer=new ResizeObserver(()=>this.request());this.observer.observe(canvas);this.request();
  }
  makeProgram(vs,fs){
    const gl=this.gl, p=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);gl.deleteProgram(p);throw new Error(`渲染着色器编译失败：${log}`);}
      gl.attachShader(p,s);gl.deleteShader(s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error(`渲染程序连接失败：${log}`);}return p;
  }
  uniform(name,line=false){const map=line?this.lineUniforms:this.uniforms;if(!map.has(name))map.set(name,this.gl.getUniformLocation(line?this.lineProgram:this.program,name));return map.get(name);}
  clearData(){this.ready=false;this.request();}
  setData(data){
    const n=Math.round(Math.cbrt(data.length));
    if(![64,128].includes(n)||data.length!==n**3)throw new Error('三维网格尺寸无效');
    const gl=this.gl,reuse=!!this.texture&&this.gridSize===n;if(!this.texture)this.texture=gl.createTexture();
    if(this.gridSize!==n){this.locator.point=this.locator.point.map(v=>Math.min(n-1,Math.floor((v+.5)*n/this.gridSize)));this.gridSize=n;this.updateLocatorGeometry();}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,this.linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,this.linear?gl.LINEAR:gl.NEAREST);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
    if(reuse)gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,n,n,n,gl.RED,gl.FLOAT,data);
    else gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,n,n,n,0,gl.RED,gl.FLOAT,data);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`三维纹理上传失败 (${error})`);
    this.ready=true;this.request();
  }
  configure(settings,interactive=false){
    const previousCrop=this.settings.crop;
    const next={...settings};
    if(Object.hasOwn(next,'points'))next.points=normalizePoints(next.points);
    Object.assign(this.settings,next);
    if(this.settings.crop!==previousCrop)this.updateLocatorGeometry();
    this.request(interactive);
  }
  setLocator({point=this.locator.point,planes=this.locator.planes,showProbe=this.locator.showProbe}={},interactive=false){
    const selected=[...new Set(Array.from(planes,axis=>typeof axis==='string'?'xyz'.indexOf(axis.toLowerCase()):axis))].filter(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2);
    // Geometry validation keeps grid indices aligned with the source volume.
    const geometry=overlayGeometry(Array.from(point),selected,this.settings.crop,this.gridSize);
    this.locator={point:Array.from(point),planes:selected,showProbe:Boolean(showProbe)};
    this.updateLocatorGeometry(geometry);this.request(interactive);
  }
  updateLocatorGeometry(geometry=overlayGeometry(this.locator.point,this.locator.planes,this.settings.crop,this.gridSize)){
    const vertices=[],groups=[];
    for(const plane of geometry.planes){groups.push({first:vertices.length/3,count:plane.vertices.length/3,color:PLANE_COLORS[plane.axis]});vertices.push(...plane.vertices);}
    if(this.locator.showProbe&&geometry.marker.length){groups.push({first:vertices.length/3,count:geometry.marker.length/3,color:[.98,.97,.91,1]});vertices.push(...geometry.marker);}
    this.locatorGroups=groups;this.locatorGeometry=geometry;
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.locatorBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
  }
  reset(){this.yaw=.68;this.pitch=.42;this.distance=2.65;this.request();}
  request(interactive=false){
    if(this.destroyed)return;this.interactive=interactive;
    clearTimeout(this.settle);
    if(interactive)this.settle=setTimeout(()=>this.request(),160);
    if(!this.raf)this.raf=requestAnimationFrame(()=>{this.raf=0;try{this.draw();}catch(e){this.onFailure(e.message);}});
  }
  draw(){
    const gl=this.gl,canvas=this.canvas,start=performance.now(),box=canvas.getBoundingClientRect();
    const scale=this.interactive?.65:Math.min(devicePixelRatio,1.25);
    const w=Math.max(1,Math.round(box.width*scale)),h=Math.max(1,Math.round(box.height*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.clearColor(23/255,38/255,45/255,1);gl.clear(gl.COLOR_BUFFER_BIT);
    if(!this.ready)return;
    const {eye,forward,right,up}=cameraBasis(this.yaw,this.pitch,this.distance);
    const camera=(line=false)=>{for(const [key,value]of Object.entries({eye,rightAxis:right,upAxis:up,forwardAxis:forward}))gl.uniform3fv(this.uniform(key,line),value);};
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);camera();gl.uniform2f(this.uniform('resolution'),w,h);
    gl.uniform1f(this.uniform('gridSize'),this.gridSize);
    gl.uniform1i(this.uniform('volume'),0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    const steps=this.gridSize===128?(this.interactive?128:320):(this.interactive?64:160);
    gl.uniform1i(this.uniform('hardwareLinear'),this.linear?1:0);gl.uniform1i(this.uniform('steps'),steps);
    gl.uniform1i(this.uniform('mode'),this.settings.mode);gl.uniform1i(this.uniform('region'),['neutral','ionized','band','custom'].indexOf(this.settings.region));
    const transfer=new Float32Array(MAX_POINTS*2);
    this.settings.points.forEach((p,i)=>{transfer[i*2]=p.x;transfer[i*2+1]=p.y;});
    gl.uniform2fv(this.uniform('transferPoints[0]'),transfer);gl.uniform1i(this.uniform('pointCount'),this.settings.points.length);
    gl.uniform3iv(this.uniform('sliceCell'),new Int32Array(this.locator.point));
    gl.uniform3iv(this.uniform('planeEnabled'),new Int32Array([0,1,2].map(axis=>this.locator.planes.includes(axis)?1:0)));
    for(const name of ['opacity','center','width','crop'])gl.uniform1f(this.uniform(name),this.settings[name]);
    gl.uniform1f(this.uniform('lightStrength'),this.settings.light);
    const range=this.settings.valueRange||[0,1];gl.uniform2f(this.uniform('valueRange'),...range);
    gl.uniform1f(this.uniform('colorMiddle'),this.settings.colorMiddle??.5);
    ['lowColor','midColor','highColor'].forEach((key,i)=>gl.uniform3fv(this.uniform(key),(this.settings.palette||PALETTE)[i].map(v=>v/255)));
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.useProgram(this.lineProgram);gl.bindVertexArray(this.lineVao);camera(true);gl.uniform1f(this.uniform('aspect',true),w/h);
    gl.uniform4fv(this.uniform('lineColor',true),[.67,.78,.79,.28]);gl.drawArrays(gl.LINES,0,24);
    // Deliberately X-ray locator lines: the filled planes above retain occlusion.
    gl.bindVertexArray(this.locatorVao);
    for(const group of this.locatorGroups){gl.uniform4fv(this.uniform('lineColor',true),group.color);gl.drawArrays(gl.LINES,group.first,group.count);}
    gl.bindVertexArray(null);gl.disable(gl.BLEND);
    this.onState(`${this.interactive?'交互预览':'静止精细'} · ${steps} 步`);
    this.lastDraw={width:w,height:h,cpuMs:performance.now()-start};
  }
  dispose(){this.destroyed=true;cancelAnimationFrame(this.raf);clearTimeout(this.settle);this.observer.disconnect();this.events.abort();const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteProgram(this.program);gl.deleteProgram(this.lineProgram);gl.deleteBuffer(this.lineBuffer);gl.deleteBuffer(this.locatorBuffer);gl.deleteVertexArray(this.vao);gl.deleteVertexArray(this.lineVao);gl.deleteVertexArray(this.locatorVao);}
}
