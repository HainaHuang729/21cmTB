import { MAX_POINTS, MIN_POINT_GAP, addPoint, evaluateTransfer, movePoint, normalizePoints, removePoint } from './transfer.js';

const STYLE = `
.transfer-editor{color:var(--ink,#24292b);font-size:11px;min-width:0}
.transfer-editor__plot{display:block;width:100%;height:184px;background:#e4e8e0;border:1px solid #cbd0ca;border-radius:3px;touch-action:none;cursor:crosshair}
.transfer-editor__help{margin:7px 0;color:var(--muted,#687277);font-size:10px;line-height:1.6}
.transfer-editor__row{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:8px}
.transfer-editor__row label{display:block;flex:1;min-width:68px;font-size:10px}
.transfer-editor__row input,.transfer-editor__row select{display:block;width:100%;height:30px;margin-top:4px;border:1px solid #bdc8be;border-radius:4px;background:#fafaf5;padding:4px 6px;color:inherit;font:inherit;font-variant-numeric:tabular-nums}
.transfer-editor__row button{min-height:32px;border:1px solid #bdc8be;border-radius:4px;background:transparent;padding:5px 9px;color:inherit;font:inherit;cursor:pointer}
.transfer-editor__row button:hover{background:#dce4d9}
.transfer-editor__row input:disabled,.transfer-editor__row select:disabled,.transfer-editor__row button:disabled{opacity:.45;cursor:not-allowed}
.transfer-editor :focus-visible{outline:3px solid #4d8f9c;outline-offset:2px}
.transfer-editor__status{display:block;min-height:17px;margin-top:6px;color:var(--muted,#687277);font-size:10px;line-height:1.5}
.transfer-editor[aria-disabled=true] .transfer-editor__plot{opacity:.5;cursor:not-allowed}
`;

