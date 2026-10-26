import { S, commit, emit, page, toast } from './store';
import type { Obj } from './model';
import { makeCanvas, rasterCanvas, storeRaster, cloneCanvas } from './raster';
import { rasterToPage, toRasterPx, editTime } from './ops';
import { renderPage } from './render';

// ---------- selection mask (page space) ----------
export const GS: { mask: HTMLCanvasElement | null; edges: HTMLCanvasElement | null; pageId: string | null } = { mask: null, edges: null, pageId: null };

export function hasSelection() { return !!GS.mask && GS.pageId === S.ui.pageId; }

export function combineSelection(src: HTMLCanvasElement, mode = S.ui.selMode) {
  const pg = page();
  if (!hasSelection() || mode === 'replace') { GS.mask = src; }
  else {
    const ctx = GS.mask!.getContext('2d')!;
    ctx.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  GS.pageId = pg.id;
  updateEdges();
}

export function selectShape(path: Path2D, mode = S.ui.selMode) {
  const pg = page();
  const c = makeCanvas(pg.w, pg.h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fill(path);
  combineSelection(c, mode);
}
export function selectAllPixels() { const p = new Path2D(); const pg = page(); p.rect(0, 0, pg.w, pg.h); selectShape(p, 'replace'); }
export function selectNone() { GS.mask = null; GS.edges = null; GS.pageId = null; emit(); }
export function invertSelection() {
  const pg = page();
  const c = makeCanvas(pg.w, pg.h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
  if (hasSelection()) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(GS.mask!, 0, 0); }
  GS.mask = c; GS.pageId = pg.id; updateEdges();
}

function updateEdges() {
  const m = GS.mask!;
  const w = m.width, h = m.height;
  const src = m.getContext('2d')!.getImageData(0, 0, w, h).data;
  const e = makeCanvas(w, h);
  const ectx = e.getContext('2d')!;
  const out = ectx.createImageData(w, h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = on(x, y);
    if (v && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) {
      const i = (y * w + x) * 4;
      const dark = ((x + y) >> 2) % 2 === 0;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = dark ? 20 : 250; out.data[i + 3] = 255;
    }
  }
  ectx.putImageData(out, 0, 0);
  GS.edges = e;
  emit();
}

/** The selection mask mapped into a raster's pixel space (null = everything). */
export function maskFor(o: Obj): HTMLCanvasElement | null {
  if (!hasSelection()) return null;
  const c = rasterCanvas(o);
  const ml = makeCanvas(c.width, c.height);
  const ctx = ml.getContext('2d')!;
  const m = rasterToPage(o).inverse();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(GS.mask!, 0, 0);
  return ml;
}

export function selectionBounds() {
  if (!hasSelection()) return null;
  const m = GS.mask!;
  const d = m.getContext('2d')!.getImageData(0, 0, m.width, m.height).data;
  let x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (d[(y * m.width + x) * 4 + 3] > 127) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------- compositing helpers ----------
export function compositePage(): HTMLCanvasElement {
  const pg = page();
  const c = makeCanvas(pg.w, pg.h);
  renderPage(c.getContext('2d')!, S.doc, pg, { time: editTime() });
  return c;
}

export function pickColour(p: { x: number; y: number }): string | null {
  const c = compositePage();
  if (p.x < 0 || p.y < 0 || p.x >= c.width || p.y >= c.height) return null;
  const d = c.getContext('2d')!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function flood(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, tol: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
  const i0 = (sy * w + sx) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const t = tol * 4;
  const match = (i: number) => Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) + Math.abs(data[i + 3] - a0) <= t;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    let lx = x;
    while (lx >= 0 && !out[y * w + lx] && match((y * w + lx) * 4)) lx--;
    lx++;
    let up = false, dn = false;
    for (let xx = lx; xx < w && !out[y * w + xx] && match((y * w + xx) * 4); xx++) {
      out[y * w + xx] = 1;
      if (y > 0) { const m = !out[(y - 1) * w + xx] && match(((y - 1) * w + xx) * 4); if (m && !up) { stack.push(xx, y - 1); up = true; } else if (!m) up = false; }
      if (y < h - 1) { const m = !out[(y + 1) * w + xx] && match(((y + 1) * w + xx) * 4); if (m && !dn) { stack.push(xx, y + 1); dn = true; } else if (!m) dn = false; }
    }
  }
  return out;
}

export function magicWand(p: { x: number; y: number }, mode = S.ui.selMode) {
  const c = compositePage();
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const region = flood(img.data, c.width, c.height, Math.floor(p.x), Math.floor(p.y), S.ui.tolerance);
  const m = makeCanvas(c.width, c.height);
  const mctx = m.getContext('2d')!;
  const md = mctx.createImageData(c.width, c.height);
  for (let i = 0; i < region.length; i++) if (region[i]) { md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = md.data[i * 4 + 3] = 255; }
  mctx.putImageData(md, 0, 0);
  combineSelection(m, mode);
}

export function bucketFill(o: Obj, pagePt: { x: number; y: number }, colour = S.ui.fg) {
  const c = rasterCanvas(o);
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = toRasterPx(o, pagePt);
  const region = flood(img.data, c.width, c.height, Math.floor(px.x), Math.floor(px.y), S.ui.tolerance);
  const mask = maskFor(o);
  const md = mask ? mask.getContext('2d')!.getImageData(0, 0, c.width, c.height).data : null;
  const [r, g, b] = hexToRgb(colour);
  const op = S.ui.brush.opacity;
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue;
    const a = op * (md ? md[i * 4 + 3] / 255 : 1);
    if (!a) continue;
    const j = i * 4;
    img.data[j] = img.data[j] * (1 - a) + r * a;
    img.data[j + 1] = img.data[j + 1] * (1 - a) + g * a;
    img.data[j + 2] = img.data[j + 2] * (1 - a) + b * a;
    img.data[j + 3] = img.data[j + 3] * (1 - a) + 255 * a;
  }
  ctx.putImageData(img, 0, 0);
  storeRaster(o);
  commit();
}

export function fillSelection(o: Obj, colour = S.ui.fg, clear = false) {
  const c = rasterCanvas(o);
  const ctx = c.getContext('2d')!;
  const mask = maskFor(o);
  ctx.save();
  if (clear) ctx.globalCompositeOperation = 'destination-out';
  if (mask) {
    const tmp = makeCanvas(c.width, c.height);
    const t = tmp.getContext('2d')!;
    t.drawImage(mask, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = colour; t.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(tmp, 0, 0);
  } else { ctx.fillStyle = colour; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.restore();
  storeRaster(o);
  commit();
}

export function gradientFill(o: Obj, a: { x: number; y: number }, b: { x: number; y: number }) {
  const c = rasterCanvas(o);
  const pa = toRasterPx(o, a), pb = toRasterPx(o, b);
  const tmp = makeCanvas(c.width, c.height);
  const t = tmp.getContext('2d')!;
  const g = t.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
  g.addColorStop(0, S.ui.fg); g.addColorStop(1, S.ui.bg);
  t.fillStyle = g; t.fillRect(0, 0, c.width, c.height);
  const mask = maskFor(o);
  if (mask) { t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0); }
  const ctx = c.getContext('2d')!;
  ctx.save(); ctx.globalAlpha = S.ui.brush.opacity; ctx.drawImage(tmp, 0, 0); ctx.restore();
  storeRaster(o);
  commit();
}

export function cropPageTo(b: { x: number; y: number; w: number; h: number }) {
  const pg = page();
  b = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
  if (b.w < 4 || b.h < 4) return;
  for (const o of pg.objects) {
    o.x -= b.x; o.y -= b.y;
    o.keys?.x?.forEach(k => (k.v -= b.x));
    o.keys?.y?.forEach(k => (k.v -= b.y));
  }
  pg.w = b.w; pg.h = b.h;
  pg.guides = { x: pg.guides.x.map(v => v - b.x), y: pg.guides.y.map(v => v - b.y) };
  selectNone();
  for (const v of Object.values(S.ui.views)) v.fitted = false;
  commit();
  toast(`Canvas cropped to ${b.w} × ${b.h}`);
}

export function cropRasterToSelection(o: Obj) {
  const b = selectionBounds();
  if (!b) { toast('Make a selection first'); return; }
  const c = rasterCanvas(o);
  const m = rasterToPage(o).inverse();
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x)))), y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y))));
  const x1 = Math.min(c.width, Math.ceil(Math.max(...pts.map(p => p.x)))), y1 = Math.min(c.height, Math.ceil(Math.max(...pts.map(p => p.y))));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  const n = makeCanvas(x1 - x0, y1 - y0);
  n.getContext('2d')!.drawImage(c, -x0, -y0);
  const pm = rasterToPage(o);
  const cx = x0 + (x1 - x0) / 2, cy = y0 + (y1 - y0) / 2;
  const centre = { x: pm.a * cx + pm.c * cy + pm.e, y: pm.b * cx + pm.d * cy + pm.f };
  const ux = (o.w || c.width) / c.width, uy = (o.h || c.height) / c.height;
  storeRaster(o, n);
  o.w = (x1 - x0) * ux; o.h = (y1 - y0) * uy;
  if (o.keys) { delete o.keys.x; delete o.keys.y; }
  o.x = centre.x; o.y = centre.y;
  commit();
}

