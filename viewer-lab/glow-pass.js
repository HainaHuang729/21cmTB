const vertex=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 outColor;
uniform sampler2D source,halo;
uniform vec2 texel,direction;
uniform int stage;
uniform bool hdr;
uniform float strength;
vec3 decode(vec3 c){return hdr?c:c/max(vec3(.001),1.-c);}
vec3 encode(vec3 c){return hdr?c:c/(1.+c);}
vec3 readColor(vec2 p){return decode(texture(source,p).rgb);}
vec3 toneMap(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
void main(){
  vec3 color;
  if(stage==0){
    color=(readColor(uv+texel*.5)+readColor(uv-texel*.5)+readColor(uv+vec2(texel.x,-texel.y)*.5)+readColor(uv+vec2(-texel.x,texel.y)*.5))*.25;
    float brightness=max(color.r,max(color.g,color.b));
    color*=smoothstep(.3,.95,brightness);
  }else if(stage==1){
    color=readColor(uv)*.227027;
    color+=(readColor(uv+direction)+readColor(uv-direction))*.1945946;
    color+=(readColor(uv+direction*2.)+readColor(uv-direction*2.))*.1216216;
    color+=(readColor(uv+direction*3.)+readColor(uv-direction*3.))*.054054;
    color+=(readColor(uv+direction*4.)+readColor(uv-direction*4.))*.016216;
  }else{
    color=readColor(uv)+decode(texture(halo,uv).rgb)*strength*.85;
    outColor=vec4(pow(toneMap(color),vec3(1./2.2)),1.);return;
  }
  outColor=vec4(encode(color),1.);
}`;

export class GlowPass{
  constructor(gl,makeProgram){
    this.gl=gl;this.hdr=!!gl.getExtension('EXT_color_buffer_float');
    this.program=makeProgram(vertex,fragment);this.uniforms=new Map();this.targets=[];
    this.vao=gl.createVertexArray();
  }
  uniform(name){if(!this.uniforms.has(name))this.uniforms.set(name,this.gl.getUniformLocation(this.program,name));return this.uniforms.get(name);}
  target(width,height){
    const gl=this.gl,texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,this.hdr?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,this.hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw new Error('辉光渲染缓冲不可用，请切换界面剖切');}
    return {width,height,texture,framebuffer};
  }
  resize(width,height){
    if(this.targets[0]?.width===width&&this.targets[0]?.height===height)return;
    this.clearTargets();
    // Two reduced buffers give a soft halo without blurring the source image.
    const smallW=Math.max(1,Math.ceil(width/4)),smallH=Math.max(1,Math.ceil(height/4));
    const allocate=()=>{this.targets.push(this.target(width,height));this.targets.push(this.target(smallW,smallH));this.targets.push(this.target(smallW,smallH));};
    try{allocate();}catch(error){
      this.clearTargets();if(!this.hdr)throw error;
      // A device may expose float colour buffers but reject a large target.
      // Compress radiance into RGBA8 and decode before bloom/tone mapping.
      this.gl.getError();this.hdr=false;allocate();
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);
  }
  begin(width,height){this.resize(width,height);this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,this.targets[0].framebuffer);}
  pass(source,target,stage,direction=[0,0],halo=source,strength=0){
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer??null);
    gl.viewport(0,0,target?.width??this.targets[0].width,target?.height??this.targets[0].height);
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,halo.texture);
    gl.uniform1i(this.uniform('source'),0);gl.uniform1i(this.uniform('halo'),1);
    gl.uniform1i(this.uniform('stage'),stage);gl.uniform1i(this.uniform('hdr'),this.hdr?1:0);
    gl.uniform2f(this.uniform('texel'),1/source.width,1/source.height);gl.uniform2fv(this.uniform('direction'),direction);
    gl.uniform1f(this.uniform('strength'),strength);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  finish(strength,radius=1.4){
    const [scene,a,b]=this.targets;
    if(strength>0){this.pass(scene,a,0);this.pass(a,b,1,[radius/a.width,0]);this.pass(b,a,1,[0,radius/a.height]);}
    this.pass(scene,null,2,[0,0],strength>0?a:scene,strength);
    this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);
  }
  clearTargets(){for(const target of this.targets){this.gl.deleteTexture(target.texture);this.gl.deleteFramebuffer(target.framebuffer);}this.targets=[];}
  dispose(){this.clearTargets();this.gl.deleteProgram(this.program);this.gl.deleteVertexArray(this.vao);}
}