export class TransferEditor {
  constructor(container, { points, onChange = () => {}, colorAt } = {}) {
    if (!(container instanceof HTMLElement)) throw new TypeError('曲线编辑器需要一个容器');
    this.container = container;
    this.points = normalizePoints(points);
    this.onChange = onChange;
    this.colorAt = colorAt;
    this.selected = 0;
    this.domain={label:'xH',min:0,max:1,unit:''};
    this.bins = [];
    this._enabled = true;
    this.drag = null;
    this.events = new AbortController();
    this.root = document.createElement('div');
    this.root.className = 'transfer-editor';
    this.root.innerHTML = `<style>${STYLE}</style>
      <canvas class="transfer-editor__plot" tabindex="0" role="group" aria-label="可编辑透明度曲线"></canvas>
      <p class="transfer-editor__help">拖动圆点；双击空白添加。方向键微调，PageUp / PageDown 选点，Delete 删除。</p>
      <div class="transfer-editor__row">
        <label>选中点<select aria-label="选中曲线控制点"></select></label>
        <label><span data-domain-label>xH</span><input type="number" min="0" max="1" step="0.01" aria-label="控制点物理值"></label>
        <label>透明度权重<input type="number" min="0" max="1" step="0.01" aria-label="控制点透明度权重"></label>
      </div>
      <div class="transfer-editor__row"><button type="button" data-action="add">添加点</button><button type="button" data-action="remove">删除选中点</button></div>
      <output class="transfer-editor__status" aria-live="polite"></output>`;
    container.append(this.root);
    this.canvas = this.root.querySelector('canvas');
    this.select = this.root.querySelector('select');
    [this.xInput, this.yInput] = this.root.querySelectorAll('input');
    this.addButton = this.root.querySelector('[data-action="add"]');
    this.removeButton = this.root.querySelector('[data-action="remove"]');
    this.status = this.root.querySelector('output');
    const on = (target, event, handler) => target.addEventListener(event, handler, { signal: this.events.signal });

    on(this.select, 'change', () => { this.selected = Number(this.select.value); this.refresh(); });
    for (const [input, key] of [[this.xInput, 'x'], [this.yInput, 'y']]) {
      let pending = false;
      const finish = () => {
        const value = key==='x'?this.fromPhysical(input.valueAsNumber):input.valueAsNumber;
        pending = false;
        if (!this.enabled) { this.refresh(); return; }
        this.commit(Number.isFinite(value) ? movePoint(this.points, this.selected, { [key]: value }) : this.points);
        if (!Number.isFinite(value)) this.status.textContent = '请输入有效数字；已恢复最近有效值。';
        else if (Math.abs(value - this.points[this.selected][key]) > 1e-10) {
          this.status.textContent = key === 'x' ? '物理值已限制在相邻控制点之间，端点位置固定。' : '透明度权重已限制在 0–1。';
        }
      };
      on(input, 'input', () => {
        if (!this.enabled) return;
        pending = true;
        const value = key==='x'?this.fromPhysical(input.valueAsNumber):input.valueAsNumber;
        if (!Number.isFinite(value)) { input.setAttribute('aria-invalid', 'true'); return; }
        this.points = movePoint(this.points, this.selected, { [key]: value });
        input.setAttribute('aria-invalid', String(Math.abs(value - this.points[this.selected][key]) > 1e-10));
        // Do not refresh the form here: partially typed values such as "0."
        // must survive while the plot and renderer preview the valid number.
        this.syncPlotLabel();
        this.redraw();
        this.onChange(this.getPoints(), true);
      });
      on(input, 'change', finish);
      // Some input methods defer or omit change; blur still ends preview mode
      // and restores invalid input to the latest valid, constrained value.
      on(input, 'blur', () => { if (pending || !Number.isFinite(input.valueAsNumber)) finish(); });
    }
    on(this.addButton, 'click', () => this.addAfterSelected());
    on(this.removeButton, 'click', () => this.removeSelected());
    on(this.canvas, 'pointerdown', e => this.pointerDown(e));
    on(this.canvas, 'pointermove', e => this.pointerMove(e));
    on(this.canvas, 'pointerup', e => this.pointerEnd(e));
    on(this.canvas, 'pointercancel', e => this.pointerEnd(e));
    on(this.canvas, 'lostpointercapture', e => this.pointerEnd(e));
    on(this.canvas, 'dblclick', e => {
      if (!this.enabled || this.hit(e) >= 0) return;
      const position = this.position(e);
      this.insert(position);
    });
    on(this.canvas, 'keydown', e => this.keyDown(e));
    this.observer = new ResizeObserver(() => this.redraw());
    this.observer.observe(this.canvas);
    this.refresh();
  }

  getPoints() { return this.points.map(p => ({ ...p })); }
  toPhysical(value){return this.domain.min+value*(this.domain.max-this.domain.min);}
  fromPhysical(value){return (value-this.domain.min)/(this.domain.max-this.domain.min);}
  setDomain(domain){this.domain={...domain};this.root.querySelector('[data-domain-label]').textContent=domain.label;this.xInput.step=(domain.max-domain.min)/100;this.refresh();}
  setPoints(points) {
    this.points = normalizePoints(points);
    this.selected = Math.min(this.selected, this.points.length - 1);
    this.refresh();
  }
  get enabled() { return this._enabled; }
  set enabled(value) {
    this._enabled = Boolean(value);
    if (!this._enabled && this.drag) this.pointerEnd({ pointerId: this.drag.id });
    this.refresh();
  }
  setEnabled(value) { this.enabled = value; }
  setHistogram(bins) {
    this.bins = Array.from(bins || [], n => Number.isFinite(n) ? Math.max(0, n) : 0);
    this.redraw();
  }

