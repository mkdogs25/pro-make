import { S, commit, emit, page, toast } from './store';
import type { Obj } from './model';
import { makeCanvas, rasterCanvas, storeRaster, cloneCanvas } from './raster';
import { rasterToPage, toRasterPx, editTime, renderObjectsToCanvas, addObj, currentLayerId, paintTarget } from './ops';
import { maskToSubpaths } from './ink';
import { newObj, uid } from './model';
import { objMatrix, objPath2D, pageBox, unionBox, recentrePath } from './geometry';
import { editableMask, maskCanvas, storeMask } from './raster';
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

export function refreshSelection() { if (GS.mask) updateEdges(); else emit(); }

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

export function pickColour(p: { x: number; y: number }, size = S.ui.picker.size, merged = S.ui.picker.merged): string | null {
  let src: HTMLCanvasElement, px = Math.floor(p.x), py = Math.floor(p.y);
  if (merged) src = compositePage();
  else {
    const o = S.ui.sel.length ? page().objects.find(x => x.id === S.ui.sel[0] && x.type === 'raster') : null;
    if (!o) src = compositePage();
    else { src = rasterCanvas(o); const q = toRasterPx(o, p); px = Math.floor(q.x); py = Math.floor(q.y); }
  }
  if (px < 0 || py < 0 || px >= src.width || py >= src.height) return null;
  const r = Math.max(0, Math.floor(size / 2));
  const x0 = Math.max(0, px - r), y0 = Math.max(0, py - r), x1 = Math.min(src.width, px + r + 1), y1 = Math.min(src.height, py + r + 1);
  const d = src.getContext('2d')!.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let R = 0, G = 0, B = 0, A = 0;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; R += d[i] * a; G += d[i + 1] * a; B += d[i + 2] * a; A += a; }
  if (!A) return '#000000';
  return '#' + [R / A, G / A, B / A].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
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

function matchAll(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, tol: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
  const i0 = (sy * w + sx) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3], t = tol * 4;
  for (let i = 0; i < w * h; i++) { const j = i * 4; if (Math.abs(data[j] - r0) + Math.abs(data[j + 1] - g0) + Math.abs(data[j + 2] - b0) + Math.abs(data[j + 3] - a0) <= t) out[i] = 1; }
  return out;
}

