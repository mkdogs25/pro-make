import type { Obj } from './model';
import { emit } from './store';

// Live pixel canvases for raster objects. The doc stores a PNG data URL plus a
// revision id; the canvas here is reloaded whenever the revision differs
// (e.g. after undo).
const reg = new Map<string, { canvas: HTMLCanvasElement; rev: string | undefined; loading?: string }>();

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export function rasterCanvas(o: Obj): HTMLCanvasElement {
  let e = reg.get(o.id);
  if (!e) { e = { canvas: makeCanvas(o.w!, o.h!), rev: undefined }; reg.set(o.id, e); }
  if (e.rev !== o.rev && e.loading !== o.rev) {
    const want = o.rev, src = o.src;
    e.loading = want;
    if (!src) { e.canvas.width = Math.round(o.w!); e.canvas.height = Math.round(o.h!); e.rev = want; e.loading = undefined; }
    else {
      const img = new Image();
      img.onload = () => {
        const cur = reg.get(o.id)!;
        if (cur.loading !== want) return;
        cur.canvas.width = img.naturalWidth; cur.canvas.height = img.naturalHeight;
        cur.canvas.getContext('2d')!.drawImage(img, 0, 0);
        cur.rev = want; cur.loading = undefined;
        emit();
      };
      img.src = src;
    }
  }
  return e.canvas;
}

/** Register a canvas as the current pixels of a raster object (after painting). */
export function storeRaster(o: Obj, canvas?: HTMLCanvasElement) {
  const c = canvas || rasterCanvas(o);
  o.src = c.toDataURL('image/png');
  o.rev = Math.random().toString(36).slice(2);
  if (!o.w || !o.h) { o.w = c.width; o.h = c.height; }
  reg.set(o.id, { canvas: c, rev: o.rev });
}

export function cloneCanvas(c: HTMLCanvasElement) {
  const n = makeCanvas(c.width, c.height);
  n.getContext('2d')!.drawImage(c, 0, 0);
  return n;
}

// ---------- images used by media clips ----------
const imgs = new Map<string, HTMLImageElement>();
export function imageFor(url: string): HTMLImageElement {
  let i = imgs.get(url);
  if (!i) { i = new Image(); i.onload = () => emit(); i.src = url; imgs.set(url, i); }
  return i;
}

// ---------- layer masks (alpha = visibility) ----------
const masks = new Map<string, { canvas: HTMLCanvasElement; rev: string | undefined; loading?: string }>();

/** The layer mask canvas for a raster, or null while it is still loading / when there is none. */
export function maskCanvas(o: Obj): HTMLCanvasElement | null {
  if (!o.maskSrc) return null;
  let e = masks.get(o.id);
  if (e && e.rev === o.maskRev) return e.canvas;
  if (!e) { e = { canvas: makeCanvas(o.w || 1, o.h || 1), rev: undefined }; masks.set(o.id, e); }
  if (e.loading !== o.maskRev) {
    const want = o.maskRev, src = o.maskSrc;
    e.loading = want;
    const img = new Image();
    img.onload = () => {
      const cur = masks.get(o.id)!;
      if (cur.loading !== want) return;
      cur.canvas.width = img.naturalWidth; cur.canvas.height = img.naturalHeight;
      cur.canvas.getContext('2d')!.drawImage(img, 0, 0);
      cur.rev = want; cur.loading = undefined;
      emit();
    };
    img.src = src;
  }
  return null;
}

export function storeMask(o: Obj, canvas: HTMLCanvasElement) {
  o.maskSrc = canvas.toDataURL('image/png');
  o.maskRev = Math.random().toString(36).slice(2);
  masks.set(o.id, { canvas, rev: o.maskRev });
}
/** Mutable mask canvas for painting (creates a fully-visible mask if none exists). */
export function editableMask(o: Obj, fill: 'white' | 'black' | 'none' = 'white'): HTMLCanvasElement {
  const existing = maskCanvas(o);
  if (existing) return existing;
  const rc = rasterCanvas(o);
  const c = makeCanvas(rc.width, rc.height);
  if (fill !== 'none') { const x = c.getContext('2d')!; x.fillStyle = '#fff'; if (fill === 'white') x.fillRect(0, 0, c.width, c.height); }
  masks.set(o.id, { canvas: c, rev: undefined });
  return c;
}
