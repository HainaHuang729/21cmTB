// Dependency-free regression tests for the real localization and UI code.
// The small DOM/canvas adapter below tests behavior, not browser layout.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const staticRoot = fs.existsSync(path.join(root, "static")) ? path.join(root, "static") : root;
const simulationRoot = process.env.ATLAS_DATA_ROOT || (staticRoot === root ? root : path.join(root, "site_v11"));
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
      removeAttribute(name) { attributes.delete(name); },
      addEventListener(name, callback) { listeners.set(name, callback); },
      trigger(name) { return listeners.get(name)?.(); },
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      querySelector(selector) { if (!queries.has(selector)) queries.set(selector, element()); return queries.get(selector); },
      querySelectorAll(selector) { return selector === "button" ? this.children : []; },
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
    getElementById(id) { return this.querySelector(`#${id}`); },
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    querySelectorAll(selector) {
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
    state.sliceTimer = 99;
    state.requestSerial = 12;
    state.status = {kind: "ready", runId: state.result.run_id};
  `);
}

test("all static and literal runtime translation keys exist in both languages", () => {
  const h = harness(), messages = h.context.AtlasI18n.messages;
  for (const [key, values] of Object.entries(messages)) {
    assert.equal(values.length, 2, key);
    assert.ok(values.every((v) => typeof v === "string" && v.length > 0), key);
    assert.deepEqual([...values[0].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), [...values[1].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), key);
  }
  for (const match of html.matchAll(/data-i18n(?:-aria-label|-title|-alt)?="([^"]+)"/g)) assert.ok(messages[match[1]], match[1]);
  for (const match of source.matchAll(/\bt\("([^"]+)"/g)) assert.ok(messages[match[1]], match[1]);
  assert.ok(html.indexOf('src="i18n.js') < html.indexOf('src="app.js'));
  assert.equal((html.match(/hii256-v23/g) || []).length, 4);
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
  assert.equal(h.run("state.sliceTimer"), 99);
  assert.equal(h.run("state.requestSerial"), 12);
  assert.equal(h.fetches, 0);
  assert.equal(h.intervalChanges, 0);
  assert.equal(h.get("#slice-play").textContent, "暂停");
  assert.match(before.control.wrapper.title, /恒星形成效率/);
  assert.match(h.get("#status-message").textContent, /单参数扫描/);
  for (const z of [6, 7, 8, 10]) {
    assert.equal(h.get(`#lf-chart-${z}`).getAttribute("aria-label"), `显示红移 ${z} 的紫外光度函数`);
    assert.ok(h.texts.includes(`z = ${z}`));
  }
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
  h.context.manifest = JSON.parse(fs.readFileSync(path.join(simulationRoot, "web_data/index.json"), "utf8"));
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
    const file = url.split("?")[0];
    const base = /^web_data\/(index\.json|runs\/|pl\/)/.test(file) ? simulationRoot : staticRoot;
    return new Response(fs.readFileSync(path.join(base, file)));
  };
  // Data tests exercise the actual loader and decoder; drawing is covered above.
  h.run("drawAll = () => {};");
  return requests;
}

