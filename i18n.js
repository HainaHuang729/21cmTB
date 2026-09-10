"use strict";

// Authored interface copy only. Simulation values, units and source names are
// deliberately shared between languages and never translated or transformed.
window.AtlasI18n = (() => {
  const messages = {
    pageTitle: ["21cmFAST Precomputed Parameter Atlas", "21cmFAST 预计算参数图谱"],
    home: ["21 cm Signal Atlas home", "21 cm 信号图谱首页"],
    identity: ["SIGNAL ATLAS", "信号图谱"],
    precomputed: ["PRECOMPUTED / 21cmFAST", "预计算 / 21cmFAST"],
    navigation: ["Atlas sections", "图谱章节"],
    controls: ["Controls", "参数"],
    evolution: ["Evolution", "演化"],
    analysis: ["Analysis", "分析"],
    fields: ["Fields", "空间场"],
    language: ["Interface language", "界面语言"],
    revision: ["REV", "版本"],
    resultsLoading: ["Loading results", "正在加载结果"],
    resultsReady: ["Results ready", "结果已就绪"],
    resultsUnavailable: ["Results unavailable", "结果不可用"],
    loadingBadge: ["LOADING", "加载中"],
    exactBadge: ["EXACT · {id}", "精确结果 · {id}"],
    unavailableBadge: ["UNAVAILABLE", "不可用"],
    errorBadge: ["ERROR", "加载错误"],
    noDataBadge: ["NO DATA", "无数据"],
    heroKicker: ["SYSTEM / 21CM–A · VIEW / PRIMARY", "系统 / 21CM–A · 视图 / 主视图"],
    heroCosmic: ["COSMIC", "宇宙"],
    heroSignal: ["SIGNAL", "信号"],
    heroAtlas: ["ATLAS.", "图谱。"],
    heroIntro: ["An exact, precomputed view of the 21 cm signal from cosmic dawn through reionization—built for parameter inspection, model comparison, and spatial-field analysis.", "以精确的预计算结果呈现从宇宙黎明到再电离时期的 21 cm 信号，用于参数探索、模型对比与空间场分析。"],
    enter: ["Enter the atlas", "进入图谱"],
    instrument: ["Simulation volume and redshift coverage", "模拟体积与红移范围"],
    missionProfile: ["MISSION PROFILE / 001", "模拟概况 / 001"],
    precomputedState: ["STATE / PRECOMPUTED", "状态 / 已预计算"],
    orbitTitle: ["Simulation redshift trajectory", "模拟红移轨迹"],
    orbitDescription: ["A technical diagram representing the stored lightcone from redshift 35 to redshift 6.", "表示已存储光锥从红移 35 到红移 6 的示意图。"],
    start: ["START / z 35", "起点 / z 35"],
    end: ["END / z 6", "终点 / z 6"],
    volume: ["VOLUME", "模拟尺度"],
    lightcone: ["LIGHTCONE", "光锥"],
    frames: ["FIELD FRAMES", "空间场帧数"],
    models: ["EXACT MODELS", "精确模型数"],
    origin: ["ORIGIN / COSMIC DAWN", "起点 / 宇宙黎明"],
    destination: ["DESTINATION / REIONIZATION", "终点 / 再电离"],
    parameters: ["Model Parameters", "模型参数"],
    parameterSubtitle: ["10 PARAMETERS · EXACT PRECOMPUTED RUNS", "10 个参数 · 精确预计算结果"],
    reset: ["Reset to baseline", "恢复基准模型"],
    parameterControls: ["Model parameter controls", "模型参数控制"],
    initialTitle: ["Loading precomputed result", "正在加载预计算结果"],
    noSimulation: ["This page never starts a new 21cmFAST calculation.", "本页面不会启动新的 21cmFAST 计算。"],
    loadingMetadata: ["Loading design metadata…", "正在加载参数设计信息…"],
    summary: ["Current model summary", "当前模型摘要"],
    trough: ["Absorption-trough z", "吸收谷红移 z"],
    minimum: ["Minimum", "最小值"],
    runtime: ["Runtime", "计算用时"],
    lightconeTitle: ["Brightness-temperature lightcone", "亮温光锥"],
    lightconeSubtitle: ["FULL REDSHIFT EVOLUTION · HIGH z → LOW z", "完整红移演化 · 高 z → 低 z"],
    analysisDescription: ["UV luminosity function and auxiliary statistics", "紫外光度函数与辅助统计量"],
    lfTitle: ["UV Luminosity Function", "紫外光度函数"],
    lfSubtitle: ["MODEL–OBSERVATION COMPARISON · BPL / MATCHED PL", "模型与观测对比 · BPL / 同参数 PL"],
    fullscreen: ["Fullscreen", "全屏"],
    exitFullscreen: ["Exit fullscreen", "退出全屏"],
    fullscreenTitle: ["View UV LF in fullscreen", "全屏查看紫外光度函数"],
    lfRedshift: ["UV luminosity-function redshift", "紫外光度函数红移"],
    lfSource: ["HST: Bouwens+21, Oesch+18 · JWST: Bouwens+23, Donnan+24 · ▽ denotes upper limits", "HST：Bouwens+21、Oesch+18 · JWST：Bouwens+23、Donnan+24 · ▽ 表示上限"],
    globalTitle: ["Global Mean Brightness Temperature", "全局平均亮温"],
    matchedPL: ["MATCHED PL", "同参数 PL"],
    historyTitle: ["Reionization History", "再电离历史"],
    thomson: ["THOMSON", "汤姆孙光学深度"],
    sliceTitle: ["Five Spatial-field Slices", "五种空间场切片"],
    sliceSubtitle: ["BPL ROW · MATCHED PL ROW", "上排 BPL · 下排同参数 PL"],
    play: ["Play", "播放"],
    pause: ["Pause", "暂停"],
    redshift: ["REDSHIFT", "红移"],
    sliceRedshift: ["Slice redshift", "切片红移"],
    timeDirection: ["earlier → later", "早期 → 晚期"],
    bplDescription: ["Current broken-power-law model", "当前折断幂律模型"],
    plLabel: ["Matched PL", "同参数 PL"],
    plDescription: ["Standard power law with identical astrophysical parameters · 32 redshifts · 256 × 256 slices", "相同天体物理参数下的标准幂律模型 · 32 个红移 · 256 × 256 切片"],
    brightnessDescription: ["21 cm brightness temperature", "21 cm 亮温"],
    densityDescription: ["Density contrast δ", "密度扰动 δ"],
    ionizationDescription: ["Ionized hydrogen fraction", "氢电离分数"],
    spinDescription: ["Spin temperature · log", "自旋温度 · 对数色标"],
    kineticDescription: ["Gas kinetic temperature · log", "气体动理温度 · 对数色标"],
    archive: ["ARCHIVE / STATIC DATASET", "归档 / 静态数据集"],
    readOnly: ["TRANSFER / READ ONLY", "访问 / 只读"],
    footerArchive: ["ARCHIVE / 21CM–A", "归档 / 21CM–A"],
    firstLight: ["FROM FIRST LIGHT", "从宇宙初光"],
    reionization: ["TO REIONIZATION.", "到再电离。"],
    loadingManifest: ["Loading simulation manifest…", "正在加载模拟清单…"],
    manifestCount: ["{count} EXACT 21cmFAST LIGHTCONES", "{count} 组精确 21cmFAST 光锥"],
    box: ["BOX / 250 cMpc", "盒长 / 250 cMpc"],
    returnTop: ["Return to index ↑", "返回顶部 ↑"],
    footerNote: ["Exact 21cmFAST outputs · no browser-side simulation · LF references: Bouwens et al. 2021/2023, Oesch et al. 2018, Donnan et al. 2024", "精确 21cmFAST 输出 · 不在浏览器中运行模拟 · 光度函数参考：Bouwens et al. 2021/2023、Oesch et al. 2018、Donnan et al. 2024"],
    unavailableTitle: ["High-resolution parameter point unavailable", "该高分辨率参数点不可用"],
    unavailableMessage: ["{id} · 21cmFAST encountered a spin-temperature numerical failure; no interpolation or low-resolution substitute is used", "{id} · 21cmFAST 自旋温度计算出现数值错误；不使用插值或低分辨率结果替代"],
    excluded: ["Excluded numerical outlier", "已排除的数值异常点"],
    switching: ["Switching exact simulation", "正在切换精确模拟结果"],
    loadingFiles: ["{id} · Loading precomputed files", "{id} · 正在加载预计算文件"],
    loaded: ["Precomputed result loaded", "预计算结果已加载"],
    oatMode: ["{parameter} one-at-a-time scan", "{parameter} 单参数扫描"],
    gridMode: ["KP × MS joint grid", "KP × MS 联合网格"],
    baselineMode: ["Baseline model", "基准模型"],
    loadedMessage: ["{mode} · No new calculation was launched", "{mode} · 未启动新的计算"],
    failedTitle: ["Result loading failed", "结果加载失败"],
    libraryFailed: ["Result library not available", "结果库不可用"],
    fetchError: ["Failed to read {path}: HTTP {status}", "无法读取 {path}：HTTP {status}"],
    decompressError: ["This browser cannot decompress the high-resolution data. Please use a current browser.", "此浏览器不支持高分辨率数据解压，请使用较新版本的浏览器。"],
    lengthError: ["High-resolution slice data failed its length check.", "高分辨率切片数据未通过长度校验。"],
    redshiftError: ["The BPL and matched-PL slice redshift grids do not agree.", "BPL 与同参数 PL 切片的红移网格不一致。"],
    unexpectedError: ["Unable to load the data. Check your connection and retry. Details: {message}", "无法加载数据，请检查网络后重试。详细信息：{message}"],
    redshiftAxis: ["Redshift, z  (cosmic time →)", "红移 z（宇宙时间 →）"],
    distanceAxis: ["Transverse distance [cMpc]", "横向距离 [cMpc]"],
    ionizationAxis: ["Ionized fraction, ξ", "电离分数 ξ"],
    magnitudeAxis: ["Absolute UV magnitude, M_UV", "紫外绝对星等 M_UV"],
    historyUnavailable: ["Ionization history unavailable", "电离历史暂无数据"],
    plHistoryUnavailable: ["PL history unavailable", "PL 电离历史暂无数据"],
    pending: ["Not available", "暂无数据"],
    plSlicesUnavailable: ["PL slices unavailable", "PL 切片暂无数据"],
    storedOnly: ["Only stored results are displayed", "仅显示已存储结果"],
    lfOption: ["Show the UV luminosity function at redshift {redshift}", "显示红移 {redshift} 的紫外光度函数"],
    emptyLF: ["No LF bins pass the numerical threshold at this redshift", "该红移下没有通过数值阈值的光度函数数据点"],
    F_STAR10: ["Star-formation efficiency at 10^10 solar masses.", "质量为 10^10 个太阳质量的暗晕的恒星形成效率。"],
    ALPHA_STAR: ["Halo-mass slope of the star-formation efficiency.", "恒星形成效率随暗晕质量变化的幂律斜率。"],
    F_ESC10: ["Ionizing escape fraction at 10^10 solar masses.", "质量为 10^10 个太阳质量的暗晕的电离光子逃逸分数。"],
    ALPHA_ESC: ["Halo-mass slope of the ionizing escape fraction.", "电离光子逃逸分数随暗晕质量变化的幂律斜率。"],
    M_TURN: ["Turnover halo mass below which star formation is suppressed.", "恒星形成开始受到抑制的暗晕质量阈值。"],
    t_STAR: ["Star-formation timescale in units of the Hubble time.", "恒星形成时间尺度，以哈勃时间为单位。"],
    L_X: ["Soft-band X-ray luminosity per star-formation rate.", "单位恒星形成率对应的软 X 射线光度。"],
    NU_X_THRESH: ["Low-energy X-ray cutoff.", "X 射线低能截断值。"],
    KP_h_Mpc: ["Transition wavenumber, converted to Mpc^-1 with h=0.678.", "转折波数，使用 h=0.678 转换为 Mpc^-1。"],
    MS: ["Small-scale primordial spectral index above kp.", "波数高于 kp 时的小尺度原初功率谱指数。"],
  };
  const storageKey = "21cm-atlas-language";
  let language = "en";
  try { if (localStorage.getItem(storageKey) === "zh") language = "zh"; } catch (_) { /* Storage may be disabled. */ }

  function t(key, values = {}) {
    const entry = messages[key];
    const template = entry ? entry[language === "zh" ? 1 : 0] : key;
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
  }

  function apply() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    for (const attribute of ["aria-label", "title"]) {
      document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((node) => {
        node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
      });
    }
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.language === language));
    });
  }

  function setLanguage(value) {
    language = value === "zh" ? "zh" : "en";
    try { localStorage.setItem(storageKey, language); } catch (_) { /* Switching still works without storage. */ }
    apply();
  }

  return {t, apply, setLanguage, get language() { return language; }, messages};
})();
