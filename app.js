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
  selectedField: "brightness",
  thumbnailDataset: "bpl",
  auxPanel: "ionization",
};

const $ = (selector) => document.querySelector(selector);
const astroNames = new Set(["F_STAR10", "ALPHA_STAR", "F_ESC10", "ALPHA_ESC", "M_TURN", "t_STAR", "L_X", "NU_X_THRESH"]);
const DATA_VERSION = "hii256-v13";
const plotPalette = {
  ink: "#1d2730",
  text: "#56616a",
  grid: "rgba(31,45,58,0.12)",
  gridLight: "rgba(31,45,58,0.065)",
  border: "rgba(31,45,58,0.38)",
  current: "#a33e32",
  pl: "rgba(36,87,138,0.9)",
  hst: "#2f6f71",
  jwst: "#865c86",
  paper: "#ffffff",
};

function versioned(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${DATA_VERSION}`;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`读取 ${path} 失败：HTTP ${response.status}`);
  return response.json();
}

async function fetchBuffer(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`读取 ${path} 失败：HTTP ${response.status}`);
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
  if (!("DecompressionStream" in window)) throw new Error("浏览器不支持高分辨率数据解压缩，请使用新版浏览器");
  const compressed = new Uint8Array(
    buffer,
    descriptor.offset,
    descriptor.compressed_bytes,
  );
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (raw.byteLength !== descriptor.uncompressed_bytes) throw new Error("高分辨率切片数据长度校验失败");
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
  $("#status-title").textContent = "该高分辨率参数点未发布";
  $("#status-message").textContent = `${runId} · 21cmFAST 自旋温度计算出现数值异常；未使用插值或低分辨率结果替代`;
  $("#run-badge").textContent = "UNAVAILABLE";
  $("#run-badge").className = "run-badge failed";
  $("#selection-detail").innerHTML = `<strong>已排除的数值异常点</strong><span>${runId}</span>`;
  [
    "#metric-z", "#metric-temp", "#metric-kp", "#metric-ms", "#metric-time",
    "#tau-current", "#tau-pl", "#tau-difference", "#main-bpl-range",
    "#main-pl-range", "#main-scale-min", "#main-scale-max",
  ].forEach((selector) => {
    $(selector).textContent = "—";
  });
  [
    "#slice-brightness-range", "#slice-density-range", "#slice-ionization-range",
    "#slice-spin-temperature-range", "#slice-kinetic-temperature-range",
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
  $("#status-title").textContent = "切换精确模拟";
  $("#status-message").textContent = `${runId} · 正在读取预计算文件`;
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
    )) throw new Error("BPL 与同参数 PL 的切片红移网格不一致");
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
    $("#status-title").textContent = "结果读取失败";
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
  $("#status-title").textContent = "预计算结果已载入";
  const mode = result.role.kind === "astro_oat" ? `${result.role.parameter} 单参数扫描` : (result.role.kind === "kp_ms_grid" ? "KP × MS 联合网格" : "基准模型");
  $("#status-message").textContent = `${mode} · 页面没有启动新计算`;
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
  setThumbnailDataset(state.thumbnailDataset);
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

function drawCurve(ctx, z, values, px, py, color, width, shadow = false, dash = []) {
  ctx.beginPath();
  z.forEach((value, index) => ctx[index ? "lineTo" : "moveTo"](px(value), py(values[index])));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  if (shadow) { ctx.shadowColor = "rgba(163,62,50,0.18)"; ctx.shadowBlur = 4; }
  ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
}

function drawGlobal() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#global-chart"));
  const margin = {left: 52, right: 15, top: 14, bottom: 35};
  const z = state.result.global.redshift, values = state.result.global.brightness_mk;
  const pl = state.plReference ? state.plReference.global : null;
  const combined = pl ? values.concat(pl.brightness_mk) : values;
  const zMin = Math.min(...z), zMax = Math.max(...z), [yMin, yMax] = niceBounds(combined, true);
  const px = (value) => margin.left + (zMax - value) / (zMax - zMin) * (width - margin.left - margin.right);
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  ctx.clearRect(0, 0, width, height); ctx.font = "10px Arial, sans-serif";
  for (let index = 0; index <= 5; index += 1) {
    const value = yMin + index * (yMax - yMin) / 5, y = py(value);
    ctx.strokeStyle = plotPalette.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(value.toFixed(0), margin.left - 10, y);
  }
  for (let index = 0; index <= 5; index += 1) {
    const value = zMax - index * (zMax - zMin) / 5, x = px(value);
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(value.toFixed(0), x, height - margin.bottom + 12);
  }
  if (yMin < 0 && yMax > 0) {
    ctx.strokeStyle = plotPalette.border; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(margin.left, py(0)); ctx.lineTo(width - margin.right, py(0)); ctx.stroke(); ctx.setLineDash([]);
  }
  if (pl) drawCurve(ctx, pl.redshift, pl.brightness_mk, px, py, plotPalette.pl, 1.6, false, [7, 5]);
  drawCurve(ctx, z, values, px, py, plotPalette.current, 2.1, true);
  const trough = values.indexOf(Math.min(...values));
  ctx.fillStyle = plotPalette.paper; ctx.strokeStyle = plotPalette.current; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px(z[trough]), py(values[trough]), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("Redshift, z   ·   cosmic time →", (margin.left + width - margin.right) / 2, height - 5);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("δTb [mK]", 0, 0); ctx.restore();
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
  const margin = {left: 52, right: 15, top: 14, bottom: 35};
  const current = availableIonizationHistory(state.result);
  const pl = availableIonizationHistory(state.plReference);
  const histories = [current, pl].filter(Boolean);
  ctx.clearRect(0, 0, width, height);
  if (!histories.length) {
    ctx.fillStyle = plotPalette.text; ctx.font = "10px Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Ionization history is being prepared", width / 2, height / 2);
    return;
  }
  const allRedshifts = histories.flatMap((history) => history.redshift);
  const zMin = Math.min(...allRedshifts), zMax = Math.max(...allRedshifts);
  const px = (value) => margin.left + (zMax - value) / (zMax - zMin) * (width - margin.left - margin.right);
  const py = (value) => margin.top + (1.02 - value) / 1.04 * (height - margin.top - margin.bottom);
  ctx.font = "10px Arial, sans-serif";
  for (let index = 0; index <= 5; index += 1) {
    const value = index / 5, y = py(value);
    ctx.strokeStyle = plotPalette.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(value.toFixed(1), margin.left - 10, y);
  }
  for (let index = 0; index <= 5; index += 1) {
    const value = zMax - index * (zMax - zMin) / 5, x = px(value);
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(value.toFixed(0), x, height - margin.bottom + 12);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom); ctx.clip();
  if (pl) drawCurve(ctx, pl.redshift, pl.ionized_fraction, px, py, plotPalette.pl, 1.6, false, [7, 5]);
  if (current) drawCurve(ctx, current.redshift, current.ionized_fraction, px, py, plotPalette.current, 2.1);
  ctx.restore();
  ctx.strokeStyle = plotPalette.border;
  ctx.strokeRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  if (!pl) {
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText("PL history computing", width - margin.right - 8, margin.top + 8);
  }
  ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("Redshift, z   ·   cosmic time →", (margin.left + width - margin.right) / 2, height - 5);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("Ionized fraction, xi", 0, 0); ctx.restore();
  const tauCurrent = current && Number.isFinite(current.tau_e) ? current.tau_e : null;
  const tauPL = pl && Number.isFinite(pl.tau_e) ? pl.tau_e : null;
  $("#tau-current").textContent = tauCurrent === null ? "构建中" : tauCurrent.toFixed(4);
  $("#tau-pl").textContent = tauPL === null ? "构建中" : tauPL.toFixed(4);
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
  const margin = {left: 55, right: 18, top: 12, bottom: 36};
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
  ctx.font = "10px Arial, sans-serif"; ctx.fillStyle = plotPalette.text;
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
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("Redshift, z   ·   cosmic time →", (margin.left + width - margin.right) / 2, height - 4);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Transverse distance [cMpc]", 0, 0); ctx.restore();
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
    button.setAttribute("aria-label", `显示红移 ${redshift.toFixed(0)} 的 UV 光度函数`);
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
  ctx.font = "10px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PL slices computing", width / 2, height / 2 - 7);
  ctx.font = "9px Arial, sans-serif";
  ctx.fillText("完成后自动更新", width / 2, height / 2 + 10);
}

const sliceFieldSpecs = [
  {name: "brightness", key: "brightness", canvas: "#brightness-slice", label: "brightness_temp", subtitle: "21 cm 亮温 [mK]", fixed: [-150, 30], palette: "eor"},
  {name: "density", key: "density", canvas: "#density-slice", label: "density", subtitle: "密度对比度 δ", palette: "viridis"},
  {name: "ionized", key: "ionized", canvas: "#ionization-slice", label: "x_HII", subtitle: "电离氢分数", palette: "viridis"},
  {name: "spin", key: "spinTemperatureLog10", canvas: "#spin-temperature-slice", label: "Ts_box", subtitle: "21 cm 自旋温度 [K] · log", palette: "viridis", temperature: true},
  {name: "kinetic", key: "kineticTemperatureLog10", canvas: "#kinetic-temperature-slice", label: "Tk_box", subtitle: "IGM 气体动温 [K] · log", palette: "viridis", temperature: true},
];

function selectedFieldSpec() {
  return sliceFieldSpecs.find((field) => field.name === state.selectedField) || sliceFieldSpecs[0];
}

function formatFieldRange(field, range) {
  if (!range) return "—";
  if (field.temperature) return `${formatKelvin(10 ** range[0])} … ${formatKelvin(10 ** range[1])} K`;
  if (field.name === "brightness") return `${range[0].toFixed(1)} … ${range[1].toFixed(1)} mK`;
  if (field.name === "density") return `${range[0].toFixed(2)} … ${range[1].toFixed(2)}`;
  return `${range[0].toFixed(3)} … ${range[1].toFixed(3)}`;
}

function formatScaleEdge(field, value) {
  if (field.temperature) return `${formatKelvin(10 ** value)} K`;
  if (field.name === "brightness") return `${value.toFixed(0)} mK`;
  if (field.name === "density") return `δ ${value.toFixed(2)}`;
  return value.toFixed(3);
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

function drawMainSlice() {
  if (!state.result || state.sliceIndex === null) return;
  const field = selectedFieldSpec();
  const bplDecoded = state.result.decodedSlices;
  const plDecoded = state.plReference ? state.plReference.decodedSlices : null;
  const scale = sharedFieldScale(field, bplDecoded, plDecoded);
  const bplRange = drawOneField($("#main-bpl-slice"), field, bplDecoded, scale);
  let plRange = null;
  if (plDecoded) plRange = drawOneField($("#main-pl-slice"), field, plDecoded, scale);
  else drawPendingPLSlice($("#main-pl-slice"));

  $("#main-field-title").textContent = field.label;
  $("#main-field-subtitle").textContent = `${field.subtitle} · SELECTED 256² SLICE`;
  $("#main-bpl-range").textContent = formatFieldRange(field, bplRange);
  $("#main-pl-range").textContent = plRange ? formatFieldRange(field, plRange) : "计算中";
  $("#main-scale-min").textContent = formatScaleEdge(field, scale[0]);
  $("#main-scale-max").textContent = formatScaleEdge(field, scale[1]);
  $("#main-scale-gradient").className = `palette ${field.palette === "eor" ? "eor-palette" : "viridis-palette"}`;
}

function drawSlices() {
  if (!state.result || state.sliceIndex === null) return;
  const bplDecoded = state.result.decodedSlices;
  const plDecoded = state.plReference ? state.plReference.decodedSlices : null;
  if (!plDecoded && state.thumbnailDataset === "pl") state.thumbnailDataset = "bpl";
  const thumbnailDecoded = state.thumbnailDataset === "pl" ? plDecoded : bplDecoded;

  document.querySelectorAll("[data-dataset]").forEach((button) => {
    const isPL = button.dataset.dataset === "pl";
    button.disabled = isPL && !plDecoded;
    const active = button.dataset.dataset === state.thumbnailDataset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".slice-thumb").forEach((button) => {
    const active = button.dataset.field === state.selectedField;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  sliceFieldSpecs.forEach((field) => {
    const scale = sharedFieldScale(field, bplDecoded, plDecoded);
    const range = drawOneField($(field.canvas), field, thumbnailDecoded, scale);
    $(`#slice-${field.name === "ionized" ? "ionization" : field.name === "spin" ? "spin-temperature" : field.name === "kinetic" ? "kinetic-temperature" : field.name}-range`).textContent = formatFieldRange(field, range);
  });
  drawMainSlice();
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
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.15; ctx.setLineDash([]);
  if (point.upper_limit) {
    ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x + 4, y - 3); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, Math.min(py(yMin), y + 13)); ctx.stroke();
    return;
  }
  const lowerPhi = Math.max(point.phi - point.sigma_minus, 10 ** yMin);
  const upperPhi = Math.min(point.phi + point.sigma_plus, 10 ** yMax);
  const yLow = py(Math.log10(lowerPhi)), yHigh = py(Math.log10(upperPhi));
  ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow);
  ctx.moveTo(x - 3, yHigh); ctx.lineTo(x + 3, yHigh);
  ctx.moveTo(x - 3, yLow); ctx.lineTo(x + 3, yLow); ctx.stroke();
  const source = observationSource(point.source_id);
  if (source && source.instrument.startsWith("HST")) {
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(x - 3.2, y - 3.2, 6.4, 6.4);
  }
}

