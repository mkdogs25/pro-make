import type { Clip, ClipFx, ClipProp, Doc, Obj, Page, Paint, Pattern, Track } from './model';
import { isGradient, isPattern } from './model';
import { anim, localBox, mapNodes, markerPaths, objMatrix, objPath2D, objSubpaths, pathSampler, subpathsToPath2D, valueAt, type Box } from './geometry';
import { rasterCanvas, imageFor, maskCanvas, makeCanvas } from './raster';
import { drawTextLines, fontString, layoutAll } from './text';
import { mediaEl } from './media';
import { applyClipFilters } from './clipfx';

export interface RenderOpts { time: number; hidden?: Set<string>; depth?: number; noBg?: boolean; lookup?: Map<string, Obj> }

// ---------- paints ----------
const patCache = new Map<string, CanvasPattern>();
function patternFor(ctx: CanvasRenderingContext2D, p: Pattern): CanvasPattern | null {
  const key = JSON.stringify(p);
  let pat = patCache.get(key);
  if (!pat) {
    const s = Math.max(4, p.size), z = 2;
    const c = document.createElement('canvas');
    c.width = c.height = s * z;
    const x = c.getContext('2d')!;
    x.scale(z, z);
    x.fillStyle = p.c1; x.fillRect(0, 0, s, s);
    x.fillStyle = p.c2; x.strokeStyle = p.c2; x.lineWidth = Math.max(1, s * 0.12);
    switch (p.pattern) {
      case 'stripes': case 'diagonal': x.fillRect(0, 0, s / 2, s); break;
      case 'dots': x.beginPath(); x.arc(s / 2, s / 2, s * 0.24, 0, 7); x.fill(); break;
      case 'checks': x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2); break;
      case 'grid': x.strokeRect(0, 0, s, s); break;
      case 'cross': x.fillRect(s * 0.4, s * 0.15, s * 0.2, s * 0.7); x.fillRect(s * 0.15, s * 0.4, s * 0.7, s * 0.2); break;
      case 'waves': x.beginPath(); for (let i = 0; i <= s; i++) { const y = s / 2 + Math.sin((i / s) * Math.PI * 2) * s * 0.22; if (i) x.lineTo(i, y); else x.moveTo(i, y); } x.stroke(); break;
    }
    pat = ctx.createPattern(c, 'repeat')!;
    patCache.set(key, pat);
    if (patCache.size > 60) patCache.delete(patCache.keys().next().value!);
  }
  if (!pat) return null;
  const rot = p.angle + (p.pattern === 'diagonal' ? 45 : 0);
  pat.setTransform(new DOMMatrix().rotate(rot).scale(1 / 2));
  return pat;
}

export function setPaint(ctx: CanvasRenderingContext2D, which: 'fill' | 'stroke', p: Paint, b: Box) {
  if (!p) return false;
  const key = which === 'fill' ? 'fillStyle' : 'strokeStyle';
  if (typeof p === 'string') { ctx[key] = p; return true; }
  if (isPattern(p)) { const pat = patternFor(ctx, p); if (!pat) return false; ctx[key] = pat; return true; }
  if (!isGradient(p)) return false;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let g: CanvasGradient;
  if (p.kind === 'radial') g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.w, b.h) / 2 || 1);
  else {
    const a = (p.angle * Math.PI) / 180;
    const r = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.h) / 2;
    g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  for (const s of p.stops) g.addColorStop(Math.min(1, Math.max(0, s.o)), s.c);
  ctx[key] = g;
  return true;
}

export function pageNumber(doc: Doc, page: Page) {
  return doc.pages.filter(p => !p.isMaster).indexOf(page) + 1;
}

// ---------- pages ----------
export function renderPage(ctx: CanvasRenderingContext2D, doc: Doc, page: Page, opts: RenderOpts) {
  const depth = opts.depth || 0;
  if (depth > 3) return;
  if (page.bg && !opts.noBg) { ctx.fillStyle = page.bg; ctx.fillRect(0, 0, page.w, page.h); }
  const layout = layoutAll(doc);
  const master = page.masterId ? doc.pages.find(p => p.id === page.masterId) : null;
  const pn = pageNumber(doc, page);
  const sources = master ? [master, page] : [page];
  const lookup = new Map<string, Obj>();
  for (const s of sources) for (const o of s.objects) lookup.set(o.id, o);
  const o2 = { ...opts, lookup };
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const src of sources) for (const o of src.objects) {
      const lid = doc.layers.some(l => l.id === o.layerId) ? o.layerId : doc.layers[0].id;
      if (lid !== layer.id || !o.visible || o.isClip || opts.hidden?.has(o.id)) continue;
      ctx.save();
      ctx.globalAlpha *= layer.opacity;
      drawObject(ctx, doc, o, o2, layout, pn);
      ctx.restore();
    }
  }
}

