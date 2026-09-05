"use strict";

const state = {
  design: null,
  controls: new Map(),
  result: null,
  previous: null,
  activeAstro: null,
  requestSerial: 0,
  sliceIndex: null,
  sliceTimer: null,
  lfIndex: null,
};

const $ = (selector) => document.querySelector(selector);
const astroNames = new Set(["F_STAR10", "ALPHA_STAR", "F_ESC10", "ALPHA_ESC", "M_TURN", "t_STAR", "L_X", "NU_X_THRESH"]);
const DATA_VERSION = "lf-exact-v6";

function versioned(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${DATA_VERSION}`;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`读取 ${path} 失败：HTTP ${response.status}`);
  return response.json();
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
  $(`#group-${specification.group}`).appendChild(wrapper);
}

function decodeI16(encoded, scale) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer), values = new Float32Array(binary.length / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getInt16(index * 2, true) * scale;
  return values;
}

function decodePlane(lightcone) {
  const values = decodeI16(lightcone.brightness_i16_le_base64, lightcone.quantization_mk);
  return {values, rows: lightcone.shape[0], columns: lightcone.shape[1]};
}

function decodeSlices(slices) {
  const [count, rows, columns] = slices.shape;
  return {
    count,
    rows,
    columns,
    brightness: decodeI16(slices.brightness_i16_le_base64, slices.brightness_quantization_mk),
    density: decodeI16(slices.density_i16_le_base64, slices.density_quantization),
    ionized: decodeI16(
      slices.ionized_fraction_i16_le_base64,
      slices.ionized_fraction_quantization,
    ),
    spinTemperatureLog10: decodeI16(
      slices.spin_temperature_log10_i16_le_base64,
      slices.temperature_log10_quantization,
    ),
    kineticTemperatureLog10: decodeI16(
      slices.kinetic_temperature_log10_i16_le_base64,
      slices.temperature_log10_quantization,
    ),
  };
}

async function loadRun(runId) {
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
    result.decodedSlices = decodeSlices(result.slices);
    state.previous = state.result;
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
  $("#run-identity").textContent = result.run_id;
  const summary = $("#parameter-summary"); summary.innerHTML = "";
  state.design.parameter_specs.forEach((specification) => {
    const item = document.createElement("div");
    item.innerHTML = `<small>${specification.label}</small><strong>${displayNumber(result.parameters[specification.name], specification.name)}</strong>`;
    summary.appendChild(item);
  });
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

function drawCurve(ctx, z, values, px, py, color, width, shadow = false) {
  ctx.beginPath();
  z.forEach((value, index) => ctx[index ? "lineTo" : "moveTo"](px(value), py(values[index])));
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (shadow) { ctx.shadowColor = "rgba(214,255,64,0.35)"; ctx.shadowBlur = 9; }
  ctx.stroke(); ctx.shadowBlur = 0;
}

function drawGlobal() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#global-chart"));
  const margin = {left: 64, right: 24, top: 26, bottom: 48};
  const z = state.result.global.redshift, values = state.result.global.brightness_mk;
  const combined = state.previous ? values.concat(state.previous.global.brightness_mk) : values;
  const zMin = Math.min(...z), zMax = Math.max(...z), [yMin, yMax] = niceBounds(combined, true);
  const px = (value) => margin.left + (zMax - value) / (zMax - zMin) * (width - margin.left - margin.right);
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  ctx.clearRect(0, 0, width, height); ctx.font = "10px SFMono-Regular, Consolas, monospace";
  for (let index = 0; index <= 5; index += 1) {
    const value = yMin + index * (yMax - yMin) / 5, y = py(value);
    ctx.strokeStyle = "rgba(217,231,235,0.09)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = "#6d787d"; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(value.toFixed(0), margin.left - 10, y);
  }
  for (let index = 0; index <= 5; index += 1) {
    const value = zMax - index * (zMax - zMin) / 5, x = px(value);
    ctx.fillStyle = "#6d787d"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(value.toFixed(0), x, height - margin.bottom + 12);
  }
  if (yMin < 0 && yMax > 0) {
    ctx.strokeStyle = "rgba(244,241,232,0.28)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(margin.left, py(0)); ctx.lineTo(width - margin.right, py(0)); ctx.stroke(); ctx.setLineDash([]);
  }
  if (state.previous) drawCurve(ctx, state.previous.global.redshift, state.previous.global.brightness_mk, px, py, "rgba(101,229,242,0.28)", 1.2);
  drawCurve(ctx, z, values, px, py, "#d6ff40", 2.2, true);
  const trough = values.indexOf(Math.min(...values));
  ctx.fillStyle = "#080c0e"; ctx.strokeStyle = "#d6ff40"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px(z[trough]), py(values[trough]), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#879196"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("REDSHIFT z  ·  COSMIC TIME →", (margin.left + width - margin.right) / 2, height - 5);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("δTb  [mK]", 0, 0); ctx.restore();
}

