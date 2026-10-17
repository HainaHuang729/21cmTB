// Fullscreen the document, so the existing playback and parameter controls stay
// in the same DOM and retain their state. Embedded browsers can use the same
// layout within their window when native fullscreen is unavailable.
export function setupViewerFullscreen(button,label){
  const root=document.documentElement;
  const nativeElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  const enter=(document.fullscreenEnabled!==false&&root.requestFullscreen)||(document.webkitFullscreenEnabled!==false&&root.webkitRequestFullscreen);
  const leave=document.exitFullscreen||document.webkitExitFullscreen;
  let active=false,busy=false,scrollPosition=[0,0];

  function setActive(next){
    const wasActive=active;
    if(next&&!wasActive)scrollPosition=[window.scrollX,window.scrollY];
    active=next;
    root.classList.toggle('is-viewer-fullscreen',active);
    document.body.classList.toggle('is-viewer-fullscreen',active);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'退出全屏':'全屏查看三维画面');
    label.textContent=active?'退出全屏':'全屏';
    if(wasActive&&!active)requestAnimationFrame(()=>{
      window.scrollTo(...scrollPosition);
      button.focus({preventScroll:true});
    });
  }

  async function toggle(){
    if(busy)return;
    busy=true;button.disabled=true;
    try{
      if(active){
        if(nativeElement()&&leave){
          try{await leave.call(document);}catch{/* Allow another exit attempt. */}
        }
        if(!nativeElement())setActive(false);
      }else{
        setActive(true);
        if(enter){
          try{await enter.call(root);}catch{/* Keep the window-filling layout. */}
        }
      }
    }finally{busy=false;button.disabled=false;}
  }

  button.addEventListener('click',toggle);
  for(const event of ['fullscreenchange','webkitfullscreenchange']){
    document.addEventListener(event,()=>setActive(!!nativeElement()));
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&active){
      event.preventDefault();toggle();
    }
  });
}
