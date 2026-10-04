(() => {
  const messages = {
    compareTitle: ['Official versus current caching', '官方缓存和当前缓存，差在哪里？'],
    compareIntro: ['Both have cold and warm states: build on first use, reuse on a matching call. The differences are storage, reuse scope, lifetime and mutable-object state management.', '两者都有冷、热状态：第一次建立缓存，后续匹配时复用。区别在于缓存位置、复用范围、生命周期和对象状态管理。'],
    diskTag: ['OFFICIAL / DISK CACHE', '官方 / 磁盘缓存'], diskTitle: ['Read matching HDF5 results', '从 HDF5 读取匹配结果'], diskFlow: ['Proposal → parameter match → file read → downstream calculation', '提案 → 参数匹配 → 读取文件 → 后续计算'],
    diskCopy: ['regenerate=False permits cache reads; write=True saves new outputs. Full caching can retain IC, PF, TS, ionization and brightness fields. The field-only mode writes IC / PF alone.', 'regenerate=False 允许读取匹配缓存，write=True 保存新结果。全量模式可缓存 IC、PF、TS、电离和亮温；字段模式只保存 IC / PF。'],
    diskFoot: ['Files can survive process restarts, with storage and I/O costs. Parameter-dependent outputs cannot be reused directly after changing astrophysics.', '文件可跨进程或重启保留；有读写与存储开销。变更天体物理参数后，参数相关结果不能直接复用。'],
    explicitTag: ['OFFICIAL / EXPLICIT INPUTS', '官方 / 显式内存输入'], explicitTitle: ['Pass existing objects into the next call', '把已有对象传给下一次调用'], explicitFlow: ['Retain IC / PF → init_box / perturb → downstream calculation', '持有 IC / PF → init_box / perturb → 后续计算'],
    explicitCopy: ['Official interfaces already accept existing IC / PerturbField objects. The caller manages dependencies, lifetime and the complete redshift evolution.', '官方接口已经允许调用方保存并传入 IC / PerturbField 对象。需要调用方管理依赖、对象生命周期和完整的红移流程。'],
    explicitFoot: ['This pilot retains the 32 requested PF outputs. In this version, supplying every internal field changes the output-redshift list, so other internal fields still run through the official calculation.', '本次测试保留原请求的 32 个 PF 输出。当前版本传入全部内部红移会改变输出列表，因此其余内部 PF 仍由官方流程计算。'],
    currentTag: ['CURRENT / COMBINED', '当前 / COMBINED'], currentTitle: ['Keep exact intermediate state per worker', '每个持久 worker 内保存精确中间状态'], currentFlow: ['Exact dependency key → verify arrays → restore state → downstream calculation', '精确依赖键 → 验证内存数组 → 恢复状态 → 后续计算'],
    currentCopy: ['Reuse matching IC, PF at each call redshift and parsed raw Lyα tables. Preserve / restore the velocity side effects of PF calls on IC. FIELD_ONLY isolates field reuse for comparison.', '复用匹配的 IC、各调用红移的 PF 及已解析 Lyα 原始表；保存并恢复 PF 对 IC 速度数组的原位修改。FIELD_ONLY 用于单独比较字段缓存。'],
    currentFoot: ['No field-file read on each hit; more worker memory is retained. Caches disappear when a worker exits, and a replacement starts cold.', '无需每次读取字段文件；占用更多 worker 内存。worker 退出后缓存消失，新 worker 从冷缓存开始。'],
    compareNote: ['Reuse is an existing official capability. Our implementation integrates a persistent worker cache for this repaired BT target; it has not yet established a speed advantage over the best official setup.', '缓存复用本身是官方已有能力。当前方案是针对这个 BT 修复版的持久 worker 接入；尚不能据此宣称比官方最佳用法更快。'],
    benchTitle: ['Measured comparison on the same target', '同一配置的实测对照'], benchCold: ['Cold A', '冷启动 A'], benchNew: ['New proposal B', '新参数 B'], benchRepeat: ['Revisit A', '再次访问 A'],
    benchLoading: ['Loading the test snapshot…', '正在读取测试快照…'], benchError: ['Snapshot unavailable. Mechanism explanations remain available.', '测试快照暂不可用，机制说明仍可查看。'],
    thMethod: ['Cache path', '缓存路径'], thTime: ['Seconds', '耗时 / 秒'], thRatio: ['Recompute time / mode time', '重算耗时 / 本模式'], thRSS: ['Peak RSS / GiB', '峰值 RSS / GiB'], thDisk: ['Cumulative disk / GiB', '累计磁盘 / GiB'], thScience: ['Scientific comparison', '科学结果比对'],
    benchFoot: ['One worker, 16 threads, 250 cMpc, 128/512, TS ON, fixed KP=10 / MS=2.5. Official interfaces are tested in our repaired BT fork, not unmodified latest upstream. Output hashing is excluded from time; cache I/O is included and OS page cache is not flushed. A scientifically unequal path is not eligible for production acceleration.', '单 worker、16 线程，250 cMpc、128/512、TS ON、固定 KP=10 / MS=2.5。测试的是当前 BT 修复版中的官方接口，不是未修改的最新上游版本。计时扣除输出哈希检查，包含实际缓存 I/O；操作系统页缓存未清空。未通过科学一致性检查的路径不能用于生产加速。'],
    benchDownload: ['Download snapshot & provenance ↗', '下载测试快照与来源记录 ↗'],
    back: ['Back to the MCMC atlas ↗', '返回 MCMC 图谱 ↗'],
    title: ['At each proposal,<br>which data can be reused?', '每一次提案，<br>哪些数据可以复用？'],
    intro: ['With KP / MS fixed, astrophysical proposals can share the same initial conditions and matching density evolution. Follow the actual evaluation path to see where reuse occurs.', '固定 KP / MS 时，天体物理参数改变，初始密度场与对应的密度演化仍可复用。沿着真实计算链条，查看缓存在哪里生效。'],
    metricLabel: ['Approximate ongoing MCMC speedup', '目前持续续跑的整体加速'],
    metricNote: ['About 16.4 → 11.6 min / MCMC step<br>Against forced recomputation · 2026-10-04 snapshot', '约 16.4 → 11.6 分钟 / MCMC 步<br>相对强制重算 · 2026-10-04 快照'],
    chainLabel: ['ONE VALID PROPOSAL / ONE PERSISTENT WORKER', '一次有效提案 / 一个持久 worker 内'],
    chainTitle: ['Evaluation pipeline', '计算链条'],
    cold: ['① Cold start', '① 冷启动'], hot: ['② Warm cache', '② 热缓存'], changed: ['③ Changed dependency', '③ 依赖改变'],
    legendReuse: ['Reuse stored data', '复用已计算数据'], legendCompute: ['Compute this evaluation', '本次重新计算'], legendInput: ['Inputs / checks', '输入 / 检查'], clickHint: ['Select a node to inspect its data ↓', '点击节点查看数据内容 ↓'],
    nodeProposal: ['Astrophysical proposal', '天体物理参数提案'], nodePrior: ['Transform & prior', '参数变换与先验'], priorShort: ['Outside prior → return −∞', '超出先验 → 直接返回 −∞'],
    nodeLF: ['UV luminosity function', 'UV luminosity function'], lfShort: ['Predict LF for the new parameters', '按新参数重新预测 LF'],
    nodeFixed: ['Fixed field dependencies', '固定的场依赖'], nodeIC: ['Initial conditions · IC', '初始条件 IC'], icShort: ['Initial density & velocity arrays', '初始密度与速度数组'],
    nodePF: ['Density evolution at each z', '各红移的密度演化'], pfShort: ['Density / velocity & IC post-state', '密度 / 速度场与 IC 后状态'],
    nodeTS: ['Heating & spin temperature', '加热与自旋温度'], nodeLYA: ['Raw Lyα tables', 'Lyα 原始表'], lyaShort: ['Keep unchanged parsed inputs', '保留不变的解析结果'],
    nodeIon: ['Ionization & recombination', '电离与重组'], ionShort: ['New 3D xHI fields for this proposal', '新参数下的 xHI 三维场'],
    nodeHistory: ['Volume means & τ integration', '体积平均与 τ 积分'], nodeLike: ['LF + τ + xHI', 'LF + τ + xHI'], likeShort: ['Compare to data; return to sampler', '与观测比较，再交回 sampler'],
    stateNote: ['On a cache hit: restore pristine IC velocities, then replay each PerturbField call’s exact velocity side effects.', '缓存命中时：先恢复 IC 的初始速度状态，再逐红移重放 PerturbField 的速度修改。'],
    scopeTitle: ['Configuration shown here', '本图对应的配置'], scopeNote: ['Each worker owns its cache; arrays are not shared between workers. Continuation keeps the original sampler, priors and scientific target.', '每个 worker 独立保存缓存；不同 worker 不共享场数组。正式续跑仍保持原 sampler、先验和科学 target。'],
    memoryText: ['Field-cache arrays / worker<br>16-worker validation peak RSS: about 214 / 384 GiB', '字段缓存数组 / worker<br>16-worker 补充验收峰值 RSS：约 214 / 384 GiB'],
    memoryNote: ['Cache capacity differs from total process memory. A new worker starts cold.', '数组容量不等于完整进程内存；新 worker 从冷缓存重新建立。'],
    validationTitle: ['Cold / warm outputs match bitwise', '冷 / 热结果逐位一致'],
    validationText: ['All 16 workers demonstrated reuse. The two-step sampler comparison preserved scientific blobs, walker states and RNG states.', '16 个 worker 全部验证复用。两步采样对照的科学 blobs、walker 状态与 RNG 状态一致。'],
    validationNote: ['Warm-cache supplement: 444 → 319 sec / evaluation, about 1.39×. This establishes computational equivalence, not MCMC convergence.', '热缓存补充测试：444 → 319 秒 / evaluation，约 1.39×。该缓存优化验证的是计算等价性，不是 MCMC 收敛。'],
    resultsLink: ['Explore repaired joint results ↗', '查看修复版联合结果 ↗'], footerNote: ['Evaluation schematic · dated measurement snapshots', '计算结构示意 · 数值为标注日期的实测快照'],
  };
  const descriptions = {
    cold: ['A fresh worker computes and stores IC / PerturbField data, and parses Lyα tables on first use. All parameter-dependent stages run normally.', '新 worker 首次计算并保存 IC / PerturbField 数据，首次使用时解析 Lyα 表。所有依赖天体物理参数的步骤正常执行。'],
    hot: ['Only astrophysical parameters change. Matching IC / PerturbField data and parsed Lyα inputs are reused; heating, ionization, LF and likelihood are recomputed.', '仅天体物理参数改变。复用匹配的 IC / PerturbField 数据及已解析的 Lyα 输入；加热、电离、LF 和 likelihood 重新计算。'],
    changed: ['Example: KP or MS changes. Field keys no longer match, so IC / PerturbField must be computed for the new dependency set. Unchanged raw Lyα tables may still be reused.', '示例：KP 或 MS 改变。字段缓存键不再匹配，IC / PerturbField 必须按新依赖重新计算；不变的 Lyα 原始表仍可复用。'],
  };
  // Detail text follows the accepted repaired-native cache implementation, not a generic MCMC model.
  const nodes = {
    proposal: {title:'nodeProposal',number:'01 / PROPOSAL',kind:'input',copy:['The sampler proposes eight coordinates. η★ is converted back through log₁₀(f★,10) = η★ + log₁₀(t★). Proposal order and stretch moves are unchanged.', 'sampler 提出八个坐标。通过 log₁₀(f★,10) = η★ + log₁₀(t★) 转回物理参数。缓存不改变提案顺序或 stretch move。'],foot:['These parameters feed the LF and thermal / ionization branches.', '这些参数输入 LF 分支及加热 / 电离分支。']},
    prior: {title:'nodePrior',number:'02 / PRIOR',kind:'input',copy:['Apply the original parameter transform and prior. Outside-prior proposals return −∞ immediately, without running the full simulation. Valid proposals enter both scientific branches.', '执行原参数变换与先验。超出 prior 的提案直接返回 −∞，无需完整模拟。有效提案进入两个科学计算分支。'],foot:['A quick prior rejection offers little opportunity for cache speedup.', '快速的先验拒绝几乎没有可供缓存节省的计算。']},
    lf: {title:'nodeLF',number:'03A / LF',kind:'compute',copy:['The native LF prediction uses the new astrophysical parameters and fixed cosmology. It is recomputed and compared with the same 34 HST + Donnan data points, MUV > −20. This branch does not use the cached 3D IC / PerturbField arrays.', '原生 LF 预测使用新的天体物理参数及固定宇宙学，重新计算并与相同的 34 个 HST + Donnan 数据点比较，MUV > −20。这个分支不使用缓存的三维 IC / PerturbField 数组。'],foot:['LF likelihood remains proposal-dependent.', 'LF likelihood 仍然依赖本次提案。']},
    fixed: {title:'nodeFixed',number:'DEPENDENCIES',kind:'input',copy:['Field identities include the exact UserParams, CosmoParams, IC seed, relevant global flags and source / native / table fingerprint. PerturbField additionally includes redshift and its upstream IC velocity-state digest.', '字段身份包含精确的 UserParams、CosmoParams、IC seed、相关全局 flags，以及源码 / native / 原始表指纹。PerturbField 还包含红移及上游 IC 速度状态摘要。'],foot:['Changed dependencies miss the cache. KP / MS are never rounded or binned to manufacture hits.', '依赖改变则缓存不命中。不会对 KP / MS 舍入或分箱来制造命中。']},
    ic: {title:'nodeIC',number:'03B / IC CACHE',kind:'field',copy:['Retain the native InitialConditions arrays: density and velocity fields, plus a pristine copy of the velocity arrays that PerturbField modifies in place. On a matching hit, verify immutable arrays and restore pristine velocities before reuse.', '保留原生 InitialConditions 数组，包括密度与速度场；另存一份 PerturbField 会原位修改的速度数组初始副本。命中时先验证不变数组，再恢复初始速度状态，然后复用。'],foot:['The cache lives in this worker’s memory between evaluations.', '缓存在这个 worker 的内存中跨 evaluation 保留。']},
    pf: {title:'nodePF',number:'04 / FIELD CACHE',kind:'field',copy:['Retain the PerturbedField output arrays at each requested redshift and the exact post-call state of IC velocities. A hit returns the matching field and restores the saved post-call velocity state, reproducing the original sequence of side effects.', '保留每个请求红移下的 PerturbedField 输出数组，以及该调用结束后的 IC 速度状态。命中时返回匹配的场，并恢复保存的调用后速度状态，重现原来的副作用顺序。'],foot:['Only dependency-matched field outputs are reused; array and metadata integrity are checked.', '只复用依赖匹配的场输出，并检查数组及元数据完整性。']},
    lya: {title:'nodeLYA',number:'STATIC INPUT / TABLE CACHE',kind:'table',copy:['Keep the parsed raw Lyα tables in the native process. Reuse avoids repeatedly reading / parsing unchanged inputs. Radiation, coupling and redshift-dependent calculations using those tables still run for each new proposal.', '在 native 进程内保留已解析的 Lyα 原始表，避免重复读取和解析不变输入。使用这些表的辐射、耦合和红移相关计算仍对每个新提案执行。'],foot:['In the changed-KP/MS example, raw tables remain unchanged. A changed table / release requires identity verification and requalification.', '本页 KP/MS 改变的示例中，原始表保持不变；表或发布版本改变时须重新核对身份及验收。']},
    ts: {title:'nodeTS',number:'05 / RECALCULATE',kind:'compute',copy:['Use the current proposal and the matching density / velocity fields to recompute heating, gas temperature Tk, spin temperature TS, electron fraction and Lyα coupling across the original internal redshift evolution.', '使用本次提案及匹配的密度 / 速度场，按原内部红移演化重新计算加热、气体温度 Tk、自旋温度 TS、电子分数和 Lyα 耦合。'],foot:['Reusing raw Lyα tables does not reuse the parameter-dependent thermal history.', '复用 Lyα 原始表并不代表复用依赖参数的热历史。']},
    ion: {title:'nodeIon',number:'06 / RECALCULATE',kind:'compute',copy:['Recompute ionization and inhomogeneous recombination with the new source parameters and evolving thermal state. The resulting 3D xHI fields are new outputs for this proposal.', '按照新的源参数和演化中的热状态，重新计算电离与非均匀重组。本次提案得到新的三维 xHI 场。'],foot:['Thermal and ionization stages have evolution feedback; the diagram groups them for readability, without removing that feedback.', '热演化与电离之间有演化反馈；图中为便于阅读分组，并未删除反馈过程。']},
    history: {title:'nodeHistory',number:'07 / RECALCULATE',kind:'compute',copy:['Average each newly computed 3D neutral-fraction field. Use the original 31-node z=5…35 tau postprocessing, plus the separately requested z=5.9 value for the neutral-fraction constraint.', '对新算出的三维中性氢分数场取体积平均。沿用原 z=5…35 的 31 节点 tau 后处理，并使用单独请求的 z=5.9 值计算中性氢分数约束。'],foot:['The tau integration, redshift nodes and original conventions remain unchanged.', 'tau 积分、红移节点及原有约定保持不变。']},
    likelihood: {title:'nodeLike',number:'08 / RECALCULATE',kind:'compute',copy:['Combine the new LF, Planck tau and McGreer xHI(z=5.9) likelihood terms with the original prior. Return the same callback structure and scientific blobs. The sampler applies its original acceptance rule and updates its state.', '将新的 LF、Planck tau 和 McGreer xHI(z=5.9) 似然项与原先验组合，返回相同结构的 callback 和科学 blobs。sampler 按原接受规则更新状态。'],foot:['The cache supplies exact intermediate inputs. It does not store an approximate likelihood or replace the sampler.', '缓存提供精确的中间输入；最终 likelihood 和 sampler 状态按本次计算更新。']},
  };
  let language = 'zh', mode = 'hot', selected = 'pf';
  let benchmarkData = null, benchmarkCase = 1;
  try { const stored=localStorage.getItem('21cm-atlas-language'); if (stored==='en'||stored==='zh') language=stored; } catch (_) {}
  const t = pair => pair[language==='zh'?1:0];
  function status(node) {
    if (node.kind==='field') return mode==='hot'?'reuse':'compute';
    if (node.kind==='table') return mode==='cold'?'compute':'reuse';
    return node.kind;
  }
  function detail() {
    const n=nodes[selected];
    document.getElementById('detail-index').textContent=n.number;
    document.getElementById('detail-title').textContent=t(messages[n.title]);
    document.getElementById('detail-copy').textContent=t(n.copy);
    document.getElementById('detail-foot').textContent=t(n.foot);
    document.querySelectorAll('[data-node]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.node===selected)));
  }
  const methodNames = {
    BASELINE: ['Forced recomputation', '强制重算'], OFFICIAL_DISK_ALL: ['Official · full disk', '官方 · 全量磁盘'], OFFICIAL_DISK_FIELDS: ['Official · fields on disk', '官方 · 字段磁盘'], OFFICIAL_EXPLICIT_FIELDS: ['Official · explicit IC / PF', '官方 · 显式 IC / PF'], CUSTOM_FIELD_ONLY: ['Current · FIELD_ONLY', '当前 · FIELD_ONLY'], CUSTOM_COMBINED: ['Current · COMBINED', '当前 · COMBINED'],
  };
  const scienceNames = {PENDING:['Pending comparison','待统一核验'],BITWISE_EQUAL:['Bitwise equal','逐位一致'],SCIENTIFIC_DIFFERENCE:['Scientific difference','科学结果不同'],FORWARD_FAILED:['Forward failed','计算失败'],NOT_RUN:['Not yet completed','尚未完成']};
  function renderComparison() {
    document.querySelectorAll('[data-case]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.case)===benchmarkCase)));
    const explanations=[
      ['First A: the cache is empty. Generation, cache writes and initialization costs are included.', '首次 A：缓存为空，计入生成、缓存写入及初始化开销。'],
      ['B changes F_ESC10. This is the relevant comparison for a new astrophysical proposal; matching field inputs can be reused, while parameter-dependent outputs must be checked or recomputed.', 'B 改变 F_ESC10。这是新天体物理提案的对照：匹配的场输入可复用，依赖参数的输出需要重新核对或计算。'],
      ['Exactly the same A returns after B. Official full-disk caching may retrieve complete TS / ionization outputs. That speed is not representative of a new continuous MCMC proposal.', 'B 之后再次访问完全相同的 A。官方全量磁盘缓存可能直接读取完整 TS / 电离输出，这个速度不能代表新的连续 MCMC 提案。'],
    ];
    document.getElementById('benchmark-description').textContent=t(explanations[benchmarkCase]);
    if(!benchmarkData)return;
    const data=benchmarkData,body=document.getElementById('benchmark-body');body.replaceChildren();
    const base=data.modes.find(m=>m.id==='BASELINE')?.cases.find(c=>c.index===benchmarkCase);
    for(const method of data.modes){
      const row=document.createElement('tr'),c=method.cases.find(c=>c.index===benchmarkCase);
      const values=[t(methodNames[method.id]),c?.status==='ok'?c.seconds.toFixed(1):'—',c?.status==='ok'&&base?.status==='ok'?(base.seconds/c.seconds).toFixed(2)+'×':'—',c?.rss_gib?.toFixed(2)??'—',c?.disk_gib?.toFixed(2)??'—',t(scienceNames[c?.science_status??'NOT_RUN']??scienceNames.PENDING)];
      if(method.id.startsWith('CUSTOM'))row.classList.add('custom-row');
      if(c?.science_status==='SCIENTIFIC_DIFFERENCE'||c?.science_status==='FORWARD_FAILED')row.classList.add('invalid-row');
      for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
    }
    document.getElementById('benchmark-meta').textContent=language==='zh'?`静态快照：${data.snapshot_hkt} · ${data.completed_cases}/${data.maximum_cases} 次计算已完成 · ${data.final_comparison?'已执行统一科学比对':'最终科学比对尚未完成'} · job ${data.job_id}`:`Static snapshot: ${data.snapshot_hkt} · ${data.completed_cases}/${data.maximum_cases} evaluations completed · ${data.final_comparison?'Scientific comparison available':'Final scientific comparison pending'} · job ${data.job_id}`;
  }
  function render() {
    document.documentElement.lang=language==='zh'?'zh-CN':'en';
    document.title=language==='zh'?'Signal Atlas · MCMC 缓存计算链条':'Signal Atlas · MCMC cache pipeline';
    document.querySelectorAll('[data-text]').forEach(el=>{el.innerHTML=t(messages[el.dataset.text]);});
    document.querySelectorAll('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===language)));
    document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
    document.getElementById('mode-description').textContent=t(descriptions[mode]);
    const labels={input:['INPUT / CHECK','输入 / 检查'],compute:['RECOMPUTE','重新计算'],reuse:['REUSE','缓存复用']};
    document.querySelectorAll('[data-node]').forEach(el=>{
      const n=nodes[el.dataset.node],s=status(n);el.dataset.status=s;
      let label=t(labels[s]);
      if(mode==='cold'&&(n.kind==='field'||n.kind==='table')) label=t(['COMPUTE + STORE','计算并缓存']);
      if(mode==='changed'&&n.kind==='field') label=t(['CACHE MISS → COMPUTE','依赖失配 → 重算']);
      el.querySelector('[data-badge]').textContent=label;
    });
    detail();
    renderComparison();
  }
  document.querySelectorAll('[data-language]').forEach(el=>el.addEventListener('click',()=>{
    language=el.dataset.language;
    try{localStorage.setItem('21cm-atlas-language',language);}catch(_){}
    render();
  }));
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>{mode=el.dataset.mode;render();}));
  document.querySelectorAll('[data-node]').forEach(el=>el.addEventListener('click',()=>{selected=el.dataset.node;detail();}));
  document.querySelectorAll('[data-case]').forEach(el=>el.addEventListener('click',()=>{benchmarkCase=Number(el.dataset.case);renderComparison();}));
  render();
  fetch('web_data/cache_comparison/index.json?v=20261004-2',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Snapshot load failed');return response.json();}).then(data=>{benchmarkData=data;renderComparison();}).catch(()=>{document.getElementById('benchmark-meta').textContent=t(messages.benchError);});
})();
