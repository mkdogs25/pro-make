import { S, commit, toast } from './store';
import type { Obj } from './model';
import { cloneCanvas, editableMask, makeCanvas, rasterCanvas, storeMask, storeRaster } from './raster';
import { rasterToPage, toRasterPx } from './ops';
import { GS, hasSelection, maskFor, refreshSelection } from './grain';
import { convolve, lum } from './pixfx';
import { page } from './store';

export type BrushKind = 'brush' | 'pencil' | 'airbrush' | 'eraser' | 'smudge' | 'clone' | 'heal' | 'dodge' | 'burn' | 'blur' | 'sharpen';
export const BRUSH_TOOLS: BrushKind[] = ['brush', 'pencil', 'airbrush', 'eraser', 'smudge', 'clone', 'heal', 'dodge', 'burn', 'blur', 'sharpen'];
type Pt = { x: number; y: number };

export interface Target {
  canvas: HTMLCanvasElement;
  toPx: (p: Pt) => Pt;
  scale: number;                 // raster pixels per page unit's inverse: page-size → pixel-size factor
  sel: HTMLCanvasElement | null; // selection mask in this target's pixel space
  alphaMode: boolean;            // painting into a mask: white reveals, erase hides
  lockAlpha: boolean;
  done: () => void;
  obj?: Obj;
}

export function rasterTarget(o: Obj): Target {
  const canvas = rasterCanvas(o);
  const m = rasterToPage(o);
  return {
    canvas, toPx: p => toRasterPx(o, p), scale: 1 / Math.max(0.01, Math.hypot(m.a, m.b)), sel: maskFor(o), alphaMode: false, lockAlpha: !!o.lockAlpha, obj: o,
    done: () => { storeRaster(o, canvas); commit('Paint'); },
  };
}
export function layerMaskTarget(o: Obj): Target {
  const rc = rasterCanvas(o);
  const canvas = editableMask(o, 'white');
  const m = rasterToPage(o);
  const k = canvas.width / rc.width;
  return {
    canvas, toPx: p => { const q = toRasterPx(o, p); return { x: q.x * k, y: q.y * k }; }, scale: 1 / Math.max(0.01, Math.hypot(m.a, m.b)) * k, sel: null, alphaMode: true, lockAlpha: false, obj: o,
    done: () => { storeMask(o, canvas); commit('Paint mask'); },
  };
}
export function quickMaskTarget(): Target {
  const pg = page();
  if (!GS.mask || GS.pageId !== pg.id) { GS.mask = makeCanvas(pg.w, pg.h); GS.pageId = pg.id; }
  return {
    canvas: GS.mask, toPx: p => p, scale: 1, sel: null, alphaMode: true, lockAlpha: false,
    done: () => { refreshSelection(); },
  };
}

const cloneSrc: { pt: Pt | null } = { pt: null };
export function setCloneSource(t: Target, p: Pt) { cloneSrc.pt = t.toPx(p); toast('Source point set. Paint to copy from it.'); }
export const hasCloneSource = () => !!cloneSrc.pt;

const hardnessBlur = (h: number, r: number) => Math.max(0, (1 - h) * r * 0.5);

function makeDab(size: number, kind: BrushKind, colour: string, o: typeof S.ui.brush): HTMLCanvasElement {
  const s = Math.max(3, Math.ceil(size) + 4);
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d')!;
  const r = size / 2, cx = s / 2;
  const hard = kind === 'pencil' ? 1 : o.hardness;
  const aspect = Math.max(0.05, o.aspect / 100);
  ctx.translate(cx, cx); ctx.rotate((o.angle * Math.PI) / 180); ctx.scale(1, aspect); ctx.translate(-cx, -cx);
  const shape = kind === 'pencil' && o.shape === 'round' ? 'round' : o.shape;
  if (shape === 'round') {
    if (hard >= 0.99) { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(cx, cx, r, 0, 7); ctx.fill(); }
    else {
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
      g.addColorStop(0, colour); g.addColorStop(Math.min(0.99, hard), colour);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      // gradient colours with an alpha stop need an rgba end; fake it with destination-in below
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, r, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'destination-in';
      const a = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
      a.addColorStop(0, '#000'); a.addColorStop(Math.min(0.99, hard), '#000'); a.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = a; ctx.fillRect(0, 0, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }
    return c;
  }
  ctx.fillStyle = colour;
  const blur = hardnessBlur(hard, size);
  if (blur > 0.3) ctx.filter = `blur(${blur}px)`;
  ctx.beginPath();
  if (shape === 'square') ctx.rect(cx - r * 0.85, cx - r * 0.85, r * 1.7, r * 1.7);
  else if (shape === 'diamond') { ctx.moveTo(cx, cx - r); ctx.lineTo(cx + r, cx); ctx.lineTo(cx, cx + r); ctx.lineTo(cx - r, cx); ctx.closePath(); }
  else if (shape === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; if (i) ctx.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); else ctx.moveTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); }
  else if (shape === 'spray' || shape === 'chalk') {
    const n = shape === 'spray' ? Math.max(12, Math.round(size * 1.4)) : Math.round(size * size * 0.8);
    ctx.filter = 'none';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r;
      if (shape === 'spray') ctx.fillRect(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1.2, 1.2);
      else { ctx.globalAlpha = 0.3 + Math.random() * 0.7; ctx.fillRect(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1.6, 1.6); }
    }
    ctx.globalAlpha = 1;
    return c;
  }
  ctx.fill();
  return c;
}

