// Dependency-free regression tests for the real localization and UI code.
// The small DOM/canvas adapter below tests behavior, not browser layout.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const staticRoot = fs.existsSync(path.join(root, "static")) ? path.join(root, "static") : root;
const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
const source = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");
const dictionary = fs.readFileSync(path.join(staticRoot, "i18n.js"), "utf8");

function harness({stored, blockedStorage = false} = {}) {
  const elements = new Map(), all = [], texts = [], storage = new Map();
  if (stored) storage.set("21cm-atlas-language", stored);
  let fetches = 0, intervalChanges = 0;
  function element() {
    const classes = new Set(), listeners = new Map(), attributes = new Map(), queries = new Map();
    const node = {
      dataset: {}, children: [], value: "0", max: "31", textContent: "", title: "",
      style: {setProperty() {}},
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(name, callback) { listeners.set(name, callback); },
      trigger(name) { return listeners.get(name)?.(); },
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      querySelector(selector) { if (!queries.has(selector)) queries.set(selector, element()); return queries.get(selector); },
      getBoundingClientRect: () => ({width: 800, height: 500}),
      getContext: () => new Proxy({}, {get(_, key) {
        if (key === "fillText") return (text) => texts.push(text);
        if (key === "createImageData") return (w, h) => ({data: new Uint8ClampedArray(w * h * 4)});
        return () => {};
      }}),
    };
    Object.defineProperty(node, "innerHTML", {set() { this.children = []; }});
    all.push(node);
    return node;
  }
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const node = element();
    for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) {
      node.setAttribute(attr[1], attr[2]);
      if (attr[1] === "id") elements.set(`#${attr[2]}`, node);
      if (attr[1].startsWith("data-")) node.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr[2];
    }
  }
  const document = {
    documentElement: {style: {setProperty() {}}}, body: element(), fullscreenElement: null,
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    querySelectorAll(selector) {
      if (selector === "#lf-redshift-options button") return this.querySelector("#lf-redshift-options").children;
      const attribute = selector.match(/^\[([^\]]+)\]$/);
      if (attribute) return all.filter((node) => node.getAttribute(attribute[1]) !== undefined);
      return [];
    },
    createElement: element, addEventListener() {},
  };
  const sandbox = {
    document, console, Float32Array, Uint8Array, Uint8ClampedArray, DataView, Blob, Response, DecompressionStream,
    atob, setTimeout, clearTimeout,
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error("Storage disabled"); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw new Error("Storage disabled"); storage.set(key, value); },
    },
    fetch: async () => { fetches += 1; throw new Error("Test network failure"); },
    devicePixelRatio: 1, matchMedia: () => ({matches: true}), addEventListener() {},
    requestAnimationFrame: (callback) => callback(),
    setInterval: () => { intervalChanges += 1; return 42; },
    clearInterval: () => { intervalChanges += 1; },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(dictionary, context);
  // Exercise production event setup and initial rendering without a network boot.
  vm.runInContext(source.replace(/initialize\(\);\s*$/, ""), context);
  return {
    context, document, storage, texts,
    run: (code) => vm.runInContext(code, context),
    get: (selector) => document.querySelector(selector),
    get fetches() { return fetches; },
    get intervalChanges() { return intervalChanges; },
  };
}

