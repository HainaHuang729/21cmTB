"use strict";

const state = {
  language: window.AtlasI18n.language,
  status: {kind: "initial"},
  design: null,
  controls: new Map(),
  parameters: {},
  result: null,
  plReference: null,
  activeAstro: null,
  requestSerial: 0,
  sliceIndex: null,
  sliceTimer: null,
  lfIndex: null,
  plCache: null,
  parametersCollapsed: false,
};

const $ = (selector) => document.querySelector(selector);
const astroNames = new Set(["F_STAR10", "ALPHA_STAR", "F_ESC10", "ALPHA_ESC", "M_TURN", "t_STAR", "L_X", "NU_X_THRESH"]);
const DATA_VERSION = "hii256-v18";
const UI_VERSION = "hii256-v20";
const t = (key, values) => window.AtlasI18n.t(key, values);
const PLOT_FONT = '"Avenir Next", "Century Gothic", Futura, "Helvetica Neue", Arial, "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif';
const PLOT_MONO = '"IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Consolas, "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", monospace';
const plotPalette = {
  ink: "#181a19",
  text: "#686b67",
  axis: "#181a19",
  grid: "rgba(24,26,25,0.16)",
  gridLight: "rgba(24,26,25,0.08)",
  border: "#181a19",
  current: "#B84B3E",
  pl: "#4D8F9C",
  hst: "#181a19",
  jwst: "#D6A62E",
  plot: "#f0efe8",
  paper: "#f0efe8",
};

class AtlasError extends Error {
  constructor(key, values = {}) {
    super(t(key, values));
    this.key = key;
    this.values = values;
  }
}

function errorMessage(error) {
  return error instanceof AtlasError ? t(error.key, error.values) : t("unexpectedError", {message: error.message});
}

function modelMode(result) {
  if (result.role.kind === "pl") return t("plMode");
  if (result.role.kind === "astro_oat") return t("oatMode", {parameter: result.role.parameter});
  return t(result.role.kind === "kp_ms_grid" ? "gridMode" : "baselineMode");
}

function setSelectionDetail(label, runId) {
  const title = document.createElement("strong"), id = document.createElement("span");
  title.textContent = label;
  id.textContent = runId;
  $("#selection-detail").replaceChildren(title, id);
}

function renderStatus() {
  const {kind, runId, error} = state.status;
  const titleKeys = {initial: "initialTitle", loading: "switching", ready: "loaded", unavailable: "unavailableTitle", error: "failedTitle", libraryError: "libraryFailed"};
  const badgeKeys = {initial: "loadingBadge", loading: "loadingBadge", ready: "exactBadge", unavailable: "unavailableBadge", error: "errorBadge", libraryError: "noDataBadge"};
  $("#status-title").textContent = t(titleKeys[kind]);
  $("#status-card").classList.toggle("active", kind === "initial" || kind === "loading");
  $("#run-badge").textContent = t(badgeKeys[kind], {id: runId ? runId.replace(/^(run|pl)_/, "").slice(0, 8) : ""});
  $("#run-badge").className = `run-badge ${kind === "ready" ? "completed" : kind === "initial" || kind === "loading" ? "running" : "failed"}`;
  let message = t("noSimulation");
  if (kind === "loading") message = t("loadingFiles", {id: runId});
  if (kind === "unavailable") message = t("unavailableMessage", {id: runId});
  if (kind === "ready") message = t("loadedMessage", {mode: modelMode(state.result)});
  if (error) message = errorMessage(error);
  $("#status-message").textContent = message;
  if (kind === "unavailable") setSelectionDetail(t("excluded"), runId);
  else if (state.result) setSelectionDetail(modelMode(state.result), state.result.run_id);
  else $("#selection-detail").textContent = t(kind === "libraryError" ? "libraryFailed" : "loadingMetadata");
}

function renderLocalizedUI() {
  $("#data-state span").textContent = t(state.design ? "resultsReady" : state.status.kind === "libraryError" ? "resultsUnavailable" : "resultsLoading");
  $("#footer-count").textContent = state.design ? t("manifestCount", {count: state.design.n_exact_runs}) : t("loadingManifest");
  for (const control of state.controls.values()) {
    const description = t(control.specification.name);
    control.wrapper.title = description;
    control.slider.setAttribute("aria-label", `${control.specification.label} · ${description}`);
  }
  document.querySelectorAll("#lf-redshift-options button").forEach((button) => {
    const redshift = state.result.luminosity_function.redshift[Number(button.dataset.index)].toFixed(0);
    button.setAttribute("aria-label", t("lfOption", {redshift}));
  });
  $("#slice-play").textContent = t(state.sliceTimer ? "pause" : "play");
  $("#slice-play").setAttribute("aria-pressed", String(Boolean(state.sliceTimer)));
  if (!state.result) {
    document.querySelectorAll(".pl-slice-row output").forEach((output) => {
      output.textContent = state.status.kind === "initial" || state.status.kind === "loading" ? t("loadingBadge") : "—";
    });
  }
  updateFullscreenLabel();
  renderModelLabels();
  if (state.result?.parameters) updateMSMetric();
  renderParameterDock();
  renderStatus();
}

function renderModelLabels() {
  const isPL = state.result?.role.kind === "pl";
  document.querySelectorAll("[data-current-model]").forEach((node) => { node.textContent = isPL ? "PL" : "BPL"; });
  for (const [selector, key] of [
    ['[data-i18n="bplDescription"]', isPL ? "plCurrentDescription" : "bplDescription"],
    ['[data-i18n="sliceSubtitle"]', isPL ? "plSliceSubtitle" : "sliceSubtitle"],
    ['[data-i18n="lfSubtitle"]', isPL ? "plLFSubtitle" : "lfSubtitle"],
    ['[data-i18n="lightconeTitle"]', isPL ? "plEvolutionTitle" : "lightconeTitle"],
    ['[data-i18n="lightconeSubtitle"]', isPL ? "plEvolutionSubtitle" : "lightconeSubtitle"],
  ]) $(selector).textContent = t(key);
  const ms = state.controls.get("MS");
  if (ms) {
    const inactive = state.parameters.KP_h_Mpc === 0;
    ms.wrapper.classList.toggle("parameter-inactive", inactive);
    ms.slider.setAttribute("aria-describedby", "parameter-mode-note");
    ms.slider.setAttribute("aria-valuetext", `${displayNumber(state.parameters.MS, "MS")}${inactive ? ` · ${t("msIgnored")}` : ""}`);
  }
  $("#parameter-mode-note").textContent = t(state.parameters.KP_h_Mpc === 0 ? "plModeNote" : "parameterModeNote");
}