// ---------- brush engine ----------
export type BrushKind = 'brush' | 'pencil' | 'eraser' | 'smudge' | 'clone' | 'dodge' | 'burn';
const cloneSrc: { pt: { x: number; y: number } | null; rasterId: string | null } = { pt: null, rasterId: null };
export function setCloneSource(o: Obj, p: { x: number; y: number }) { cloneSrc.pt = toRasterPx(o, p); cloneSrc.rasterId = o.id; toast('Clone source set'); }

export class Stroke {
  o: Obj; kind: BrushKind; canvas: HTMLCanvasElement; before: HTMLCanvasElement; buffer: HTMLCanvasElement;
  mask: HTMLCanvasElement | null; last: { x: number; y: number } | null = null; size: number; dab: HTMLCanvasElement;
  cloneOffset: { x: number; y: number } | null = null; scale: number;
  constructor(o: Obj, kind: BrushKind) {
    this.o = o; this.kind = kind;
    this.canvas = rasterCanvas(o);
    this.before = cloneCanvas(this.canvas);
    this.buffer = makeCanvas(this.canvas.width, this.canvas.height);
    this.mask = maskFor(o);
    const m = rasterToPage(o);
    this.scale = 1 / Math.max(0.01, Math.hypot(m.a, m.b));
    this.size = Math.max(1, S.ui.brush.size * this.scale);
    this.dab = this.makeDab();
  }
  makeDab() {
    const s = Math.ceil(this.size) + 2;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d')!;
    const r = this.size / 2;
    const hard = this.kind === 'pencil' ? 1 : S.ui.brush.hardness;
    const col = this.kind === 'dodge' ? '#ffffff' : this.kind === 'burn' ? '#000000' : S.ui.fg;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
    g.addColorStop(0, col); g.addColorStop(Math.min(0.99, hard), col); g.addColorStop(1, col + '00');
    ctx.fillStyle = this.kind === 'pencil' ? col : g;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2); ctx.fill();
    return c;
  }
  to(pagePt: { x: number; y: number }) {
    const p = toRasterPx(this.o, pagePt);
    if (this.kind === 'clone' && !this.cloneOffset) {
      if (!cloneSrc.pt) { toast('Alt-click to set a clone source first'); return; }
      this.cloneOffset = { x: cloneSrc.pt.x - p.x, y: cloneSrc.pt.y - p.y };
    }
    const from = this.last || p;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    const spacing = Math.max(0.5, this.size * (this.kind === 'smudge' ? 0.08 : 0.12));
    const steps = Math.max(1, Math.ceil(d / spacing));
    const bctx = this.buffer.getContext('2d')!;
    for (let i = this.last ? 1 : 0; i <= steps; i++) {
      const x = from.x + ((p.x - from.x) * i) / steps, y = from.y + ((p.y - from.y) * i) / steps;
      const s = this.dab.width;
      if (this.kind === 'smudge') {
        const prev = { x: from.x + ((p.x - from.x) * (i - 1)) / steps, y: from.y + ((p.y - from.y) * (i - 1)) / steps };
        const ctx = this.canvas.getContext('2d')!;
        const tmp = makeCanvas(s, s);
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(this.canvas, prev.x - s / 2, prev.y - s / 2, s, s, 0, 0, s, s);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(this.dab, 0, 0);
        ctx.save(); ctx.globalAlpha = 0.5 * S.ui.brush.opacity;
        ctx.drawImage(tmp, x - s / 2, y - s / 2);
        ctx.restore();
      } else if (this.kind === 'clone' && this.cloneOffset) {
        const tmp = makeCanvas(s, s);
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(this.before, x + this.cloneOffset.x - s / 2, y + this.cloneOffset.y - s / 2, s, s, 0, 0, s, s);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(this.dab, 0, 0);
        bctx.drawImage(tmp, x - s / 2, y - s / 2);
      } else {
        bctx.globalAlpha = S.ui.brush.flow;
        bctx.drawImage(this.dab, x - s / 2, y - s / 2);
      }
    }
    this.last = p;
    if (this.kind === 'smudge') return;
    if (this.mask) { bctx.globalCompositeOperation = 'destination-in'; bctx.globalAlpha = 1; bctx.drawImage(this.mask, 0, 0); bctx.globalCompositeOperation = 'source-over'; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.before, 0, 0);
    ctx.globalCompositeOperation = this.kind === 'eraser' ? 'destination-out' : this.kind === 'dodge' ? 'soft-light' : this.kind === 'burn' ? 'soft-light' : 'source-over';
    ctx.globalAlpha = S.ui.brush.opacity * (this.kind === 'dodge' || this.kind === 'burn' ? 0.6 : 1);
    if (this.kind === 'dodge' || this.kind === 'burn') {
      // keep transparency: only affect existing pixels
      const t = makeCanvas(this.canvas.width, this.canvas.height);
      const tc = t.getContext('2d')!;
      tc.drawImage(this.buffer, 0, 0);
      tc.globalCompositeOperation = 'destination-in';
      tc.drawImage(this.before, 0, 0);
      ctx.drawImage(t, 0, 0);
    } else ctx.drawImage(this.buffer, 0, 0);
    ctx.restore();
  }
  end() {
    storeRaster(this.o, this.canvas);
    commit();
  }
}

