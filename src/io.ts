import P from 'paper/dist/paper-core';
import { jsPDF } from 'jspdf';
import { S, T, commit, emit, page, replaceDoc, toast, afterCommit } from './store';
import type { Doc, Obj, Page, Paint } from './model';
import { newObj } from './model';
import { anim, localBox, objSubpaths, subpathsToD } from './geometry';
import { renderFrame, renderPage, timelineDuration } from './render';
import { makeCanvas, rasterCanvas, storeRaster } from './raster';
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

export async function importImage(f: Blob, at?: { x: number; y: number }, name = 'Image') {
  const url = URL.createObjectURL(f);
  const img = new Image();
  await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
  if (!img.naturalWidth) { toast('Could not read that image'); return; }
  if (S.ui.mode === 'motion') {
    const m = await probeMedia(new File([f], (f as File).name || 'image.png', { type: f.type }));
    S.doc.media.push(m); addMediaClip(m); return;
  }
  const pg = page();
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
  const pn = doc.pages.filter(p => !p.isMaster).indexOf(pg) + 1;
  let out = pg.bg ? `<rect width="${pg.w}" height="${pg.h}" fill="${pg.bg}"/>` : '';
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    out += `<g id="${esc(layer.name)}" opacity="${layer.opacity}">`;
    for (const src of srcs) for (const o of src.objects) {
      if (o.layerId !== layer.id || !o.visible) continue;
      const a = anim(o, t);
      const tr = `translate(${a.x} ${a.y}) rotate(${a.rotation}) scale(${a.sx} ${a.sy})`;
      const blend = o.blend && o.blend !== 'source-over' ? `;mix-blend-mode:${o.blend}` : '';
      const common = `transform="${tr}" opacity="${a.opacity}" style="${blend}"`;
      const b = localBox(o);
      if (o.type === 'text') {
        const lay = layout.get(o.id);
        const lh = (o.size || 16) * (o.lineHeight || 1.3);
        const fill = svgPaint(o.fill, defs, `g${o.id}f`, o);
        const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
        const lines = (lay?.lines || []).map(l => {
          const x = o.align === 'center' ? l.x + l.colW / 2 : o.align === 'right' ? l.x + l.colW : l.x;
          return `<text x="${x}" y="${l.y + lh / 2}" dominant-baseline="middle" text-anchor="${anchor}">${esc(l.text.replace(/\{page\}/g, String(pn)))}</text>`;
        }).join('');
        out += `<g ${common} fill="${fill}" font-family="${esc(o.font || 'Inter')}" font-size="${o.size}" font-weight="${o.weight || 400}" font-style="${o.italic ? 'italic' : 'normal'}" letter-spacing="${o.letterSpacing || 0}">` +
          (o.frameFill ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${o.frameFill}"/>` : '') + lines + '</g>';
      } else if (o.type === 'raster') {
        out += `<image ${common} x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" href="${rasterCanvas(o).toDataURL()}" preserveAspectRatio="none"/>`;
      } else if (o.type === 'embed') {
        const target = doc.pages.find(p => p.id === o.pageId);
        if (target) {
          const s = Math.min(b.w / target.w, b.h / target.h);
          defs.push(`<clipPath id="c${o.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></clipPath>`);
          out += `<g ${common}><g clip-path="url(#c${o.id})"><g transform="translate(${-target.w * s / 2} ${-target.h * s / 2}) scale(${s})">${pageSVGBody(doc, target, t, defs, depth + 1)}</g></g></g>`;
        }
      } else {
        const fill = svgPaint(o.fill, defs, `g${o.id}f`, o), stroke = svgPaint(o.stroke, defs, `g${o.id}s`, o);
        out += `<path ${common} d="${subpathsToD(objSubpaths(o))}" fill="${fill}" fill-rule="${o.fillRule || 'nonzero'}" stroke="${o.strokeWidth > 0 ? stroke : 'none'}" stroke-width="${o.strokeWidth}" stroke-linecap="${o.cap || 'round'}" stroke-linejoin="${o.join || 'round'}"${o.dash?.length ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}><title>${esc(o.name)}</title></path>`;
      }
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