function renderParameterDock() {
  $("#parameter-content").hidden = state.parametersCollapsed;
  $("#parameter-toggle").textContent = t(state.parametersCollapsed ? "expandParameters" : "collapseParameters");
  $("#parameter-toggle").setAttribute("aria-expanded", String(!state.parametersCollapsed));
}

function initializeParameterDock() {
  const updateHeight = () => document.documentElement.style.setProperty("--parameter-dock-height", `${$("#parameters-section").getBoundingClientRect().height}px`);
  if ("ResizeObserver" in window) new ResizeObserver(updateHeight).observe($("#parameters-section"));
  updateHeight();
  $("#parameter-toggle").addEventListener("click", () => {
    state.parametersCollapsed = !state.parametersCollapsed;
    renderParameterDock();
    updateHeight();
  });
  document.querySelectorAll('a[href="#parameters-section"]').forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    state.parametersCollapsed = false;
    renderParameterDock();
    updateHeight();
    if (link.classList.contains("system-action")) $("#lightcone-section").scrollIntoView();
    state.controls.get("KP_h_Mpc")?.slider.focus({preventScroll: true});
  }));
}

function updateFullscreenLabel() {
  const fullscreen = Boolean(document.fullscreenElement);
  $("#main-fullscreen").textContent = t(fullscreen ? "exitFullscreen" : "fullscreen");
  $("#main-fullscreen").title = t(fullscreen ? "exitFullscreen" : "fullscreenTitle");
}

function setLanguage(language) {
  window.AtlasI18n.setLanguage(language);
  state.language = window.AtlasI18n.language;
  renderLocalizedUI();
  // Redraw existing data only: no fetch, control reset or timer restart.
  drawAll();
}