function drawLuminosityFunction() {
  if (!state.result || state.lfIndex === null) return;
  const {context: ctx, width, height} = canvasContext($("#lf-chart"));
  const margin = {left: 54, right: 14, top: 14, bottom: 39};
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
  const px = (value) => margin.left + (value - xMin) / (xMax - xMin) * (width - margin.left - margin.right);
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "10px Arial, sans-serif";
  for (let value = Math.ceil(yMin / 2) * 2; value <= yMax; value += 2) {
    const y = py(value);
    ctx.strokeStyle = plotPalette.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(value.toFixed(0), margin.left - 10, y);
  }
  for (let value = xMin; value <= xMax; value += 2) {
    const x = px(value);
    ctx.strokeStyle = plotPalette.gridLight;
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, height - margin.bottom); ctx.stroke();
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(value.toFixed(0), x, height - margin.bottom + 12);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom); ctx.clip();
  if (plCurve) drawLFCurve(ctx, plCurve, px, py, plotPalette.pl, 1.6, [7, 5]);
  const drawn = drawLFCurve(ctx, current, px, py, plotPalette.current, 2.1);
  observations.forEach((point) => drawObservationPoint(ctx, point, px, py, yMin, yMax));
  ctx.restore();
  ctx.strokeStyle = plotPalette.border;
  ctx.strokeRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  if (!drawn) {
    ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("该红移没有达到数值阈值的 LF 数据", (margin.left + width - margin.right) / 2, (margin.top + height - margin.bottom) / 2);
  }
  ctx.fillStyle = plotPalette.text; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("Absolute UV magnitude, MUV", (margin.left + width - margin.right) / 2, height - 5);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("log10 φ [cMpc⁻³ mag⁻¹]", 0, 0); ctx.restore();
}

