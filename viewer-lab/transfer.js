// Opacity weights describe display visibility; they never change voxel values.
export const MAX_POINTS = 16;
export const MIN_POINT_GAP = .001;
const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));

export function normalizePoints(points) {
  const unique = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    unique.set(clamp(point.x), clamp(point.y));
  }
  if (!unique.size) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  let result = [...unique].sort(([a], [b]) => a - b).map(([x, y]) => ({ x, y }));
  if (result[0].x !== 0) result.unshift({ x: 0, y: result[0].y });
  if (result.at(-1).x !== 1) result.push({ x: 1, y: result.at(-1).y });
  // Keep both endpoints and spread any oversized imported curve across its domain.
  if (result.length > MAX_POINTS) result = Array.from({ length: MAX_POINTS }, (_, i) => result[Math.round(i * (result.length - 1) / (MAX_POINTS - 1))]);
  return result;
}

// Input points are normalized at edit/load boundaries so this can run per sample.
export function evaluateTransfer(value, points) {
  if (!Number.isFinite(value)) return 0;
  if (!Array.isArray(points) || points.length < 2) return clamp(value);
  const x = clamp(value);
  if (x <= points[0].x) return points[0].y;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (x <= b.x) {
      const a = points[i - 1];
      const t = (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return points.at(-1).y;
}

export function createTransferLUT(points, size = 256) {
  if (!Number.isInteger(size) || size < 2 || size > 65536) throw new RangeError('曲线采样数须为 2 至 65536 的整数');
  const normalized = normalizePoints(points);
  return Float32Array.from({ length: size }, (_, i) => evaluateTransfer(i / (size - 1), normalized));
}

export function movePoint(points, index, position) {
  const result = normalizePoints(points);
  if (!Number.isInteger(index) || index < 0 || index >= result.length) return result;
  const p = result[index];
  if (Number.isFinite(position?.y)) p.y = clamp(position.y);
  if (index > 0 && index < result.length - 1 && Number.isFinite(position?.x)) {
    // An imported curve may have very close neighbours. The existing point is
    // always reachable, even when a full editing gap cannot fit between them.
    const lo = Math.min(p.x, result[index - 1].x + MIN_POINT_GAP);
    const hi = Math.max(p.x, result[index + 1].x - MIN_POINT_GAP);
    p.x = clamp(position.x, lo, hi);
  }
  return result;
}

export function addPoint(points, position) {
  const result = normalizePoints(points);
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return result;
  const x = clamp(position.x), y = clamp(position.y);
  const existing = result.findIndex(p => Math.abs(p.x - x) < MIN_POINT_GAP);
  if (existing >= 0) { result[existing].y = y; return result; }
  if (result.length >= MAX_POINTS) return result;
  return normalizePoints([...result, { x, y }]);
}

export function removePoint(points, index) {
  const result = normalizePoints(points);
  if (Number.isInteger(index) && index > 0 && index < result.length - 1) result.splice(index, 1);
  return result;
}

export function samplePreset(region, center = .5, width = .3) {
  if (region === 'ionized') return [{ x: 0, y: 1 }, { x: 1, y: 0 }];
  if (region !== 'band') return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  center = clamp(Number.isFinite(center) ? center : .5);
  const sigma = clamp(Number.isFinite(width) ? width : .3, .04, 1) * .5;
  const weight = x => Math.exp(-.5 * ((x - center) / sigma) ** 2);
  // Place samples around the peak, so narrow bands survive conversion. These
  // are editable linear approximations; the original Gaussian preset is exact.
  const xs = [0, 1, ...[-4, -3, -2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2, 3, 4].map(t => clamp(center + t * sigma))];
  return normalizePoints(xs.map(x => ({ x, y: weight(x) })));
}
