const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ms-corner.html'), 'utf8');

function harness(stored = null, search = '', blocked = false) {
  const nodes = [...html.matchAll(/<[a-z][^>]*>/gi)].map(match => {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(v => [v[1], v[2]]));
    const node = {dataset: {}, textContent: '', listeners: {},
      getAttribute: k => attrs[k], setAttribute: (k,v) => { attrs[k] = String(v); },
      addEventListener: (k,v) => { node.listeners[k] = v; }};
    for (const [k,v] of Object.entries(attrs)) if (k.startsWith('data-')) {
      node.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    return node;
  });
  const storage = new Map(stored ? [['21cm-atlas-language', stored]] : []);
  const document = {documentElement: {}, title: '', querySelectorAll: selector => {
    const attr = selector.slice(1,-1);
    return nodes.filter(n => n.getAttribute(attr) !== undefined);
  }};
  const context = vm.createContext({document, URLSearchParams,
    localStorage: {getItem(k) {if(blocked) throw Error('blocked'); return storage.get(k);},
      setItem(k,v) {if(blocked) throw Error('blocked'); storage.set(k,v);}},
    window: {location: {search}}});
  for (const file of ['i18n.js','ms-corner.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return {context,document,nodes,storage};
}

test('both languages cover every authored label, attribute and figure alt', () => {
  for (const lang of ['en','zh']) {
    const h = harness(lang);
    const i18n = h.context.window.AtlasI18n;
    assert.equal(h.document.documentElement.lang, lang==='zh' ? 'zh-CN' : 'en');
    assert.equal(h.document.title, i18n.t('msPageTitle'));
    for (const node of h.nodes) for (const attr of ['data-i18n','data-i18n-title','data-i18n-aria-label','data-ms-alt']) {
      const key=node.getAttribute(attr); if(!key) continue;
      assert.ok(i18n.messages[key], `Missing ${key}`);
      assert.equal(i18n.messages[key].length,2);
      assert.ok(i18n.messages[key].every(v=>typeof v==='string' && v.length));
      if(attr==='data-i18n') assert.equal(node.textContent,i18n.t(key));
      if(attr==='data-ms-alt') assert.equal(node.getAttribute('alt'),i18n.t(key));
    }
  }
});
test('language buttons, persisted preference and explicit language links work', () => {
  const h=harness('en');
  h.nodes.find(n=>n.dataset.language==='zh').listeners.click();
  assert.equal(h.document.documentElement.lang,'zh-CN');
  assert.equal(h.storage.get('21cm-atlas-language'),'zh');
  h.nodes.find(n=>n.dataset.language==='en').listeners.click();
  assert.equal(h.document.documentElement.lang,'en');
  assert.equal(harness('en','?lang=zh').document.documentElement.lang,'zh-CN');
  assert.equal(harness('zh','?lang=en').document.documentElement.lang,'en');
  assert.equal(harness(null,'?lang=zh',true).document.documentElement.lang,'zh-CN');
});
test('all page assets exist and original scientific snapshot is retained', () => {
  for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if(m[1].startsWith('#')) continue;
    const file=m[1].split('?')[0];
    assert.ok(fs.existsSync(path.join(root,file)),file);
  }
  assert.match(html,/href="styles.css/);
  assert.match(html,/system-header/);
  const data=JSON.parse(fs.readFileSync(path.join(root,'web_data/ms_corner_chunk1/index.json')));
  assert.equal(data.status,'PRELIMINARY_NOT_CONVERGED');
  assert.equal(data.sources.length,2);
  assert.deepEqual(data.sources[0].shape,[160,64,7]);
});
