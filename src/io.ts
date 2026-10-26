import P from 'paper';
import { jsPDF } from 'jspdf';
import { S, T, commit, emit, page, replaceDoc, toast, afterCommit } from './store';
import type { Doc, Obj, Page, Paint } from './model';
import { newObj, isPattern } from './model';
import { anim, localBox, mapNodes, markerPaths, objMatrix, objSubpaths, subpathsToD } from './geometry';
import { renderFrame, renderPage, tableGeometry, timelineDuration } from './render';
import { imageFor, makeCanvas, maskCanvas, rasterCanvas, storeRaster } from './raster';
import { mediaBlobs, probeMedia } from './media';
import { addMediaClip, currentLayerId, editTime, fromPaper, addObj } from './ops';
import { layoutAll, fontString } from './text';
import { play, pause, audioStream } from './playback';
import { sampleDoc } from './sample';

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'promake';

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res([...(i.files || [])]);
    i.click();
  });
}

const blobToDataURL = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b); });

// ---------- project files ----------
export async function saveProject() {
  const doc: Doc = JSON.parse(JSON.stringify(S.doc));
  for (const m of doc.media) { const b = mediaBlobs.get(m.id); if (b) m.url = await blobToDataURL(b); }
  download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), `${safe(doc.name)}.promake`);
  toast('Project saved');
}

export async function openProject(file?: File) {
  const f = file || (await pickFiles('.promake,.json', false))[0];
  if (!f) return;
  try {
    const doc: Doc = JSON.parse(await f.text());
    if (!doc.pages || !doc.layers) throw new Error('not a ProMake project');
    await rehydrateMedia(doc);
    replaceDoc(doc);
    toast(`Opened ${doc.name}`);
  } catch (e) { toast(`Could not open file: ${(e as Error).message}`); }
}

async function rehydrateMedia(doc: Doc) {
  for (const m of doc.media) {
    if (m.url.startsWith('data:')) {
      const blob = await (await fetch(m.url)).blob();
      mediaBlobs.set(m.id, blob);
      m.url = URL.createObjectURL(blob);
    }
  }
}

export function newDocument() {
  replaceDoc(sampleDoc());
  const d = S.doc;
  // blank variant: keep structure, drop artwork
  d.name = 'Untitled';
  const blank = d.pages.find(p => !p.isMaster && p.w === 1280)!;
  blank.objects = []; blank.name = 'Artboard 1'; blank.bg = '#FFFDF7';
  d.pages = d.pages.filter(p => p === blank);
  d.timeline.tracks.forEach(t => (t.clips = t.kind === 'video' && t.name === 'V1' ? [{ ...t.clips[0], pageId: blank.id, name: 'Artboard 1', fadeOut: 0 }] : []));
  d.layers = [{ id: d.layers[0].id, name: 'Layer 1', visible: true, locked: false, opacity: 1 }];
  replaceDoc(d);
}

// ---------- autosave (IndexedDB) ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('promake', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbSet(key: string, val: unknown) {
  const db = await idb();
  await new Promise<void>((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const r = tx.objectStore('kv').get(key); r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error); });
}

let saveTimer = 0;
export function startAutosave() {
  afterCommit.push(() => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        const blobs: Record<string, Blob> = {};
        for (const m of S.doc.media) { const b = mediaBlobs.get(m.id); if (b) blobs[m.id] = b; }
        await idbSet('doc', JSON.stringify(S.doc));
        await idbSet('blobs', blobs);
      } catch { /* storage may be unavailable */ }
    }, 800);
  });
}
export async function restoreAutosave(): Promise<boolean> {
  try {
    const json = await idbGet<string>('doc');
    if (!json) return false;
    const doc: Doc = JSON.parse(json);
    const blobs = (await idbGet<Record<string, Blob>>('blobs')) || {};
    doc.media = doc.media.filter(m => blobs[m.id]);
    for (const m of doc.media) { mediaBlobs.set(m.id, blobs[m.id]); m.url = URL.createObjectURL(blobs[m.id]); }
    for (const tr of doc.timeline.tracks) tr.clips = tr.clips.filter(c => c.kind !== 'media' || doc.media.some(m => m.id === c.mediaId));
    replaceDoc(doc);
    return true;
  } catch { return false; }
}