const temperatureStops = [[-200,[34,211,238]],[-120,[37,94,234]],[-40,[17,24,39]],[0,[5,5,5]],[15,[251,191,36]],[40,[239,68,68]]];
const densityStops = [[-0.9,[7,20,34]],[-0.4,[24,107,139]],[0,[217,231,235]],[1,[250,204,21]],[3,[249,115,22]],[10,[190,24,93]]];
const ionizationStops = [[0,[5,10,18]],[0.1,[20,45,73]],[0.35,[19,113,139]],[0.65,[101,229,242]],[0.9,[214,255,64]],[1,[255,249,194]]];
const thermalStops = [[-1,[7,15,33]],[0,[24,59,105]],[1,[58,134,180]],[2,[103,225,198]],[3,[250,204,21]],[4,[249,115,22]],[5,[255,238,210]]];
function colorFromStops(value, stops) {
  const clipped = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], value));
  let upper = 1; while (upper < stops.length && clipped > stops[upper][0]) upper += 1;
  upper = Math.min(upper, stops.length - 1);
  const [x0,c0] = stops[upper - 1], [x1,c1] = stops[upper], fraction = x1 === x0 ? 0 : (clipped - x0) / (x1 - x0);
  return c0.map((channel, index) => Math.round(channel + fraction * (c1[index] - channel)));
}
function temperatureColor(value) { return colorFromStops(value, temperatureStops); }
function densityColor(value) { return colorFromStops(value, densityStops); }
function ionizationColor(value) { return colorFromStops(value, ionizationStops); }
function thermalColor(log10Kelvin) { return colorFromStops(log10Kelvin, thermalStops); }