  refresh() {
    const count = this.points.length, point = this.points[this.selected];
    this.select.replaceChildren(...this.points.map((p, i) => {
      const option = document.createElement('option');
      option.value = i; option.textContent = `${i + 1}${i === 0 || i === count - 1 ? ' · 端点' : ''}`;
      return option;
    }));
    this.select.value = this.selected;
    this.xInput.value = Number(this.toPhysical(point.x).toFixed(4));
    this.yInput.value = Number(point.y.toFixed(4));
    this.xInput.removeAttribute('aria-invalid');
    this.yInput.removeAttribute('aria-invalid');
    const endpoint = this.selected === 0 || this.selected === count - 1;
    this.xInput.disabled = !this.enabled || endpoint;
    this.xInput.min = this.toPhysical(endpoint ? point.x : this.points[this.selected - 1].x + MIN_POINT_GAP);
    this.xInput.max = this.toPhysical(endpoint ? point.x : this.points[this.selected + 1].x - MIN_POINT_GAP);
    this.yInput.disabled = this.select.disabled = !this.enabled;
    this.addButton.disabled = !this.enabled || count >= MAX_POINTS;
    this.removeButton.disabled = !this.enabled || endpoint;
    this.root.setAttribute('aria-disabled', String(!this.enabled));
    this.syncPlotLabel();
    this.status.textContent = `${count} / ${MAX_POINTS} 个点${endpoint ? ' · 端点固定物理值，可调权重' : ' · 显示映射不改变原值'}`;
    this.redraw();
  }

  syncPlotLabel() {
    const point = this.points[this.selected];
    this.canvas.setAttribute('aria-label', `透明度曲线，第 ${this.selected + 1} 个控制点，${this.domain.label} ${this.toPhysical(point.x).toFixed(3)} ${this.domain.unit}，权重 ${point.y.toFixed(3)}。方向键移动；PageUp 或 PageDown 选择点。`);
  }

  commit(points, interactive = false) {
    this.points = normalizePoints(points);
    this.selected = Math.min(this.selected, this.points.length - 1);
    this.refresh();
    this.onChange(this.getPoints(), interactive);
  }
  insert(position) {
    if (!this.enabled || this.points.length >= MAX_POINTS) return;
    const points = addPoint(this.points, position);
    this.selected = points.reduce((best, p, i) => Math.abs(p.x - position.x) < Math.abs(points[best].x - position.x) ? i : best, 0);
    this.commit(points);
  }
  addAfterSelected() {
    if (!this.enabled || this.points.length >= MAX_POINTS) return;
    let i = Math.min(this.selected, this.points.length - 2);
    if (this.points[i + 1].x - this.points[i].x < MIN_POINT_GAP * 2) {
      i = this.points.slice(0, -1).reduce((best, p, j) => this.points[j + 1].x - p.x > this.points[best + 1].x - this.points[best].x ? j : best, 0);
    }
    const x = (this.points[i].x + this.points[i + 1].x) / 2;
    this.insert({ x, y: evaluateTransfer(x, this.points) });
  }
  removeSelected() {
    if (!this.enabled || this.selected === 0 || this.selected === this.points.length - 1) return;
    const points = removePoint(this.points, this.selected);
    this.selected--;
    this.commit(points);
  }

