"use strict";

// Extend the existing Atlas translator; share its persisted language preference.
Object.assign(window.AtlasI18n.messages, {
  msPageTitle: ["Signal Atlas · Joint non-21-cm inference", "信号图谱 · 非21厘米联合约束"],
  msAtlas: ["Atlas", "图谱首页"],
  msCorner: ["Corner", "参数分布"],
  msDiagnostics: ["Diagnostics", "收敛诊断"],
  msKicker: ["INFERENCE / JOINT NON-21 · SNAPSHOT / 2026-09-14", "推断 / 非21厘米联合约束 · 快照 / 2026-09-14"],
  msTitle: ["Fixed kₚ. Free mₛ.", "固定 kₚ，自由 mₛ。"],
  msSubtitle: ["Two independent ensembles of one cosmological model — not a ΛCDM–BTPS comparison.", "同一宇宙学模型的两组独立采样，并非 ΛCDM 与 BTPS 对比。"],
  msWarning: ["PRELIMINARY — NOT CONVERGED", "初步诊断 — 尚未收敛"],
  msWarningBody: ["Both ensembles still drift. These figures show current sampling distributions, not final credible intervals or publishable constraints.", "两组采样仍存在漂移。这些图只展示当前采样分布，不是最终可信区间或可发表的参数约束。"],
  msIdentity: ["Separate inference branches", "明确区分两条推断分支"],
  msThis: ["THIS PAGE / JOINT · FREE mₛ", "本页 / 联合约束 · 自由 mₛ"],
  msJoint: ["Fixed kₚ = 1 h Mpc⁻¹; sampled mₛ. Seven parameters: four star-formation parameters, two escape-fraction parameters and mₛ. Likelihood: LF + τₑ + xHI.", "固定 kₚ = 1 h Mpc⁻¹，采样 mₛ。共7个参数：4个恒星形成参数、2个逃逸率参数和 mₛ。似然为 LF + τₑ + xHI。"],
  msOther: ["OTHER BRANCH / LF-ONLY · FIXED COSMOLOGY", "另一分支 / 仅LF · 固定宇宙学"],
  msLFOnly: ["Fixed kₚ and mₛ for each model. Four star-formation parameters, constrained by LF only. No τₑ or xHI likelihood.", "每个模型均固定 kₚ 和 mₛ，只采样4个恒星形成参数，仅使用LF约束，不加入 τₑ 或 xHI 似然。"],
  msSeparation: ["Chains, progress, convergence and figures are recorded separately. This is neither a replacement for the LF-only figures nor a reweighted LF-only chain. Because the parameter spaces also differ, their differences cannot be attributed solely to adding reionization constraints.", "两者的链、进度、收敛状态和图分别记录。本页不替换 LF-only 图，也不是将 LF-only 链重加权得到的结果。由于参数空间也不同，不能把两者差异全部归因于加入再电离约束。"],
  msSetup: ["Snapshot & configuration", "采样快照与计算设置"],
  msSample: ["kₚ = 1 h Mpc⁻¹ = 0.678 Mpc⁻¹; mₛ ∈ [0.5, 2.0]. Each ensemble has 64 walkers and 160 saved steps after 40 initial burn-in steps. No additional samples are discarded here.", "kₚ = 1 h Mpc⁻¹ = 0.678 Mpc⁻¹；mₛ ∈ [0.5, 2.0]。每组64个 walkers，初始 burn-in 40步后保存160步。本页没有额外丢弃样本。"],
  msCaution: ["20,480 correlated stored rows are not 20,480 independent effective samples. The mₛ prior also includes non-blue slopes.", "20,480条相关采样记录不等于20,480个独立有效样本。mₛ 的先验还包含非蓝倾斜部分。"],
  msData: ["Data: 49 LF points — HST z = 6, 7, 8 and Donnan (2024) z = 9, 10, restricted to z < 11 — plus Planck τₑ and McGreer xHI(5.9). No 21-cm likelihood is used.", "约束数据：49个LF点（HST z = 6, 7, 8；Donnan 2024 z = 9, 10，仅 z < 11），加上 Planck τₑ 和 McGreer xHI(5.9)。不使用任何21厘米似然。"],
  msCompute: ["Direct 21cmFAST coeval simulations plus τ integration; no emulator or lightcone. HII_DIM = 128, DIM = 512, BOX_LEN = 250 cMpc. These are not the Atlas lightcone-grid runs.", "直接运行 21cmFAST 共时模拟并积分计算 τ；不使用模拟器或光锥。HII_DIM = 128，DIM = 512，BOX_LEN = 250 cMpc。与图谱首页的光锥网格不是同一组运行。"],
  msSampling: ["Sampling coordinates", "采样参数坐标"],
  msCaption: ["Red solid: ensemble 0; blue dashed: ensemble 1 (not BPL/PL). Labels: empirical median and 16–84% range. Contours: 68% / 95% mass of 60-bin histograms smoothed with Gaussian σ = 1 bin, for display only. Not validated credible regions.","红色实线：ensemble 0；蓝色虚线：ensemble 1（不是BPL/PL）。标注为经验中位数及16–84%样本范围。轮廓为60格直方图经高斯σ=1格平滑后的68% / 95%质量范围，仅用于显示，不是已验证的可信区域。"],
  msFigureLanguage: ["Scientific symbols and the original English plot annotations are shared between languages; captions and interpretation switch with the interface.", "两种语言共用科学符号和原始英文图内标注；图注及解读随界面语言切换。"],
  msNative: ["Native stellar-efficiency coordinates", "原始恒星形成效率坐标"],
  msTransform: ["Coordinate transformation only: log₁₀ f★,10 = η★ + log₁₀ t★. No resampling or change of weights.", "仅作坐标变换：log₁₀ f★,10 = η★ + log₁₀ t★，没有重新采样或改变权重。"],
  msWhy: ["Why the posterior is not frozen", "为什么还不能冻结后验"],
  msDrift: ["mₛ, αesc and the log posterior still drift between the first and second halves. The chains are too short for reliable final autocorrelation estimates. Walkers within an ensemble are not treated as independent chains for R̂. Trace bands show the 16th–84th percentiles across walkers at each step, not error bars.", "mₛ、αesc 和对数后验值仍存在前后半段漂移，链长尚不足以可靠估计最终自相关时间。不将同一 ensemble 的 walkers 当作独立链计算 R̂。追踪图中的带状区域为每步 walkers 的16–84百分位，不是误差条。"],
  msProvenance: ["Provenance & settings ↗", "采样来源与设置 ↗"],
  msReport: ["Full diagnostics ↗", "完整诊断报告 ↗"],
  msFooter: ["ARCHIVE / JOINT NON-21 · READ ONLY · NOT LF-ONLY", "归档 / 非21厘米联合约束 · 只读 · 非LF-only"],
  msBack: ["Return to Signal Atlas ↗", "返回信号图谱首页 ↗"],
  msEtaAlt: ["Preliminary seven-parameter corner for two independent ensembles", "两组独立采样的初步七参数分布图"],
  msNativeAlt: ["Preliminary corner in native stellar-efficiency coordinates", "原始恒星形成效率坐标下的初步参数分布图"],
  msTraceAlt: ["Independent-ensemble traces showing remaining drift", "显示残余漂移的独立采样追踪图"],
});

function renderMSLanguage(value) {
  const i18n = window.AtlasI18n;
  i18n.setLanguage(value);
  document.title = i18n.t("msPageTitle");
  document.querySelectorAll("[data-ms-alt]").forEach(node => {
    node.setAttribute("alt", i18n.t(node.dataset.msAlt));
  });
}
document.querySelectorAll("[data-language]").forEach(button => {
  button.addEventListener("click", () => renderMSLanguage(button.dataset.language));
});
// Shareable language-specific links; otherwise respect the Atlas preference.
const requestedMSLanguage = new URLSearchParams(window.location.search).get("lang");
renderMSLanguage(["en", "zh"].includes(requestedMSLanguage) ? requestedMSLanguage : window.AtlasI18n.language);
