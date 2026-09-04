"use strict";

const state = {
  design: null,
  controls: new Map(),
  result: null,
  previous: null,
  activeAstro: null,
  requestSerial: 0,
};

const $ = (selector) => document.querySelector(selector);
const astroNames = new Set(["F_STAR10", "ALPHA_STAR", "F_ESC10", "ALPHA_ESC", "M_TURN", "t_STAR", "L_X", "NU_X_THRESH"]);

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

function decodePlane(lightcone) {
  const binary = atob(lightcone.brightness_i16_le_base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer), values = new Float32Array(binary.length / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getInt16(index * 2, true) * lightcone.quantization_mk;
  return {values, rows: lightcone.shape[0], columns: lightcone.shape[1]};
}

async function loadRun(runId) {
  const serial = ++state.requestSerial;
  $("#status-card").classList.add("active");
  $("#status-title").textContent = "切换精确模拟";
  $("#status-message").textContent = `${runId} · 正在读取预计算文件`;
  $("#run-badge").textContent = "LOADING";
  $("#run-badge").className = "run-badge running";
  try {
    const result = await fetchJSON(`web_data/runs/${runId}.json`);
    if (serial !== state.requestSerial) return;
    result.decodedPlane = decodePlane(result.lightcone);
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

const colorStops = [[-200,[34,211,238]],[-120,[37,94,234]],[-40,[17,24,39]],[0,[5,5,5]],[15,[251,191,36]],[40,[239,68,68]]];
function temperatureColor(value) {
  const clipped = Math.max(colorStops[0][0], Math.min(colorStops[colorStops.length - 1][0], value));
  let upper = 1; while (upper < colorStops.length && clipped > colorStops[upper][0]) upper += 1;
  upper = Math.min(upper, colorStops.length - 1);
  const [x0,c0] = colorStops[upper - 1], [x1,c1] = colorStops[upper], fraction = x1 === x0 ? 0 : (clipped - x0) / (x1 - x0);
  return c0.map((channel, index) => Math.round(channel + fraction * (c1[index] - channel)));
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

function drawAll() { drawGlobal(); drawLightcone(); }
function resetControls() {
  state.activeAstro = null;
  for (const control of state.controls.values()) resetOne(control);
  loadRun(state.design.baseline_run_id);
}

async function initialize() {
  try {
    state.design = await fetchJSON("web_data/index.json");
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
window.addEventListener("resize", () => { clearTimeout(window.__drawTimer); window.__drawTimer = setTimeout(drawAll, 120); });
initialize();
