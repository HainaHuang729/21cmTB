"use strict";

// A fixed-cosmology functional test, not the old free-ms inference.
const shared = window.AtlasI18n.messages;
Object.assign(shared, {
  msPageTitle: ["Signal Atlas · MUV > −20 joint test", "信号图谱 · MUV > −20 联合测试"],
  msAtlas: ["Atlas", "图谱首页"], msCorner: ["Samples", "样本"], msDiagnostics: ["Diagnostics", "诊断"],
  msKicker: ["JOINT / MUV > −20 · SNAPSHOT / 2026-09-28", "联合 / MUV > −20 · 快照 / 2026-09-28"],
  msTitle: ["Fixed cosmology. Joint test.", "固定宇宙学，联合测试。"],
  msSubtitle: shared.mcmcJointDescription,
  msWarning: shared.mcmcJointStatus,
  msWarningBody: shared.mcmcJointCaution,
  msIdentity: ["Separate inference branches", "区分两条推断分支"],
  msThis: ["THIS PAGE / EIGHT-PARAMETER JOINT TEST", "本页 / 八参数联合测试"],
  msJoint: shared.mcmcJointDescription,
  msOther: ["OTHER BRANCH / FOUR-PARAMETER LF ONLY", "另一分支 / 四参数 LF-only"],
  msLFOnly: shared.mcmcLFDescription,
  msSeparation: shared.mcmcSeparation,
  msSetup: ["Snapshot & configuration", "快照与计算设置"],
  msSample: shared.mcmcJointCaution,
  msCaution: ["12,800 correlated rows are not independent effective samples. Two completed 200-step chains; no convergence certification.", "12,800 条相关记录不是独立有效样本。两条已完成的 200 步链，尚未通过收敛认证。"],
  msData: shared.mcmcJointData,
  msCompute: ["Direct 21cmFAST coeval simulations and τ integration. HII_DIM = 128, DIM = 512, BOX_LEN = 250 cMpc. No 256-grid samples included.", "直接运行 21cmFAST 共时模拟并积分 τ。HII_DIM = 128，DIM = 512，BOX_LEN = 250 cMpc。不混入 256 网格样本。"],
  msSampling: ["Raw sampling coordinates", "原始采样坐标"],
  msCaption: shared.mcmcJointCaption,
  msFigureLanguage: ["Plot annotations remain in English; captions switch with the interface.", "图内标注保留英文，图注随界面语言切换。"],
  msNative: ["Native stellar-efficiency coordinates", "原始恒星形成效率坐标"],
  msTransform: ["Coordinate transformation only: log₁₀ f★,10 = η★ + log₁₀ t★. No resampling or change of weights.", "仅作坐标变换：log₁₀ f★,10 = η★ + log₁₀ t★，无重新采样或权重改变。"],
  msWhy: ["Execution is not convergence", "运行完成不代表收敛"],
  msDrift: ["Two exploratory ensembles, including their inherited prefixes once. Completion is not convergence; no credible-interval claim. Numerical-domain proposals occurred. Each line is a walker, not an independent chain.", "两条探索性链，各自仅包含一次继承前缀。完成不代表收敛，不作可信区间声明；运行中曾出现数值域异常提案。每条线是一个 walker，不是独立链。"],
  msProvenance: ["Provenance & stored samples ↗", "来源与保存样本 ↗"],
  msReport: ["Functional-test report ↗", "功能测试报告 ↗"],
  msFooter: ["JOINT / MUV > −20 / EXPLORATORY · NOT CONVERGED", "联合 / MUV > −20 / 阶段性结果 · 未收敛"],
  msBack: ["Return to Signal Atlas ↗", "返回信号图谱首页 ↗"],
  msEtaAlt: shared.mcmcJointAlt,
  msNativeAlt: ["Eight-parameter raw samples in native stellar coordinates", "原始恒星参数坐标下的八参数样本"],
  msTraceAlt: ["Two exploratory ensembles, 200 steps and 32 walkers each", "两条探索性链，每条 200 步、32 walkers"],
});

function renderMSLanguage(value) {
  const i18n = window.AtlasI18n;
  i18n.setLanguage(value);
  document.title = i18n.t("msPageTitle");
  document.querySelectorAll("[data-ms-alt]").forEach(node => node.setAttribute("alt", i18n.t(node.dataset.msAlt)));
}
document.querySelectorAll("[data-language]").forEach(button => {
  button.addEventListener("click", () => renderMSLanguage(button.dataset.language));
});
const requestedMSLanguage = new URLSearchParams(window.location.search).get("lang");
renderMSLanguage(["en", "zh"].includes(requestedMSLanguage) ? requestedMSLanguage : window.AtlasI18n.language);