// ---------- import ----------
export async function importFiles(files: File[], at?: { x: number; y: number }) {
  for (const f of files) {
    if (f.name.endsWith('.promake')) { await openProject(f); continue; }
    if (f.type === 'image/svg+xml' || f.name.endsWith('.svg')) { await importSVG(await f.text()); continue; }
    if (f.type.startsWith('image/')) { await importImage(f, at); continue; }
    if (f.type.startsWith('video/') || f.type.startsWith('audio/')) {
      const m = await probeMedia(f);
      S.doc.media.push(m);
      if (S.ui.mode === 'motion') addMediaClip(m); else commit();
      toast(`${m.kind === 'video' ? 'Video' : 'Audio'} added to the Motion media bin`);
      continue;
    }
    toast(`Unsupported file: ${f.name}`);
  }
}

/** Read an image file, downscaling very large ones so documents stay light. */
export async function imageToDataURL(f: Blob, maxDim = 3200): Promise<{ src: string; w: number; h: number } | null> {
  const url = URL.createObjectURL(f);
  const img = new Image();
  await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
  if (!img.naturalWidth) { URL.revokeObjectURL(url); return null; }
  const k = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const keepAlpha = /png|gif|webp|svg/.test(f.type);
  return { src: c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.92), w: img.naturalWidth, h: img.naturalHeight };
}

/** Put an image into an existing image frame. */
export async function loadImageInto(o: Obj, f: Blob) {
  const r = await imageToDataURL(f);
  if (!r) { toast('Could not read that image'); return; }
  o.src = r.src; o.imgX = 0; o.imgY = 0; o.imgScale = 1; o.name = (f as File).name || o.name;
  commit();
}

export async function importImage(f: Blob, at?: { x: number; y: number }, name = 'Image') {
  if (S.ui.mode === 'motion') {
    const m = await probeMedia(new File([f], (f as File).name || 'image.png', { type: f.type }));
    S.doc.media.push(m); addMediaClip(m); return;
  }
  const pg = page();
  if (S.ui.mode === 'print') {
    const r = await imageToDataURL(f);
    if (!r) { toast('Could not read that image'); return; }
    const k = Math.min((pg.w * 0.7) / r.w, (pg.h * 0.5) / r.h, 1);
    const o = newObj('image', currentLayerId(), { name: (f as File).name || name, x: at?.x ?? pg.w / 2, y: at?.y ?? pg.h / 2, w: Math.round(r.w * k), h: Math.round(r.h * k), src: r.src, fill: null });
    addObj(o); commit();
    return;
  }
  const url = URL.createObjectURL(f);
  const img = new Image();
  await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
  if (!img.naturalWidth) { toast('Could not read that image'); return; }
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  const fit = Math.min(1, (pg.w * 0.8) / img.naturalWidth, (pg.h * 0.8) / img.naturalHeight);
  const o = newObj('raster', currentLayerId(), {
    name: (f as File).name || name, x: at?.x ?? pg.w / 2, y: at?.y ?? pg.h / 2,
    w: img.naturalWidth, h: img.naturalHeight, sx: fit, sy: fit,
  });
  storeRaster(o, c);
  addObj(o);
  commit();
  URL.revokeObjectURL(url);
}