export function bucketFill(o: Obj, pagePt: { x: number; y: number }, colour = S.ui.fg) {
  if (S.ui.bucket.mode === 'selection') { fillSelection(o, colour); return; }
  const c = rasterCanvas(o);
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  let region: Uint8Array;
  if (S.ui.bucket.merged) {
    // decide the area from what you see (all layers), then map it onto this layer's pixels
    const comp = compositePage(), cd = comp.getContext('2d')!.getImageData(0, 0, comp.width, comp.height);
    const pr = S.ui.bucket.contiguous ? flood(cd.data, comp.width, comp.height, Math.floor(pagePt.x), Math.floor(pagePt.y), S.ui.tolerance) : matchAll(cd.data, comp.width, comp.height, Math.floor(pagePt.x), Math.floor(pagePt.y), S.ui.tolerance);
    const M = rasterToPage(o);
    region = new Uint8Array(c.width * c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const qx = Math.floor(M.a * (x + 0.5) + M.c * (y + 0.5) + M.e), qy = Math.floor(M.b * (x + 0.5) + M.d * (y + 0.5) + M.f);
      if (qx >= 0 && qy >= 0 && qx < comp.width && qy < comp.height && pr[qy * comp.width + qx]) region[y * c.width + x] = 1;
    }
  } else {
    const px = toRasterPx(o, pagePt);
    region = S.ui.bucket.contiguous ? flood(img.data, c.width, c.height, Math.floor(px.x), Math.floor(px.y), S.ui.tolerance) : matchAll(img.data, c.width, c.height, Math.floor(px.x), Math.floor(px.y), S.ui.tolerance);
  }
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
  commit('Bucket fill');
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
  const g = S.ui.gradient;
  const vx = pb.x - pa.x, vy = pb.y - pa.y, L2 = vx * vx + vy * vy || 1, L = Math.sqrt(L2), ux = vx / L, uy = vy / L;
  const ang0 = Math.atan2(vy, vx);
  const [r1, g1, b1] = hexToRgb(S.ui.fg), [r2, g2, b2] = hexToRgb(S.ui.bg);
  const out = new ImageData(c.width, c.height), d = out.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const dx = x + 0.5 - pa.x, dy = y + 0.5 - pa.y;
    let t: number;
    switch (g.type) {
      case 'radial': t = Math.hypot(dx, dy) / L; break;
      case 'conical': { let q = (Math.atan2(dy, dx) - ang0) / (Math.PI * 2); q -= Math.floor(q); t = q; break; }
      case 'square': t = Math.max(Math.abs(dx * ux + dy * uy), Math.abs(-dx * uy + dy * ux)) / L; break;
      case 'bilinear': t = Math.abs((dx * vx + dy * vy) / L2); break;
      default: t = (dx * vx + dy * vy) / L2;
    }
    if (g.repeat === 'sawtooth') t -= Math.floor(t);
    else if (g.repeat === 'triangle') { const m = ((t % 2) + 2) % 2; t = m > 1 ? 2 - m : m; }
    t = Math.max(0, Math.min(1, t));
    if (g.reverse) t = 1 - t;
    const i = (y * c.width + x) * 4;
    if (g.toTransparent) { d[i] = r1; d[i + 1] = g1; d[i + 2] = b1; d[i + 3] = 255 * (1 - t); }
    else { d[i] = r1 + (r2 - r1) * t; d[i + 1] = g1 + (g2 - g1) * t; d[i + 2] = b1 + (b2 - b1) * t; d[i + 3] = 255; }
  }
  const tmp = makeCanvas(c.width, c.height);
  const t = tmp.getContext('2d')!;
  t.putImageData(out, 0, 0);
  const mask = maskFor(o);
  if (mask) { t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0); }
  const ctx = c.getContext('2d')!;
  ctx.save(); ctx.globalAlpha = S.ui.brush.opacity; if (o.lockAlpha) ctx.globalCompositeOperation = 'source-atop'; ctx.drawImage(tmp, 0, 0); ctx.restore();
  storeRaster(o);
  commit('Gradient');
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
import { FILTERS, runFilter, type FxExtra } from './pixfx';
export { FILTERS, runFilter };
const ALPHA_FILTERS = new Set(['coloralpha', 'dropshadow', 'clouds', 'checker']);

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
  preview(id: string, params: Record<string, number>, extra: FxExtra = {}) {
    const res = runFilter(id, this.before, params, { fg: S.ui.fg, bg: S.ui.bg, ...extra });
    if (this.mask) {
      const b = this.before.data, r = res.data, m = this.mask;
      for (let i = 0; i < r.length; i += 4) {
        const a = m[i + 3] / 255;
        if (a >= 1) continue;
        for (let k = 0; k < 4; k++) r[i + k] = b[i + k] * (1 - a) + r[i + k] * a;
      }
    }
    // keep original alpha so filters never reveal transparent areas (unless the filter edits alpha itself)
    const r = res.data, b = this.before.data;
    if (!ALPHA_FILTERS.has(id)) for (let i = 3; i < r.length; i += 4) r[i] = b[i];
    this.canvas.getContext('2d')!.putImageData(res, 0, 0);
    emit();
  }
  cancel() { this.canvas.getContext('2d')!.putImageData(this.before, 0, 0); emit(); }
  apply(label = 'Filter') { storeRaster(this.o, this.canvas); commit(label); }
}


// ======================================================================
// Selection tools beyond the basics
// ======================================================================
const maskData = () => { const m = GS.mask!; return m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height); };

export function selectByColour(p: { x: number; y: number }, mode = S.ui.selMode) {
  const c = compositePage();
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  const region = matchAll(img.data, c.width, c.height, Math.floor(p.x), Math.floor(p.y), S.ui.tolerance);
  const m = makeCanvas(c.width, c.height), mc = m.getContext('2d')!, md = mc.createImageData(c.width, c.height);
  for (let i = 0; i < region.length; i++) if (region[i]) md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = md.data[i * 4 + 3] = 255;
  mc.putImageData(md, 0, 0);
  combineSelection(m, mode);
}