  geometry() {
    const { width, height } = this.canvas.getBoundingClientRect();
    return { width, height, left: 31, top: 22, right: Math.max(32, width - 13), bottom: Math.max(23, height - 27) };
  }
  position(e) {
    const r = this.canvas.getBoundingClientRect(), g = this.geometry();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left - g.left) / (g.right - g.left))), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top - g.top) / (g.bottom - g.top))) };
  }
  hit(e) {
    const r = this.canvas.getBoundingClientRect(), g = this.geometry();
    let hit = -1, distance = 14;
    this.points.forEach((p, i) => {
      const d = Math.hypot(e.clientX - r.left - g.left - p.x * (g.right - g.left), e.clientY - r.top - g.bottom + p.y * (g.bottom - g.top));
      if (d < distance) { hit = i; distance = d; }
    });
    return hit;
  }
  pointerDown(e) {
    if (!this.enabled || e.button !== 0) return;
    this.canvas.focus({ preventScroll: true });
    const hit = this.hit(e);
    if (hit < 0) return;
    e.preventDefault();
    this.selected = hit;
    this.drag = { id: e.pointerId, changed: false };
    this.canvas.setPointerCapture(e.pointerId);
    this.refresh();
  }
  pointerMove(e) {
    if (!this.enabled || !this.drag || this.drag.id !== e.pointerId) return;
    this.drag.changed = true;
    this.commit(movePoint(this.points, this.selected, this.position(e)), true);
  }
  pointerEnd(e) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const changed = this.drag.changed;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (changed) this.onChange(this.getPoints(), false);
  }
  keyDown(e) {
    if (!this.enabled) return;
    if (['PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'PageUp') this.selected = Math.min(this.points.length - 1, this.selected + 1);
      if (e.key === 'PageDown') this.selected = Math.max(0, this.selected - 1);
      if (e.key === 'Home') this.selected = 0;
      if (e.key === 'End') this.selected = this.points.length - 1;
      this.refresh(); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.removeSelected(); return; }
    if (e.key === 'Insert' || e.key === '+') { e.preventDefault(); this.addAfterSelected(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const step = e.shiftKey ? .05 : .01, p = this.points[this.selected];
    this.commit(movePoint(this.points, this.selected, {
      x: p.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
      y: p.y + (e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0),
    }));
  }

  redraw() {
    const g = this.geometry();
    if (g.width < 1 || g.height < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2), c = this.canvas;
    c.width = Math.round(g.width * ratio); c.height = Math.round(g.height * ratio);
    const ctx = c.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const x = value => g.left + value * (g.right - g.left), y = value => g.bottom - value * (g.bottom - g.top);
    ctx.font = '10px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillStyle = '#687277'; ctx.fillText('透明度权重', g.left, 13);
    for (const v of [0, .5, 1]) {
      ctx.strokeStyle = '#cbd0ca'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(g.left, y(v)); ctx.lineTo(g.right, y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v, g.left - 7, y(v) + 3);
      ctx.textAlign = 'center'; ctx.fillText(Number(this.toPhysical(v).toFixed(2)), x(v), g.bottom + 16);
    }
    ctx.textAlign = 'right'; ctx.fillText(`${this.domain.label} ${this.domain.unit}`, g.right, g.height - 2);
    const max = Math.log1p(Math.max(0, ...this.bins));
    if (max) this.bins.forEach((n, i) => {
      const v = (i + .5) / this.bins.length, color = this.colorAt?.(v);
      ctx.fillStyle = Array.isArray(color) ? `rgba(${color.join(',')},.33)` : '#4d8f9c45';
      const h = Math.log1p(n) / max * (g.bottom - g.top);
      ctx.fillRect(x(i / this.bins.length), g.bottom - h, Math.max(1, (g.right - g.left) / this.bins.length - 1), h);
    });
    ctx.beginPath(); ctx.moveTo(x(0), y(0));
    this.points.forEach(p => ctx.lineTo(x(p.x), y(p.y)));
    ctx.lineTo(x(1), y(0)); ctx.closePath(); ctx.fillStyle = '#b84b3e10'; ctx.fill();
    ctx.beginPath(); this.points.forEach((p, i) => i ? ctx.lineTo(x(p.x), y(p.y)) : ctx.moveTo(x(p.x), y(p.y)));
    ctx.strokeStyle = '#b84b3e'; ctx.lineWidth = 2; ctx.stroke();
    this.points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(x(p.x), y(p.y), i === this.selected ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === this.selected ? '#d6a62e' : '#fafaf5'; ctx.fill();
      ctx.strokeStyle = i === this.selected ? '#24292b' : '#b84b3e'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
  dispose() {
    this.observer.disconnect();
    this.events.abort();
    this.root.remove();
  }
}