export class Stroke {
  t: Target; kind: BrushKind; before: HTMLCanvasElement; buffer: HTMLCanvasElement; work: HTMLCanvasElement | null = null;
  last: Pt | null = null; size: number; dab: HTMLCanvasElement; cloneOffset: Pt | null = null;
  direct: boolean; opts: typeof S.ui.brush; colour: string; revealing: boolean; accum = 0;
  constructor(t: Target, kind: BrushKind) {
    this.t = t; this.kind = kind;
    this.opts = { ...S.ui.brush };
    this.before = cloneCanvas(t.canvas);
    this.buffer = makeCanvas(t.canvas.width, t.canvas.height);
    this.size = Math.max(1, this.opts.size * t.scale);
    this.direct = ['smudge', 'blur', 'sharpen', 'heal', 'clone'].includes(kind);
    if (this.direct) this.work = cloneCanvas(t.canvas);
    // painting into a mask: light colours reveal, dark colours hide; the eraser always hides
    const light = lum(parseInt(S.ui.fg.slice(1, 3), 16), parseInt(S.ui.fg.slice(3, 5), 16), parseInt(S.ui.fg.slice(5, 7), 16)) >= 128;
    this.revealing = light;
    this.colour = kind === 'dodge' ? '#ffffff' : kind === 'burn' ? '#000000' : t.alphaMode ? '#ffffff' : S.ui.fg;
    this.dab = makeDab(this.size, kind, this.colour, this.opts);
  }
  private symmetry(p: Pt): Pt[] {
    const o = this.opts, W = this.t.canvas.width, H = this.t.canvas.height;
    if (o.symmetry === 'none' || this.direct) return [p];
    if (o.symmetry === 'h') return [p, { x: W - p.x, y: p.y }];
    if (o.symmetry === 'v') return [p, { x: p.x, y: H - p.y }];
    if (o.symmetry === 'both') return [p, { x: W - p.x, y: p.y }, { x: p.x, y: H - p.y }, { x: W - p.x, y: H - p.y }];
    const n = Math.max(2, Math.round(o.symN)), out: Pt[] = [], cx = W / 2, cy = H / 2;
    for (let i = 0; i < n; i++) { const a = (i * Math.PI * 2) / n, dx = p.x - cx, dy = p.y - cy; out.push({ x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }); }
    return out;
  }

  to(pagePt: Pt, pressure = 1) {
    const t = this.t, o = this.opts;
    const p = t.toPx(pagePt);
    if ((this.kind === 'clone' || this.kind === 'heal') && !this.cloneOffset) {
      if (!cloneSrc.pt) { toast('Alt-click to set a source point first'); return; }
      this.cloneOffset = { x: cloneSrc.pt.x - p.x, y: cloneSrc.pt.y - p.y };
    }
    const from = this.last || p;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    const base = this.kind === 'smudge' ? 0.08 : this.kind === 'heal' ? 0.25 : this.kind === 'blur' || this.kind === 'sharpen' ? 0.18 : o.spacing / 100;
    const spacing = Math.max(0.6, this.size * Math.max(0.02, base));
    const steps = Math.max(1, Math.ceil(d / spacing));
    const bctx = this.buffer.getContext('2d')!;
    const pk = o.pressure ? 0.15 + 0.85 * pressure : 1;
    for (let i = this.last ? 1 : 0; i <= steps; i++) {
      let x = from.x + ((p.x - from.x) * i) / steps, y = from.y + ((p.y - from.y) * i) / steps;
      const prev = { x: from.x + ((p.x - from.x) * Math.max(0, i - 1)) / steps, y: from.y + ((p.y - from.y) * Math.max(0, i - 1)) / steps };
      let k = pk * (1 + ((Math.random() - 0.5) * 2 * o.sizeJitter) / 100);
      if (o.scatter > 0) { const a = Math.random() * 6.283, r = Math.random() * this.size * (o.scatter / 100); x += Math.cos(a) * r; y += Math.sin(a) * r; }
      k = Math.max(0.05, k);
      if (this.direct) { this.stampDirect(x, y, prev, k); continue; }
      if (o.shape === 'spray' || o.shape === 'chalk') this.dab = makeDab(this.size, this.kind, this.colour, o);
      const s = this.dab.width * k;
      bctx.globalAlpha = Math.min(1, o.flow * (o.pressure ? 0.35 + 0.65 * pressure : 1));
      for (const q of this.symmetry({ x, y })) bctx.drawImage(this.dab, q.x - s / 2, q.y - s / 2, s, s);
    }
    this.last = p;
    this.flush();
  }