function setSlicePlaying(playing) {
  if (state.sliceTimer) window.clearInterval(state.sliceTimer);
  state.sliceTimer = null;
  $("#slice-play").textContent = playing ? "暂停" : "播放";
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

function setAuxPanel(name) {
  state.auxPanel = name;
  document.querySelectorAll("[data-aux-panel]").forEach((button) => {
    const active = button.dataset.auxPanel === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  ["ionization", "lf"].forEach((panelName) => {
    const panel = $(`#aux-${panelName}`);
    const active = panelName === name;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  window.requestAnimationFrame(() => {
    if (name === "ionization") drawIonizationHistory();
    else drawLuminosityFunction();
  });
}

function setThumbnailDataset(name) {
  const plReady = Boolean(state.plReference && state.plReference.decodedSlices);
  state.thumbnailDataset = name === "pl" && plReady ? "pl" : "bpl";
  document.querySelectorAll("[data-dataset]").forEach((button) => {
    const active = button.dataset.dataset === state.thumbnailDataset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.disabled = button.dataset.dataset === "pl" && !plReady;
    button.title = button.disabled ? "该 PL 切片仍在计算" : "";
  });
  drawSlices();
}

function selectField(name) {
  state.selectedField = name;
  document.querySelectorAll(".slice-thumb").forEach((button) => {
    const active = button.dataset.field === name;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  drawMainSlice();
}

function drawAll() {
  drawGlobal();
  drawLightcone();
  drawSlices();
  if (state.auxPanel === "ionization") drawIonizationHistory();
  else drawLuminosityFunction();
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
    $("#data-state").classList.add("online"); $("#data-state").lastChild.textContent = "结果就绪";
    $("#footer-count").textContent = `${state.design.n_exact_runs} EXACT 21cmFAST LIGHTCONES`;
    await loadRun(state.design.baseline_run_id);
  } catch (error) {
    $("#status-card").classList.remove("active");
    $("#status-title").textContent = "结果库尚未生成";
    $("#status-message").textContent = error.message;
    $("#run-badge").textContent = "NO DATA"; $("#run-badge").className = "run-badge failed";
  }
}

$("#reset-button").addEventListener("click", resetControls);
$("#slice-redshift").addEventListener("input", () => { updateSliceControl(); drawSlices(); });
$("#slice-play").addEventListener("click", () => setSlicePlaying(!state.sliceTimer));
document.querySelectorAll("[data-aux-panel]").forEach((button) => button.addEventListener("click", () => setAuxPanel(button.dataset.auxPanel)));
document.querySelectorAll("[data-dataset]").forEach((button) => button.addEventListener("click", () => setThumbnailDataset(button.dataset.dataset)));
document.querySelectorAll(".slice-thumb").forEach((button) => button.addEventListener("click", () => selectField(button.dataset.field)));
$("#main-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("#main-map-card").requestFullscreen();
});
document.addEventListener("fullscreenchange", () => window.requestAnimationFrame(drawMainSlice));
window.addEventListener("resize", () => { clearTimeout(window.__drawTimer); window.__drawTimer = setTimeout(drawAll, 120); });
initialize();
