for(const button of document.querySelectorAll('.console-toggle')){
  const footer=button.closest('footer');
  button.addEventListener('click',()=>{
    const collapsed=footer.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',collapsed?'展开调参区':'收起调参区');
    button.replaceChildren(document.createTextNode(collapsed?'展开 ':'收起 '));
    const mark=document.createElement('span');mark.setAttribute('aria-hidden','true');mark.textContent=collapsed?'+':'−';button.append(mark);
  });
}