function versioned(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${DATA_VERSION}`;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new AtlasError("fetchError", {path, status: response.status});
  return response.json();
}

async function fetchBuffer(path) {
  const response = await fetch(path);
  if (!response.ok) throw new AtlasError("fetchError", {path, status: response.status});
  return response.arrayBuffer();
}

function displayNumber(value, name) {
  if (name === "NU_X_THRESH") return Math.round(value).toString();
  if (name === "KP_h_Mpc") return Number(value).toFixed(value < 10 ? 1 : 0);
  if (["F_STAR10", "F_ESC10", "M_TURN", "L_X"].includes(name)) return Number(value).toFixed(2);
  return Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function currentIndex(name) { return Number(state.controls.get(name).slider.value); }
function updateSliderVisual(control) {
  const {slider, specification, valueNode} = control;
  const index = Number(slider.value);
  slider.style.setProperty("--fill", `${100 * index / (specification.values.length - 1)}%`);
  valueNode.textContent = displayNumber(specification.values[index], specification.name);
  state.parameters[specification.name] = specification.values[index];
  slider.setAttribute("aria-valuetext", valueNode.textContent);
}

function resetOne(control) {
  control.slider.value = control.specification.default_index;
  updateSliderVisual(control);
}

function resolveRunId(changedName = null) {
  if (changedName && astroNames.has(changedName)) {
    state.activeAstro = changedName;
    for (const [name, control] of state.controls) if (name !== changedName) resetOne(control);
    return state.design.mappings.astro_oat[changedName][currentIndex(changedName)];
  }
  if (changedName === "KP_h_Mpc" || changedName === "MS") {
    state.activeAstro = null;
    for (const [name, control] of state.controls) if (astroNames.has(name)) resetOne(control);
    return selectedGridRunId();
  }
  if (state.activeAstro) return state.design.mappings.astro_oat[state.activeAstro][currentIndex(state.activeAstro)];
  return selectedGridRunId();
}

function selectedGridRunId() {
  // Zero is a UI selector for the stored standard PL, not an extra BPL run.
  if (state.parameters.KP_h_Mpc === 0) return state.design.baseline_run_id;
  const kpSpec = state.design.parameter_specs.find((spec) => spec.name === "KP_h_Mpc");
  return state.design.mappings.kp_ms_grid[kpSpec.values.indexOf(state.parameters.KP_h_Mpc)][currentIndex("MS")];
}

function createParameter(specification) {
  if (specification.name === "KP_h_Mpc") specification = {
    ...specification, values: [0, ...specification.values], default_index: specification.default_index + 1,
  };
  const wrapper = document.createElement("div");
  wrapper.className = "parameter";
  wrapper.dataset.name = specification.name;
  wrapper.dataset.group = specification.group;
  wrapper.title = t(specification.name);
  const values = specification.values;
  wrapper.innerHTML = `
    <div class="parameter-head"><span class="parameter-label">${specification.label}</span><span class="parameter-value"></span></div>
    <input type="range" min="0" max="${values.length - 1}" step="1" value="${specification.default_index}" aria-label="${specification.label}">
    <div class="range-extents"><span>${displayNumber(values[0], specification.name)}</span><span>${displayNumber(values[values.length - 1], specification.name)}</span></div>`;
  const control = {wrapper, slider: wrapper.querySelector("input"), valueNode: wrapper.querySelector(".parameter-value"), specification};
  control.slider.setAttribute("aria-label", `${specification.label} · ${t(specification.name)}`);
  control.slider.addEventListener("input", () => {
    updateSliderVisual(control);
    const runId = resolveRunId(specification.name);
    renderModelLabels();
    loadRun(runId);
  });
  state.controls.set(specification.name, control);
  updateSliderVisual(control);
  $("#parameter-list").appendChild(wrapper);
}

function decodeI16Bytes(bytes, scale) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getInt16(index * 2, true) * scale;
  return values;
}

function decodeI16(encoded, scale) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return decodeI16Bytes(bytes, scale);
}

function decodePlane(lightcone) {
  const values = decodeI16(lightcone.brightness_i16_le_base64, lightcone.quantization_mk);
  return {values, rows: lightcone.shape[0], columns: lightcone.shape[1]};
}

async function inflateSliceField(buffer, descriptor) {
  if (!("DecompressionStream" in window)) throw new AtlasError("decompressError");
  const compressed = new Uint8Array(
    buffer,
    descriptor.offset,
    descriptor.compressed_bytes,
  );
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (raw.byteLength !== descriptor.uncompressed_bytes) throw new AtlasError("lengthError");
  return raw;
}

async function decodeSlices(slices, basePath) {
  const [count, rows, columns] = slices.shape;
  const buffer = await fetchBuffer(versioned(`${basePath}/${slices.binary_file}`));
  const fields = slices.binary_fields;
  const [brightness, density, ionized, spinTemperatureLog10, kineticTemperatureLog10] = await Promise.all([
    inflateSliceField(buffer, fields.brightness_i16_le).then((bytes) => decodeI16Bytes(bytes, slices.brightness_quantization_mk)),
    inflateSliceField(buffer, fields.density_i16_le).then((bytes) => decodeI16Bytes(bytes, slices.density_quantization)),
    inflateSliceField(buffer, fields.ionized_fraction_i16_le).then((bytes) => decodeI16Bytes(bytes, slices.ionized_fraction_quantization)),
    inflateSliceField(buffer, fields.spin_temperature_log10_i16_le).then((bytes) => decodeI16Bytes(bytes, slices.temperature_log10_quantization)),
    inflateSliceField(buffer, fields.kinetic_temperature_log10_i16_le).then((bytes) => decodeI16Bytes(bytes, slices.temperature_log10_quantization)),
  ]);
  return {
    count,
    rows,
    columns,
    brightness,
    density,
    ionized,
    spinTemperatureLog10,
    kineticTemperatureLog10,
  };
}

function showUnavailableRun(runId) {
  state.requestSerial += 1;
  setSlicePlaying(false);
  state.result = null;
  state.plReference = null;
  state.status = {kind: "unavailable", runId};
  renderModelLabels();
  renderStatus();
  [
    "#metric-z", "#metric-temp", "#metric-kp", "#metric-ms", "#metric-time",
    "#tau-current", "#tau-pl", "#tau-difference",
  ].forEach((selector) => {
    $(selector).textContent = "—";
  });
  [
    "#slice-brightness-range", "#slice-density-range", "#slice-ionization-range",
    "#slice-spin-temperature-range", "#slice-kinetic-temperature-range",
    "#pl-slice-brightness-range", "#pl-slice-density-range", "#pl-slice-ionization-range",
    "#pl-slice-spin-temperature-range", "#pl-slice-kinetic-temperature-range",
    "#slice-redshift-value", "#thumbnail-redshift", "#lf-redshift-value",
  ].forEach((selector) => {
    $(selector).textContent = "—";
  });
  $("#lf-redshift-options").innerHTML = "";
  document.querySelectorAll("canvas").forEach((canvas) => {
    const context = canvas.getContext("2d");
    context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height); context.restore();
  });
}

async function loadRun(runId) {
  const usePL = state.parameters.KP_h_Mpc === 0;
  if (usePL && state.result?.role.kind === "pl" && state.status.kind === "ready") {
    state.result.parameters.MS = state.parameters.MS;
    updateMSMetric();
    return;
  }
  if ((state.design.unavailable_run_ids || []).includes(runId)) {
    showUnavailableRun(runId);
    return;
  }
  const serial = ++state.requestSerial;
  state.status = {kind: "loading", runId};
  renderStatus();
  try {
    if (usePL) {
      const reference = state.design.pl_inventory.find((entry) => entry.source_run_ids.includes(runId));
      if (!reference) throw new AtlasError("plReferenceMissing");
      const plReference = await loadPLReference({file: `web_data/pl/${reference.pl_id}.json`});
      if (serial !== state.requestSerial) return;
      state.plReference = plReference;
      state.result = {
        ...plReference,
        run_id: plReference.pl_id,
        role: {kind: "pl"},
        parameters: {...state.parameters},
      };
      showResult();
      return;
    }
    const result = await fetchJSON(versioned(`web_data/runs/${runId}.json`));
    if (serial !== state.requestSerial) return;
    result.decodedPlane = decodePlane(result.lightcone);
    const plReference = await loadPLReference(result.pl_reference);
    if (plReference.slices && (
      result.slices.redshift.length !== plReference.slices.redshift.length
      || result.slices.redshift.some(
        (redshift, index) => Math.abs(redshift - plReference.slices.redshift[index]) > 1.0e-4,
      )
    )) throw new AtlasError("redshiftError");
    result.decodedSlices = await decodeSlices(result.slices, "web_data/runs");
    if (serial !== state.requestSerial) return;
    state.plReference = plReference;
    state.result = result;
    showResult();
  } catch (error) {
    if (serial !== state.requestSerial) return;
    state.status = {kind: "error", runId, error};
    renderStatus();
  }
}

async function loadPLReference(reference) {
  // Keep only the latest reference; MS changes at KP=0 reuse the same data,
  // including an in-flight request, without retaining the whole result library.
  if (state.plCache?.file === reference.file) return state.plCache.promise;
  const cache = {file: reference.file};
  cache.promise = (async () => {
    const result = await fetchJSON(versioned(reference.file));
    if (result.slices) {
      result.decodedSlices = await decodeSlices(result.slices, "web_data/pl");
      const {count, rows, columns, brightness} = result.decodedSlices;
      const values = new Float32Array(rows * count);
      for (let frame = 0; frame < count; frame += 1) {
        for (let row = 0; row < rows; row += 1) {
          values[row * count + frame] = brightness[frame * rows * columns + row * columns + Math.floor(columns / 2)];
        }
      }
      // PL exports contain 32 transverse slices, not the full lightcone plane.
      // Show their central columns as an explicitly labelled sampled view.
      result.decodedPlane = {values, rows, columns: count};
      result.lightcone = {
        redshift: result.slices.redshift,
        distance_mpc: Array.from({length: rows}, (_, row) => row * result.slices.box_len_mpc / rows),
      };
    }
    return result;
  })().catch((error) => {
    if (state.plCache === cache) state.plCache = null;
    throw error;
  });
  state.plCache = cache;
  return cache.promise;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function showResult() {
  const result = state.result;
  state.status = {kind: "ready", runId: result.run_id};
  renderStatus();
  renderModelLabels();
  $("#metric-z").textContent = result.summary.trough_redshift.toFixed(2);
  $("#metric-temp").textContent = `${result.summary.trough_brightness_mk.toFixed(1)} mK`;
  $("#metric-kp").textContent = `${result.parameters.KP_h_Mpc.toFixed(1)} h/Mpc`;
  updateMSMetric();
  $("#metric-time").textContent = formatDuration(result.summary.elapsed_seconds);
  configureSliceControl();
  configureLFControl();
  drawAll();
}

function updateMSMetric() {
  const result = state.result;
  $("#metric-ms").textContent = `${result.parameters.MS.toFixed(2)}${result.role.kind === "pl" ? ` · ${t("msIgnored")}` : ""}`;
}

function canvasContext(canvas) {
  const box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * ratio)); canvas.height = Math.max(1, Math.round(box.height * ratio));
  const context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {context, width: box.width, height: box.height};
}

function niceBounds(values, includeZero = false) {
  let minimum = Math.min(...values), maximum = Math.max(...values);
  if (includeZero) { minimum = Math.min(minimum, 0); maximum = Math.max(maximum, 0); }
  const span = Math.max(maximum - minimum, 1);
  return [minimum - span * 0.12, maximum + span * 0.12];
}

function niceTicks(minimum, maximum, targetCount = 5) {
  const rawStep = Math.max(maximum - minimum, Number.EPSILON) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= normalized) || 10;
  const step = multiplier * magnitude;
  const first = Math.ceil(minimum / step) * step;
  const values = [];
  for (let value = first; value <= maximum + step * 0.05; value += step) values.push(Number(value.toPrecision(12)));
  return values;
}

function preparePlot(ctx, width, height, margin) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = plotPalette.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = plotPalette.plot;
  ctx.fillRect(margin.left, margin.top, plotWidth, plotHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return {plotWidth, plotHeight};
}

function drawXTick(ctx, x, plotBottom, label, gridTop, showGrid = true) {
  if (showGrid) {
    ctx.strokeStyle = plotPalette.gridLight; ctx.lineWidth = 0.65;
    ctx.beginPath(); ctx.moveTo(x, gridTop); ctx.lineTo(x, plotBottom); ctx.stroke();
  }
  ctx.strokeStyle = plotPalette.axis; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x, plotBottom); ctx.lineTo(x, plotBottom - 6);
  ctx.moveTo(x, gridTop); ctx.lineTo(x, gridTop + 6); ctx.stroke();
  ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_MONO}`;
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(label, x, plotBottom + 9);
}