function seed(h) {
  h.run(`
    state.design = {n_exact_runs: 55, lf_observations: {sources: [], by_display_redshift: {}}};
    createParameter({name: "F_STAR10", label: "log10 f★,10", values: [-1.5, -1.3], default_index: 1});
    state.controls.get("F_STAR10").slider.value = "1";
    updateSliderVisual(state.controls.get("F_STAR10"));
    state.activeAstro = "F_STAR10";
    state.result = {
      run_id: "run_example", role: {kind: "astro_oat", parameter: "F_STAR10"},
      summary: {elapsed_seconds: 100},
      global: {redshift: [10, 8], brightness_mk: [-20, 10]},
      lightcone: {redshift: [10, 8], distance_mpc: [0, 250]},
      decodedPlane: {values: new Float32Array([1, 2, 3, 4]), rows: 2, columns: 2},
      slices: {redshift: [10, 8]},
      decodedSlices: {count: 2, rows: 2, columns: 2},
      ionization_history: {redshift: [10, 8], ionized_fraction: [0.1, 0.4], tau_e: 0.05},
      luminosity_function: {redshift: [6, 7, 8, 10], curves: Array.from({length: 4}, () => ({muv: [-20, -18], log10_phi: [-4, -3]}))},
    };
    for (const field of sliceFieldSpecs) state.result.decodedSlices[field.key] = new Float32Array([1, 2, 3, 4, 1, 2, 3, 4]);
    state.plReference = {...state.result, pl_id: "pl_example"};
    state.sliceIndex = 1;
    state.lfIndex = 2;
    state.sliceTimer = 99;
    state.requestSerial = 12;
    state.status = {kind: "ready", runId: state.result.run_id};
    configureLFControl();
  `);
}

