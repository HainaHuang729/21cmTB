const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const project = path.resolve(__dirname, "..");
const root = fs.existsSync(path.join(project, "static")) ? path.join(project, "static") : project;
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("park-pl-comparison.html");
const data = JSON.parse(read("web_data/park_pl_comparison/index.json"));

test("only the combined Park/PL entry is exposed on the home page", () => {
  const home = read("index.html");
  assert.equal((home.match(/href="park-pl-comparison.html"/g) || []).length, 1);
  assert.ok(home.includes('data-i18n="parkPLComparison"'));
  assert.ok(read("i18n.js").includes("parkPLComparison:"));
  for (const legacy of ["park2019-lf.html", "pl-muv20-lf.html"]) {
    assert.ok(!home.includes(`href="${legacy}"`));
    assert.ok(!html.includes(`href="${legacy}"`));
  }
});

test("legacy bookmarks lead to the combined display without duplicating figures", () => {
  for (const file of ["park2019-lf.html", "pl-muv20-lf.html"]) {
    const redirect = read(file);
    assert.match(redirect, /http-equiv="refresh" content="0; url=park-pl-comparison.html"/);
    assert.match(redirect, /rel="canonical" href="park-pl-comparison.html"/);
    assert.match(redirect, /<a href="park-pl-comparison.html">/);
    assert.ok(!redirect.includes("<img"));
    assert.ok(!redirect.includes("<table"));
  }
});

test("the single combined figure is the unchanged latest Park/PL overlay", () => {
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  const file = "web_data/park_pl_comparison/park_vs_pl_muv20.png";
  const image = fs.readFileSync(path.join(root, file));
  assert.equal(crypto.createHash("sha256").update(image).digest("hex"), data.figure_sha256);
  assert.equal(data.figure_sha256, "208596455ee68ad2758413b923f818bf84c68e8e5bda6266ef88028ccd1edc06");
  assert.ok(html.includes(`${file}?v=${data.figure_sha256.slice(0, 12)}`));
  assert.equal(image.readUInt32BE(16), 2080);
  assert.equal(image.readUInt32BE(20), 2080);
  for (const name of ["Park", "PL"]) {
    assert.equal(data[name].steps_per_ensemble, 15000);
    assert.equal(data[name].walkers, 32);
    assert.equal(data[name].sample_count, 960000);
    assert.equal(data[name].diagnostic_gate_passed, false);
    assert.equal(data[name].diagnostics.passed, false);
  }
  assert.deepEqual(Object.keys(data.Park.observations), ["6", "7", "8", "10"]);
  assert.deepEqual(Object.keys(data.PL.observations), ["6", "7", "8", "9", "10"]);
  assert.equal(Object.values(data.Park.observations).flat().length, 27);
  assert.equal(Object.values(data.PL.observations).flat().length, 34);
  assert.match(html, /均尚未通过收敛检查/);
});

test("parameter summary matches all eight rows of the saved comparison", () => {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...tbody.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>[^<]+<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 8);
  for (const [i, row] of rows.entries()) {
    const name = i < 4 ? "Park" : "PL", dimension = i % 4;
    const key = ["F_STAR10", "t_STAR", "ALPHA_STAR", "M_TURN"][dimension];
    assert.equal(row[1], name);
    assert.equal(row[2], data[name].best_astro[key].toFixed(4));
    assert.equal(row[3], data[name].quantiles[1][dimension].toFixed(4));
    assert.equal(row[4], `${data[name].quantiles[0][dimension].toFixed(4)} – ${data[name].quantiles[2][dimension].toFixed(4)}`);
  }
});

test("all combined-page asset and section links resolve", () => {
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const [file, fragment] = match[1].split("?")[0].split("#");
    const target = file ? readIfHTML(file) : html;
    if (fragment) assert.ok(target.includes(`id="${fragment}"`), match[1]);
  }
  function readIfHTML(file) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
    return file.endsWith(".html") ? read(file) : "";
  }
});