function drawYTick(ctx, y, plotLeft, plotRight, label, emphasized = false) {
  ctx.strokeStyle = emphasized ? "rgba(0,0,0,0.30)" : plotPalette.grid;
  ctx.lineWidth = emphasized ? 0.85 : 0.65;
  ctx.setLineDash(emphasized ? [5, 4] : []);
  ctx.beginPath(); ctx.moveTo(plotLeft, y); ctx.lineTo(plotRight, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = plotPalette.axis; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(plotLeft, y); ctx.lineTo(plotLeft + 6, y);
  ctx.moveTo(plotRight, y); ctx.lineTo(plotRight - 6, y); ctx.stroke();
  ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_MONO}`;
  ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(label, plotLeft - 10, y);
}

function drawXMinorTick(ctx, x, plotTop, plotBottom) {
  ctx.strokeStyle = plotPalette.axis; ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, plotTop); ctx.lineTo(x, plotTop + 3.5);
  ctx.moveTo(x, plotBottom); ctx.lineTo(x, plotBottom - 3.5); ctx.stroke();
}

function drawYMinorTick(ctx, y, plotLeft, plotRight) {
  ctx.strokeStyle = plotPalette.axis; ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(plotLeft, y); ctx.lineTo(plotLeft + 3.5, y);
  ctx.moveTo(plotRight, y); ctx.lineTo(plotRight - 3.5, y); ctx.stroke();
}

function finishPlot(ctx, width, height, margin, xLabel, yLabel) {
  const plotRight = width - margin.right, plotBottom = height - margin.bottom;
  ctx.strokeStyle = plotPalette.border; ctx.lineWidth = 1.1;
  ctx.strokeRect(margin.left + 0.5, margin.top + 0.5, plotRight - margin.left - 1, plotBottom - margin.top - 1);
  ctx.fillStyle = plotPalette.ink; ctx.font = `700 15px ${PLOT_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText(xLabel, (margin.left + plotRight) / 2, height - 5);
  ctx.save();
  ctx.translate(15, (margin.top + plotBottom) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0); ctx.restore();
}

function drawCurve(ctx, z, values, px, py, color, width, dash = []) {
  ctx.beginPath();
  z.forEach((value, index) => ctx[index ? "lineTo" : "moveTo"](px(value), py(values[index])));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  ctx.stroke(); ctx.setLineDash([]);
}

function drawGlobal() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#global-chart"));
  const margin = {left: 70, right: 20, top: 18, bottom: 54};
  const z = state.result.global.redshift, values = state.result.global.brightness_mk;
  const pl = state.plReference ? state.plReference.global : null;
  const combined = pl ? values.concat(pl.brightness_mk) : values;
  const zMin = Math.min(...z), zMax = Math.max(...z), [yMin, yMax] = niceBounds(combined, true);
  const {plotWidth, plotHeight} = preparePlot(ctx, width, height, margin);
  const px = (value) => margin.left + (zMax - value) / (zMax - zMin) * plotWidth;
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * plotHeight;
  niceTicks(yMin, yMax, 4).forEach((value) => drawYTick(ctx, py(value), margin.left, width - margin.right, value.toFixed(0), Math.abs(value) < 1e-8));
  for (let index = 0; index <= 4; index += 1) {
    const value = zMax - index * (zMax - zMin) / 4;
    drawXTick(ctx, px(value), height - margin.bottom, value.toFixed(0), margin.top);
    if (index < 4) drawXMinorTick(ctx, px(value - (zMax - zMin) / 8), margin.top, height - margin.bottom);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(margin.left, margin.top, plotWidth, plotHeight); ctx.clip();
  if (pl) drawCurve(ctx, pl.redshift, pl.brightness_mk, px, py, plotPalette.pl, 1.6, [7, 5]);
  drawCurve(ctx, z, values, px, py, plotPalette.current, 2.2);
  ctx.restore();
  const trough = values.indexOf(Math.min(...values));
  ctx.fillStyle = plotPalette.paper; ctx.strokeStyle = plotPalette.current; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(px(z[trough]), py(values[trough]), 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  finishPlot(ctx, width, height, margin, t("redshiftAxis"), "δT_b [mK]");
}

function availableIonizationHistory(result) {
  if (result && result.ionization_history) return result.ionization_history;
  if (result && result.global && result.global.xhi) {
    return {
      redshift: result.global.redshift,
      ionized_fraction: result.global.xhi.map((neutral) => 1 - neutral),
      tau_e: null,
    };
  }
  return null;
}

function drawIonizationHistory() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#ionization-history-chart"));
  const margin = {left: 70, right: 20, top: 18, bottom: 54};
  const current = availableIonizationHistory(state.result);
  const pl = availableIonizationHistory(state.plReference);
  const histories = [current, pl].filter(Boolean);
  preparePlot(ctx, width, height, margin);
  if (!histories.length) {
    ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_MONO}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t("historyUnavailable"), width / 2, height / 2);
    return;
  }
  const allRedshifts = histories.flatMap((history) => history.redshift);
  const zMin = Math.min(...allRedshifts), zMax = Math.max(...allRedshifts);
  const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
  const px = (value) => margin.left + (zMax - value) / (zMax - zMin) * plotWidth;
  const py = (value) => margin.top + (1.03 - value) / 1.06 * plotHeight;
  [0, 0.25, 0.5, 0.75, 1].forEach((value) => drawYTick(ctx, py(value), margin.left, width - margin.right, value.toFixed(value % 0.5 ? 2 : 1), value === 0.5));
  for (let index = 0; index <= 4; index += 1) {
    const value = zMax - index * (zMax - zMin) / 4;
    drawXTick(ctx, px(value), height - margin.bottom, value.toFixed(0), margin.top);
    if (index < 4) drawXMinorTick(ctx, px(value - (zMax - zMin) / 8), margin.top, height - margin.bottom);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, plotWidth, plotHeight); ctx.clip();
  if (pl) drawCurve(ctx, pl.redshift, pl.ionized_fraction, px, py, plotPalette.pl, 1.6, [7, 5]);
  if (current) drawCurve(ctx, current.redshift, current.ionized_fraction, px, py, plotPalette.current, 2.2);
  ctx.restore();
  if (!pl) {
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(t("plHistoryUnavailable"), width - margin.right - 8, margin.top + 8);
  }
  finishPlot(ctx, width, height, margin, t("redshiftAxis"), t("ionizationAxis"));
  const tauCurrent = current && Number.isFinite(current.tau_e) ? current.tau_e : null;
  const tauPL = pl && Number.isFinite(pl.tau_e) ? pl.tau_e : null;
  $("#tau-current").textContent = tauCurrent === null ? t("pending") : tauCurrent.toFixed(4);
  $("#tau-pl").textContent = tauPL === null ? t("pending") : tauPL.toFixed(4);
  $("#tau-difference").textContent = tauCurrent === null || tauPL === null
    ? "—"
    : `${tauCurrent - tauPL >= 0 ? "+" : ""}${(tauCurrent - tauPL).toFixed(4)}`;
}