function moveDock(h, name, value) {
  h.context.dockChange = {name, value};
  h.run(`{
    const control = state.controls.get(dockChange.name);
    const index = control.specification.values.indexOf(dockChange.value);
    if (index < 0) throw new Error("Unknown test parameter value");
    control.slider.value = String(index);
    control.slider.trigger("input");
  }`);
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
  select(h, "KP_h_Mpc", 1);
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
  h.run('state.sliceIndex = 13; state.sliceTimer = 99;');
  for (let ms = 0; ms < 5; ms += 1) {
    select(h, "MS", ms);
    await h.run('loadRun(resolveRunId("MS"))');
    assert.equal(h.run('state.result'), before);
    assert.equal(h.run('state.result.parameters.MS'), h.context.manifest.parameter_specs.find((s) => s.name === "MS").values[ms]);
    assert.equal(requests.length, 2);
    assert.equal(h.run('state.sliceIndex'), 13);
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

test("KP=0 stays selected across all astrophysical scans and resolves the matching PL", async () => {
  const h = harness(); seedDesign(h); useStoredFiles(h);
  // Use real stored metadata for every scan point, but avoid inflating all 32
  // references in a mapping test. Real full-size decoding is exercised above.
  h.run(`decodeSlices = async () => ({count: 1, rows: 1, columns: 1, brightness: new Float32Array([0])});`);
  select(h, "KP_h_Mpc", 0);
  const design = h.context.manifest;
  for (const [name, runIds] of Object.entries(design.mappings.astro_oat)) {
    for (let index = 0; index < runIds.length; index += 1) {
      const id = select(h, name, index);
      assert.equal(h.run("state.parameters.KP_h_Mpc"), 0, `${name}/${index}`);
      assert.equal(id, runIds[index]);
      await h.run(`loadRun(${JSON.stringify(id)})`);
      if (design.unavailable_run_ids.includes(id)) {
        assert.equal(h.run("state.status.kind"), "unavailable");
        assert.equal(h.run("state.result"), null);
        continue;
      }
      const reference = design.pl_inventory.find((entry) => entry.source_run_ids.includes(id));
      assert.equal(h.run("state.status.kind"), "ready", `${name}/${index}`);
      assert.equal(h.run("state.result.pl_id"), reference.pl_id);
      assert.equal(h.run("state.result.role.kind"), "pl");
      assert.ok(h.run("[...astroNames].every(name => state.result.astro_parameters[name] === state.parameters[name])"));
      const before = h.run("state.result");
      select(h, "MS", 4);
      await h.run('loadRun(resolveRunId("MS"))');
      assert.equal(h.run("state.result"), before);
      assert.equal(h.run("state.parameters.KP_h_Mpc"), 0);
      assert.equal(h.run("state.activeAstro"), name);
    }
  }
  // Entering PL from an OAT BPL result also retains the stellar selection.
  select(h, "KP_h_Mpc", 1);
  const id = select(h, "F_STAR10", 0);
  assert.equal(select(h, "KP_h_Mpc", 0), id);
  await h.run(`loadRun(${JSON.stringify(id)})`);
  assert.equal(h.run("state.parameters.F_STAR10"), design.parameter_specs.find(s => s.name === "F_STAR10").values[0]);
  assert.equal(h.run("state.result.astro_parameters.F_STAR10"), h.run("state.parameters.F_STAR10"));
});

test("late PL astrophysical requests cannot overwrite a newer PL selection", async () => {
  const h = harness(); seedDesign(h); const requests = useStoredFiles(h);
  h.run(`decodeSlices = async () => ({count: 1, rows: 1, columns: 1, brightness: new Float32Array([0])});`);
  const storedFetch = h.context.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  select(h, "KP_h_Mpc", 0);
  const firstId = select(h, "F_STAR10", 0);
  const firstPL = h.context.manifest.pl_inventory.find(entry => entry.source_run_ids.includes(firstId)).pl_id;
  h.context.fetch = async url => {
    if (url.includes(firstPL)) await gate;
    return storedFetch(url);
  };
  const first = h.run(`loadRun(${JSON.stringify(firstId)})`);
  const lastId = select(h, "F_STAR10", 4);
  await h.run(`loadRun(${JSON.stringify(lastId)})`);
  const finalResult = h.run("state.result");
  release(); await first;
  assert.equal(h.run("state.result"), finalResult);
  assert.equal(h.run("state.parameters.KP_h_Mpc"), 0);
  assert.equal(h.run("state.status.kind"), "ready");
  assert.equal(requests.length, 2);
});

test("all four LF panels pair model, PL and observations by redshift with shared limits", () => {
  const h = harness(); seed(h);
  h.run(`
    state.plReference = {...state.plReference, luminosity_function: {
      redshift: [10, 8, 7, 6], curves: [10, 8, 7, 6].map(z => ({muv: [-20], log10_phi: [-z]}))
    }};
    state.design.lf_observations.by_display_redshift = Object.fromEntries(
      [6, 7, 8, 10].map(z => [String(z), [{redshift: z, phi: 1e-5, sigma_plus: 2e-6, sigma_minus: 1e-6}]])
    );
    var panelsDrawn = [];
    drawLFPanel = (panel, bounds) => panelsDrawn.push({panel, bounds});
    drawLuminosityFunction();
  `);
  const results = h.run("panelsDrawn");
  assert.deepEqual(Array.from(results, entry => entry.panel.redshift), [6, 7, 8, 10]);
  for (const {panel, bounds} of results) {
    assert.equal(panel.plCurve.log10_phi[0], -panel.redshift);
    assert.equal(panel.observations[0].redshift, panel.redshift);
    assert.equal(bounds, results[0].bounds);
    assert.ok(bounds[0] <= -10 && bounds[1] >= -1);
  }
  assert.equal((html.match(/id="lf-chart-(6|7|8|10)"/g) || []).length, 4);
  assert.ok(!html.includes("lf-redshift-options"));
});

test("all 25 corners follow dock KP/MS with provenance, no substitute for PL, and bilingual copy", async () => {
  const h = harness(); seedDesign(h); const requests = useStoredFiles(h);
  const mcmcSource = fs.readFileSync(path.join(staticRoot, "mcmc.js"), "utf8");
  vm.runInContext(mcmcSource, h.context);
  for (const match of mcmcSource.matchAll(/\bt\("([^"]+)"/g)) assert.ok(h.context.AtlasI18n.messages[match[1]], match[1]);
  await h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  h.run("loadRun = async (runId) => { state.lastRequestedRun = runId; };");
  assert.equal(h.run("state.mcmc.status"), "ready");
  assert.equal(requests.length, 3);
  const archive = h.run("state.mcmc.catalog");
  for (const [file, digest] of Object.entries(archive.files_sha256)) {
    assert.equal(require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(staticRoot, file))).digest("hex"), digest, file);
  }
  assert.deepEqual(Array.from(archive.categories.lf_only.likelihood), ["LF"]);
  assert.equal(archive.categories.lf_only.dimensions, 4);
  assert.equal(archive.categories.joint.dimensions, 7);
  assert.equal(archive.joint.status, "PRELIMINARY_NOT_CONVERGED");
  assert.equal(archive.joint.lf_points, archive.categories.lf_only.lf_points);
  assert.equal(h.get("#mcmc-joint-rows").textContent, "20,480");
  assert.equal(h.get("#mcmc-joint-date").textContent, "2026-09-14");
  const jointPath = h.get("#mcmc-joint-image").getAttribute("src");
  assert.ok(jointPath.endsWith(`?v=${archive.joint.figure_sha256["corner_eta.png"].slice(0, 12)}`));
  assert.equal(h.get("#mcmc-joint-open").getAttribute("href"), jointPath);
  assert.equal(archive.figure_style, "corner-shared-v2");
  const audits = JSON.parse(fs.readFileSync(path.join(staticRoot, "web_data/mcmc/corner_layout_audit.json")));
  assert.equal(Object.keys(audits).length, 27);
  for (const [file, audit] of Object.entries(audits)) {
    assert.ok(audit.passed, file);
    assert.equal(audit.style, archive.figure_style);
    assert.ok(audit.checked_text_items >= 25);
    assert.deepEqual(audit.clipped_text, []);
    assert.deepEqual(audit.text_overlaps, []);
    assert.deepEqual(audit.text_on_plot, []);
    assert.equal(audit.smoothing, false);
    assert.equal(audit.bins_1d, 35);
    assert.equal(audit.bins_2d, 32);
    const png = fs.readFileSync(path.join(staticRoot, "web_data", file));
    assert.equal(png.readUInt32BE(16), audit.pixel_size[0]);
    assert.equal(png.readUInt32BE(20), audit.pixel_size[1]);
  }
  assert.ok(!html.includes('id="mcmc-lf-select"'));
  assert.equal(archive.lf.models.length, 25);
  assert.equal(new Set(archive.lf.models.map(m => `${m.KP_h_Mpc}/${m.MS}`)).size, 25);
  assert.equal(archive.lf.models.filter(m => m.diagnostic_gate_passed).length, 6);
  assert.equal(archive.lf.models.filter(m => m.steps_per_ensemble === 4000).length, 1);
  assert.match(h.get("#mcmc-load-status").textContent, /2026-09-15/);
  assert.match(h.get("#mcmc-lf-grid-count").textContent, /5 × 5.*25/);
  for (let index = 0; index < 25; index += 1) {
    const model = archive.lf.models[index];
    moveDock(h, "KP_h_Mpc", model.KP_h_Mpc);
    moveDock(h, "MS", model.MS);
    assert.equal(h.run("state.mcmc.selectedLF"), index);
    assert.equal(h.run("state.parameters.KP_h_Mpc"), model.KP_h_Mpc);
    assert.equal(h.run("state.parameters.MS"), model.MS);
    assert.equal(h.get("#mcmc-lf-open").hidden, false);
    assert.equal(h.get("#mcmc-lf-empty").hidden, true);
    assert.equal(model.sample_count, model.steps_per_ensemble * model.walkers * 2);
    assert.equal(model.figure_style, archive.figure_style);
    assert.equal(model.figure_sources.length, 2);
    assert.equal(audits[`lf_corner/${model.file}`].samples_per_ensemble.reduce((a, b) => a + b), model.sample_count);
    for (const source of model.figure_sources) {
      assert.deepEqual(Array.from(source.retained_shape), [model.steps_per_ensemble, 32, 4]);
      assert.match(source.retained_values_sha256, /^[0-9a-f]{64}$/);
      assert.match(source.file_sha256, /^[0-9a-f]{64}$/);
    }
    const imagePath = h.get("#mcmc-lf-image").getAttribute("src");
    assert.ok(fs.existsSync(path.join(staticRoot, imagePath.split("?")[0])));
    assert.ok(imagePath.endsWith(`?v=${model.figure_sha256.slice(0, 12)}`));
    assert.equal(h.get("#mcmc-lf-open").getAttribute("href"), imagePath);
    assert.equal(h.get("#mcmc-lf-status").textContent, h.context.AtlasI18n.t(model.diagnostic_gate_passed ? "mcmcLFGatePassed" : "mcmcLFGateNotPassed"));
    assert.ok(h.get("#mcmc-lf-caption").textContent.includes(`${model.chain_source}_${model.source_model_index}`));
    const original = JSON.parse(fs.readFileSync(path.join(staticRoot, "web_data/lf_corner", model.source_manifest)));
    const sourceModel = original.models.find(m => m.model_index === model.source_model_index);
    assert.equal(original.chain_source, model.chain_source);
    assert.equal(sourceModel.KP_h_Mpc, model.KP_h_Mpc);
    assert.equal(sourceModel.MS, model.MS);
    assert.equal(sourceModel.sample_count, model.sample_count);
  }
  const selectedImage = h.get("#mcmc-lf-image").getAttribute("src");
  h.run('setLanguage("zh")');
  assert.equal(h.get("#mcmc-lf-image").getAttribute("src"), selectedImage);
  assert.match(h.get("#mcmc-lf-image").getAttribute("alt"), /四参数/);
  assert.match(h.get("#mcmc-lf-caption").textContent, /探索性快照/);
  moveDock(h, "KP_h_Mpc", 0);
  moveDock(h, "F_STAR10", h.run('state.controls.get("F_STAR10").specification.values[0]'));
  assert.equal(h.run("state.parameters.KP_h_Mpc"), 0);
  assert.equal(h.run("state.mcmc.selectedLF"), -1);
  assert.equal(h.get("#mcmc-lf-open").hidden, true);
  assert.equal(h.get("#mcmc-lf-empty").hidden, false);
  assert.equal(h.get("#mcmc-lf-image").getAttribute("src"), undefined);
  assert.equal(h.get("#mcmc-lf-open").getAttribute("href"), undefined);
  assert.match(h.get("#mcmc-lf-empty").textContent, /没有 kₚ = 0/);
  assert.equal(h.get("#mcmc-lf-rows").textContent, "—");
  moveDock(h, "MS", 2);
  assert.equal(h.run("state.mcmc.selectedLF"), -1);
  moveDock(h, "KP_h_Mpc", 20);
  assert.equal(h.run("state.mcmc.selectedLF"), 16);
  assert.equal(h.get("#mcmc-lf-open").hidden, false);
  assert.equal(h.get("#mcmc-joint-image").getAttribute("src"), jointPath);
  // BPL stellar scans reset the cosmology: follow the actual dock, not the old corner.
  moveDock(h, "F_STAR10", h.run('state.controls.get("F_STAR10").specification.values[0]'));
  assert.equal(h.run("state.mcmc.selectedLF"), 0);
  moveDock(h, "KP_h_Mpc", 30); moveDock(h, "MS", 4);
  h.run("resetControls()");
  assert.equal(h.run("state.mcmc.selectedLF"), 0);
  assert.equal(requests.length, 3);
  assert.ok(html.indexOf('id="mcmc-section"') > html.indexOf('class="slice-model-row pl-slice-row"'));
});

test("MCMC fetch failure is isolated and retryable", async () => {
  const h = harness(); seed(h);
  vm.runInContext(fs.readFileSync(path.join(staticRoot, "mcmc.js"), "utf8"), h.context);
  const before = h.run("state.result");
  await h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  assert.equal(h.run("state.mcmc.status"), "error");
  assert.equal(h.get("#mcmc-lf-open").hidden, true);
  assert.equal(h.run("state.result"), before);
  h.run('setLanguage("zh")');
  assert.match(h.get("#mcmc-load-status").textContent, /加载失败/);
  useStoredFiles(h);
  await h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  assert.equal(h.run("state.mcmc.status"), "ready");
  assert.equal(h.get("#mcmc-lf-empty").hidden, false); // No cosmology controls in this fixture.
});

test("an incomplete LF grid is rejected without changing simulation results", async () => {
  const h = harness(); seed(h); useStoredFiles(h);
  const before = h.run("state.result");
  const read = h.context.fetch;
  h.context.fetch = async url => {
    const response = await read(url);
    if (!url.startsWith("web_data/lf_corner/index.json")) return response;
    const index = await response.json();
    index.models.pop();
    return new Response(JSON.stringify(index));
  };
  vm.runInContext(fs.readFileSync(path.join(staticRoot, "mcmc.js"), "utf8"), h.context);
  await h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  assert.equal(h.run("state.mcmc.status"), "error");
  assert.equal(h.get("#mcmc-lf-open").hidden, true);
  assert.equal(h.run("state.result"), before);
});

test("corner selection uses the latest dock values when manifests arrive late", async () => {
  const h = harness(); seedDesign(h); useStoredFiles(h);
  h.run("loadRun = async () => {};");
  const read = h.context.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  h.context.fetch = async url => {
    const response = await read(url);
    if (url.startsWith("web_data/lf_corner/index.json")) await gate;
    return response;
  };
  vm.runInContext(fs.readFileSync(path.join(staticRoot, "mcmc.js"), "utf8"), h.context);
  const pending = h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  moveDock(h, "KP_h_Mpc", 30); moveDock(h, "MS", 4);
  assert.equal(h.get("#mcmc-lf-open").hidden, true);
  release(); await pending;
  assert.equal(h.run("state.mcmc.selectedLF"), 24);
  assert.match(h.get("#mcmc-lf-image").getAttribute("src"), /kp30_ms4/);
});

test("archive ready before parameter controls waits instead of choosing a default corner", async () => {
  const h = harness(); useStoredFiles(h);
  vm.runInContext(fs.readFileSync(path.join(staticRoot, "mcmc.js"), "utf8"), h.context);
  await h.run("AtlasMCMC.initialize(state.mcmc, state.parameters)");
  assert.equal(h.run("state.mcmc.selectedLF"), -1);
  assert.match(h.get("#mcmc-lf-empty").textContent, /Waiting for/);
  seedDesign(h); h.run("renderLocalizedUI()");
  assert.equal(h.run("state.mcmc.selectedLF"), 0);
  assert.equal(h.get("#mcmc-lf-empty").hidden, true);
});