function clipTo(ctx: CanvasRenderingContext2D, cl: Obj, t: number) {
  const base = ctx.getTransform();
  const a = anim(cl, t);
  ctx.translate(a.x, a.y); ctx.rotate((a.rotation * Math.PI) / 180); ctx.scale(a.sx, a.sy);
  if (['rect', 'ellipse', 'star', 'path'].includes(cl.type)) ctx.clip(objPath2D(cl), cl.fillRule || 'nonzero');
  else { const b = localBox(cl), p = new Path2D(); p.rect(b.x, b.y, b.w, b.h); ctx.clip(p); }
  ctx.setTransform(base);
}

export function drawObject(ctx: CanvasRenderingContext2D, doc: Doc, o: Obj, opts: RenderOpts, layout = layoutAll(doc), pageNo = 1) {
  const pageM = ctx.getTransform();
  const a = anim(o, opts.time);
  ctx.save();
  if (o.clipBy && opts.lookup) { const cl = opts.lookup.get(o.clipBy); if (cl) clipTo(ctx, cl, opts.time); }
  // blur and drop shadow ride on the canvas filter; sizes are in page units
  if (o.blur || o.shadow) {
    const sc = Math.hypot(pageM.a, pageM.b) || 1;
    const fl: string[] = [];
    if (ctx.filter && ctx.filter !== 'none') fl.push(ctx.filter);
    if (o.blur) fl.push(`blur(${(o.blur * sc).toFixed(2)}px)`);
    if (o.shadow) fl.push(`drop-shadow(${o.shadow.dx * sc}px ${o.shadow.dy * sc}px ${o.shadow.blur * sc}px ${o.shadow.color})`);
    ctx.filter = fl.join(' ');
  }
  ctx.translate(a.x, a.y); ctx.rotate((a.rotation * Math.PI) / 180); ctx.scale(a.sx, a.sy);
  ctx.globalAlpha *= Math.max(0, Math.min(1, a.opacity));
  ctx.globalCompositeOperation = o.blend || 'source-over';
  const b = localBox(o);
  switch (o.type) {
    case 'text': {
      if (o.textPath && opts.lookup) { drawTextOnPath(ctx, o, opts, pageM); break; }
      if (o.frameFill) { ctx.fillStyle = o.frameFill; ctx.fillRect(b.x, b.y, b.w, b.h); }
      if (typeof o.fill === 'string') ctx.fillStyle = o.fill; else setPaint(ctx, 'fill', o.fill, b);
      drawTextLines(ctx, o, layout.get(o.id), pageNo);
      break;
    }
    case 'raster': {
      const c = rasterCanvas(o);
      ctx.imageSmoothingQuality = 'high';
      const mk = o.maskSrc ? maskCanvas(o) : null;
      if (mk) {
        const t = makeCanvas(c.width, c.height), tc = t.getContext('2d')!;
        tc.drawImage(c, 0, 0);
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(mk, 0, 0, c.width, c.height);
        ctx.drawImage(t, b.x, b.y, b.w, b.h);
      } else ctx.drawImage(c, b.x, b.y, b.w, b.h);
      break;
    }
    case 'image': drawImageFrame(ctx, o, b); break;
    case 'table': drawTable(ctx, o, b); break;
    case 'embed': {
      const target = doc.pages.find(p => p.id === o.pageId);
      ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      if (target) {
        const s = Math.min(b.w / target.w, b.h / target.h);
        ctx.translate(-target.w * s / 2, -target.h * s / 2);
        ctx.scale(s, s);
        renderPage(ctx, doc, target, { ...opts, depth: (opts.depth || 0) + 1, lookup: undefined });
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
        ctx.setLineDash([]);
        if ((o.markerStart && o.markerStart !== 'none') || (o.markerEnd && o.markerEnd !== 'none')) {
          ctx.fillStyle = typeof o.stroke === 'string' ? o.stroke : '#000';
          for (const sp of markerPaths(o)) ctx.fill(subpathsToPath2D([sp]));
        }
      }
    }
  }
  ctx.restore();
}