// Match py21cmfast.plotting: brightness_temp uses the fixed EoR map over
// [-150, 30] mK; other fields use viridis. Temperature arrays are already
// encoded as log10(K), so linear normalization here is equivalent to LogNorm
// on the physical Kelvin values.
const eorStops = [
  [0.00,[255,255,255]],
  [0.21,[255,255,0]],
  [0.42,[255,165,0]],
  [0.63,[255,0,0]],
  [0.86,[0,0,0]],
  [0.90,[0,0,255]],
  [1.00,[0,255,255]],
];
const viridisStops = [
  [0.0000,[68,1,84]],
  [0.0625,[72,24,106]],
  [0.1250,[71,45,123]],
  [0.1875,[66,64,134]],
  [0.2500,[59,82,139]],
  [0.3125,[51,99,141]],
  [0.3750,[44,114,142]],
  [0.4375,[38,130,142]],
  [0.5000,[33,145,140]],
  [0.5625,[31,160,136]],
  [0.6250,[40,174,128]],
  [0.6875,[63,188,115]],
  [0.7500,[94,201,98]],
  [0.8125,[132,212,75]],
  [0.8750,[173,220,48]],
  [0.9375,[216,226,25]],
  [1.0000,[253,231,37]],
];
function colorFromStops(value, stops) {
  const clipped = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], value));
  let upper = 1; while (upper < stops.length && clipped > stops[upper][0]) upper += 1;
  upper = Math.min(upper, stops.length - 1);
  const [x0,c0] = stops[upper - 1], [x1,c1] = stops[upper], fraction = x1 === x0 ? 0 : (clipped - x0) / (x1 - x0);
  return c0.map((channel, index) => Math.round(channel + fraction * (c1[index] - channel)));
}
function eorColor(value) { return colorFromStops((value + 150) / 180, eorStops); }
function viridisColor(value, minimum, maximum) {
  const normalized = maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
  return colorFromStops(normalized, viridisStops);
}