export function selectFromAlpha(o: Obj, mode: typeof S.ui.selMode = 'replace') {
  const pg = page();
  const t = editTime();
  const c = renderObjectsToCanvas([o], { x: 0, y: 0, w: pg.w, h: pg.h }, t);
  const cc = c.getContext('2d')!, d = cc.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a; }
  cc.putImageData(d, 0, 0);
  combineSelection(c, mode);
}

export function selectFromShapes() {
  const objs = page().objects.filter(o => S.ui.sel.includes(o.id) && ['rect', 'ellipse', 'star', 'path'].includes(o.type));
  if (!objs.length) { toast('Select one or more vector shapes first (draw them in Ink)'); return; }
  const t = editTime(), path = new Path2D();
  for (const o of objs) path.addPath(objPath2D(o), objMatrix(o, t));
  selectShape(path, 'replace');
}

function morph(n: number, grow: boolean) {
  const m = GS.mask!;
  const tmp = makeCanvas(m.width, m.height), tc = tmp.getContext('2d', { willReadFrequently: true })!;
  tc.filter = `blur(${Math.max(0.5, n)}px)`; tc.drawImage(m, 0, 0); tc.filter = 'none';
  const d = tc.getImageData(0, 0, tmp.width, tmp.height);
  const th = grow ? 6 : 249;
  for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > th; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
  tc.putImageData(d, 0, 0);
  return tmp;
}
export function growSelection(n: number) { if (!hasSelection()) return toast('Make a selection first'); GS.mask = morph(n, true); refreshSelection(); }
export function shrinkSelection(n: number) { if (!hasSelection()) return toast('Make a selection first'); GS.mask = morph(n, false); refreshSelection(); }
export function featherSelection(n: number) {
  if (!hasSelection()) return toast('Make a selection first');
  const m = GS.mask!, tmp = makeCanvas(m.width, m.height), tc = tmp.getContext('2d')!;
  tc.filter = `blur(${Math.max(0.5, n / 2)}px)`; tc.drawImage(m, 0, 0);
  GS.mask = tmp; refreshSelection();
}
export function sharpenSelection() {
  if (!hasSelection()) return toast('Make a selection first');
  const d = maskData();
  for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > 127; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
  GS.mask!.getContext('2d')!.putImageData(d, 0, 0); refreshSelection();
}
export function borderSelection(n: number) {
  if (!hasSelection()) return toast('Make a selection first');
  const outer = morph(n, true), inner = morph(n, false);
  const oc = outer.getContext('2d')!;
  oc.globalCompositeOperation = 'destination-out'; oc.drawImage(inner, 0, 0);
  GS.mask = outer; refreshSelection();
}

export function selectionToPath() {
  if (!hasSelection()) { toast('Make a selection first'); return; }
  const m = GS.mask!, d = maskData();
  const bin = new Uint8Array(m.width * m.height);
  for (let i = 0; i < bin.length; i++) bin[i] = d.data[i * 4 + 3] > 127 ? 1 : 0;
  const sps = maskToSubpaths(bin, m.width, m.height, 0.9, 6);
  if (!sps.length) { toast('The selection is empty'); return; }
  const o = newObj('path', currentLayerId(), { name: 'Selection path', subpaths: sps, fill: null, stroke: S.ui.bg, strokeWidth: 2 });
  recentrePath(o);
  addObj(o);
  commit('Selection to path');
  toast('Selection converted to an editable path. Switch to Ink to adjust it.');
}

export function strokeSelection(o: Obj, width: number, colour = S.ui.fg) {
  if (!hasSelection()) { toast('Make a selection first'); return; }
  const m = GS.mask!, d = maskData();
  const bin = new Uint8Array(m.width * m.height);
  for (let i = 0; i < bin.length; i++) bin[i] = d.data[i * 4 + 3] > 127 ? 1 : 0;
  const sps = maskToSubpaths(bin, m.width, m.height, 0.6, 2);
  const c = rasterCanvas(o), ctx = c.getContext('2d')!;
  const M = rasterToPage(o).inverse();
  ctx.save();
  ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.globalAlpha = S.ui.brush.opacity;
  for (const sp of sps) {
    ctx.beginPath();
    sp.nodes.forEach((n, i) => { const nx = sp.nodes[(i + 1) % sp.nodes.length]; if (!i) ctx.moveTo(n.x, n.y); if (i < sp.nodes.length - 1 || sp.closed) ctx.bezierCurveTo(n.ox, n.oy, nx.ix, nx.iy, nx.x, nx.y); });
    ctx.stroke();
  }
  ctx.restore();
  storeRaster(o);
  commit('Stroke selection');
}