  private stampDirect(x: number, y: number, prev: Pt, k: number) {
    const w = this.work!, wctx = w.getContext('2d', { willReadFrequently: true })!;
    const s = Math.max(3, Math.round(this.dab.width * k)), h = s / 2;
    const dabK = k === 1 ? this.dab : (() => { const c = makeCanvas(s, s); c.getContext('2d')!.drawImage(this.dab, 0, 0, s, s); return c; })();
    const str = Math.max(0.02, this.opts.flow);
    if (this.kind === 'smudge') {
      const tmp = makeCanvas(s, s), tc = tmp.getContext('2d')!;
      tc.drawImage(w, prev.x - h, prev.y - h, s, s, 0, 0, s, s);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(dabK, 0, 0);
      wctx.save(); wctx.globalAlpha = 0.55 * str; wctx.drawImage(tmp, x - h, y - h); wctx.restore();
    } else if (this.kind === 'clone') {
      const o = this.cloneOffset!;
      const tmp = makeCanvas(s, s), tc = tmp.getContext('2d')!;
      tc.drawImage(this.before, x + o.x - h, y + o.y - h, s, s, 0, 0, s, s);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(dabK, 0, 0);
      wctx.drawImage(tmp, x - h, y - h);
    } else if (this.kind === 'blur' || this.kind === 'sharpen') {
      const tmp = makeCanvas(s, s), tc = tmp.getContext('2d', { willReadFrequently: true })!;
      if (this.kind === 'blur') { tc.filter = `blur(${Math.max(1, s * 0.06)}px)`; tc.drawImage(w, x - h, y - h, s, s, 0, 0, s, s); tc.filter = 'none'; }
      else {
        tc.drawImage(w, x - h, y - h, s, s, 0, 0, s, s);
        const src = tc.getImageData(0, 0, s, s);
        tc.putImageData(convolve(src, [0, -1, 0, -1, 5, -1, 0, -1, 0]), 0, 0);
      }
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(dabK, 0, 0);
      wctx.save(); wctx.globalAlpha = 0.6 * str; wctx.drawImage(tmp, x - h, y - h); wctx.restore();
    } else if (this.kind === 'heal') {
      const o = this.cloneOffset!;
      const tmp = makeCanvas(s, s), tc = tmp.getContext('2d', { willReadFrequently: true })!;
      tc.drawImage(this.before, x + o.x - h, y + o.y - h, s, s, 0, 0, s, s);
      const srcPatch = tc.getImageData(0, 0, s, s), dstPatch = wctx.getImageData(Math.round(x - h), Math.round(y - h), s, s);
      // shift the sampled texture so its average colour matches what is already at the destination
      let sr = 0, sg = 0, sb = 0, dr = 0, dg = 0, db = 0, n = 0;
      for (let i = 0; i < srcPatch.data.length; i += 4) if (srcPatch.data[i + 3] > 20 && dstPatch.data[i + 3] > 20) { sr += srcPatch.data[i]; sg += srcPatch.data[i + 1]; sb += srcPatch.data[i + 2]; dr += dstPatch.data[i]; dg += dstPatch.data[i + 1]; db += dstPatch.data[i + 2]; n++; }
      if (n) {
        const er = (dr - sr) / n, eg = (dg - sg) / n, eb = (db - sb) / n;
        for (let i = 0; i < srcPatch.data.length; i += 4) { srcPatch.data[i] += er; srcPatch.data[i + 1] += eg; srcPatch.data[i + 2] += eb; }
        tc.putImageData(srcPatch, 0, 0);
      }
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(dabK, 0, 0);
      wctx.drawImage(tmp, x - h, y - h);
    }
  }

  /** Composite the stroke so far onto the target, honouring opacity, selection and lock-alpha. */
  private flush() {
    const t = this.t, ctx = t.canvas.getContext('2d')!;
    const opacity = this.opts.opacity;
    if (this.direct) {
      let res = this.work!;
      if (t.sel) { const m = cloneCanvas(res), mc = m.getContext('2d')!; mc.globalCompositeOperation = 'destination-in'; mc.drawImage(t.sel, 0, 0); res = m; }
      ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.before, 0, 0);
      ctx.globalCompositeOperation = t.lockAlpha ? 'source-atop' : 'source-over';
      ctx.globalAlpha = this.kind === 'clone' || this.kind === 'heal' ? opacity : 1;
      ctx.drawImage(res, 0, 0); ctx.restore();
      return;
    }
    const bctx = this.buffer.getContext('2d')!;
    if (t.sel) { bctx.save(); bctx.globalCompositeOperation = 'destination-in'; bctx.globalAlpha = 1; bctx.drawImage(t.sel, 0, 0); bctx.restore(); }
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.before, 0, 0);
    const erase = this.kind === 'eraser' || (t.alphaMode && !this.revealing);
    if (this.kind === 'dodge' || this.kind === 'burn') {
      const tmp = cloneCanvas(this.buffer), tc = tmp.getContext('2d')!;
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(this.before, 0, 0);
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = opacity * 0.6; ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.globalCompositeOperation = erase ? 'destination-out' : t.lockAlpha ? 'source-atop' : 'source-over';
      ctx.globalAlpha = opacity;
      ctx.drawImage(this.buffer, 0, 0);
    }
    ctx.restore();
  }

  end() { this.t.done(); }
}

export const brushActive = () => hasSelection();