function formatKelvin(value) {
  if (value >= 1.0e4 || value < 0.1) return value.toExponential(1);
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function drawLightcone() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#lightcone-chart"));
  const margin = {left: 68, right: 20, top: 14, bottom: 48};
  const {values, rows, columns} = state.result.decodedPlane;
  const imageCanvas = document.createElement("canvas"); imageCanvas.width = columns; imageCanvas.height = rows;
  const imageContext = imageCanvas.getContext("2d"), image = imageContext.createImageData(columns, rows);
  for (let index = 0; index < values.length; index += 1) {
    const color = eorColor(values[index]), offset = 4 * index;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
  }
  imageContext.putImageData(image, 0, 0); ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageCanvas, margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  ctx.strokeStyle = plotPalette.border; ctx.strokeRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  ctx.font = `13px ${PLOT_MONO}`; ctx.fillStyle = plotPalette.text;
  const redshift = state.result.lightcone.redshift;
  for (let index = 0; index <= 5; index += 1) {
    const column = Math.round(index * (columns - 1) / 5), x = margin.left + index * (width - margin.left - margin.right) / 5;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(redshift[column].toFixed(1), x, height - margin.bottom + 12);
  }
  const distance = state.result.lightcone.distance_mpc;
  for (let index = 0; index <= 3; index += 1) {
    const value = index * distance[distance.length - 1] / 3, y = margin.top + index * (height - margin.top - margin.bottom) / 3;
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(value.toFixed(0), margin.left - 10, y);
  }
  ctx.fillStyle = plotPalette.ink; ctx.font = `700 15px ${PLOT_FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(t("redshiftAxis"), (margin.left + width - margin.right) / 2, height - 4);
  ctx.save(); ctx.translate(16, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t("distanceAxis"), 0, 0); ctx.restore();
}

function configureSliceControl() {
  const slices = state.result.slices;
  const slider = $("#slice-redshift");
  slider.max = slices.redshift.length - 1;
  if (state.sliceIndex === null) {
    state.sliceIndex = slices.redshift.reduce(
      (best, value, index) => Math.abs(value - 10) < Math.abs(slices.redshift[best] - 10) ? index : best,
      0,
    );
  }
  state.sliceIndex = Math.min(state.sliceIndex, slices.redshift.length - 1);
  slider.value = state.sliceIndex;
  updateSliceControl();
}

function updateSliceControl() {
  if (!state.result) return;
  const slider = $("#slice-redshift");
  state.sliceIndex = Number(slider.value);
  slider.style.setProperty("--fill", `${100 * state.sliceIndex / Number(slider.max)}%`);
  const label = `z = ${state.result.slices.redshift[state.sliceIndex].toFixed(2)}`;
  $("#slice-redshift-value").textContent = label;
  $("#thumbnail-redshift").textContent = label;
}

function configureLFControl() {
  const redshifts = state.result.luminosity_function.redshift;
  if (state.lfIndex === null) {
    state.lfIndex = redshifts.reduce(
      (best, value, index) => Math.abs(value - 8) < Math.abs(redshifts[best] - 8) ? index : best,
      0,
    );
  }
  state.lfIndex = Math.min(state.lfIndex, redshifts.length - 1);
  const options = $("#lf-redshift-options");
  options.innerHTML = "";
  redshifts.forEach((redshift, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = index;
    button.textContent = `z = ${redshift.toFixed(0)}`;
    button.setAttribute("aria-label", t("lfOption", {redshift: redshift.toFixed(0)}));
    button.addEventListener("click", () => {
      state.lfIndex = index;
      updateLFControl();
      drawLuminosityFunction();
    });
    options.appendChild(button);
  });
  updateLFControl();
}

function updateLFControl() {
  if (!state.result || state.lfIndex === null) return;
  $("#lf-redshift-value").textContent = `z = ${state.result.luminosity_function.redshift[state.lfIndex].toFixed(0)}`;
  document.querySelectorAll("#lf-redshift-options button").forEach((button) => {
    const active = Number(button.dataset.index) === state.lfIndex;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function sliceFieldRange(values, decoded) {
  const offset = state.sliceIndex * decoded.rows * decoded.columns;
  let minimum = Infinity, maximum = -Infinity;
  for (let pixel = 0; pixel < decoded.rows * decoded.columns; pixel += 1) {
    const value = values[offset + pixel];
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
  }
  return [minimum, maximum];
}

function drawSliceField(canvas, values, decoded, colorFunction, scaleRange = null) {
  const {context: ctx, width, height} = canvasContext(canvas);
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = decoded.columns; imageCanvas.height = decoded.rows;
  const imageContext = imageCanvas.getContext("2d"), image = imageContext.createImageData(decoded.columns, decoded.rows);
  const offset = state.sliceIndex * decoded.rows * decoded.columns;
  const nativeRange = sliceFieldRange(values, decoded);
  const [minimum, maximum] = scaleRange || nativeRange;
  for (let pixel = 0; pixel < decoded.rows * decoded.columns; pixel += 1) {
    const value = values[offset + pixel], color = colorFunction(value, minimum, maximum), target = pixel * 4;
    image.data[target] = color[0]; image.data[target + 1] = color[1]; image.data[target + 2] = color[2]; image.data[target + 3] = 255;
  }
  imageContext.putImageData(image, 0, 0);
  const size = Math.min(width, height), left = (width - size) / 2, top = (height - size) / 2;
  ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageCanvas, left, top, size, size);
  ctx.strokeStyle = plotPalette.border; ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
  return nativeRange;
}

function drawPendingPLSlice(canvas) {
  const {context: ctx, width, height} = canvasContext(canvas);
  ctx.fillStyle = "#f4f6f7";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = plotPalette.grid;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.fillStyle = plotPalette.text;
  ctx.font = `700 12px ${PLOT_MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t("plSlicesUnavailable"), width / 2, height / 2 - 7);
  ctx.font = `10px ${PLOT_MONO}`;
  ctx.fillText(t("storedOnly"), width / 2, height / 2 + 10);
}

