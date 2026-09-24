/* Mass-dependent stellar-to-baryon fraction; ps.c ComputeLF component 1.
 * An analytic model relation, not an additional simulation or posterior fit. */
(() => {
  'use strict';
  const model = {alpha: .5, logMass: 10};
  let current;
  const $ = id => document.getElementById(id);
  const fmt = value => value === 0 ? '0' : value.toExponential(5);
  const copy = {
    'stellar-heading': ['Stellar mass versus halo mass', '恒星质量与暗物质晕质量的关系'],
    'stellar-definition': [
      'M★(Mh) = f★(Mh) (Ωb/Ωm) Mh. The vertical axis is total stellar mass in M☉, not the dimensionless fraction f★ or its normalization f★,10. Here f★(Mh) = min[1, f★,10 (Mh / 10¹⁰ M☉)^α★].',
      'M★(Mh) = f★(Mh) (Ωb/Ωm) Mh。纵轴为恒星总质量，单位 M☉，不是无量纲的 f★ 或归一化参数 f★,10。其中 f★(Mh) = min[1, f★,10 (Mh / 10¹⁰ M☉)^α★]。'],
    'alpha-label': ['Mass slope α★', '质量斜率 α★'],
    'mass-label': ['Example log₁₀(Mhalo / M☉)', '计算示例 log₁₀(Mhalo / M☉)'],
    'stellar-download': ['Download M★(Mh) CSV', '下载 M★(Mh) CSV'],
    'calculation-heading': ['Calculation at the selected halo mass', '所选暗物质晕质量处的具体计算'],
    'stellar-scope': [
      'Analytic atomic-cooling-halo prescription from this project’s 21cmFAST ComputeLF (component 1). The mass range is a formula exploration, not a claim that halos at every mass exist in each snapshot. The duty factor exp(−Mturn/Mhalo) weights active halo abundance in the LF separately; it is not folded into this f★. With fixed f★,10 and α★, this relation has no explicit z, kp, ms or t★ dependence. Redshift and t★ enter SFR and UV conversion, not this fraction. These curves are not posterior uncertainty bands.',
      '使用本项目 21cmFAST ComputeLF（component 1）的原子冷却晕解析关系。所画质量范围用于探索公式，不表示每个快照都实际包含这些质量的晕。占空因子 exp(−Mturn/Mhalo) 在 LF 中另行加权活跃晕丰度，不乘入此 f★。固定 f★,10 和 α★ 后，该关系不显含 z、kp、ms 或 t★；红移与 t★ 影响 SFR 和 UV 转换，但不影响此比例。这些曲线不是后验不确定性区间。']
  };
  function render(state) {
    current = state;
    const zh = state.language === 'zh';
    const tr = (en, cn) => zh ? cn : en;
    for (const [id, labels] of Object.entries(copy)) $(id).textContent = labels[zh ? 1 : 0];
    $('alpha-value').textContent = model.alpha.toFixed(2);
    $('mass-value').textContent = model.logMass.toFixed(2);
    const fraction = m => window.AtlasLFMass.stellarFraction(state.fstar, model.alpha, m);
    const fb=state.cosmology.OMb/state.cosmology.OMm;
    const stellarMass = m => fraction(m)*fb*m;
    const W=960,H=450,L=105,R=35,T=42,B=72,PW=W-L-R,PH=H-T-B;
    const px = logm => L + (logm-7)/6*PW;
    const py = mass => T + (13-Math.log10(mass))/13*PH;
    let svg = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Stellar mass versus halo mass"><title>M★ = f★(Mh) (Ωb/Ωm) Mh; both axes logarithmic, masses in M☉</title>';
    for (let p=0;p<=12;p+=2) {
      svg += '<path d="M'+L+' '+py(10**p)+'H'+(W-R)+'" stroke="#181a19" stroke-opacity=".12"/><text x="'+(L-14)+'" y="'+(py(10**p)+6)+'" text-anchor="end" font-size="17">10'+['⁰','²','⁴','⁶','⁸','¹⁰','¹²'][p/2]+'</text>';
    }
    for (let p=7;p<=13;p++) {
      svg += '<path d="M'+px(p)+' '+(H-B)+'v6" stroke="#181a19"/><text x="'+px(p)+'" y="'+(H-B+30)+'" text-anchor="middle" font-size="17">10'+['⁷','⁸','⁹','¹⁰','¹¹','¹²','¹³'][p-7]+'</text>';
    }
    const points=Array.from({length:301},(_,i)=>{const logm=7+6*i/300;return (i?'L':'M')+px(logm).toFixed(2)+' '+py(stellarMass(10**logm)).toFixed(2);}).join(' ');
    svg += '<path d="M'+L+' '+T+'V'+(H-B)+'H'+(W-R)+'" fill="none" stroke="#181a19"/>';
    svg += '<path d="M'+px(10)+' '+T+'V'+(H-B)+'" stroke="#686b67" stroke-dasharray="4 5"/><text x="'+(px(10)+8)+'" y="'+(H-B-12)+'" font-size="15">'+tr('Pivot mass','定义质量')+'</text>';
    svg += '<path class="baryon-limit" d="M'+px(7)+' '+py(fb*1e7)+'L'+px(13)+' '+py(fb*1e13)+'" fill="none" stroke="#686b67" stroke-dasharray="6 5"/>';
    svg += '<path class="stellar-curve" d="'+points+'" fill="none" stroke="#357b84" stroke-width="3"/>';
    svg += '<text x="'+L+'" y="25" font-size="16">'+tr('Dashed: baryon budget M★ = (Ωb/Ωm) Mh','虚线：重子预算上限 M★ = (Ωb/Ωm) Mh')+'</text>';
    const m = 10**model.logMass, f=fraction(m);
    svg += '<circle cx="'+px(model.logMass)+'" cy="'+py(stellarMass(m))+'" r="6" fill="#df5a2e" stroke="#f0efe8" stroke-width="2"/>';
    svg += '<text x="'+(L+PW/2)+'" y="'+(H-15)+'" text-anchor="middle" font-size="20">Mhalo [M☉] · '+tr('log scale','对数坐标')+'</text>';
    svg += '<text transform="translate(25 '+(T+PH/2)+') rotate(-90)" text-anchor="middle" font-size="19">M★ [M☉] · '+tr('log scale','对数坐标')+'</text>';
    svg += '<rect class="stellar-probe" x="'+L+'" y="'+T+'" width="'+PW+'" height="'+PH+'" fill="transparent"/></svg>';
    $('stellar-plot').innerHTML=svg;
    function readout(mass) {
      const value=fraction(mass);
      $('stellar-hover').textContent='Mh = '+fmt(mass)+' M☉ · M★ = '+fmt(stellarMass(mass))+' M☉ · f★ = '+fmt(value)+' ('+(100*value).toPrecision(5)+'%)';
    }
    readout(m);
    $('stellar-plot').querySelector('.stellar-probe').addEventListener('pointermove',event=>{
      const bounds=$('stellar-plot').querySelector('svg').getBoundingClientRect();
      const q=Math.max(0,Math.min(1,((event.clientX-bounds.left)*W/bounds.width-L)/PW));
      readout(10**(7+6*q));
    });
    const f10=10**state.fstar, ratio=m/1e10, factor=ratio**model.alpha, raw=f10*factor;
    const baryons=fb*m;
    const steps=[
      [tr('Convert the normalization from log space','将归一化参数从对数转换为线性值'),
       'f★,10 = 10^('+state.fstar.toFixed(2)+') = '+fmt(f10)],
      [tr('Apply the halo-mass dependence','计算质量依赖项'),
       '(Mhalo / 10¹⁰ M☉)^α★ = ('+fmt(m)+' / 10¹⁰)^('+model.alpha.toFixed(2)+') = '+fmt(factor)],
      [tr('Compute the uncapped fraction','计算未限制的比例'),
       'f★,raw = f★,10 × (Mhalo / 10¹⁰ M☉)^α★ = '+fmt(f10)+' × '+fmt(factor)+' = '+fmt(raw)],
      [tr('Apply the physical cap','应用物理上限'),
       'f★(Mhalo) = min(1, '+fmt(raw)+') = '+fmt(f)+' = '+(100*f).toPrecision(6)+'%'],
      [tr('Compute the implied stellar mass (not SFR)','计算对应的恒星质量（不是恒星形成率）'),
       'fb = Ωb/Ωm = '+state.cosmology.OMb+' / '+state.cosmology.OMm+' = '+fmt(fb)+'\n'+
       'Mb = fb Mhalo = '+fmt(baryons)+' M☉\n'+
       'M★ = f★ Mb = '+fmt(f)+' × '+fmt(baryons)+' = '+fmt(f*baryons)+' M☉\n'+
       'M★/Mhalo = fb f★ = '+fmt(fb*f)]
    ];
    $('stellar-calculation').replaceChildren(...steps.map(([title,formula])=>{
      const li=document.createElement('li'), label=document.createElement('strong'), code=document.createElement('code');
      label.textContent=title;code.textContent=formula;li.append(label,code);return li;
    }));
  }
  for (const [id,key] of [['alpha-star','alpha'],['example-mass','logMass']]) {
    $(id).addEventListener('input',()=>{model[key]=Number($(id).value);if(current)render(current);});
  }
  $('reset').addEventListener('click',()=>{
    model.alpha=.5;model.logMass=10;$('alpha-star').value=.5;$('example-mass').value=10;
    if(current)render(current);
  });
  $('stellar-download').addEventListener('click',()=>{
    if(!current)return;
    const rows=['halo_mass_msun,fstar10,alpha_star,fstar_uncapped,fstar_capped,baryon_fraction,stellar_mass_msun'];
    const f10=10**current.fstar,fb=current.cosmology.OMb/current.cosmology.OMm;
    for(let i=0;i<=300;i++){
      const mass=10**(7+6*i/300),raw=f10*(mass/1e10)**model.alpha;
      const f=window.AtlasLFMass.stellarFraction(current.fstar,model.alpha,mass);
      rows.push([mass,f10,model.alpha,raw,f,fb,f*fb*mass].join(','));
    }
    const url=URL.createObjectURL(new Blob([rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='stellar-mass-vs-halo-mass.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.AtlasStellarFraction={render};
})();
