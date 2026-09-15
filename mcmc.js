"use strict";

// Read-only inference archive. Its selection belongs to the unified page state,
// but is deliberately independent of the precomputed lightcone parameter grid.
window.AtlasMCMC = (() => {
  const t = (key, values) => window.AtlasI18n.t(key, values);
  const node = (id) => document.getElementById(id);
  const format = (value) => Number(value).toLocaleString(window.AtlasI18n.language === "zh" ? "zh-CN" : "en-US");
  async function readJSON(path) {
    const response = await fetch(`${path}?v=mcmc-20260915-1`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function render(archive) {
    const status = node("mcmc-load-status");
    status.textContent = t(archive.status === "ready" ? "mcmcLoaded" : archive.status === "error" ? "mcmcFailed" : "mcmcLoading", {date: archive.catalog?.snapshot_date || "—"});
    if (archive.status !== "ready") return;
    const {lf, joint, categories} = archive.catalog;
    const model = lf.models[archive.selectedLF];
    node("mcmc-lf-status").textContent = t(model.diagnostic_gate_passed ? "mcmcLFGatePassed" : "mcmcLFGateNotPassed");
    const imagePath = `${categories.lf_only.directory}/${model.file}?v=${model.figure_sha256.slice(0, 12)}`;
    const image = node("mcmc-lf-image");
    if (image.getAttribute("src") !== imagePath) image.setAttribute("src", imagePath);
    image.setAttribute("alt", t("mcmcLFAlt", {kp: model.KP_h_Mpc, ms: model.MS}));
    node("mcmc-lf-open").setAttribute("href", imagePath);
    node("mcmc-lf-fixed").textContent = `kₚ = ${model.KP_h_Mpc} h Mpc⁻¹ / mₛ = ${model.MS}`;
    node("mcmc-lf-sampling").textContent = `${format(model.steps_per_ensemble)} × ${model.walkers} × ${categories.lf_only.ensembles}`;
    node("mcmc-lf-rows").textContent = format(model.sample_count);
    node("mcmc-lf-caption").textContent = t("mcmcLFCaption", {kp: model.KP_h_Mpc, ms: model.MS, job: `${model.chain_source}_${model.source_model_index}`, date: model.snapshot_date});
    node("mcmc-lf-grid-count").textContent = t("mcmcLFGrid", {count: lf.models.length, kp: lf.grid.kp_h_Mpc.length, ms: lf.grid.ms.length});
    node("mcmc-lf-select").value = String(archive.selectedLF);
    const [steps, walkers] = joint.sources[0].shape;
    node("mcmc-joint-date").textContent = categories.joint.snapshot_date;
    node("mcmc-joint-sampling").textContent = `${steps} × ${walkers} × ${joint.sources.length}`;
    node("mcmc-joint-rows").textContent = format(joint.sources.reduce((sum, source) => sum + source.shape[0] * source.shape[1], 0));
  }

  async function initialize(archive) {
    archive.status = "loading";
    node("mcmc-lf-select").disabled = true;
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
      archive.catalog = {...catalog, lf, joint};
      archive.selectedLF = Math.min(Math.max(0, archive.selectedLF), lf.models.length - 1);
      const controls = node("mcmc-lf-select");
      controls.replaceChildren();
      const groups = new Map();
      lf.models.forEach((model, index) => {
        if (!groups.has(model.KP_h_Mpc)) {
          const group = document.createElement("optgroup");
          group.label = `kₚ = ${model.KP_h_Mpc} h Mpc⁻¹`;
          controls.appendChild(group);
          groups.set(model.KP_h_Mpc, group);
        }
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `kₚ ${model.KP_h_Mpc} / mₛ ${model.MS}`;
        groups.get(model.KP_h_Mpc).appendChild(option);
      });
      // Assign once per initialization; retries must not accumulate listeners.
      controls.onchange = () => {
        const index = Number(controls.value);
        if (Number.isInteger(index) && index >= 0 && index < lf.models.length) {
          archive.selectedLF = index;
          render(archive);
        }
      };
      controls.disabled = false;
      archive.status = "ready";
    } catch (error) {
      archive.status = "error";
      console.warn("MCMC archive loading failed", error);
    }
    render(archive);
  }
  return {initialize, render};
})();