const sliceFieldSpecs = [
  {name: "brightness", key: "brightness", canvas: "#brightness-slice", output: "#slice-brightness-range", plCanvas: "#pl-brightness-slice", plOutput: "#pl-slice-brightness-range", label: "brightness_temp", fixed: [-150, 30], palette: "eor"},
  {name: "density", key: "density", canvas: "#density-slice", output: "#slice-density-range", plCanvas: "#pl-density-slice", plOutput: "#pl-slice-density-range", label: "density", palette: "viridis"},
  {name: "ionized", key: "ionized", canvas: "#ionization-slice", output: "#slice-ionization-range", plCanvas: "#pl-ionization-slice", plOutput: "#pl-slice-ionization-range", label: "x_HII", palette: "viridis"},
  {name: "spin", key: "spinTemperatureLog10", canvas: "#spin-temperature-slice", output: "#slice-spin-temperature-range", plCanvas: "#pl-spin-temperature-slice", plOutput: "#pl-slice-spin-temperature-range", label: "Ts_box", palette: "viridis", temperature: true},
  {name: "kinetic", key: "kineticTemperatureLog10", canvas: "#kinetic-temperature-slice", output: "#slice-kinetic-temperature-range", plCanvas: "#pl-kinetic-temperature-slice", plOutput: "#pl-slice-kinetic-temperature-range", label: "Tk_box", palette: "viridis", temperature: true},
];

function formatFieldRange(field, range) {
  if (!range) return "—";
  if (field.temperature) return `${formatKelvin(10 ** range[0])} … ${formatKelvin(10 ** range[1])} K`;
  if (field.name === "brightness") return `${range[0].toFixed(1)} … ${range[1].toFixed(1)} mK`;
  if (field.name === "density") return `${range[0].toFixed(2)} … ${range[1].toFixed(2)}`;
  return `${range[0].toFixed(3)} … ${range[1].toFixed(3)}`;
}

function sharedFieldScale(field, bplDecoded, plDecoded) {
  if (field.fixed) return field.fixed;
  const bplRange = sliceFieldRange(bplDecoded[field.key], bplDecoded);
  if (!plDecoded) return bplRange;
  const plRange = sliceFieldRange(plDecoded[field.key], plDecoded);
  return [Math.min(bplRange[0], plRange[0]), Math.max(bplRange[1], plRange[1])];
}

function drawOneField(canvas, field, decoded, scale) {
  const color = field.palette === "eor" ? eorColor : viridisColor;
  return drawSliceField(canvas, decoded[field.key], decoded, color, scale);
}

function drawSlices() {
  if (!state.result || state.sliceIndex === null) return;
  const bplDecoded = state.result.decodedSlices;
  const plDecoded = state.plReference ? state.plReference.decodedSlices : null;

  sliceFieldSpecs.forEach((field) => {
    const scale = sharedFieldScale(field, bplDecoded, plDecoded);
    const bplRange = drawOneField($(field.canvas), field, bplDecoded, scale);
    $(field.output).textContent = formatFieldRange(field, bplRange);
    if (plDecoded) {
      const plRange = drawOneField($(field.plCanvas), field, plDecoded, scale);
      $(field.plOutput).textContent = formatFieldRange(field, plRange);
    } else {
      drawPendingPLSlice($(field.plCanvas));
      $(field.plOutput).textContent = t("pending");
    }
  });
}

function drawLFCurve(ctx, curve, px, py, color, width, dash = []) {
  let drawing = false;
  ctx.beginPath();
  curve.muv.forEach((magnitude, index) => {
    const logPhi = curve.log10_phi[index];
    if (!Number.isFinite(magnitude) || !Number.isFinite(logPhi)) return;
    ctx[drawing ? "lineTo" : "moveTo"](px(magnitude), py(logPhi));
    drawing = true;
  });
  if (!drawing) return false;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  return true;
}

function observationSource(sourceId) {
  return state.design.lf_observations.sources.find((source) => source.id === sourceId);
}

function observationColor(point) {
  const source = observationSource(point.source_id);
  return source && source.instrument.startsWith("HST") ? plotPalette.hst : plotPalette.jwst;
}

function drawObservationPoint(ctx, point, px, py, yMin, yMax) {
  const x = px(point.muv), y = py(Math.log10(point.phi)), color = observationColor(point);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4; ctx.setLineDash([]);
  if (point.upper_limit) {
    ctx.beginPath(); ctx.moveTo(x - 4.5, y - 3.5); ctx.lineTo(x + 4.5, y - 3.5); ctx.lineTo(x, y + 4.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + 4.5); ctx.lineTo(x, Math.min(py(yMin), y + 15)); ctx.stroke();
    return;
  }
  const lowerPhi = Math.max(point.phi - point.sigma_minus, 10 ** yMin);
  const upperPhi = Math.min(point.phi + point.sigma_plus, 10 ** yMax);
  const yLow = py(Math.log10(lowerPhi)), yHigh = py(Math.log10(upperPhi));
  ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow);
  ctx.moveTo(x - 3.5, yHigh); ctx.lineTo(x + 3.5, yHigh);
  ctx.moveTo(x - 3.5, yLow); ctx.lineTo(x + 3.5, yLow); ctx.stroke();
  const source = observationSource(point.source_id);
  ctx.fillStyle = plotPalette.paper;
  if (source && source.instrument.startsWith("HST")) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillRect(x - 3.7, y - 3.7, 7.4, 7.4); ctx.strokeRect(x - 3.7, y - 3.7, 7.4, 7.4);
  }
}