/** New layer from the selected pixels of a layer (optionally removing them from the original). */
export function layerViaCopy(o: Obj, cut = false) {
  if (!hasSelection()) { toast('Make a selection first'); return; }
  const b = selectionBounds();
  if (!b) return;
  const pg = page(), t = editTime();
  const full = renderObjectsToCanvas([o], { x: 0, y: 0, w: pg.w, h: pg.h }, t);
  const fc = full.getContext('2d')!;
  fc.globalCompositeOperation = 'destination-in'; fc.drawImage(GS.mask!, 0, 0);
  const c = makeCanvas(b.w, b.h);
  c.getContext('2d')!.drawImage(full, -b.x, -b.y);
  const n = newObj('raster', o.layerId, { name: `${o.name} ${cut ? 'cut' : 'copy'}`, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
  storeRaster(n, c);
  const idx = pg.objects.indexOf(o);
  pg.objects.splice(idx + 1, 0, n);
  if (cut) fillSelection(o, '#000', true);
  S.ui.sel = [n.id];
  commit(cut ? 'Layer via cut' : 'Layer via copy');
}

// ---------- saved selections (channels) ----------
export const CHANNELS: { id: string; name: string; canvas: HTMLCanvasElement; pageId: string }[] = [];
export function saveChannel() {
  if (!hasSelection()) { toast('Make a selection first'); return; }
  CHANNELS.push({ id: uid('ch'), name: `Selection ${CHANNELS.length + 1}`, canvas: cloneCanvas(GS.mask!), pageId: S.ui.pageId });
  emit(); toast('Selection saved. Load it later from the Adjust tab.');
}
export function loadChannel(id: string, mode = S.ui.selMode) {
  const ch = CHANNELS.find(c => c.id === id);
  if (!ch) return;
  const pg = page();
  const c = makeCanvas(pg.w, pg.h); c.getContext('2d')!.drawImage(ch.canvas, 0, 0);
  combineSelection(c, mode);
}
export function deleteChannel(id: string) { const i = CHANNELS.findIndex(c => c.id === id); if (i >= 0) CHANNELS.splice(i, 1); emit(); }

export function toggleQuickMask() {
  S.ui.quickMask = !S.ui.quickMask;
  if (S.ui.quickMask) {
    const pg = page();
    if (!GS.mask || GS.pageId !== pg.id) { GS.mask = makeCanvas(pg.w, pg.h); GS.pageId = pg.id; }
    toast('Quick mask on: paint with light colours to select, dark colours or the eraser to deselect');
  } else if (GS.mask) { if (!selectionBounds()) selectNone(); else refreshSelection(); }
  emit();
}

// ======================================================================
// Layers
// ======================================================================
const rasters = () => page().objects.filter(o => o.type === 'raster');

export function addLayerMask(o: Obj, kind: 'white' | 'black' | 'selection' | 'alpha') {
  const rc = rasterCanvas(o);
  const c = makeCanvas(rc.width, rc.height), ctx = c.getContext('2d')!;
  if (kind === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  else if (kind === 'alpha') { ctx.drawImage(rc, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; } ctx.putImageData(d, 0, 0); }
  else if (kind === 'selection') { const m = maskFor(o); if (m) ctx.drawImage(m, 0, 0); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); } }
  storeMask(o, c);
  S.ui.maskEdit = true;
  commit('Add layer mask');
}
export function deleteLayerMask(o: Obj) { delete o.maskSrc; delete o.maskRev; S.ui.maskEdit = false; commit('Delete layer mask'); }
export function applyLayerMask(o: Obj) {
  const mk = maskCanvas(o);
  if (!mk) return;
  const c = rasterCanvas(o), ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mk, 0, 0, c.width, c.height); ctx.globalCompositeOperation = 'source-over';
  delete o.maskSrc; delete o.maskRev; S.ui.maskEdit = false;
  storeRaster(o); commit('Apply layer mask');
}
export function invertLayerMask(o: Obj) {
  const mk = editableMask(o, 'white'), ctx = mk.getContext('2d')!;
  const d = ctx.getImageData(0, 0, mk.width, mk.height);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = 255 - d.data[i + 3]; }
  ctx.putImageData(d, 0, 0); storeMask(o, mk); commit('Invert layer mask');
}