// ---------- filters ----------
export interface FilterDef { id: string; name: string; params: { key: string; label: string; min: number; max: number; step?: number; def: number }[] }
export const FILTERS: FilterDef[] = [
  { id: 'bc', name: 'Brightness / Contrast', params: [{ key: 'b', label: 'Brightness', min: -100, max: 100, def: 0 }, { key: 'c', label: 'Contrast', min: -100, max: 100, def: 0 }] },
  { id: 'hsl', name: 'Hue / Saturation', params: [{ key: 'h', label: 'Hue', min: -180, max: 180, def: 0 }, { key: 's', label: 'Saturation', min: -100, max: 100, def: 0 }, { key: 'l', label: 'Lightness', min: -100, max: 100, def: 0 }] },
  { id: 'levels', name: 'Levels', params: [{ key: 'lo', label: 'Input black', min: 0, max: 254, def: 0 }, { key: 'hi', label: 'Input white', min: 1, max: 255, def: 255 }, { key: 'g', label: 'Gamma', min: 0.1, max: 3, step: 0.01, def: 1 }] },
  { id: 'temp', name: 'Colour Temperature', params: [{ key: 't', label: 'Warmth', min: -100, max: 100, def: 20 }, { key: 'tint', label: 'Tint', min: -100, max: 100, def: 0 }] },
  { id: 'blur', name: 'Gaussian Blur', params: [{ key: 'r', label: 'Radius', min: 0, max: 40, def: 4 }] },
  { id: 'sharpen', name: 'Sharpen', params: [{ key: 'a', label: 'Amount', min: 0, max: 3, step: 0.05, def: 0.8 }] },
  { id: 'noise', name: 'Film Grain', params: [{ key: 'a', label: 'Amount', min: 0, max: 100, def: 18 }, { key: 'mono', label: 'Monochrome', min: 0, max: 1, def: 1 }] },
  { id: 'vignette', name: 'Vignette', params: [{ key: 'a', label: 'Strength', min: 0, max: 100, def: 45 }, { key: 'r', label: 'Radius', min: 10, max: 100, def: 70 }] },
  { id: 'pixelate', name: 'Pixelate', params: [{ key: 's', label: 'Cell size', min: 2, max: 64, def: 8 }] },
  { id: 'posterize', name: 'Posterise', params: [{ key: 'n', label: 'Levels', min: 2, max: 16, def: 4 }] },
  { id: 'threshold', name: 'Threshold', params: [{ key: 't', label: 'Threshold', min: 0, max: 255, def: 128 }] },
  { id: 'edges', name: 'Edge Detect', params: [{ key: 'a', label: 'Strength', min: 0.2, max: 4, step: 0.1, def: 1 }] },
  { id: 'emboss', name: 'Emboss', params: [{ key: 'a', label: 'Strength', min: 0.2, max: 4, step: 0.1, def: 1 }] },
  { id: 'invert', name: 'Invert Colours', params: [] },
  { id: 'desat', name: 'Desaturate', params: [] },
  { id: 'sepia', name: 'Sepia', params: [{ key: 'a', label: 'Amount', min: 0, max: 100, def: 80 }] },
];

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