function drawLuminosityFunction() {
  if (!state.result || state.lfIndex === null) return;
  const {context: ctx, width, height} = canvasContext($("#lf-chart"));
  const margin = {left: 86, right: 30, top: 30, bottom: 68};
  const xMin = -24, xMax = -10;
  const current = state.result.luminosity_function.curves[state.lfIndex];
  const plCurve = state.plReference && state.plReference.luminosity_function
    ? state.plReference.luminosity_function.curves[state.lfIndex]
    : null;
  const displayRedshift = state.result.luminosity_function.redshift[state.lfIndex].toFixed(0);
  const observations = state.design.lf_observations.by_display_redshift[displayRedshift] || [];
  const bounds = current.log10_phi.concat(plCurve ? plCurve.log10_phi : []);
  observations.forEach((point) => {
    bounds.push(Math.log10(point.phi));
    if (point.phi + point.sigma_plus > 0) bounds.push(Math.log10(point.phi + point.sigma_plus));
    if (point.phi - point.sigma_minus > 0) bounds.push(Math.log10(point.phi - point.sigma_minus));
  });
  const finiteBounds = bounds.filter((value) => Number.isFinite(value) && value >= -12);
  const yMin = Math.max(-12, Math.min(-7, Math.floor(Math.min(...finiteBounds) - 0.35)));
  const yMax = Math.min(1, Math.max(-1, Math.ceil(Math.max(...finiteBounds) + 0.35)));
  const {plotWidth, plotHeight} = preparePlot(ctx, width, height, margin);
  const px = (value) => margin.left + (value - xMin) / (xMax - xMin) * plotWidth;
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * plotHeight;
  for (let value = Math.ceil(yMin / 2) * 2; value <= yMax; value += 2) {
    drawYTick(ctx, py(value), margin.left, width - margin.right, value.toFixed(0));
    if (value + 1 <= yMax) drawYMinorTick(ctx, py(value + 1), margin.left, width - margin.right);
  }
  for (let value = xMin; value <= xMax; value += 2) {
    drawXTick(ctx, px(value), height - margin.bottom, value.toFixed(0), margin.top);
    if (value + 1 <= xMax) drawXMinorTick(ctx, px(value + 1), margin.top, height - margin.bottom);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, plotWidth, plotHeight); ctx.clip();
  if (plCurve) drawLFCurve(ctx, plCurve, px, py, plotPalette.pl, 1.6, [7, 5]);
  const drawn = drawLFCurve(ctx, current, px, py, plotPalette.current, 2.2);
  observations.forEach((point) => drawObservationPoint(ctx, point, px, py, yMin, yMax));
  ctx.restore();
  if (!drawn) {
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t("emptyLF"), (margin.left + width - margin.right) / 2, (margin.top + height - margin.bottom) / 2);
  }
  ctx.fillStyle = plotPalette.ink; ctx.font = `700 14px ${PLOT_MONO}`;
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillText(`z = ${displayRedshift}`, width - margin.right - 10, margin.top + 9);
  finishPlot(ctx, width, height, margin, t("magnitudeAxis"), "log₁₀ φ [cMpc⁻³ mag⁻¹]");
}

function setSlicePlaying(playing) {
  if (state.sliceTimer) window.clearInterval(state.sliceTimer);
  state.sliceTimer = null;
  $("#slice-play").textContent = t(playing ? "pause" : "play");
  $("#slice-play").setAttribute("aria-pressed", String(playing));
  $("#slice-play").classList.toggle("playing", playing);
  if (!playing) return;
  const slider = $("#slice-redshift");
  if (Number(slider.value) >= Number(slider.max)) slider.value = 0;
  state.sliceTimer = window.setInterval(() => {
    const next = Number(slider.value) + 1;
    if (next > Number(slider.max)) { setSlicePlaying(false); return; }
    slider.value = next;
    updateSliceControl();
    drawSlices();
  }, 420);
}

function drawAll() {
  drawGlobal();
  drawLightcone();
  drawSlices();
  drawIonizationHistory();
  drawLuminosityFunction();
}
function resetControls() {
  state.activeAstro = null;
  for (const control of state.controls.values()) resetOne(control);
  renderModelLabels();
  return loadRun(state.design.baseline_run_id);
}

async function initialize() {
  try {
    state.design = await fetchJSON(versioned("web_data/index.json"));
    state.design.parameter_specs.forEach(createParameter);
    $("#data-state").classList.add("online");
    $("#hero-run-count").textContent = state.design.n_exact_runs;
    renderLocalizedUI();
    await loadRun(state.design.baseline_run_id);
  } catch (error) {
    state.status = {kind: "libraryError", error};
    renderLocalizedUI();
  }
}

function initializeMotion() {
  const sections = [...document.querySelectorAll(".reveal")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }
  document.body.classList.add("motion-ready");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {rootMargin: "0px 0px -8%", threshold: 0.08});
  sections.forEach((section) => observer.observe(section));
}

$("#reset-button").addEventListener("click", resetControls);
document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
});
$("#slice-redshift").addEventListener("input", () => { updateSliceControl(); drawSlices(); });
$("#slice-play").addEventListener("click", () => setSlicePlaying(!state.sliceTimer));
$("#main-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("#main-map-card").requestFullscreen();
});
document.addEventListener("fullscreenchange", () => {
  updateFullscreenLabel();
  window.requestAnimationFrame(drawLuminosityFunction);
});
window.addEventListener("resize", () => { clearTimeout(window.__drawTimer); window.__drawTimer = setTimeout(drawAll, 120); });
window.AtlasI18n.apply();
renderLocalizedUI();
initializeMotion();
initializeParameterDock();
initialize();