function formatKelvin(value) {
  if (value >= 1.0e4 || value < 0.1) return value.toExponential(1);
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function drawLightcone() {
  if (!state.result) return;
  const {context: ctx, width, height} = canvasContext($("#lightcone-chart"));
  const margin = {left: 62, right: 24, top: 18, bottom: 45};
  const {values, rows, columns} = state.result.decodedPlane;
  const imageCanvas = document.createElement("canvas"); imageCanvas.width = columns; imageCanvas.height = rows;
  const imageContext = imageCanvas.getContext("2d"), image = imageContext.createImageData(columns, rows);
  for (let index = 0; index < values.length; index += 1) {
    const color = temperatureColor(values[index]), offset = 4 * index;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
  }
  imageContext.putImageData(image, 0, 0); ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageCanvas, margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  ctx.strokeStyle = "rgba(217,231,235,0.24)"; ctx.strokeRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  ctx.font = "10px SFMono-Regular, Consolas, monospace"; ctx.fillStyle = "#879196";
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
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("REDSHIFT z  ·  COSMIC TIME →", (margin.left + width - margin.right) / 2, height - 4);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("TRANSVERSE DISTANCE  [cMpc]", 0, 0); ctx.restore();
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
  $("#slice-redshift-value").textContent = `z = ${state.result.slices.redshift[state.sliceIndex].toFixed(2)}`;
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

function drawSliceField(canvas, values, decoded, colorFunction) {
  const {context: ctx, width, height} = canvasContext(canvas);
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = decoded.columns; imageCanvas.height = decoded.rows;
  const imageContext = imageCanvas.getContext("2d"), image = imageContext.createImageData(decoded.columns, decoded.rows);
  const offset = state.sliceIndex * decoded.rows * decoded.columns;
  let minimum = Infinity, maximum = -Infinity;
  for (let pixel = 0; pixel < decoded.rows * decoded.columns; pixel += 1) {
    const value = values[offset + pixel], color = colorFunction(value), target = pixel * 4;
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
    image.data[target] = color[0]; image.data[target + 1] = color[1]; image.data[target + 2] = color[2]; image.data[target + 3] = 255;
  }
  imageContext.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageCanvas, 0, 0, width, height);
  ctx.strokeStyle = "rgba(217,231,235,0.25)"; ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  return [minimum, maximum];
}

function drawSlices() {
  if (!state.result || state.sliceIndex === null) return;
  const decoded = state.result.decodedSlices;
  const brightnessRange = drawSliceField($("#brightness-slice"), decoded.brightness, decoded, temperatureColor);
  const densityRange = drawSliceField($("#density-slice"), decoded.density, decoded, densityColor);
  const ionizationRange = drawSliceField($("#ionization-slice"), decoded.ionized, decoded, ionizationColor);
  const spinRange = drawSliceField($("#spin-temperature-slice"), decoded.spinTemperatureLog10, decoded, thermalColor);
  const kineticRange = drawSliceField($("#kinetic-temperature-slice"), decoded.kineticTemperatureLog10, decoded, thermalColor);
  $("#slice-brightness-range").textContent = `${brightnessRange[0].toFixed(1)} … ${brightnessRange[1].toFixed(1)} mK`;
  $("#slice-density-range").textContent = `${densityRange[0].toFixed(2)} … ${densityRange[1].toFixed(2)}`;
  $("#slice-ionization-range").textContent = `${ionizationRange[0].toFixed(3)} … ${ionizationRange[1].toFixed(3)}`;
  $("#slice-spin-temperature-range").textContent = `${formatKelvin(10 ** spinRange[0])} … ${formatKelvin(10 ** spinRange[1])} K`;
  $("#slice-kinetic-temperature-range").textContent = `${formatKelvin(10 ** kineticRange[0])} … ${formatKelvin(10 ** kineticRange[1])} K`;
}

function drawLFCurve(ctx, curve, px, py, color, width) {
  let drawing = false;
  ctx.beginPath();
  curve.muv.forEach((magnitude, index) => {
    const logPhi = curve.log10_phi[index];
    if (!Number.isFinite(magnitude) || !Number.isFinite(logPhi)) return;
    ctx[drawing ? "lineTo" : "moveTo"](px(magnitude), py(logPhi));
    drawing = true;
  });
  if (!drawing) return false;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  return true;
}

function drawLuminosityFunction() {
  if (!state.result || state.lfIndex === null) return;
  const {context: ctx, width, height} = canvasContext($("#lf-chart"));
  const margin = {left: 70, right: 25, top: 24, bottom: 54};
  const xMin = -24, xMax = -10, yMin = -20, yMax = 1;
  const px = (value) => margin.left + (value - xMin) / (xMax - xMin) * (width - margin.left - margin.right);
  const py = (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "10px SFMono-Regular, Consolas, monospace";
  for (let value = -20; value <= 0; value += 5) {
    const y = py(value);
    ctx.strokeStyle = "rgba(217,231,235,0.09)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
    ctx.fillStyle = "#6d787d"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(value.toFixed(0), margin.left - 10, y);
  }
  for (let value = xMin; value <= xMax; value += 2) {
    const x = px(value);
    ctx.strokeStyle = "rgba(217,231,235,0.045)";
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, height - margin.bottom); ctx.stroke();
    ctx.fillStyle = "#6d787d"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(value.toFixed(0), x, height - margin.bottom + 12);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom); ctx.clip();
  if (state.previous && state.previous.luminosity_function) {
    drawLFCurve(
      ctx,
      state.previous.luminosity_function.curves[state.lfIndex],
      px,
      py,
      "rgba(101,229,242,0.38)",
      1.4,
    );
  }
  const current = state.result.luminosity_function.curves[state.lfIndex];
  const drawn = drawLFCurve(ctx, current, px, py, "#d6ff40", 2.2);
  ctx.restore();
  ctx.strokeStyle = "rgba(217,231,235,0.24)";
  ctx.strokeRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);
  if (!drawn) {
    ctx.fillStyle = "#879196"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("该红移没有达到数值阈值的 LF 数据", (margin.left + width - margin.right) / 2, (margin.top + height - margin.bottom) / 2);
  }
  ctx.fillStyle = "#879196"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("ABSOLUTE UV MAGNITUDE  MUV", (margin.left + width - margin.right) / 2, height - 5);
  ctx.save(); ctx.translate(14, (margin.top + height - margin.bottom) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("log10 φ  [cMpc⁻³ mag⁻¹]", 0, 0); ctx.restore();
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

function drawAll() { drawGlobal(); drawLightcone(); drawSlices(); drawLuminosityFunction(); }
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
window.addEventListener("resize", () => { clearTimeout(window.__drawTimer); window.__drawTimer = setTimeout(drawAll, 120); });
initialize();