function drawTextOnPath(ctx: CanvasRenderingContext2D, o: Obj, opts: RenderOpts, pageM: DOMMatrix) {
  const pth = opts.lookup!.get(o.textPath!);
  if (!pth) return;
  const sm = pathSampler(mapNodes(objSubpaths(pth), objMatrix(pth, opts.time)));
  if (sm.len <= 0) return;
  ctx.setTransform(pageM);
  ctx.font = fontString(o);
  ctx.textBaseline = 'alphabetic';
  if (typeof o.fill === 'string') ctx.fillStyle = o.fill;
  const ls = o.letterSpacing || 0;
  const chars = [...(o.text || '').replace(/\n/g, ' ')];
  const ws = chars.map(ch => ctx.measureText(ch).width + ls);
  const total = ws.reduce((s, w) => s + w, 0);
  const al = o.align || 'left';
  let d = (o.textOffset || 0) + (al === 'center' ? (sm.len - total) / 2 : al === 'right' ? sm.len - total : 0);
  const stroke = typeof o.stroke === 'string' && o.strokeWidth > 0;
  if (stroke) { ctx.strokeStyle = o.stroke as string; ctx.lineWidth = o.strokeWidth; }
  chars.forEach((ch, i) => {
    const mid = d + ws[i] / 2;
    d += ws[i];
    if (!sm.closed && (mid < 0 || mid > sm.len)) return;
    const pt = sm.at(mid);
    ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.a);
    if (stroke) ctx.strokeText(ch, -ws[i] / 2, 0);
    ctx.fillText(ch, -ws[i] / 2, 0);
    ctx.restore();
  });
}

function drawImageFrame(ctx: CanvasRenderingContext2D, o: Obj, b: Box) {
  if (o.fill) { setPaint(ctx, 'fill', o.fill, b); ctx.fillRect(b.x, b.y, b.w, b.h); }
  if (o.src) {
    const im = imageFor(o.src);
    if (im.complete && im.naturalWidth) {
      ctx.save();
      ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      const iw = im.naturalWidth, ih = im.naturalHeight;
      let sx = 1, sy = 1;
      switch (o.fit || 'fill') {
        case 'fit': sx = sy = Math.min(b.w / iw, b.h / ih); break;
        case 'fill': sx = sy = Math.max(b.w / iw, b.h / ih); break;
        case 'stretch': sx = b.w / iw; sy = b.h / ih; break;
        default: sx = sy = 1;
      }
      const k = o.imgScale || 1;
      ctx.translate(b.x + b.w / 2 + (o.imgX || 0), b.y + b.h / 2 + (o.imgY || 0));
      ctx.rotate(((o.imgRot || 0) * Math.PI) / 180);
      ctx.scale(sx * k, sy * k);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, -iw / 2, -ih / 2);
      ctx.restore();
    }
  }
  if (o.stroke && o.strokeWidth > 0 && setPaint(ctx, 'stroke', o.stroke, b)) { ctx.lineWidth = o.strokeWidth; ctx.strokeRect(b.x, b.y, b.w, b.h); }
}

export function tableGeometry(o: Obj) {
  const rows = o.rows || 1, cols = o.cols || 1;
  const cw = o.colW && o.colW.length === cols ? o.colW : Array(cols).fill(o.w! / cols);
  const rh = o.rowH && o.rowH.length === rows ? o.rowH : Array(rows).fill(o.h! / rows);
  const sx = o.w! / cw.reduce((s, v) => s + v, 0), sy = o.h! / rh.reduce((s, v) => s + v, 0);
  return { rows, cols, cw: cw.map(v => v * sx), rh: rh.map(v => v * sy) };
}