function convolve(src: ImageData, k: number[], div = 1, bias = 0): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
      const xx = Math.min(w - 1, Math.max(0, x + kx)), yy = Math.min(h - 1, Math.max(0, y + ky));
      const i = (yy * w + xx) * 4, kv = k[(ky + 1) * 3 + kx + 1];
      r += data[i] * kv; g += data[i + 1] * kv; b += data[i + 2] * kv;
    }
    const j = (y * w + x) * 4;
    o[j] = r / div + bias; o[j + 1] = g / div + bias; o[j + 2] = b / div + bias; o[j + 3] = data[j + 3];
  }
  return out;
}

function boxBlur(img: ImageData, r: number) {
  const { width: w, height: h } = img;
  const d = img.data;
  const tmp = new Float32Array(d.length);
  r = Math.max(1, Math.round(r));
  // premultiplied horizontal then vertical passes
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? d : tmp;
    const dst = pass === 0 ? tmp : d;
    const len = pass === 0 ? w : h, lines = pass === 0 ? h : w;
    for (let l = 0; l < lines; l++) {
      const acc = [0, 0, 0, 0];
      const idx = (p: number) => (pass === 0 ? (l * w + Math.min(len - 1, Math.max(0, p))) : (Math.min(len - 1, Math.max(0, p)) * w + l)) * 4;
      for (let p = -r; p <= r; p++) { const i = idx(p); for (let c = 0; c < 4; c++) acc[c] += src[i + c]; }
      for (let p = 0; p < len; p++) {
        const o = idx(p);
        for (let c = 0; c < 4; c++) dst[o + c] = acc[c] / (2 * r + 1);
        const add = idx(p + r + 1), rem = idx(p - r);
        for (let c = 0; c < 4; c++) acc[c] += src[add + c] - src[rem + c];
      }
    }
  }
}