function paperColour(c: paper.Color | null | undefined): Paint {
  if (!c) return null;
  if (c.gradient) {
    const g = c.gradient;
    const gc = c as unknown as { origin: paper.Point; destination: paper.Point };
    const a = gc.destination && gc.origin ? gc.destination.subtract(gc.origin).angle : 0;
    return { kind: g.radial ? 'radial' : 'linear', angle: a, stops: g.stops.map((s: paper.GradientStop) => ({ o: s.offset, c: s.color.toCSS(true) })) };
  }
  return c.alpha < 1 ? c.toCSS(false) : c.toCSS(true);
}

export async function importSVG(text: string) {
  P.project.clear();
  let item: paper.Item;
  try { item = P.project.importSVG(text, { expandShapes: true, insert: false }); }
  catch { toast('Could not read that SVG'); return; }
  const pg = page();
  const lid = currentLayerId();
  const made: Obj[] = [];
  const walk = (it: paper.Item) => {
    if (!it.visible) return;
    if (it instanceof P.Path || it instanceof P.CompoundPath) {
      const pi = it as paper.PathItem;
      const sps = fromPaper(pi);
      if (!sps.length) return;
      const o = newObj('path', lid, {
        name: it.name || 'Path', subpaths: sps, fill: paperColour(pi.fillColor), stroke: paperColour(pi.strokeColor),
        strokeWidth: pi.strokeColor ? pi.strokeWidth : 0, opacity: it.opacity, fillRule: pi.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
      });
      made.push(o);
    } else if (it instanceof P.PointText) {
      const t = it as paper.PointText;
      const b = t.bounds;
      made.push(newObj('text', lid, { name: 'Text', text: t.content, x: b.center.x, y: b.center.y, w: Math.max(40, b.width + 10), h: b.height + 6, size: t.fontSize as number, font: String(t.fontFamily || 'Inter').split(',')[0].replace(/['"]/g, ''), fill: paperColour(t.fillColor) || '#000' }));
    } else if (it.children) it.children.forEach(walk);
  };
  walk(item);
  if (!made.length) { toast('No drawable shapes found in that SVG'); return; }
  // centre the imported artwork on the page
  const { recentrePath } = await import('./geometry');
  const b = item.bounds;
  const dx = pg.w / 2 - (b.x + b.width / 2), dy = pg.h / 2 - (b.y + b.height / 2);
  for (const o of made) {
    if (o.type === 'path') recentrePath(o);
    o.x += dx; o.y += dy;
    pg.objects.push(o);
  }
  S.ui.sel = made.map(o => o.id);
  commit();
  toast(`Imported ${made.length} object${made.length > 1 ? 's' : ''} from SVG`);
}

// ---------- export ----------
export function exportPNG(scale = 2) {
  if (S.ui.mode === 'motion') {
    const tl = S.doc.timeline;
    const c = makeCanvas(tl.w, tl.h);
    renderFrame(c.getContext('2d')!, S.doc, T.time);
    c.toBlob(b => b && download(b, `${safe(S.doc.name)}-frame.png`));
    return;
  }
  const pg = page();
  const c = makeCanvas(pg.w * scale, pg.h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  renderPage(ctx, S.doc, pg, { time: editTime() });
  c.toBlob(b => b && download(b, `${safe(pg.name)}.png`));
}

export function exportJPEG(quality = 0.92) {
  const pg = page();
  const c = makeCanvas(pg.w, pg.h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
  renderPage(ctx, S.doc, pg, { time: editTime() });
  c.toBlob(b => b && download(b, `${safe(pg.name)}.jpg`), 'image/jpeg', quality);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svgPaint(p: Paint, defs: string[], id: string, o: Obj): string {
  if (!p) return 'none';
  if (typeof p === 'string') return p;
  if (isPattern(p)) {
    const sz = Math.max(4, p.size);
    let shape = '';
    switch (p.pattern) {
      case 'stripes': case 'diagonal': shape = `<rect width="${sz / 2}" height="${sz}" fill="${p.c2}"/>`; break;
      case 'dots': shape = `<circle cx="${sz / 2}" cy="${sz / 2}" r="${sz * 0.24}" fill="${p.c2}"/>`; break;
      case 'checks': shape = `<rect width="${sz / 2}" height="${sz / 2}" fill="${p.c2}"/><rect x="${sz / 2}" y="${sz / 2}" width="${sz / 2}" height="${sz / 2}" fill="${p.c2}"/>`; break;
      case 'grid': shape = `<rect width="${sz}" height="${sz}" fill="none" stroke="${p.c2}" stroke-width="${sz * 0.12}"/>`; break;
      case 'cross': shape = `<rect x="${sz * 0.4}" y="${sz * 0.15}" width="${sz * 0.2}" height="${sz * 0.7}" fill="${p.c2}"/><rect x="${sz * 0.15}" y="${sz * 0.4}" width="${sz * 0.7}" height="${sz * 0.2}" fill="${p.c2}"/>`; break;
      case 'waves': shape = `<path d="M0 ${sz / 2} Q${sz / 4} ${sz * 0.1} ${sz / 2} ${sz / 2} T${sz} ${sz / 2}" fill="none" stroke="${p.c2}" stroke-width="${sz * 0.12}"/>`; break;
    }
    defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${sz}" height="${sz}" patternTransform="rotate(${p.angle + (p.pattern === 'diagonal' ? 45 : 0)})"><rect width="${sz}" height="${sz}" fill="${p.c1}"/>${shape}</pattern>`);
    return `url(#${id})`;
  }
  const b = localBox(o);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const stops = p.stops.map(s => `<stop offset="${s.o}" stop-color="${s.c}"/>`).join('');
  if (p.kind === 'radial') defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${Math.max(b.w, b.h) / 2}">${stops}</radialGradient>`);
  else {
    const a = (p.angle * Math.PI) / 180, r = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.h) / 2;
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx - Math.cos(a) * r}" y1="${cy - Math.sin(a) * r}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}">${stops}</linearGradient>`);
  }
  return `url(#${id})`;
}

function pageSVGBody(doc: Doc, pg: Page, t: number, defs: string[], depth = 0): string {
  if (depth > 3) return '';
  const layout = layoutAll(doc);
  const master = pg.masterId ? doc.pages.find(p => p.id === pg.masterId) : null;
  const srcs = master ? [master, pg] : [pg];
  const lookup = new Map<string, Obj>();
  for (const sc of srcs) for (const o of sc.objects) lookup.set(o.id, o);
  const pn = doc.pages.filter(p => !p.isMaster).indexOf(pg) + 1;
  let out = pg.bg ? `<rect width="${pg.w}" height="${pg.h}" fill="${pg.bg}"/>` : '';
  const xf = (o: Obj) => { const a = anim(o, t); return `translate(${a.x} ${a.y}) rotate(${a.rotation}) scale(${a.sx} ${a.sy})`; };
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    out += `<g id="${esc(layer.name)}" opacity="${layer.opacity}">`;
    for (const src of srcs) for (const o of src.objects) {
      if (o.layerId !== layer.id || !o.visible || o.isClip) continue;
      const a = anim(o, t);
      const tr = xf(o);
      const blend = o.blend && o.blend !== 'source-over' ? `;mix-blend-mode:${o.blend}` : '';
      // blur / drop shadow
      let filt = '';
      if (o.blur || o.shadow) {
        const fid = `fx${o.id}`;
        let prims = '';
        if (o.blur) prims += `<feGaussianBlur stdDeviation="${o.blur}"/>`;
        if (o.shadow) prims += `<feDropShadow dx="${o.shadow.dx}" dy="${o.shadow.dy}" stdDeviation="${o.shadow.blur / 2}" flood-color="${o.shadow.color.slice(0, 7)}" flood-opacity="${o.shadow.color.length > 7 ? parseInt(o.shadow.color.slice(7, 9), 16) / 255 : 1}"/>`;
        defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%">${prims}</filter>`);
        filt = ` filter="url(#${fid})"`;
      }
      const common = `transform="${tr}" opacity="${a.opacity}" style="${blend}"${filt}`;
      const b = localBox(o);
      let piece = '';
      if (o.type === 'text' && o.textPath && lookup.get(o.textPath)) {
        const pth = lookup.get(o.textPath)!;
        const pid = `tp${o.id}`;
        defs.push(`<path id="${pid}" d="${subpathsToD(mapNodes(objSubpaths(pth), objMatrix(pth, t)))}"/>`);
        const fill = svgPaint(o.fill, defs, `g${o.id}f`, o);
        const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
        const start = o.align === 'center' ? '50%' : o.align === 'right' ? '100%' : `${o.textOffset || 0}`;
        piece = `<text fill="${fill}" opacity="${a.opacity}" font-family="${esc(o.font || 'Inter')}" font-size="${o.size}" font-weight="${o.weight || 400}" font-style="${o.italic ? 'italic' : 'normal'}" letter-spacing="${o.letterSpacing || 0}" text-anchor="${anchor}"><textPath href="#${pid}" startOffset="${start}">${esc((o.text || '').replace(/\n/g, ' '))}</textPath></text>`;
      } else if (o.type === 'text') {
        const lay = layout.get(o.id);
        const lh = (o.size || 16) * (o.lineHeight || 1.3);
        const fill = svgPaint(o.fill, defs, `g${o.id}f`, o);
        const strokeAttr = typeof o.stroke === 'string' && o.strokeWidth > 0 ? ` stroke="${o.stroke}" stroke-width="${o.strokeWidth}" paint-order="stroke"` : '';
        const lines = (lay?.lines || []).map(l => {
          if (l.text.includes('{page}')) {
            const x = o.align === 'center' ? l.x + l.colW / 2 : o.align === 'right' ? l.x + l.colW : l.x + l.indent;
            const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
            return `<text x="${x}" y="${l.y + lh / 2}" dominant-baseline="middle" text-anchor="${anchor}">${esc(l.text.replace(/\{page\}/g, String(pn)))}</text>`;
          }
          return l.words.map(w => `<text x="${w.x}" y="${l.y + lh / 2}" dominant-baseline="middle"${w.b ? ' font-weight="700"' : ''}${w.i ? ' font-style="italic"' : ''}>${esc(w.text)}</text>`).join('');
        }).join('');
        piece = `<g ${common} fill="${fill}"${strokeAttr} font-family="${esc(o.font || 'Inter')}" font-size="${o.size}" font-weight="${o.weight || 400}" font-style="${o.italic ? 'italic' : 'normal'}" letter-spacing="${o.letterSpacing || 0}">` +
          (o.frameFill ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${o.frameFill}"/>` : '') + lines + '</g>';
      } else if (o.type === 'raster') {
        const mk = o.maskSrc ? maskCanvas(o) : null;
        let url: string;
        if (mk) { const c = rasterCanvas(o), t2 = makeCanvas(c.width, c.height), x = t2.getContext('2d')!; x.drawImage(c, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(mk, 0, 0, c.width, c.height); url = t2.toDataURL(); }
        else url = rasterCanvas(o).toDataURL();
        piece = `<image ${common} x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" href="${url}" preserveAspectRatio="none"/>`;
      } else if (o.type === 'image') {
        defs.push(`<clipPath id="ic${o.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></clipPath>`);
        let inner = o.fill ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${typeof o.fill === 'string' ? o.fill : '#EEE'}"/>` : '';
        if (o.src) {
          const im = imageFor(o.src);
          const iw = im.naturalWidth || b.w, ih = im.naturalHeight || b.h;
          let sx = 1, sy = 1;
          switch (o.fit || 'fill') { case 'fit': sx = sy = Math.min(b.w / iw, b.h / ih); break; case 'fill': sx = sy = Math.max(b.w / iw, b.h / ih); break; case 'stretch': sx = b.w / iw; sy = b.h / ih; break; }
          const k = o.imgScale || 1;
          inner += `<image href="${o.src}" x="${-iw / 2}" y="${-ih / 2}" width="${iw}" height="${ih}" transform="translate(${b.x + b.w / 2 + (o.imgX || 0)} ${b.y + b.h / 2 + (o.imgY || 0)}) rotate(${o.imgRot || 0}) scale(${sx * k} ${sy * k})" preserveAspectRatio="none"/>`;
        }
        piece = `<g ${common}><g clip-path="url(#ic${o.id})">${inner}</g></g>`;
      } else if (o.type === 'table') {
        const { rows, cols, cw, rh } = tableGeometry(o);
        const pad = o.pad ?? 6, lh = (o.size || 14) * (o.lineHeight || 1.3);
        let g = '', y = b.y;
        for (let r = 0; r < rows; r++) {
          let x = b.x;
          for (let c = 0; c < cols; c++) {
            const bg = o.header && r === 0 && o.headerFill ? o.headerFill : o.zebra && r % 2 === 0 ? o.zebra : o.frameFill;
            if (bg) g += `<rect x="${x}" y="${y}" width="${cw[c]}" height="${rh[r]}" fill="${bg}"/>`;
            const txt = o.cells?.[r]?.[c] || '';
            if (txt) {
              const al = o.align || 'left';
              const tx = al === 'center' ? x + cw[c] / 2 : al === 'right' ? x + cw[c] - pad : x + pad;
              g += txt.split('\n').map((ln, i) => `<text x="${tx}" y="${y + pad + i * lh + lh / 2}" dominant-baseline="middle" text-anchor="${al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start'}"${o.header && r === 0 ? ' font-weight="700"' : ''}>${esc(ln)}</text>`).join('');
            }
            x += cw[c];
          }
          y += rh[r];
        }
        if ((o.borderW ?? 1) > 0) {
          let yy = b.y, xx = b.x, ln = '';
          for (let r = 0; r <= rows; r++) { ln += `M${b.x} ${yy}H${b.x + b.w}`; if (r < rows) yy += rh[r]; }
          for (let c = 0; c <= cols; c++) { ln += `M${xx} ${b.y}V${b.y + b.h}`; if (c < cols) xx += cw[c]; }
          g += `<path d="${ln}" stroke="${o.borderColor || '#000'}" stroke-width="${o.borderW ?? 1}" fill="none"/>`;
        }
        piece = `<g ${common} fill="${typeof o.fill === 'string' ? o.fill : '#000'}" font-family="${esc(o.font || 'Inter')}" font-size="${o.size || 14}" font-weight="${o.weight || 400}">${g}</g>`;
      } else if (o.type === 'embed') {
        const target = doc.pages.find(p => p.id === o.pageId);
        if (target) {
          const s = Math.min(b.w / target.w, b.h / target.h);
          defs.push(`<clipPath id="c${o.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></clipPath>`);
          piece = `<g ${common}><g clip-path="url(#c${o.id})"><g transform="translate(${-target.w * s / 2} ${-target.h * s / 2}) scale(${s})">${pageSVGBody(doc, target, t, defs, depth + 1)}</g></g></g>`;
        }
      } else {
        const fill = svgPaint(o.fill, defs, `g${o.id}f`, o), stroke = svgPaint(o.stroke, defs, `g${o.id}s`, o);
        piece = `<path ${common} d="${subpathsToD(objSubpaths(o))}" fill="${fill}" fill-rule="${o.fillRule || 'nonzero'}" stroke="${o.strokeWidth > 0 ? stroke : 'none'}" stroke-width="${o.strokeWidth}" stroke-linecap="${o.cap || 'round'}" stroke-linejoin="${o.join || 'round'}"${o.dash?.length ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}><title>${esc(o.name)}</title></path>`;
        const mk = markerPaths(o);
        if (mk.length) piece += `<path transform="${tr}" opacity="${a.opacity}" d="${subpathsToD(mk)}" fill="${typeof o.stroke === 'string' ? o.stroke : '#000'}"/>`;
      }
      if (o.clipBy && lookup.get(o.clipBy)) {
        const cl = lookup.get(o.clipBy)!;
        const cid = `cp${o.id}`;
        defs.push(`<clipPath id="${cid}"><path transform="${xf(cl)}" d="${subpathsToD(objSubpaths(cl))}"/></clipPath>`);
        piece = `<g clip-path="url(#${cid})">${piece}</g>`;
      }
      out += piece;
    }
    out += '</g>';
  }
  return out;
}

export function pageToSVG(pg: Page = page(), t = editTime()): string {
  const defs: string[] = [];
  const body = pageSVGBody(S.doc, pg, t, defs);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${pg.w}" height="${pg.h}" viewBox="0 0 ${pg.w} ${pg.h}"><defs>${defs.join('')}</defs>${body}</svg>`;
}
export function exportSVG() { download(new Blob([pageToSVG()], { type: 'image/svg+xml' }), `${safe(page().name)}.svg`); }

export async function exportPDF(allPages = true) {
  const pages = allPages ? S.doc.pages.filter(p => !p.isMaster) : [page()];
  toast(`Rendering ${pages.length} page${pages.length > 1 ? 's' : ''} to PDF…`);
  await new Promise(r => setTimeout(r, 30));
  let pdf: jsPDF | null = null;
  for (const pg of pages) {
    const wPt = pg.w * 0.75, hPt = pg.h * 0.75;
    const orient = wPt > hPt ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [wPt, hPt], orientation: orient });
    else pdf.addPage([wPt, hPt], orient);
    const scale = 300 / 96;
    const c = makeCanvas(pg.w * scale, pg.h * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(scale, scale);
    renderPage(ctx, S.doc, pg, { time: editTime() });
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wPt, hPt);
  }
  pdf!.setProperties({ title: S.doc.name, creator: 'ProMake' });
  download(pdf!.output('blob'), `${safe(S.doc.name)}.pdf`);
}

// ---------- video export ----------
export const exportState = { running: false, progress: 0, cancel: () => {} };

export function exportVideo() {
  if (exportState.running) return;
  const tl = S.doc.timeline;
  const dur = timelineDuration(S.doc);
  const c = makeCanvas(tl.w, tl.h);
  const ctx = c.getContext('2d')!;
  const stream = c.captureStream(0);
  const vtrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const draw = (t: number) => { renderFrame(ctx, S.doc, t); vtrack.requestFrame?.(); };
  const hasAudio = tl.tracks.some(tr => !tr.muted && tr.clips.some(c => c.kind === 'media' && S.doc.media.find(m => m.id === c.mediaId)?.kind !== 'image'));
  if (hasAudio) audioStream()?.getAudioTracks().forEach(t => stream.addTrack(t));
  const types = hasAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  let rec: MediaRecorder;
  try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 }); }
  catch { toast('Video recording is not supported in this browser'); return; }
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  let cancelled = false;
  rec.onstop = () => {
    exportState.running = false; emit();
    if (cancelled) { toast('Export cancelled'); return; }
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime || 'video/webm' }), `${safe(S.doc.name)}.${ext}`);
    toast('Video exported');
  };
  exportState.running = true; exportState.progress = 0;
  exportState.cancel = () => { cancelled = true; pause(); if (rec.state !== 'inactive') rec.stop(); };
  S.ui.modal = { kind: 'export-video' };
  emit();
  rec.start(250);
  draw(0);
  play({
    from: 0, until: dur,
    frame: t => { draw(t); exportState.progress = t / dur; },
    end: () => { draw(dur - 0.001); setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150); S.ui.modal = null; emit(); },
  });
}

export { fontString };