function drawTable(ctx: CanvasRenderingContext2D, o: Obj, b: Box) {
  const { rows, cols, cw, rh } = tableGeometry(o);
  const pad = o.pad ?? 6;
  let y = b.y;
  for (let r = 0; r < rows; r++) {
    let x = b.x;
    for (let c = 0; c < cols; c++) {
      const bg = o.header && r === 0 && o.headerFill ? o.headerFill : o.zebra && r % 2 === 0 ? o.zebra : o.frameFill;
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, cw[c], rh[r]); }
      const txt = o.cells?.[r]?.[c] || '';
      if (txt) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, cw[c], rh[r]); ctx.clip();
        const bold = !!o.header && r === 0;
        ctx.font = fontString(o, bold);
        ctx.fillStyle = typeof o.fill === 'string' ? o.fill : '#000';
        ctx.textBaseline = 'top';
        const lh = (o.size || 14) * (o.lineHeight || 1.3);
        const lines: string[] = [];
        for (const para of txt.split('\n')) {
          let line = '';
          for (const word of para.split(' ')) {
            const t = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(t).width > cw[c] - pad * 2) { lines.push(line); line = word; } else line = t;
          }
          lines.push(line);
        }
        lines.forEach((l, i) => {
          const tw = ctx.measureText(l).width;
          const al = o.align || 'left';
          const tx = al === 'center' ? x + (cw[c] - tw) / 2 : al === 'right' ? x + cw[c] - pad - tw : x + pad;
          ctx.fillText(l, tx, y + pad + i * lh);
        });
        ctx.restore();
      }
      x += cw[c];
    }
    y += rh[r];
  }
  if ((o.borderW ?? 1) > 0) {
    ctx.strokeStyle = o.borderColor || '#000'; ctx.lineWidth = o.borderW ?? 1; ctx.lineCap = 'butt';
    ctx.beginPath();
    let yy = b.y; for (let r = 0; r <= rows; r++) { ctx.moveTo(b.x, yy); ctx.lineTo(b.x + b.w, yy); if (r < rows) yy += rh[r]; }
    let xx = b.x; for (let c = 0; c <= cols; c++) { ctx.moveTo(xx, b.y); ctx.lineTo(xx, b.y + b.h); if (c < cols) xx += cw[c]; }
    ctx.stroke();
  }
}

// ---------- Motion ----------
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

/** A clip's animatable property at timeline time t (keyframes are relative to the clip start). */
export function clipValue(c: Clip, p: ClipProp, t: number): number {
  const base = p === 'x' ? c.x : p === 'y' ? c.y : p === 'scale' ? c.scale : p === 'rotation' ? c.rotation ?? 0 : p === 'opacity' ? c.opacity : c.volume;
  return valueAt(c.keys?.[p], base, t - c.start);
}

export function clipAlpha(c: Clip, t: number) {
  let a = clipValue(c, 'opacity', t);
  const lt = t - c.start;
  if (c.fadeIn > 0 && lt < c.fadeIn) a *= lt / c.fadeIn;
  if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) a *= Math.max(0, (c.dur - lt) / c.fadeOut);
  return a;
}

/** Local (source) time of a clip at timeline time t. */
export const clipLocalTime = (c: Clip, t: number) => (c.freeze ? c.offset : c.offset + (t - c.start) * c.speed);

/** Matrix mapping page coordinates into frame coordinates for a scene clip. */
export function sceneMatrix(doc: Doc, c: Clip, t?: number) {
  const tl = doc.timeline;
  const p = doc.pages.find(pg => pg.id === c.pageId);
  if (!p) return new DOMMatrix();
  const x = t === undefined ? c.x : clipValue(c, 'x', t), y = t === undefined ? c.y : clipValue(c, 'y', t);
  const sc = t === undefined ? c.scale : clipValue(c, 'scale', t), rot = t === undefined ? c.rotation ?? 0 : clipValue(c, 'rotation', t);
  const s = Math.min(tl.w / p.w, tl.h / p.h) * sc;
  return new DOMMatrix().translate(tl.w / 2 + x, tl.h / 2 + y).rotate(rot).scale(s).translate(-p.w / 2, -p.h / 2);
}

const layerCanvas = document.createElement('canvas');
function frameLayer(w: number, h: number) {
  if (layerCanvas.width !== w || layerCanvas.height !== h) { layerCanvas.width = w; layerCanvas.height = h; }
  const c = layerCanvas.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.clearRect(0, 0, w, h);
  return c;
}

export function renderFrame(ctx: CanvasRenderingContext2D, doc: Doc, t: number, opts: Partial<RenderOpts> = {}) {
  const tl = doc.timeline;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, tl.w, tl.h);
  const vids = tl.tracks.filter(tr => tr.kind === 'video' && !tr.hidden);
  for (let i = vids.length - 1; i >= 0; i--) {
    const tr = vids[i];
    const active = tr.clips.filter(c => clipActive(c, t)).sort((a, b) => a.start - b.start);
    for (const c of active) drawClip(ctx, doc, tr, c, t, opts);
  }
}

