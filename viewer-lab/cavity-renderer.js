import { Renderer } from './renderer.js';
import { cameraBasis } from './locator.js';
import { gradientVolume } from './gradient-volume.js';
import { GlowPass } from './glow-pass.js';
import { densityNodeThreshold } from './field-presets.js?v=density-surface-20261017';

const vertex = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;

// Threshold surfaces of the published, trilinearly reconstructed scalar grid.
// These are display boundaries, not resolved physical fronts or a filament skeleton.
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
out vec4 outColor;
uniform sampler3D volume,gradients;
uniform vec2 resolution;
uniform float gridSize;
uniform vec3 eye,rightAxis,upAxis,forwardAxis;
uniform float thresholdRaw,nodeThresholdRaw,section,shadowStrength,contextOpacity,bandWidth,gradientGain;
uniform bool hardwareLinear,hdrTarget;
uniform int steps,appearance,fieldKind;
float threshold;
const vec3 cutNormal=vec3(.6666667,.3333333,.6666667);
const vec3 keyLight=vec3(-.436436,.872872,.218218);
float cutDistance(){return mix(.84,-.45,section);}
float rawField(vec3 p){
  p=clamp(p,vec3(.5/gridSize),vec3(1.-.5/gridSize));
  if(hardwareLinear)return texture(volume,p).r;
  vec3 q=p*gridSize-.5;ivec3 a=ivec3(floor(q)),b=min(a+1,ivec3(int(gridSize)-1));vec3 f=fract(q);
  float z0=mix(mix(texelFetch(volume,a,0).r,texelFetch(volume,ivec3(b.x,a.yz),0).r,f.x),mix(texelFetch(volume,ivec3(a.x,b.y,a.z),0).r,texelFetch(volume,ivec3(b.xy,a.z),0).r,f.x),f.y);
  float z1=mix(mix(texelFetch(volume,ivec3(a.xy,b.z),0).r,texelFetch(volume,ivec3(b.x,a.y,b.z),0).r,f.x),mix(texelFetch(volume,ivec3(a.x,b.yz),0).r,texelFetch(volume,b,0).r,f.x),f.y);
  return mix(z0,z1,f.z);
}
float structureValue(float value){
  if(fieldKind==1)return log(1.+max(value,0.))/log(4.);
  if(fieldKind==2)return abs(value)/100.;
  return value;
}
float field(vec3 p){return structureValue(rawField(p));}
bool inDomain(vec3 p){return all(greaterThanEqual(p,vec3(0.)))&&all(lessThanEqual(p,vec3(1.)))&&dot(p-.5,cutNormal)<=cutDistance();}
vec4 rawGradientAt(vec3 p){
  p=clamp(p,vec3(.5/gridSize),vec3(1.-.5/gridSize));
  if(hardwareLinear)return texture(gradients,p);
  vec3 q=p*gridSize-.5;ivec3 a=ivec3(floor(q)),b=min(a+1,ivec3(int(gridSize)-1));vec3 f=fract(q);
  vec4 z0=mix(mix(texelFetch(gradients,a,0),texelFetch(gradients,ivec3(b.x,a.yz),0),f.x),mix(texelFetch(gradients,ivec3(a.x,b.y,a.z),0),texelFetch(gradients,ivec3(b.xy,a.z),0),f.x),f.y);
  vec4 z1=mix(mix(texelFetch(gradients,ivec3(a.xy,b.z),0),texelFetch(gradients,ivec3(b.x,a.y,b.z),0),f.x),mix(texelFetch(gradients,ivec3(a.x,b.yz),0),texelFetch(gradients,b,0),f.x),f.y);
  return mix(z0,z1,f.z);
}
vec4 gradientAt(vec3 p){
  vec4 gradient=rawGradientAt(p);float value=rawField(p),slope=1.;
  if(fieldKind==1)slope=value>0.?1./((1.+value)*log(4.)):0.;
  if(fieldKind==2)slope=sign(value)/100.;
  return vec4(gradient.xyz*slope,gradient.w*abs(slope));
}
vec3 emissionColor(float raw){
  if(fieldKind==1)return vec3(1.,.46,.065);
  if(fieldKind==2)return raw<0.?vec3(.035,.24,1.):vec3(1.,.19,.035);
  return vec3(.025,.49,.67);
}
float solid(vec3 p){return inDomain(p)?smoothstep(threshold-.035,threshold+.035,field(p)):0.;}
vec3 normalAt(vec3 p){
  float h=1./gridSize;
  vec3 g=vec3(field(p+vec3(h,0,0))-field(p-vec3(h,0,0)),field(p+vec3(0,h,0))-field(p-vec3(0,h,0)),field(p+vec3(0,0,h))-field(p-vec3(0,0,h)));
  float magnitude=length(g);return magnitude>1e-6?-g/magnitude:vec3(0,1,0);
}
float occlusion(vec3 p,vec3 normal){
  vec3 tangent=normalize(cross(normal,abs(normal.y)<.9?vec3(0,1,0):vec3(1,0,0)));
  vec3 bitangent=cross(normal,tangent);float sum=0.;
  for(int i=0;i<5;i++){
    float angle=float(i)*2.399963;
    vec3 direction=normalize(normal*.82+(cos(angle)*tangent+sin(angle)*bitangent)*.57);
    for(int j=1;j<=3;j++)sum+=solid(p+normal*.009+direction*float(j)*.023)/15.;
  }
  return 1.-.72*sum;
}
float lightVisibility(vec3 p,vec3 normal){
  float extinction=0.;
  for(int j=1;j<=8;j++)extinction+=solid(p+normal*.012+keyLight*float(j)*.04)*.04;
  return exp(-extinction*9.);
}
vec3 shade(vec3 p,vec3 n,vec3 rd){
  if(dot(n,rd)>0.)n=-n;
  float diffuse=max(dot(n,keyLight),0.);
  float ao=1.,visibility=1.;
  if(shadowStrength>0.){ao=mix(1.,occlusion(p,n),shadowStrength);visibility=mix(1.,lightVisibility(p,n),shadowStrength);}
  float cutRim=section>.006?1.-smoothstep(.003,.018,abs(dot(p-.5,cutNormal)-cutDistance())):0.;
  vec3 material=mix(vec3(.79,.77,.63),vec3(.61,.20,.125),cutRim*.85);
  vec3 ambient=vec3(.10,.17,.19)*(.6+.4*n.y);
  vec3 halfDirection=normalize(keyLight-rd);
  float specular=pow(max(dot(n,halfDirection),0.),28.)*.12*visibility;
  vec3 color=(material*(.19+.81*diffuse*visibility)+ambient)*ao+specular;
  // A restrained cyan rim separates overlapping surfaces without outlining voxels.
  color+=vec3(.055,.12,.14)*pow(1.-max(dot(n,-rd),0.),3.)*ao;
  return pow(max(color,vec3(0.)),vec3(1./2.2));
}
void composite(inout vec4 acc,vec3 color,float alpha){acc.rgb+=(1.-acc.a)*alpha*color;acc.a+=(1.-acc.a)*alpha;}
int densitySurface(inout vec4 acc,vec3 rd,float nearT,float farT,float before,float after,float level,bool node,float entryT){
  if((before>=level)==(after>=level))return 0;
  float a=nearT,b=farT;
  for(int j=0;j<5;j++){
    float middle=(a+b)*.5,value=field(eye+rd*middle+.5);
    if((value>=level)==(before>=level))a=middle;else b=middle;
  }
  vec3 p=eye+rd*((a+b)*.5)+.5;
  // A short derivative of the reconstructed scalar avoids widening a small
  // density feature with the separately interpolated central-difference grid.
  float h=.45/gridSize;
  vec3 gradient=vec3(rawField(p+vec3(h,0,0))-rawField(p-vec3(h,0,0)),rawField(p+vec3(0,h,0))-rawField(p-vec3(0,h,0)),rawField(p+vec3(0,0,h))-rawField(p-vec3(0,0,h)));
  float magnitude=length(gradient);
  if(magnitude<1e-6)return 0;
  vec3 n=-gradient/magnitude;if(dot(n,rd)>0.)n=-n;
  float diffuse=max(dot(n,keyLight),0.);
  float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
  float visibility=1.;
  if(shadowStrength>0.){
    float crowd=0.;
    for(int j=1;j<=3;j++){
      vec3 q=p+n*(.6/gridSize)+keyLight*float(j)*(1.5/gridSize);
      if(inDomain(q))crowd+=smoothstep(level,level+.12,field(q))/3.;
    }
    visibility=mix(1.,exp(-crowd*1.8),shadowStrength);
  }
  float depth=exp(-max(0.,(a+b)*.5-entryT)*1.6);
  vec3 tint=node?vec3(1.,.48,.085):vec3(.025,.49,.63);
  float specular=node?pow(max(dot(n,normalize(keyLight-rd)),0.),96.):0.;
  vec3 color=node?tint*(.10+.85*diffuse)*visibility+vec3(1.,.93,.72)*specular*.35:tint*rim*4.*visibility;
  color*=depth;
  bool entering=after>before;
  float alpha=node?(entering?.97:.7):rim*.06*(entering?1.:.1);
  composite(acc,color,alpha);
  return 1;
}
void finish(vec3 color){if(appearance==1&&!hdrTarget)color=color/(1.+color);outColor=vec4(color,1.);}
bool boxHit(vec3 ro,vec3 rd,out float t0,out float t1){
  t0=-1e20;t1=1e20;
  for(int i=0;i<3;i++){
    if(abs(rd[i])<1e-7){if(abs(ro[i])>.5)return false;}
    else{float a=(-.5-ro[i])/rd[i],b=(.5-ro[i])/rd[i];t0=max(t0,min(a,b));t1=min(t1,max(a,b));}
  }
  return t1>max(t0,0.);
}
void main(){
  threshold=structureValue(thresholdRaw);
  vec2 uv=gl_FragCoord.xy/resolution*2.-1.;uv.x*=resolution.x/resolution.y;
  vec3 rd=normalize(forwardAxis+.3639702*(uv.x*rightAxis+uv.y*upAxis));
  vec3 background=appearance==1?mix(vec3(.0015,.003,.006),vec3(.003,.009,.014),gl_FragCoord.y/resolution.y):mix(vec3(.045,.095,.12),vec3(.095,.17,.195),gl_FragCoord.y/resolution.y);
  float t0,t1;if(!boxHit(eye,rd,t0,t1)){finish(background);return;}
  float denom=dot(rd,cutNormal),planeT=0.;
  if(abs(denom)<1e-7){if(dot(eye,cutNormal)>cutDistance()){finish(background);return;}}
  else{
    planeT=(cutDistance()-dot(eye,cutNormal))/denom;
    if(denom<0.)t0=max(t0,planeT);else t1=min(t1,planeT);
  }
  t0=max(t0,0.);if(t1<=t0){finish(background);return;}
  vec4 acc=vec4(0.);float start=field(eye+rd*t0+.5)-threshold;
  float nodeLevel=structureValue(nodeThresholdRaw);
  float ds=(t1-t0)/float(steps),previous=start,previousT=t0;int surfaces=0;
  for(int i=1;i<=640;i++){
    if(i>steps||acc.a>.995)break;
    float t=t0+float(i)*ds;vec3 p=eye+rd*t+.5;float value=field(p),signedValue=value-threshold;
    if(appearance==1&&fieldKind==1){
      // Composite two real scalar crossings in ray order. Thin lower-density
      // contours carry connectivity; denser, shaded cores remain compact.
      float before=previous+threshold;
      if(value>=before){
        surfaces+=densitySurface(acc,rd,previousT,t,before,value,threshold,false,t0);
        surfaces+=densitySurface(acc,rd,previousT,t,before,value,nodeLevel,true,t0);
      }else{
        surfaces+=densitySurface(acc,rd,previousT,t,before,value,nodeLevel,true,t0);
        surfaces+=densitySurface(acc,rd,previousT,t,before,value,threshold,false,t0);
      }
      // Density uses boundary light only. Filling every above-threshold voxel
      // with emission would reintroduce the cloudy layer this view avoids.
      if(surfaces>=12)break;
      previous=signedValue;previousT=t;continue;
    }
    if((appearance!=1||fieldKind!=1)&&((signedValue>=0.)!=(previous>=0.))){
      float a=previousT,b=t,side=previous;
      for(int j=0;j<5;j++){
        float middle=(a+b)*.5,s=field(eye+rd*middle+.5)-threshold;
        if((s>=0.)==(side>=0.))a=middle;else b=middle;
      }
      vec3 hit=eye+rd*((a+b)*.5)+.5;
      if(appearance==1){
        vec4 gradient=gradientAt(hit);float magnitude=length(gradient.xyz);
        vec3 n=magnitude>1e-6?-gradient.xyz/magnitude:vec3(0,1,0);
        if(dot(n,rd)>0.)n=-n;
        float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
        float ao=shadowStrength>0.?mix(1.,occlusion(hit,n),shadowStrength):1.;
        float cutRim=section>.006?1.-smoothstep(.003,.015,abs(dot(hit-.5,cutNormal)-cutDistance())):0.;
        vec3 tint=mix(emissionColor(rawField(hit)),vec3(1.,.40,.075),cutRim*.9);
        float depth=exp(-max(0.,(a+b)*.5-t0)*1.6);
        float directional=.28+.72*max(dot(n,keyLight),0.);
        vec3 color=tint*(.15*directional+rim*4.2)*(.16+.84*ao*ao)*depth;
        color+=vec3(.012,.035,.045)*max(dot(n,keyLight),0.)*ao;
        composite(acc,color,fieldKind==1?.16+rim*.28:.34+rim*.4);surfaces++;
      }else composite(acc,shade(hit,normalAt(hit),rd),.94);
    }
    if(appearance==1){
      // Only a scalar band with a real spatial gradient emits. A uniform xH
      // field cannot acquire a fictional glowing front from this display.
      float magnitude=gradientAt(p).w*gradientGain;
      float band=exp(-pow((value-threshold)/bandWidth,2.))*smoothstep(.025,.22,magnitude);
      if(fieldKind==1)band=0.;
      if(fieldKind==2&&abs(rawField(p))<1e-6)band=0.;
      float depth=exp(-(t-t0)*1.6);
      vec3 bandColor=fieldKind==0?vec3(.025,.63,.91):emissionColor(rawField(p));
      composite(acc,bandColor*.95*depth,1.-exp(-band*ds*4.));
      if(fieldKind==2){
        float emissionWeight=smoothstep(threshold*.45,threshold*1.7,value);
        composite(acc,emissionColor(rawField(p))*.24*depth,1.-exp(-emissionWeight*ds*1.4));
      }
      if(contextOpacity>0.)composite(acc,vec3(.015,.06,.075),1.-exp(-value*contextOpacity*ds*.5));
      if(surfaces>=(fieldKind==1?16:8))break;
    }else if(contextOpacity>0.)composite(acc,vec3(.29,.53,.57),1.-exp(-value*contextOpacity*ds));
    previous=signedValue;previousT=t;
  }
  finish(acc.rgb+(1.-acc.a)*background);
}`;

export class CavityRenderer extends Renderer {
  constructor(...args){
    super(...args);
    this.cavityProgram=this.makeProgram(vertex,fragment);
    this.cavityUniforms=new Map();
    this.glowPass=new GlowPass(this.gl,(vs,fs)=>this.makeProgram(vs,fs));
    Object.assign(this.settings,{threshold:.5,section:.42,shadowStrength:.8,contextOpacity:.12,bloom:.8,sampleMode:'energy',mode:1,light:.65,fieldKind:0,bandWidth:.065,gradientGain:1});
    this.setLocator({planes:[],showProbe:false});
    this.reset();
  }
  reset(){this.yaw=1.12;this.pitch=.48;this.distance=2.4;this.request();}
  setData(data,preparedGradient){
    super.setData(data);const gl=this.gl,n=this.gridSize;
    const reuse=!!this.gradientTexture&&this.gradientSize===n;if(!this.gradientTexture)this.gradientTexture=gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.gradientTexture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,this.linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,this.linear?gl.LINEAR:gl.NEAREST);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
    const gradients=preparedGradient??gradientVolume(data,n);
    if(reuse)gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,n,n,n,gl.RGBA,gl.FLOAT,gradients);
    else gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA32F,n,n,n,0,gl.RGBA,gl.FLOAT,gradients);
    this.gradientSize=n;
    gl.activeTexture(gl.TEXTURE0);
    const error=gl.getError();if(error!==gl.NO_ERROR){this.ready=false;throw new Error(`梯度纹理上传失败 (${error})`);}
    this.request();
  }
  draw(){
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);
    const frame=this.canvas.getBoundingClientRect();
    // Fit the domain to the shorter canvas dimension, preserving the same
    // user-controlled camera in both the surface and volume comparisons.
    const fit=Math.max(1,1.05/(frame.width/Math.max(frame.height,1)));
    if(!this.cavityProgram||this.settings.sampleMode==='volume'){
      const distance=this.distance;this.distance*=fit;
      try{super.draw();}finally{this.distance=distance;}
      return;
    }
    const gl=this.gl,canvas=this.canvas,box=canvas.getBoundingClientRect();
    const density=this.settings.fieldKind===1;
    const scale=this.interactive?(density?.85:.75):Math.min(devicePixelRatio,density?2:1.5);
    const w=Math.max(1,Math.round(box.width*scale)),h=Math.max(1,Math.round(box.height*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const energy=this.settings.sampleMode==='energy';
    if(!this.ready){gl.viewport(0,0,w,h);gl.clearColor(.065,.125,.15,1);gl.clear(gl.COLOR_BUFFER_BIT);return;}
    if(energy)this.glowPass.begin(w,h);
    gl.viewport(0,0,w,h);gl.clearColor(.065,.125,.15,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!this.ready){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return;}
    gl.useProgram(this.cavityProgram);gl.bindVertexArray(this.vao);gl.disable(gl.BLEND);
    const u=name=>{if(!this.cavityUniforms.has(name))this.cavityUniforms.set(name,gl.getUniformLocation(this.cavityProgram,name));return this.cavityUniforms.get(name);};
    const {eye,forward,right,up}=cameraBasis(this.yaw,this.pitch,this.distance*fit);
    for(const [key,value]of Object.entries({eye,forwardAxis:forward,rightAxis:right,upAxis:up}))gl.uniform3fv(u(key),value);
    gl.uniform2f(u('resolution'),w,h);gl.uniform1i(u('volume'),0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.uniform1f(u('gridSize'),this.gridSize);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.gradientTexture);gl.uniform1i(u('gradients'),1);gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('appearance'),energy?1:0);gl.uniform1i(u('hdrTarget'),this.glowPass.hdr?1:0);
    gl.uniform1i(u('hardwareLinear'),this.linear?1:0);gl.uniform1i(u('steps'),this.gridSize===128?(this.interactive?256:640):(this.interactive?112:280));
    gl.uniform1f(u('thresholdRaw'),this.settings.threshold);gl.uniform1i(u('fieldKind'),this.settings.fieldKind);
    gl.uniform1f(u('nodeThresholdRaw'),densityNodeThreshold(this.settings.threshold));
    for(const name of ['section','shadowStrength','contextOpacity','bandWidth','gradientGain'])gl.uniform1f(u(name),this.settings[name]);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);
    if(energy)this.glowPass.finish(this.settings.bloom,this.settings.fieldKind===1?.35:1.4);
    this.onState(this.interactive?'交互预览':'界面精细显示');
  }
  dispose(){this.gl.deleteTexture(this.gradientTexture);this.glowPass.dispose();this.gl.deleteProgram(this.cavityProgram);super.dispose();}
}