function replaceWithMerged(objs: Obj[], name: string, box?: { x: number; y: number; w: number; h: number }) {
  const pg = page(), t = editTime();
  const b = box || (() => { const u = unionBox(objs.map(o => pageBox(o, t)))!; return { x: Math.floor(u.x), y: Math.floor(u.y), w: Math.max(1, Math.ceil(u.w)), h: Math.max(1, Math.ceil(u.h)) }; })();
  const c = renderObjectsToCanvas(objs, b, t);
  const n = newObj('raster', objs[objs.length - 1].layerId, { name, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
  storeRaster(n, c);
  const at = pg.objects.indexOf(objs[objs.length - 1]);
  pg.objects = pg.objects.filter(o => !objs.includes(o));
  pg.objects.splice(Math.min(at - (objs.length - 1), pg.objects.length), 0, n);
  S.ui.sel = [n.id];
  return n;
}
export function mergeDown(o: Obj) {
  const list = page().objects, i = list.indexOf(o);
  const below = list.slice(0, i).reverse().find(x => x.type === 'raster' && x.visible);
  if (!below) { toast('There is no pixel layer below to merge into'); return; }
  replaceWithMerged([below, o], below.name);
  commit('Merge down');
}
export function mergeVisible() {
  const rs = rasters().filter(o => o.visible);
  if (rs.length < 2) { toast('Need two or more visible pixel layers'); return; }
  replaceWithMerged(rs, 'Merged layers');
  commit('Merge visible layers');
}
export function newFromVisible() {
  const pg = page();
  const c = compositePage();
  const n = newObj('raster', S.doc.layers[S.doc.layers.length - 1].id, { name: 'Visible', x: pg.w / 2, y: pg.h / 2, w: pg.w, h: pg.h });
  storeRaster(n, c);
  addObj(n); commit('New layer from visible');
}
export function layerToImageSize(o: Obj) {
  const pg = page();
  const c = renderObjectsToCanvas([o], { x: 0, y: 0, w: pg.w, h: pg.h }, editTime());
  storeRaster(o, c);
  o.x = pg.w / 2; o.y = pg.h / 2; o.w = pg.w; o.h = pg.h; o.rotation = 0; o.sx = 1; o.sy = 1;
  if (o.keys) for (const k of ['x', 'y', 'rotation', 'sx', 'sy'] as const) delete o.keys[k];
  delete o.maskSrc; delete o.maskRev;
  commit('Layer to image size');
}
export function autocropLayer(o: Obj) {
  const c = rasterCanvas(o), d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { toast('The layer is empty'); return; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = makeCanvas(w, h);
  n.getContext('2d')!.drawImage(c, -x0, -y0);
  const M = rasterToPage(o);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const ux = (o.w || c.width) / c.width, uy = (o.h || c.height) / c.height;
  const centre = { x: M.a * cx + M.c * cy + M.e, y: M.b * cx + M.d * cy + M.f };
  storeRaster(o, n);
  o.w = w * ux; o.h = h * uy; o.x = centre.x; o.y = centre.y;
  if (o.keys) { delete o.keys.x; delete o.keys.y; }
  delete o.maskSrc; delete o.maskRev;
  commit('Crop layer to content');
}

// ======================================================================
// Whole-image operations
// ======================================================================
function shiftKeys(o: Obj, dx: number, dy: number) {
  o.x += dx; o.y += dy;
  o.keys?.x?.forEach(k => (k.v += dx)); o.keys?.y?.forEach(k => (k.v += dy));
}
export function scaleImage(fx: number, fy: number) {
  const pg = page();
  if (fx <= 0 || fy <= 0) return;
  const uniform = Math.abs(fx - fy) < 1e-6;
  for (const o of pg.objects) {
    o.x *= fx; o.y *= fy;
    o.keys?.x?.forEach(k => (k.v *= fx)); o.keys?.y?.forEach(k => (k.v *= fy));
    if (o.type === 'raster') {
      const c = rasterCanvas(o), n = makeCanvas(Math.max(1, Math.round(c.width * fx)), Math.max(1, Math.round(c.height * fy)));
      const x = n.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height);
      o.w = (o.w || c.width) * fx; o.h = (o.h || c.height) * fy;
      storeRaster(o, n);
      if (o.maskSrc) { const mk = maskCanvas(o); if (mk) { const m2 = makeCanvas(n.width, n.height); m2.getContext('2d')!.drawImage(mk, 0, 0, n.width, n.height); storeMask(o, m2); } }
    } else if (uniform) {
      if (['text', 'table', 'image', 'embed'].includes(o.type)) { o.w = (o.w || 0) * fx; o.h = (o.h || 0) * fx; if (o.size) o.size *= fx; if (o.gutter) o.gutter *= fx; }
      else { o.sx *= fx; o.sy *= fx; }
    } else if (['text', 'table', 'image', 'embed', 'rect', 'ellipse', 'star'].includes(o.type) && Math.abs(o.rotation % 90) < 0.01) { o.w = (o.w || 0) * fx; o.h = (o.h || 0) * fy; }
    else { o.sx *= fx; o.sy *= fy; }
  }
  pg.w = Math.max(1, Math.round(pg.w * fx)); pg.h = Math.max(1, Math.round(pg.h * fy));
  pg.guides = { x: pg.guides.x.map(v => v * fx), y: pg.guides.y.map(v => v * fy) };
  selectNone();
  for (const v of Object.values(S.ui.views)) v.fitted = false;
  commit('Scale image');
}
export function canvasSize(w: number, h: number, ax = 0.5, ay = 0.5) {
  const pg = page();
  const dx = Math.round((w - pg.w) * ax), dy = Math.round((h - pg.h) * ay);
  for (const o of pg.objects) shiftKeys(o, dx, dy);
  pg.guides = { x: pg.guides.x.map(v => v + dx), y: pg.guides.y.map(v => v + dy) };
  pg.w = Math.max(1, Math.round(w)); pg.h = Math.max(1, Math.round(h));
  selectNone();
  for (const v of Object.values(S.ui.views)) v.fitted = false;
  commit('Canvas size');
}
export function rotateImage(deg: 90 | 180 | 270) {
  const pg = page(), W = pg.w, H = pg.h;
  const nw = deg === 180 ? W : H, nh = deg === 180 ? H : W;
  const rot = (x: number, y: number) => {
    const dx = x - W / 2, dy = y - H / 2;
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: nw / 2 + dx * c - dy * s, y: nh / 2 + dx * s + dy * c };
  };
  for (const o of pg.objects) {
    const p = rot(o.x, o.y);
    o.keys?.x?.forEach((k, i) => { const q = rot(k.v, o.keys?.y?.[i]?.v ?? o.y); k.v = q.x; if (o.keys?.y?.[i]) o.keys.y[i].v = q.y; });
    o.x = p.x; o.y = p.y; o.rotation += deg;
  }
  pg.w = nw; pg.h = nh; pg.guides = { x: [], y: [] };
  selectNone();
  for (const v of Object.values(S.ui.views)) v.fitted = false;
  commit('Rotate image');
}
export function flipImage(axis: 'h' | 'v') {
  const pg = page();
  for (const o of pg.objects) {
    if (axis === 'h') { o.x = pg.w - o.x; o.sx *= -1; o.rotation = -o.rotation; } else { o.y = pg.h - o.y; o.sy *= -1; o.rotation = -o.rotation; }
    if (o.keys) { delete o.keys.x; delete o.keys.y; }
  }
  selectNone();
  commit('Flip image');
}
export function autocropImage() {
  const pg = page();
  const c = renderObjectsToCanvas(pg.objects.filter(o => o.visible), { x: 0, y: 0, w: pg.w, h: pg.h }, editTime());
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { toast('Nothing to crop to'); return; }
  cropPageTo({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}


export function openFilter(id: string) {
  const o = paintTarget(false);
  if (!o) { toast('Select a pixel layer first (or rasterise a shape)'); return; }
  S.ui.sel = [o.id];
  S.ui.modal = { kind: 'filter', data: id };
  emit();
}