function transitionProgress(tr: Track, c: Clip, t: number): number {
  let prevEnd = -1;
  for (const o of tr.clips) {
    if (o === c || o.start >= c.start) continue;
    const end = o.start + o.dur;
    if (end > c.start && end > prevEnd) prevEnd = end;
  }
  if (prevEnd < 0 || t >= prevEnd) return 1;
  return Math.max(0, Math.min(1, (t - c.start) / (prevEnd - c.start)));
}

function drawClip(ctx: CanvasRenderingContext2D, doc: Doc, tr: Track, c: Clip, t: number, opts: Partial<RenderOpts>) {
  const tl = doc.timeline, W = tl.w, H = tl.h;
  const lt = clipLocalTime(c, t);
  const tp = transitionProgress(tr, c, t);
  let alpha = clipAlpha(c, t);
  ctx.save();
  // transitions (a clip overlapping an earlier clip on the same track blends in)
  if (tp < 1) {
    const type = c.trans || 'dissolve';
    switch (type) {
      case 'dissolve': alpha *= tp; break;
      case 'wipel': ctx.beginPath(); ctx.rect(0, 0, W * tp, H); ctx.clip(); break;
      case 'wiper': ctx.beginPath(); ctx.rect(W * (1 - tp), 0, W * tp, H); ctx.clip(); break;
      case 'wipeu': ctx.beginPath(); ctx.rect(0, 0, W, H * tp); ctx.clip(); break;
      case 'wiped': ctx.beginPath(); ctx.rect(0, H * (1 - tp), W, H * tp); ctx.clip(); break;
      case 'slidel': ctx.translate(-W * (1 - tp), 0); break;
      case 'slider': ctx.translate(W * (1 - tp), 0); break;
      case 'zoom': { const z = 0.4 + 0.6 * tp; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); alpha *= tp; break; }
      case 'iris': ctx.beginPath(); ctx.arc(W / 2, H / 2, tp * Math.hypot(W, H) / 2, 0, 7); ctx.clip(); break;
      case 'barn': ctx.beginPath(); ctx.rect((W / 2) * (1 - tp), 0, W * tp, H); ctx.clip(); break;
      case 'dip':
        if (tp < 0.5) { ctx.globalAlpha = tp * 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
        ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
        alpha *= (tp - 0.5) * 2; break;
    }
  }
  ctx.globalAlpha *= Math.max(0, alpha);
  const hasFx = !!c.filters?.some(f => f.on);
  const baseFilter = fxFilter(c.fx);
  if (!hasFx) ctx.filter = baseFilter;
  const target = hasFx ? frameLayer(W, H) : ctx;
  paintClip(target, doc, c, t, lt, opts);
  if (hasFx) {
    applyClipFilters(layerCanvas, c.filters!);
    ctx.filter = baseFilter;
    ctx.drawImage(layerCanvas, 0, 0);
  }
  ctx.restore();
}

