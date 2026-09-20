"use strict";

// A fixed-cosmology functional test, not the old free-ms inference.
const shared = window.AtlasI18n.messages;
Object.assign(shared, {
  msPageTitle: ["Signal Atlas · MUV > −20 joint test", "信号图谱 · MUV > −20 联合测试"],
  msAtlas: ["Atlas", "图谱首页"], msCorner: ["Samples", "样本"], msDiagnostics: ["Diagnostics", "诊断"],
  msKicker: ["JOINT TEST / MUV > −20 · SNAPSHOT / 2026-09-18", "联合测试 / MUV > −20 · 快照 / 2026-09-18"],
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
  msCaution: ["48 correlated rows are not 48 independent effective samples. The source is the completed three-step run; the live continuation is not included.", "48 条相关记录不等于 48 个独立有效样本。来源为已完成的三步短链，不包括正在续跑的结果。"],
  msData: shared.mcmcJointData,
  msCompute: ["Direct 21cmFAST coeval simulations and τ integration. HII_DIM = 256, DIM = 768, BOX_LEN = 250 cMpc. These are not the Atlas lightcone-grid runs.", "直接运行 21cmFAST 共时模拟并积分 τ。HII_DIM = 256，DIM = 768，BOX_LEN = 250 cMpc。与图谱光锥网格不是同一组运行。"],
  msSampling: ["Raw sampling coordinates", "原始采样坐标"],
  msCaption: shared.mcmcJointCaption,
  msFigureLanguage: ["Plot annotations remain in English; captions switch with the interface.", "图内标注保留英文，图注随界面语言切换。"],
  msNative: ["Native stellar-efficiency coordinates", "原始恒星形成效率坐标"],
  msTransform: ["Coordinate transformation only: log₁₀ f★,10 = η★ + log₁₀ t★. No resampling or change of weights.", "仅作坐标变换：log₁₀ f★,10 = η★ + log₁₀ t★，无重新采样或权重改变。"],
  msWhy: ["Execution is not convergence", "运行完成不代表收敛"],
  msDrift: ["This short run starts near the webpage baseline. It tests runtime and interface stability, not posterior exploration. Three steps cannot support R̂, effective-sample-size or credible-interval claims. Lines show individual walkers, not independent chains.", "短链从网页基准值附近初始化，仅测试运行时间与接口稳定性。三步样本不足以给出 R̂、有效样本数或可信区间。每条线为一个 walker，不代表独立链。"],
  msProvenance: ["Provenance & stored samples ↗", "来源与保存样本 ↗"],
  msReport: ["Functional-test report ↗", "功能测试报告 ↗"],
  msFooter: ["JOINT / MUV > −20 / FUNCTIONAL TEST ONLY", "联合 / MUV > −20 / 仅功能测试"],
  msBack: ["Return to Signal Atlas ↗", "返回信号图谱首页 ↗"],
  msEtaAlt: shared.mcmcJointAlt,
  msNativeAlt: ["Eight-parameter raw samples in native stellar coordinates", "原始恒星参数坐标下的八参数样本"],
  msTraceAlt: ["Three-step functional-test traces of sixteen walkers", "16 个 walkers 的三步功能测试轨迹"],
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