test("all static and literal runtime translation keys exist in both languages", () => {
  const h = harness(), messages = h.context.AtlasI18n.messages;
  for (const [key, values] of Object.entries(messages)) {
    assert.equal(values.length, 2, key);
    assert.ok(values.every((v) => typeof v === "string" && v.length > 0), key);
    assert.deepEqual([...values[0].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), [...values[1].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), key);
  }
  for (const match of html.matchAll(/data-i18n(?:-aria-label|-title)?="([^"]+)"/g)) assert.ok(messages[match[1]], match[1]);
  for (const match of source.matchAll(/\bt\("([^"]+)"/g)) assert.ok(messages[match[1]], match[1]);
  assert.ok(html.indexOf('src="i18n.js') < html.indexOf('src="app.js'));
  assert.equal((html.match(/hii256-v20/g) || []).length, 3);
});

test("default English, saved Chinese, invalid preference and unavailable storage", () => {
  assert.equal(harness().document.documentElement.lang, "en");
  assert.equal(harness({stored: "zh"}).document.documentElement.lang, "zh-CN");
  assert.equal(harness({stored: "invalid"}).document.documentElement.lang, "en");
  const h = harness({blockedStorage: true});
  h.run('setLanguage("zh")');
  assert.equal(h.document.documentElement.lang, "zh-CN");
  assert.equal(h.get("#status-title").textContent, "正在加载预计算结果");
});

test("language buttons preserve parameter, redshift, model, playback and data", () => {
  const h = harness(); seed(h);
  const before = h.run("({result: state.result, pl: state.plReference, control: state.controls.get('F_STAR10')})");
  h.document.querySelectorAll("[data-language]").find((b) => b.dataset.language === "zh").trigger("click");
  assert.equal(h.document.documentElement.lang, "zh-CN");
  assert.equal(h.storage.get("21cm-atlas-language"), "zh");
  assert.equal(h.run("state.result"), before.result);
  assert.equal(h.run("state.plReference"), before.pl);
  assert.equal(h.run("state.controls.get('F_STAR10')"), before.control);
  assert.equal(h.run("state.parameters.F_STAR10"), -1.3);
  assert.equal(h.run("state.activeAstro"), "F_STAR10");
  assert.equal(h.run("state.sliceIndex"), 1);
  assert.equal(h.run("state.lfIndex"), 2);
  assert.equal(h.run("state.sliceTimer"), 99);
  assert.equal(h.run("state.requestSerial"), 12);
  assert.equal(h.fetches, 0);
  assert.equal(h.intervalChanges, 0);
  assert.equal(h.get("#slice-play").textContent, "暂停");
  assert.match(before.control.wrapper.title, /恒星形成效率/);
  assert.match(h.get("#status-message").textContent, /单参数扫描/);
  assert.equal(h.get("#lf-redshift-options").children[2].getAttribute("aria-label"), "显示红移 8 的紫外光度函数");
  for (const key of ["redshiftAxis", "distanceAxis", "ionizationAxis", "magnitudeAxis"]) assert.ok(h.texts.includes(h.context.AtlasI18n.t(key)), key);
  h.run('setLanguage("en")');
  assert.equal(h.get("#slice-play").textContent, "Pause");
  assert.match(h.get("#status-message").textContent, /one-at-a-time/);
  assert.ok(h.texts.includes("Absolute UV magnitude, M_UV"));
  assert.equal(h.fetches, 0);
});

test("loading, unavailable and translated errors do not become ready on switch", () => {
  const h = harness(); seed(h);
  h.run('state.status = {kind: "loading", runId: "run_next"}; setLanguage("zh")');
  assert.equal(h.get("#status-title").textContent, "正在切换精确模拟结果");
  h.run('state.status = {kind: "error", error: new AtlasError("fetchError", {path: "web_data/example.json", status: 404})}; setLanguage("zh")');
  assert.match(h.get("#status-message").textContent, /无法读取.*404/);
  h.run('setLanguage("en")');
  assert.match(h.get("#status-message").textContent, /Failed to read.*404/);
  h.run('showUnavailableRun("run_unavailable"); setLanguage("zh")');
  assert.equal(h.get("#status-title").textContent, "该高分辨率参数点不可用");
  assert.equal(h.run("state.result"), null);
  assert.equal(h.run("state.plReference"), null);
  assert.equal(h.get("#slice-play").textContent, "播放");
  assert.equal(h.fetches, 0);
});

test("manifest fetch failure and fullscreen state remain bilingual", async () => {
  const h = harness({stored: "zh"});
  await h.run("initialize()");
  assert.equal(h.get("#status-title").textContent, "结果库不可用");
  assert.equal(h.get("#data-state span").textContent, "结果不可用");
  h.document.fullscreenElement = {};
  h.run('setLanguage("en")');
  assert.equal(h.get("#status-title").textContent, "Result library not available");
  assert.equal(h.get("#main-fullscreen").textContent, "Exit fullscreen");
  h.run('setLanguage("zh")');
  assert.equal(h.get("#main-fullscreen").textContent, "退出全屏");
  assert.equal(h.fetches, 1);
});

function seedDesign(h) {
  h.context.manifest = JSON.parse(fs.readFileSync(path.join(staticRoot, "web_data/index.json"), "utf8"));
  h.run(`state.design = manifest; state.design.parameter_specs.forEach(createParameter);
    for (const control of state.controls.values()) resetOne(control);`);
}

function select(h, name, index) {
  h.run(`state.controls.get(${JSON.stringify(name)}).slider.value = ${index};
    updateSliderVisual(state.controls.get(${JSON.stringify(name)}));`);
  return h.run(`resolveRunId(${JSON.stringify(name)})`);
}

function useStoredFiles(h) {
  const requests = [];
  h.context.fetch = async (url) => {
    requests.push(url);
    return new Response(fs.readFileSync(path.join(staticRoot, url.split("?")[0])));
  };
  // Data tests exercise the actual loader and decoder; drawing is covered above.
  h.run("drawAll = () => {};");
  return requests;
}

test("adding KP=0 preserves every existing grid and astrophysical scan mapping", () => {
  const h = harness(); seedDesign(h);
  const design = h.context.manifest;
  assert.equal(h.run('state.parameters.KP_h_Mpc'), 1);
  assert.equal(h.run('state.controls.get("KP_h_Mpc").specification.values.length'), 6);
  for (let kp = 0; kp < 5; kp += 1) {
    select(h, "KP_h_Mpc", kp + 1);
    for (let ms = 0; ms < 5; ms += 1) assert.equal(select(h, "MS", ms), design.mappings.kp_ms_grid[kp][ms]);
  }
  select(h, "KP_h_Mpc", 0);
  for (let ms = 0; ms < 5; ms += 1) assert.equal(select(h, "MS", ms), design.baseline_run_id);
  for (const [name, runIds] of Object.entries(design.mappings.astro_oat)) {
    runIds.forEach((id, index) => {
      assert.equal(select(h, name, index), id);
      assert.equal(h.run("state.parameters.KP_h_Mpc"), 1);
    });
  }
});

test("KP=0 uses actual PL data for all fields and MS never reloads or changes it", async () => {
  const h = harness(); seedDesign(h); const requests = useStoredFiles(h);
  select(h, "KP_h_Mpc", 0);
  await h.run('loadRun(resolveRunId("KP_h_Mpc"))');
  assert.equal(h.run('state.status.kind'), "ready");
  assert.equal(h.run('state.result.role.kind'), "pl");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.startsWith("web_data/pl/")));
  for (const field of ["global", "luminosity_function", "ionization_history", "decodedSlices", "summary"]) {
    assert.equal(h.run(`state.result.${field}`), h.run(`state.plReference.${field}`), field);
  }
  assert.equal(h.run('state.result.decodedPlane.columns'), 32);
  assert.equal(h.run(`state.result.decodedPlane.values[19 * 32 + 7]`), h.run(`state.plReference.decodedSlices.brightness[7 * 256 * 256 + 19 * 256 + 128]`));
  assert.equal(h.run('state.result.summary.trough_brightness_mk'), -80.14349365234375);
  const before = h.run('state.result');
  h.run('state.sliceIndex = 13; state.lfIndex = 1; state.sliceTimer = 99;');
  for (let ms = 0; ms < 5; ms += 1) {
    select(h, "MS", ms);
    await h.run('loadRun(resolveRunId("MS"))');
    assert.equal(h.run('state.result'), before);
    assert.equal(h.run('state.result.parameters.MS'), h.context.manifest.parameter_specs.find((s) => s.name === "MS").values[ms]);
    assert.equal(requests.length, 2);
    assert.equal(h.run('state.sliceIndex'), 13);
    assert.equal(h.run('state.lfIndex'), 1);
    assert.equal(h.run('state.sliceTimer'), 99);
  }
  h.run('setLanguage("zh")');
  assert.match(h.get('#metric-ms').textContent, /不影响结果/);
  assert.match(h.get('#parameter-mode-note').textContent, /任意拖动 ms/);
  // The excluded BPL KP=1, MS=4 point remains excluded; zero bypasses it.
  const excluded = select(h, "KP_h_Mpc", 1);
  await h.run(`loadRun(${JSON.stringify(excluded)})`);
  assert.equal(h.run('state.status.kind'), 'unavailable');
  select(h, "KP_h_Mpc", 0);
  await h.run('loadRun(resolveRunId("KP_h_Mpc"))');
  assert.equal(h.run('state.result.role.kind'), 'pl');
  assert.equal(requests.length, 2);
  // Reset returns to the original BPL baseline and its original default indices.
  await h.run('resetControls()');
  assert.equal(h.run('state.result.run_id'), h.context.manifest.baseline_run_id);
  assert.equal(h.run('state.parameters.KP_h_Mpc'), 1);
  assert.equal(h.run('state.parameters.MS'), 1.5);
  assert.notEqual(h.run('state.result.global'), h.run('state.plReference.global'));
});

test("rapid PL/MS/BPL switches keep the final selection and share a pending PL request", async () => {
  const h = harness(); seedDesign(h); const requests = useStoredFiles(h);
  const storedFetch = h.context.fetch;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  h.context.fetch = async (url) => {
    if (url.includes('/pl/') && url.includes('.json')) await gate;
    return storedFetch(url);
  };
  select(h, 'KP_h_Mpc', 0);
  const first = h.run('loadRun(resolveRunId("KP_h_Mpc"))');
  select(h, 'MS', 4);
  const second = h.run('loadRun(resolveRunId("MS"))');
  const finalId = select(h, 'KP_h_Mpc', 2);
  const last = h.run(`loadRun(${JSON.stringify(finalId)})`);
  release();
  await Promise.all([first, second, last]);
  assert.equal(h.run('state.status.kind'), 'ready');
  assert.equal(h.run('state.result.run_id'), finalId);
  assert.equal(h.run('state.result.parameters.KP_h_Mpc'), 3);
  assert.equal(h.run('state.result.parameters.MS'), 4);
  assert.equal(requests.filter((url) => url.includes('/pl/') && url.includes('.json')).length, 1);
});