function paintClip(ctx: CanvasRenderingContext2D, doc: Doc, c: Clip, t: number, lt: number, opts: Partial<RenderOpts>) {
  const tl = doc.timeline, W = tl.w, H = tl.h;
  const x = clipValue(c, 'x', t), y = clipValue(c, 'y', t), sc = clipValue(c, 'scale', t), rot = clipValue(c, 'rotation', t);
  const clipLt = t - c.start;
  ctx.save();
  switch (c.kind) {
    case 'scene': {
      const p = doc.pages.find(pg => pg.id === c.pageId);
      if (p) {
        const m = sceneMatrix(doc, c, t);
        ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.beginPath(); ctx.rect(0, 0, p.w, p.h); ctx.clip();
        renderPage(ctx, doc, p, { time: lt, ...opts });
      }
      break;
    }
    case 'media': {
      const md = doc.media.find(m => m.id === c.mediaId);
      if (!md) break;
      let src: CanvasImageSource | null = null, w = md.w, h = md.h;
      if (md.kind === 'video') { const v = mediaEl(md) as HTMLVideoElement; if (v.readyState >= 2) { src = v; w = v.videoWidth; h = v.videoHeight; } }
      else if (md.kind === 'image') { const im = imageFor(md.url); if (im.complete && im.naturalWidth) { src = im; w = im.naturalWidth; h = im.naturalHeight; } }
      if (src && w && h) {
        const s = Math.min(W / w, H / h) * sc;
        ctx.translate(W / 2 + x, H / 2 + y); ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(src, -(w * s) / 2, -(h * s) / 2, w * s, h * s);
      }
      break;
    }
    case 'color': { ctx.fillStyle = c.color || '#000'; ctx.fillRect(0, 0, W, H); break; }
    case 'bars': {
      const cols = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];
      cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect((W * i) / 7, 0, W / 7 + 1, H * 0.75); });
      const bot = ['#0000C0', '#111', '#C000C0', '#111', '#00C0C0', '#111', '#C0C0C0'];
      bot.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect((W * i) / 7, H * 0.75, W / 7 + 1, H * 0.25); });
      break;
    }
    case 'countdown': {
      ctx.fillStyle = c.color2 || '#14110E'; ctx.fillRect(0, 0, W, H);
      const left = Math.max(0, c.dur - clipLt), n = Math.ceil(left), frac = left - Math.floor(left);
      const R = Math.min(W, H) * 0.3;
      ctx.strokeStyle = c.color || '#F3E2C3'; ctx.lineWidth = Math.max(4, R * 0.06);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (frac || 1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 - R * 1.3, H / 2); ctx.lineTo(W / 2 + R * 1.3, H / 2); ctx.moveTo(W / 2, H / 2 - R * 1.3); ctx.lineTo(W / 2, H / 2 + R * 1.3);
      ctx.save(); ctx.globalAlpha *= 0.25; ctx.stroke(); ctx.restore();
      ctx.fillStyle = c.color || '#F3E2C3'; ctx.font = `700 ${R * 1.2}px "${c.font || 'Fraunces'}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), W / 2, H / 2 + R * 0.05);
      break;
    }
    case 'title': drawTitle(ctx, c, clipLt, x, y, sc, rot); break;
  }
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, c: Clip, lt: number, x: number, y: number, sc: number, rot: number) {
  const size = (c.fontSize || 48) * sc;
  let text = c.text || '';
  const anim = c.anim || 'none';
  const T = Math.min(0.7, c.dur / 3);
  const p = Math.min(1, lt / T), e = 1 - Math.pow(1 - p, 3);
  let dx = 0, dy = 0, zoom = 1;
  if (anim === 'slideup') { dy = (1 - e) * size * 0.9; ctx.globalAlpha *= e; }
  else if (anim === 'slideleft') { dx = (1 - e) * size * 3; ctx.globalAlpha *= e; }
  else if (anim === 'zoom') { zoom = 0.5 + 0.5 * e; ctx.globalAlpha *= e; }
  else if (anim === 'fade') ctx.globalAlpha *= e;
  else if (anim === 'typewriter') text = text.slice(0, Math.floor(Math.min(1, lt / Math.max(0.2, Math.min(c.dur * 0.7, text.length * 0.06))) * text.length));
  ctx.translate(x + dx, y + dy); ctx.rotate((rot * Math.PI) / 180); ctx.scale(zoom, zoom);
  ctx.font = `${c.italic ? 'italic ' : ''}${c.weight || 700} ${size}px "${c.font || 'Fraunces'}"`;
  const al = c.align || 'center';
  ctx.textAlign = al; ctx.textBaseline = 'middle';
  if (c.letterSpacing) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${c.letterSpacing}px`;
  const lines = text.split('\n');
  const lh = size * 1.18;
  if (c.box) {
    const w = Math.max(...lines.map(l => ctx.measureText(l).width), 10) + size * 0.8, h = lines.length * lh + size * 0.5;
    const bx = al === 'left' ? -size * 0.4 : al === 'right' ? -w + size * 0.4 : -w / 2;
    ctx.fillStyle = c.box; ctx.beginPath(); ctx.roundRect(bx, -h / 2, w, h, size * 0.2); ctx.fill();
  }
  if (c.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.05; }
  lines.forEach((l, i) => {
    const ly = (i - (lines.length - 1) / 2) * lh;
    if ((c.outline || 0) > 0) { ctx.strokeStyle = c.outlineColor || '#000'; ctx.lineWidth = c.outline!; ctx.lineJoin = 'round'; ctx.strokeText(l, 0, ly); }
    ctx.fillStyle = c.color || '#fff';
    ctx.fillText(l, 0, ly);
  });
}

export function timelineDuration(doc: Doc) {
  let d = 1;
  for (const tr of doc.timeline.tracks) for (const c of tr.clips) d = Math.max(d, c.start + c.dur);
  return d;
}
