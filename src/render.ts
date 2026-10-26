import type { Clip, ClipFx, Doc, Obj, Page, Paint } from './model';
import { anim, localBox, objPath2D, type Box } from './geometry';
import { rasterCanvas, imageFor } from './raster';
import { drawTextLines, layoutAll } from './text';
import { mediaEl } from './media';

export interface RenderOpts { time: number; hidden?: Set<string>; depth?: number; noBg?: boolean; textOverflowMarks?: boolean }

export function setPaint(ctx: CanvasRenderingContext2D, which: 'fill' | 'stroke', p: Paint, b: Box) {
  if (!p) return false;
  if (typeof p === 'string') { ctx[which === 'fill' ? 'fillStyle' : 'strokeStyle'] = p; return true; }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let g: CanvasGradient;
  if (p.kind === 'radial') g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.w, b.h) / 2 || 1);
  else {
    const a = (p.angle * Math.PI) / 180;
    const r = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.h) / 2;
    g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  for (const s of p.stops) g.addColorStop(Math.min(1, Math.max(0, s.o)), s.c);
  ctx[which === 'fill' ? 'fillStyle' : 'strokeStyle'] = g;
  return true;
}

export function pageNumber(doc: Doc, page: Page) {
  return doc.pages.filter(p => !p.isMaster).indexOf(page) + 1;
}

export function renderPage(ctx: CanvasRenderingContext2D, doc: Doc, page: Page, opts: RenderOpts) {
  const depth = opts.depth || 0;
  if (depth > 3) return;
  if (page.bg && !opts.noBg) { ctx.fillStyle = page.bg; ctx.fillRect(0, 0, page.w, page.h); }
  const layout = layoutAll(doc);
  const master = page.masterId ? doc.pages.find(p => p.id === page.masterId) : null;
  const pn = pageNumber(doc, page);
  const sources = master ? [master, page] : [page];
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const src of sources) for (const o of src.objects) {
      const lid = doc.layers.some(l => l.id === o.layerId) ? o.layerId : doc.layers[0].id;
      if (lid !== layer.id || !o.visible || opts.hidden?.has(o.id)) continue;
      ctx.save();
      ctx.globalAlpha *= layer.opacity;
      drawObject(ctx, doc, o, opts, layout, pn);
      ctx.restore();
    }
  }
}

export function drawObject(ctx: CanvasRenderingContext2D, doc: Doc, o: Obj, opts: RenderOpts, layout = layoutAll(doc), pageNo = 1) {
  const a = anim(o, opts.time);
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate((a.rotation * Math.PI) / 180); ctx.scale(a.sx, a.sy);
  ctx.globalAlpha *= Math.max(0, Math.min(1, a.opacity));
  ctx.globalCompositeOperation = o.blend || 'source-over';
  const b = localBox(o);
  switch (o.type) {
    case 'text': {
      if (o.frameFill) { ctx.fillStyle = o.frameFill; ctx.fillRect(b.x, b.y, b.w, b.h); }
      if (typeof o.fill === 'string') ctx.fillStyle = o.fill; else setPaint(ctx, 'fill', o.fill, b);
      drawTextLines(ctx, o, layout.get(o.id), pageNo);
      break;
    }
    case 'raster': {
      const c = rasterCanvas(o);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, b.x, b.y, b.w, b.h);
      break;
    }
    case 'embed': {
      const target = doc.pages.find(p => p.id === o.pageId);
      ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      if (target) {
        const s = Math.min(b.w / target.w, b.h / target.h);
        ctx.translate(-target.w * s / 2, -target.h * s / 2);
        ctx.scale(s, s);
        renderPage(ctx, doc, target, { ...opts, depth: (opts.depth || 0) + 1 });
      }
      break;
    }
    default: {
      const p = objPath2D(o);
      if (setPaint(ctx, 'fill', o.fill, b)) ctx.fill(p, o.fillRule || 'nonzero');
      if (o.strokeWidth > 0 && setPaint(ctx, 'stroke', o.stroke, b)) {
        ctx.lineWidth = o.strokeWidth;
        ctx.lineCap = o.cap || 'round'; ctx.lineJoin = o.join || 'round';
        ctx.setLineDash(o.dash || []);
        ctx.stroke(p);
      }
    }
  }
  ctx.restore();
}

