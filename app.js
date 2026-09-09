"use strict";

const state = {
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
};

const $ = (selector) => document.querySelector(selector);
const astroNames = new Set(["F_STAR10", "ALPHA_STAR", "F_ESC10", "ALPHA_ESC", "M_TURN", "t_STAR", "L_X", "NU_X_THRESH"]);
const DATA_VERSION = "hii256-v16";
const PLOT_FONT = '"STIXGeneral", "Times New Roman", "DejaVu Serif", Georgia, serif';
const plotPalette = {
  ink: "#000000",
  text: "#1f2930",
  axis: "#000000",
  grid: "rgba(100,100,100,0.20)",
  gridLight: "rgba(100,100,100,0.12)",
  border: "#000000",
  current: "#0072b2",
  pl: "#000000",
  hst: "#009e73",
  jwst: "#d55e00",
  plot: "#ffffff",
  paper: "#ffffff",
};

function versioned(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${DATA_VERSION}`;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to read ${path}: HTTP ${response.status}`);
  return response.json();
}

async function fetchBuffer(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to read ${path}: HTTP ${response.status}`);
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
    return state.design.mappings.kp_ms_grid[currentIndex("KP_h_Mpc")][currentIndex("MS")];
  }
  if (state.activeAstro) return state.design.mappings.astro_oat[state.activeAstro][currentIndex(state.activeAstro)];
  return state.design.mappings.kp_ms_grid[currentIndex("KP_h_Mpc")][currentIndex("MS")];
}

function createParameter(specification) {
  const wrapper = document.createElement("div");
  wrapper.className = "parameter";
  wrapper.title = specification.description;
  const values = specification.values;
  wrapper.innerHTML = `
    <div class="parameter-head"><span class="parameter-label">${specification.label}</span><span class="parameter-value"></span></div>
    <input type="range" min="0" max="${values.length - 1}" step="1" value="${specification.default_index}" aria-label="${specification.label}">
    <div class="range-extents"><span>${displayNumber(values[0], specification.name)}</span><span>${displayNumber(values[values.length - 1], specification.name)}</span></div>`;
  const control = {slider: wrapper.querySelector("input"), valueNode: wrapper.querySelector(".parameter-value"), specification};
  control.slider.addEventListener("input", () => {
    updateSliderVisual(control);
    loadRun(resolveRunId(specification.name));
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
  if (!("DecompressionStream" in window)) throw new Error("This browser cannot decompress the high-resolution data. Please use a current browser.");
  const compressed = new Uint8Array(
    buffer,
    descriptor.offset,
    descriptor.compressed_bytes,
  );
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (raw.byteLength !== descriptor.uncompressed_bytes) throw new Error("High-resolution slice data failed its length check.");
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
  $("#status-card").classList.remove("active");
  $("#status-title").textContent = "High-resolution parameter point unavailable";
  $("#status-message").textContent = `${runId} · 21cmFAST encountered a spin-temperature numerical failure; no interpolation or low-resolution substitute is used`;
  $("#run-badge").textContent = "UNAVAILABLE";
  $("#run-badge").className = "run-badge failed";
  $("#selection-detail").innerHTML = `<strong>Excluded numerical outlier</strong><span>${runId}</span>`;
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
  if ((state.design.unavailable_run_ids || []).includes(runId)) {
    showUnavailableRun(runId);
    return;
  }
  const serial = ++state.requestSerial;
  $("#status-card").classList.add("active");
  $("#status-title").textContent = "Switching exact simulation";
  $("#status-message").textContent = `${runId} · Loading precomputed files`;
  $("#run-badge").textContent = "LOADING";
  $("#run-badge").className = "run-badge running";
  try {
    const result = await fetchJSON(versioned(`web_data/runs/${runId}.json`));
    if (serial !== state.requestSerial) return;
    result.decodedPlane = decodePlane(result.lightcone);
    const plReference = await fetchJSON(versioned(result.pl_reference.file));
    if (plReference.slices && (
      result.slices.redshift.length !== plReference.slices.redshift.length
      || result.slices.redshift.some(
        (redshift, index) => Math.abs(redshift - plReference.slices.redshift[index]) > 1.0e-4,
      )
    )) throw new Error("The BPL and matched-PL slice redshift grids do not agree.");
    const sliceTasks = [decodeSlices(result.slices, "web_data/runs")];
    if (plReference.slices) sliceTasks.push(decodeSlices(plReference.slices, "web_data/pl"));
    const [decodedSlices, decodedPLSlices = null] = await Promise.all(sliceTasks);
    result.decodedSlices = decodedSlices;
    plReference.decodedSlices = decodedPLSlices;
    if (serial !== state.requestSerial) return;
    state.plReference = plReference;
    state.result = result;
    showResult();
  } catch (error) {
    if (serial !== state.requestSerial) return;
    $("#status-card").classList.remove("active");
    $("#status-title").textContent = "Result loading failed";
    $("#status-message").textContent = error.message;
    $("#run-badge").textContent = "ERROR";
    $("#run-badge").className = "run-badge failed";
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function showResult() {
  const result = state.result;
  $("#status-card").classList.remove("active");
  $("#status-title").textContent = "Precomputed result loaded";
  const mode = result.role.kind === "astro_oat" ? `${result.role.parameter} one-at-a-time scan` : (result.role.kind === "kp_ms_grid" ? "KP × MS joint grid" : "Baseline model");
  $("#status-message").textContent = `${mode} · No new calculation was launched`;
  $("#run-badge").textContent = `EXACT · ${result.run_id.slice(4, 12)}`;
  $("#run-badge").className = "run-badge completed";
  $("#selection-detail").innerHTML = `<strong>${mode}</strong><span>${result.run_id}</span>`;
  $("#metric-z").textContent = result.summary.trough_redshift.toFixed(2);
  $("#metric-temp").textContent = `${result.summary.trough_brightness_mk.toFixed(1)} mK`;
  $("#metric-kp").textContent = `${result.parameters.KP_h_Mpc.toFixed(1)} h/Mpc`;
  $("#metric-ms").textContent = result.parameters.MS.toFixed(2);
  $("#metric-time").textContent = formatDuration(result.summary.elapsed_seconds);
  configureSliceControl();
  configureLFControl();
  drawAll();
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
  ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_FONT}`;
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
  ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_FONT}`;
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
  finishPlot(ctx, width, height, margin, "Redshift, z  (cosmic time →)", "δT_b [mK]");
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
    ctx.fillStyle = plotPalette.text; ctx.font = `13px ${PLOT_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Ionization history is being prepared", width / 2, height / 2);
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
    ctx.fillText("PL history computing", width - margin.right - 8, margin.top + 8);
  }
  finishPlot(ctx, width, height, margin, "Redshift, z  (cosmic time →)", "Ionized fraction, ξ");
  const tauCurrent = current && Number.isFinite(current.tau_e) ? current.tau_e : null;
  const tauPL = pl && Number.isFinite(pl.tau_e) ? pl.tau_e : null;
  $("#tau-current").textContent = tauCurrent === null ? "Computing…" : tauCurrent.toFixed(4);
  $("#tau-pl").textContent = tauPL === null ? "Computing…" : tauPL.toFixed(4);
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
  ctx.font = `13px ${PLOT_FONT}`; ctx.fillStyle = plotPalette.text;
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
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("Redshift, z  (cosmic time →)", (margin.left + width - margin.right) / 2, height - 4);
  ctx.save(); ctx.translate(16, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Transverse distance [cMpc]", 0, 0); ctx.restore();
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
    button.setAttribute("aria-label", `Show the UV luminosity function at redshift ${redshift.toFixed(0)}`);
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
  ctx.font = `700 14px ${PLOT_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PL slices computing", width / 2, height / 2 - 7);
  ctx.font = `12px ${PLOT_FONT}`;
  ctx.fillText("Updates automatically when ready", width / 2, height / 2 + 10);
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
      $(field.plOutput).textContent = "Computing…";
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
    ctx.fillText("No LF bins pass the numerical threshold at this redshift", (margin.left + width - margin.right) / 2, (margin.top + height - margin.bottom) / 2);
  }
  ctx.fillStyle = plotPalette.ink; ctx.font = `700 17px ${PLOT_FONT}`;
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillText(`z = ${displayRedshift}`, width - margin.right - 10, margin.top + 9);
  finishPlot(ctx, width, height, margin, "Absolute UV magnitude, M_UV", "log₁₀ φ [cMpc⁻³ mag⁻¹]");
}

function setSlicePlaying(playing) {
  if (state.sliceTimer) window.clearInterval(state.sliceTimer);
  state.sliceTimer = null;
  $("#slice-play").textContent = playing ? "Pause" : "Play";
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
  loadRun(state.design.baseline_run_id);
}

async function initialize() {
  try {
    state.design = await fetchJSON(versioned("web_data/index.json"));
    state.design.parameter_specs.forEach(createParameter);
    $("#data-state").classList.add("online"); $("#data-state").lastChild.textContent = "Results ready";
    $("#footer-count").textContent = `${state.design.n_exact_runs} EXACT 21cmFAST LIGHTCONES`;
    await loadRun(state.design.baseline_run_id);
  } catch (error) {
    $("#status-card").classList.remove("active");
    $("#status-title").textContent = "Result library not available";
    $("#status-message").textContent = error.message;
    $("#run-badge").textContent = "NO DATA"; $("#run-badge").className = "run-badge failed";
  }
}

$("#reset-button").addEventListener("click", resetControls);
$("#slice-redshift").addEventListener("input", () => { updateSliceControl(); drawSlices(); });
$("#slice-play").addEventListener("click", () => setSlicePlaying(!state.sliceTimer));
$("#main-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("#main-map-card").requestFullscreen();
});
document.addEventListener("fullscreenchange", () => window.requestAnimationFrame(drawLuminosityFunction));
window.addEventListener("resize", () => { clearTimeout(window.__drawTimer); window.__drawTimer = setTimeout(drawAll, 120); });
initialize();