export function runFilter(id: string, src: ImageData, p: Record<string, number>): ImageData {
  const w = src.width, h = src.height;
  let out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data;
  switch (id) {
    case 'bc': {
      const b = p.b * 2.55, c = p.c;
      const f = (259 * (c + 255)) / (255 * (259 - c));
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = f * (d[i + k] - 128) + 128 + b;
      break;
    }
    case 'hsl': for (let i = 0; i < d.length; i += 4) {
      let [hh, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      hh = (hh + p.h / 360 + 1) % 1; s = Math.min(1, Math.max(0, s * (1 + p.s / 100)));
      l = p.l > 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100);
      [d[i], d[i + 1], d[i + 2]] = hsl2rgb(hh, s, l);
    } break;
    case 'levels': {
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - p.lo) / Math.max(1, p.hi - p.lo))), 1 / p.g);
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
      break;
    }
    case 'temp': for (let i = 0; i < d.length; i += 4) { d[i] += p.t * 0.5; d[i + 2] -= p.t * 0.5; d[i + 1] += p.tint * 0.4; } break;
    case 'blur': if (p.r > 0) { boxBlur(out, p.r / 2); boxBlur(out, p.r / 2); boxBlur(out, p.r / 2); } break;
    case 'sharpen': { const a = p.a; out = convolve(src, [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]); break; }
    case 'edges': { const a = p.a; out = convolve(src, [-a, -a, -a, -a, 8 * a, -a, -a, -a, -a]); break; }
    case 'emboss': { const a = p.a; out = convolve(src, [-2 * a, -a, 0, -a, 1, a, 0, a, 2 * a], 1, 0); break; }
    case 'noise': for (let i = 0; i < d.length; i += 4) {
      const n = () => (Math.random() - 0.5) * p.a * 2.2;
      if (p.mono >= 0.5) { const v = n(); d[i] += v; d[i + 1] += v; d[i + 2] += v; } else { d[i] += n(); d[i + 1] += n(); d[i + 2] += n(); }
    } break;
    case 'vignette': {
      const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy) * (p.r / 100);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = Math.max(0, (Math.hypot(x - cx, y - cy) - R * 0.5) / (R * 0.8));
        const f = 1 - Math.min(1, t * t) * (p.a / 100);
        const i = (y * w + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
      break;
    }
    case 'pixelate': {
      const s = Math.max(2, Math.round(p.s));
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const acc = [0, 0, 0, 0]; let n = 0;
        for (let yy = y; yy < Math.min(h, y + s); yy++) for (let xx = x; xx < Math.min(w, x + s); xx++) { const i = (yy * w + xx) * 4; for (let c = 0; c < 4; c++) acc[c] += d[i + c]; n++; }
        for (let yy = y; yy < Math.min(h, y + s); yy++) for (let xx = x; xx < Math.min(w, x + s); xx++) { const i = (yy * w + xx) * 4; for (let c = 0; c < 4; c++) d[i + c] = acc[c] / n; }
      }
      break;
    }
    case 'posterize': { const n = Math.max(2, Math.round(p.n)) - 1; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] / 255) * n) * (255 / n); break; }
    case 'threshold': for (let i = 0; i < d.length; i += 4) { const v = lum(d[i], d[i + 1], d[i + 2]) >= p.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } break;
    case 'invert': for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } break;
    case 'desat': for (let i = 0; i < d.length; i += 4) { const v = lum(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v; } break;
    case 'sepia': {
      const a = p.a / 100;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = r * (1 - a) + Math.min(255, r * 0.393 + g * 0.769 + b * 0.189) * a;
        d[i + 1] = g * (1 - a) + Math.min(255, r * 0.349 + g * 0.686 + b * 0.168) * a;
        d[i + 2] = b * (1 - a) + Math.min(255, r * 0.272 + g * 0.534 + b * 0.131) * a;
      }
      break;
    }
  }
  return out;
}