// ---------- Motion composite ----------
export function fxFilter(fx: ClipFx) {
  const f: string[] = [];
  if (fx.brightness !== 100) f.push(`brightness(${fx.brightness}%)`);
  if (fx.contrast !== 100) f.push(`contrast(${fx.contrast}%)`);
  if (fx.saturate !== 100) f.push(`saturate(${fx.saturate}%)`);
  if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.blur) f.push(`blur(${fx.blur}px)`);
  if (fx.grayscale) f.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia) f.push(`sepia(${fx.sepia}%)`);
  return f.length ? f.join(' ') : 'none';
}

export const clipActive = (c: Clip, t: number) => t >= c.start && t < c.start + c.dur;
export function clipAlpha(c: Clip, t: number) {
  let a = c.opacity;
  const lt = t - c.start;
  if (c.fadeIn > 0 && lt < c.fadeIn) a *= lt / c.fadeIn;
  if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) a *= Math.max(0, (c.dur - lt) / c.fadeOut);
  return a;
}

/** Matrix mapping page coordinates into frame coordinates for a scene clip. */
export function sceneMatrix(doc: Doc, c: Clip) {
  const tl = doc.timeline;
  const p = doc.pages.find(pg => pg.id === c.pageId);
  if (!p) return new DOMMatrix();
  const s = Math.min(tl.w / p.w, tl.h / p.h) * c.scale;
  return new DOMMatrix().translate(tl.w / 2 + c.x, tl.h / 2 + c.y).scale(s).translate(-p.w / 2, -p.h / 2);
}

export function renderFrame(ctx: CanvasRenderingContext2D, doc: Doc, t: number, opts: Partial<RenderOpts> = {}) {
  const tl = doc.timeline;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, tl.w, tl.h);
  const vids = tl.tracks.filter(tr => tr.kind === 'video' && !tr.hidden);
  for (let i = vids.length - 1; i >= 0; i--) {
    for (const c of vids[i].clips) {
      if (!clipActive(c, t)) continue;
      ctx.save();
      ctx.globalAlpha = clipAlpha(c, t);
      ctx.filter = fxFilter(c.fx);
      const lt = c.offset + (t - c.start) * c.speed;
      if (c.kind === 'scene') {
        const p = doc.pages.find(pg => pg.id === c.pageId);
        if (p) {
          const m = sceneMatrix(doc, c);
          ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          ctx.beginPath(); ctx.rect(0, 0, p.w, p.h); ctx.clip();
          renderPage(ctx, doc, p, { time: lt, ...opts });
        }
      } else if (c.kind === 'media') {
        const md = doc.media.find(m => m.id === c.mediaId);
        if (md) {
          let src: CanvasImageSource | null = null, w = md.w, h = md.h;
          if (md.kind === 'video') { const v = mediaEl(md) as HTMLVideoElement; if (v.readyState >= 2) { src = v; w = v.videoWidth; h = v.videoHeight; } }
          else if (md.kind === 'image') { const im = imageFor(md.url); if (im.complete && im.naturalWidth) { src = im; w = im.naturalWidth; h = im.naturalHeight; } }
          if (src && w && h) {
            const s = Math.min(tl.w / w, tl.h / h) * c.scale;
            ctx.drawImage(src, tl.w / 2 + c.x - (w * s) / 2, tl.h / 2 + c.y - (h * s) / 2, w * s, h * s);
          }
        }
      } else if (c.kind === 'title') {
        ctx.font = `700 ${c.fontSize || 48}px "${c.font || 'Fraunces'}"`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = c.color || '#fff';
        const lines = (c.text || '').split('\n');
        const lh = (c.fontSize || 48) * 1.15;
        lines.forEach((l, k) => ctx.fillText(l, c.x, c.y + (k - (lines.length - 1) / 2) * lh));
      }
      ctx.restore();
    }
  }
}

export function timelineDuration(doc: Doc) {
  let d = 1;
  for (const tr of doc.timeline.tracks) for (const c of tr.clips) d = Math.max(d, c.start + c.dur);
  return d;
}
