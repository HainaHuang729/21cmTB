"use strict";

// Read-only inference archive. LF cosmology follows the shared dock parameters;
// stellar sliders never condition/reweight a chain. Joint inference stays separate.
window.AtlasMCMC = (() => {
  const t = (key, values) => window.AtlasI18n.t(key, values);
  const node = (id) => document.getElementById(id);
  const format = (value) => Number(value).toLocaleString(window.AtlasI18n.language === "zh" ? "zh-CN" : "en-US");
  async function readJSON(path) {
    const response = await fetch(`${path}?v=corner-shared-v2`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function render(archive) {
    const status = node("mcmc-load-status");
    status.textContent = t(archive.status === "ready" ? "mcmcLoaded" : archive.status === "error" ? "mcmcFailed" : "mcmcLoading", {date: archive.catalog?.snapshot_date || "—"});
    if (archive.status !== "ready") {
      archive.selectedLF = -1;
      node("mcmc-lf-status").textContent = t(archive.status === "error" ? "mcmcFailed" : "mcmcLoading");
      clearLF(t(archive.status === "error" ? "mcmcFailed" : "mcmcLoading"));
      return;
    }
    const {lf, joint, categories} = archive.catalog;
    const kp = archive.parameters?.KP_h_Mpc, ms = archive.parameters?.MS;
    const hasParameters = Number.isFinite(kp) && Number.isFinite(ms);
    archive.selectedLF = lf.models.findIndex(model => model.KP_h_Mpc === kp && model.MS === ms);
    const model = lf.models[archive.selectedLF];
    node("mcmc-lf-fixed").textContent = hasParameters ? `kₚ = ${kp} h Mpc⁻¹ / mₛ = ${ms}` : "—";
    node("mcmc-lf-grid-count").textContent = t("mcmcLFGrid", {count: lf.models.length, kp: lf.grid.kp_h_Mpc.length, ms: lf.grid.ms.length});
    if (!model) {
      clearLF(t(hasParameters ? "mcmcLFUnavailableDetail" : "mcmcAwaitParameters", {kp, ms}));
      node("mcmc-lf-status").textContent = t(hasParameters ? "mcmcLFUnavailable" : "mcmcAwaitParameters");
    } else {
      node("mcmc-lf-empty").hidden = true;
      node("mcmc-lf-open").hidden = false;
      node("mcmc-lf-coordinates").hidden = false;
      node("mcmc-lf-status").textContent = t(model.diagnostic_gate_passed ? "mcmcLFGatePassed" : "mcmcLFGateNotPassed");
      const imagePath = `${categories.lf_only.directory}/${model.file}?v=${model.figure_sha256.slice(0, 12)}`;
      const image = node("mcmc-lf-image");
      if (image.getAttribute("src") !== imagePath) image.setAttribute("src", imagePath);
      image.setAttribute("alt", t("mcmcLFAlt", {kp, ms}));
      node("mcmc-lf-open").setAttribute("href", imagePath);
      node("mcmc-lf-sampling").textContent = `${format(model.steps_per_ensemble)} × ${model.walkers} × ${categories.lf_only.ensembles}`;
      node("mcmc-lf-rows").textContent = format(model.sample_count);
      node("mcmc-lf-caption").textContent = t("mcmcLFCaption", {kp, ms, job: `${model.chain_source}_${model.source_model_index}`, date: model.snapshot_date});
    }
    const [steps, walkers] = joint.sources[0].shape;
    const jointPath = `${categories.joint.directory}/corner_eta.png?v=${joint.figure_sha256["corner_eta.png"].slice(0, 12)}`;
    const jointImage = node("mcmc-joint-image");
    if (jointImage.getAttribute("src") !== jointPath) jointImage.setAttribute("src", jointPath);
    node("mcmc-joint-open").setAttribute("href", jointPath);
    node("mcmc-joint-date").textContent = categories.joint.snapshot_date;
    node("mcmc-joint-sampling").textContent = `${steps} × ${walkers} × ${joint.sources.length}`;
    node("mcmc-joint-rows").textContent = format(joint.sources.reduce((sum, source) => sum + source.shape[0] * source.shape[1], 0));
  }

  function clearLF(message) {
    node("mcmc-lf-open").hidden = true;
    node("mcmc-lf-open").removeAttribute("href");
    node("mcmc-lf-image").removeAttribute("src");
    node("mcmc-lf-image").setAttribute("alt", "");
    node("mcmc-lf-coordinates").hidden = true;
    node("mcmc-lf-empty").hidden = false;
    node("mcmc-lf-empty").textContent = message;
    node("mcmc-lf-caption").textContent = "";
    node("mcmc-lf-sampling").textContent = "—";
    node("mcmc-lf-rows").textContent = "—";
  }

  async function initialize(archive, parameters = {}) {
    // Keep a reference to the one existing parameter object, never a stale copy.
    archive.parameters = parameters;
    archive.status = "loading";
    render(archive);
    try {
      const catalog = await readJSON("web_data/mcmc/index.json");
      const {categories} = catalog;
      const [lf, joint] = await Promise.all([
        readJSON(`${categories.lf_only.directory}/index.json`),
        readJSON(`${categories.joint.directory}/index.json`),
      ]);
      if (lf.analysis !== "LF-only" || !lf.models.length || joint.status !== "PRELIMINARY_NOT_CONVERGED") throw new Error("Unexpected archive identity");
      for (const model of lf.models) {
        if (!/^lf_corner_[\w.]+\.png$/.test(model.file) || model.parameters.length !== 4 ||
          !/^[0-9a-f]{64}$/.test(model.figure_sha256) || catalog.files_sha256[`${categories.lf_only.directory}/${model.file}`] !== model.figure_sha256 ||
          !model.chain_source || typeof model.diagnostic_gate_passed !== "boolean" ||
          model.sample_count !== model.steps_per_ensemble * model.walkers * categories.lf_only.ensembles) throw new Error("Invalid LF snapshot");
      }
      const pairs = new Set(lf.models.map(model => `${model.KP_h_Mpc}/${model.MS}`));
      if (pairs.size !== lf.models.length || lf.grid.kp_h_Mpc.length * lf.grid.ms.length !== pairs.size ||
          lf.grid.kp_h_Mpc.some(kp => lf.grid.ms.some(ms => !pairs.has(`${kp}/${ms}`)))) throw new Error("Incomplete LF model grid");
      if (joint.sources.length !== 2 || joint.sources.some((source) => source.shape[2] !== 7)) throw new Error("Invalid joint snapshot");
      for (const file of ["corner_eta.png", "corner_native.png"]) {
        const digest = joint.figure_sha256?.[file];
        if (!/^[0-9a-f]{64}$/.test(digest || "") || catalog.files_sha256[`${categories.joint.directory}/${file}`] !== digest) throw new Error("Invalid joint figure provenance");
      }
      archive.catalog = {...catalog, lf, joint};
      archive.status = "ready";
    } catch (error) {
      archive.status = "error";
      console.warn("MCMC archive loading failed", error);
    }
    render(archive);
  }
  return {initialize, render};
})();