/** A live, cancellable filter session on one raster. */
export class Adjust {
  o: Obj; before: ImageData; mask: Uint8ClampedArray | null; canvas: HTMLCanvasElement;
  constructor(o: Obj) {
    this.o = o;
    this.canvas = rasterCanvas(o);
    this.before = this.canvas.getContext('2d')!.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const m = maskFor(o);
    this.mask = m ? m.getContext('2d')!.getImageData(0, 0, m.width, m.height).data : null;
  }
  preview(id: string, params: Record<string, number>) {
    const res = runFilter(id, this.before, params);
    if (this.mask) {
      const b = this.before.data, r = res.data, m = this.mask;
      for (let i = 0; i < r.length; i += 4) {
        const a = m[i + 3] / 255;
        if (a >= 1) continue;
        for (let k = 0; k < 4; k++) r[i + k] = b[i + k] * (1 - a) + r[i + k] * a;
      }
    }
    // keep original alpha so filters never reveal transparent areas
    const r = res.data, b = this.before.data;
    for (let i = 3; i < r.length; i += 4) r[i] = b[i];
    this.canvas.getContext('2d')!.putImageData(res, 0, 0);
    emit();
  }
  cancel() { this.canvas.getContext('2d')!.putImageData(this.before, 0, 0); emit(); }
  apply() { storeRaster(this.o, this.canvas); commit(); }
}
