import P from 'paper';
import { S, T, commit, emit, page, selected, toast, findObj, isEditable } from './store';
import { newObj, newPage, uid, defaultFx } from './model';
import type { Clip, Layer, Media, Obj, Page, SubPath, Track } from './model';
import { anim, apply, localBox, mapNodes, objMatrix, objSubpaths, pageBox, recentrePath, unionBox, setProp, type Box } from './geometry';
import { drawObject, renderPage, sceneMatrix, clipActive, timelineDuration } from './render';
import { makeCanvas, storeRaster, rasterCanvas } from './raster';

P.setup(new P.Size(1, 1));

/** The time at which edits to the current page's objects apply (scene-local time in Motion). */
export function editTime(): number {
  if (S.ui.mode !== 'motion') return T.time;
  const c = activeSceneClip();
  return c ? c.offset + (T.time - c.start) * c.speed : T.time;
}
export function activeSceneClip(): Clip | null {
  for (const tr of S.doc.timeline.tracks) {
    if (tr.kind !== 'video' || tr.hidden) continue;
    for (const c of tr.clips) if (c.kind === 'scene' && c.pageId === S.ui.pageId && clipActive(c, T.time)) return c;
  }
  return null;
}
/** page -> stage content matrix (identity outside Motion). */
export function contentMatrix(): DOMMatrix | null {
  if (S.ui.mode !== 'motion') return new DOMMatrix();
  const c = activeSceneClip();
  return c ? sceneMatrix(S.doc, c) : null;
}

export function currentLayerId(): string {
  const sel = selected()[0];
  if (sel) return sel.layerId;
  const act = S.doc.layers.find(l => l.id === S.ui.activeLayer && !l.locked);
  if (act) return act.id;
  const open = [...S.doc.layers].reverse().find(l => l.visible && !l.locked);
  return (open || S.doc.layers[S.doc.layers.length - 1]).id;
}

export function addObj(o: Obj, select = true) {
  page().objects.push(o);
  if (select) S.ui.sel = [o.id];
}

export function deleteSelection() {
  const pg = page();
  const ids = new Set(S.ui.sel);
  if (!ids.size) return;
  for (const p of S.doc.pages) for (const o of p.objects) if (o.linkNext && ids.has(o.linkNext)) o.linkNext = null;
  pg.objects = pg.objects.filter(o => !ids.has(o.id) || o.locked);
  S.ui.sel = [];
  commit();
}

// ---------- clipboard ----------
let clip: Obj[] = [];
export function copySel() {
  const pg = page();
  const need = new Set(S.ui.sel);
  for (const o of pg.objects) if (need.has(o.id) && o.clipBy) need.add(o.clipBy);
  clip = JSON.parse(JSON.stringify(pg.objects.filter(o => need.has(o.id)))); if (clip.length) toast(`Copied ${clip.length} object${clip.length > 1 ? 's' : ''}`); }
export function cutSel() { copySel(); deleteSelection(); }
/** Deep-copy objects with fresh ids, keeping groups and clip relationships intact among the copies. */
export function cloneObjects(src: Obj[]): Obj[] {
  const items: Obj[] = JSON.parse(JSON.stringify(src));
  const idmap = new Map<string, string>(), gmap = new Map<string, string>();
  for (const o of items) { idmap.set(o.id, uid()); if (o.group && !gmap.has(o.group)) gmap.set(o.group, uid('g')); }
  for (const o of items) {
    o.id = idmap.get(o.id)!;
    if (o.group) o.group = gmap.get(o.group);
    if (o.clipBy) o.clipBy = idmap.get(o.clipBy);
    if (o.textPath) o.textPath = idmap.get(o.textPath) ?? o.textPath;
    o.linkNext = null;
  }
  return items;
}

export function paste(offset = 16) {
  if (!clip.length) return;
  const items = cloneObjects(clip);
  const layerIds = new Set(S.doc.layers.map(l => l.id));
  for (const o of items) {
    o.x += offset; o.y += offset;
    if (o.keys?.x) o.keys.x.forEach(k => (k.v += offset));
    if (o.keys?.y) o.keys.y.forEach(k => (k.v += offset));
    if (!layerIds.has(o.layerId)) o.layerId = currentLayerId();
    page().objects.push(o);
  }
  S.ui.sel = items.map(o => o.id);
  clip = JSON.parse(JSON.stringify(items));
  commit();
}
export function duplicate() { copySel(); paste(); }

// ---------- z-order ----------
export function zorder(dir: 'up' | 'down' | 'top' | 'bottom') {
  const pg = page();
  const sel = new Set(S.ui.sel);
  const arr = pg.objects;
  if (dir === 'top') pg.objects = [...arr.filter(o => !sel.has(o.id)), ...arr.filter(o => sel.has(o.id))];
  else if (dir === 'bottom') pg.objects = [...arr.filter(o => sel.has(o.id)), ...arr.filter(o => !sel.has(o.id))];
  else if (dir === 'up') { for (let i = arr.length - 2; i >= 0; i--) if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
  else for (let i = 1; i < arr.length; i++) if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
  commit();
}

// ---------- align ----------
export function align(kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'dh' | 'dv') {
  const objs = selected().filter(isEditable);
  const t = editTime();
  if (!objs.length) return;
  const pg = page();
  const ref: Box = objs.length > 1 ? unionBox(objs.map(o => pageBox(o, t)))! : { x: 0, y: 0, w: pg.w, h: pg.h };
  if (kind === 'dh' || kind === 'dv') {
    if (objs.length < 3) { toast('Select three or more objects to distribute'); return; }
    const horiz = kind === 'dh';
    const sorted = [...objs].sort((a, b) => (horiz ? anim(a, t).x - anim(b, t).x : anim(a, t).y - anim(b, t).y));
    const first = anim(sorted[0], t), last = anim(sorted[sorted.length - 1], t);
    sorted.forEach((o, i) => {
      const f = i / (sorted.length - 1);
      if (horiz) setProp(o, 'x', first.x + (last.x - first.x) * f, t); else setProp(o, 'y', first.y + (last.y - first.y) * f, t);
    });
    commit(); return;
  }
  for (const o of objs) {
    const b = pageBox(o, t), a = anim(o, t);
    let dx = 0, dy = 0;
    if (kind === 'left') dx = ref.x - b.x;
    if (kind === 'right') dx = ref.x + ref.w - (b.x + b.w);
    if (kind === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (kind === 'top') dy = ref.y - b.y;
    if (kind === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    if (kind === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (dx) setProp(o, 'x', a.x + dx, t);
    if (dy) setProp(o, 'y', a.y + dy, t);
  }
  commit();
}

export function flip(axis: 'h' | 'v') {
  const t = editTime();
  for (const o of selected().filter(isEditable)) {
    const a = anim(o, t);
    if (axis === 'h') setProp(o, 'sx', -a.sx, t); else setProp(o, 'sy', -a.sy, t);
  }
  commit();
}

// ---------- paper.js bridge ----------
const isShape = (o: Obj) => ['rect', 'ellipse', 'star', 'path'].includes(o.type);

export function toPaper(o: Obj, t: number): paper.PathItem {
  const sps = mapNodes(objSubpaths(o), objMatrix(o, t));
  return spsToPaper(sps);
}
export function spsToPaper(sps: SubPath[]): paper.PathItem {
  const paths = sps.map(sp => new P.Path({
    insert: false, closed: sp.closed,
    segments: sp.nodes.map(n => new P.Segment(new P.Point(n.x, n.y), new P.Point(n.ix - n.x, n.iy - n.y), new P.Point(n.ox - n.x, n.oy - n.y))),
  }));
  if (paths.length === 1) return paths[0];
  return new P.CompoundPath({ insert: false, children: paths });
}
export function fromPaper(item: paper.Item): SubPath[] {
  const paths: paper.Path[] = [];
  const walk = (it: paper.Item) => {
    if (it instanceof P.Path) paths.push(it as paper.Path);
    else if (it.children) it.children.forEach(walk);
  };
  walk(item);
  return paths.filter(p => p.segments.length).map(p => ({
    closed: p.closed,
    nodes: p.segments.map(s => ({
      x: s.point.x, y: s.point.y,
      ix: s.point.x + s.handleIn.x, iy: s.point.y + s.handleIn.y,
      ox: s.point.x + s.handleOut.x, oy: s.point.y + s.handleOut.y,
      smooth: !s.handleIn.isZero() && !s.handleOut.isZero() && Math.abs(s.handleIn.getDirectedAngle(s.handleOut.multiply(-1))) < 2,
    })),
  }));
}

function pathFromPage(sps: SubPath[], style: Obj, name: string): Obj {
  const o = newObj('path', style.layerId, {
    name, subpaths: sps, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, opacity: style.opacity,
    blend: style.blend, dash: style.dash, cap: style.cap, join: style.join, fillRule: style.fillRule,
  });
  recentrePath(o);
  return o;
}

export function booleanOp(op: 'unite' | 'subtract' | 'intersect' | 'exclude' | 'divide') {
  const pg = page();
  const objs = pg.objects.filter(o => S.ui.sel.includes(o.id) && isShape(o) && isEditable(o));
  if (objs.length < 2) { toast('Select at least two shapes'); return; }
  const t = editTime();
  const items = objs.map(o => toPaper(o, t));
  const bottom = objs[0];
  let results: paper.PathItem[] = [];
  if (op === 'unite') results = [items.reduce((a, b) => a.unite(b))];
  else if (op === 'intersect') results = [items.reduce((a, b) => a.intersect(b))];
  else if (op === 'exclude') results = [items.reduce((a, b) => a.exclude(b))];
  else if (op === 'subtract') results = [items.slice(1).reduce((a, b) => a.subtract(b), items[0])];
  else {
    let pieces: paper.PathItem[] = [items[0]];
    for (const cutter of items.slice(1)) {
      pieces = pieces.flatMap(pc => {
        const inside = pc.intersect(cutter), outside = pc.subtract(cutter);
        return [inside, outside];
      });
    }
    results = pieces.flatMap(r => (r instanceof P.CompoundPath ? (r.children as paper.PathItem[]) : [r]));
  }
  const idx = pg.objects.indexOf(bottom);
  const made = results.map((r, i) => pathFromPage(fromPaper(r), bottom, results.length > 1 ? `${bottom.name} ${i + 1}` : bottom.name))
    .filter(o => o.subpaths!.length);
  const ids = new Set(objs.map(o => o.id));
  pg.objects = pg.objects.filter(o => !ids.has(o.id));
  pg.objects.splice(Math.min(idx, pg.objects.length), 0, ...made);
  S.ui.sel = made.map(o => o.id);
  commit();
}

export function objectToPath() {
  const t = editTime();
  for (const o of selected().filter(o => ['rect', 'ellipse', 'star'].includes(o.type) && isEditable(o))) {
    o.subpaths = JSON.parse(JSON.stringify(objSubpaths(o)));
    o.type = 'path';
    delete o.w; delete o.h; delete o.rx; delete o.points; delete o.inner; delete o.polygon;
  }
  void t;
  commit();
}

export function simplifyPaths(tol = 2.5) {
  for (const o of selected().filter(o => o.type === 'path' && isEditable(o))) {
    const it = spsToPaper(o.subpaths!);
    const paths = it instanceof P.CompoundPath ? (it.children as paper.Path[]) : [it as paper.Path];
    paths.forEach(p => p.simplify(tol));
    o.subpaths = fromPaper(it);
  }
  commit();
}

export function reversePaths() {
  for (const o of selected().filter(o => o.type === 'path')) {
    o.subpaths = o.subpaths!.map(sp => ({ closed: sp.closed, nodes: [...sp.nodes].reverse().map(n => ({ ...n, ix: n.ox, iy: n.oy, ox: n.ix, oy: n.iy })) }));
  }
  commit();
}

export function combine() {
  const pg = page();
  const objs = pg.objects.filter(o => S.ui.sel.includes(o.id) && isShape(o) && isEditable(o));
  if (objs.length < 2) { toast('Select at least two shapes to combine'); return; }
  const t = editTime();
  const sps = objs.flatMap(o => mapNodes(objSubpaths(o), objMatrix(o, t)));
  const made = pathFromPage(sps, objs[0], objs[0].name);
  made.fillRule = 'evenodd';
  const idx = pg.objects.indexOf(objs[0]);
  pg.objects = pg.objects.filter(o => !objs.includes(o));
  pg.objects.splice(idx, 0, made);
  S.ui.sel = [made.id];
  commit();
}

export function breakApart() {
  const pg = page();
  const t = editTime();
  const out: string[] = [];
  for (const o of selected().filter(o => isShape(o) && isEditable(o))) {
    const sps = mapNodes(objSubpaths(o), objMatrix(o, t));
    if (sps.length < 2) { out.push(o.id); continue; }
    const made = sps.map((sp, i) => pathFromPage([sp], o, `${o.name} ${i + 1}`));
    const idx = pg.objects.indexOf(o);
    pg.objects.splice(idx, 1, ...made);
    out.push(...made.map(m => m.id));
  }
  S.ui.sel = out;
  commit();
}

// ---------- rasterising ----------
export function renderObjectsToCanvas(objs: Obj[], box: Box, t: number, scale = 1) {
  const c = makeCanvas(box.w * scale, box.h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(-box.x, -box.y);
  for (const o of objs) drawObject(ctx, S.doc, o, { time: t });
  return c;
}

export function rasterise() {
  const pg = page();
  const t = editTime();
  const objs = pg.objects.filter(o => S.ui.sel.includes(o.id) && o.type !== 'raster' && isEditable(o));
  if (!objs.length) { toast('Select vector, text or placed objects to rasterise'); return; }
  const box = unionBox(objs.map(o => pageBox(o, t)))!;
  const pad = 4;
  const b = { x: Math.floor(box.x - pad), y: Math.floor(box.y - pad), w: Math.ceil(box.w + pad * 2), h: Math.ceil(box.h + pad * 2) };
  const c = renderObjectsToCanvas(objs, b, t);
  const r = newObj('raster', objs[objs.length - 1].layerId, { name: objs.length === 1 ? `${objs[0].name} (pixels)` : 'Rasterised', x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
  storeRaster(r, c);
  const idx = pg.objects.indexOf(objs[objs.length - 1]);
  pg.objects.splice(idx + 1, 0, r);
  pg.objects = pg.objects.filter(o => !objs.includes(o));
  S.ui.sel = [r.id];
  commit();
  toast('Rasterised. Grain tools can now paint on it.');
}

export function newRasterLayer(fill?: string) {
  const pg = page();
  const r = newObj('raster', currentLayerId(), { name: 'Paint layer', x: pg.w / 2, y: pg.h / 2, w: pg.w, h: pg.h });
  const c = makeCanvas(pg.w, pg.h);
  if (fill) { const x = c.getContext('2d')!; x.fillStyle = fill; x.fillRect(0, 0, pg.w, pg.h); }
  storeRaster(r, c);
  addObj(r);
  commit();
  return r;
}

export function flattenPage() {
  const pg = page();
  const c = makeCanvas(pg.w, pg.h);
  renderPage(c.getContext('2d')!, S.doc, pg, { time: editTime() });
  const r = newObj('raster', S.doc.layers[0].id, { name: 'Flattened', x: pg.w / 2, y: pg.h / 2, w: pg.w, h: pg.h });
  storeRaster(r, c);
  const keep = pg.objects.filter(o => !isEditable(o));
  pg.objects = [r, ...keep];
  S.ui.sel = [r.id];
  commit();
}

/** Find the raster to paint on: the selected one, or the topmost raster under the point, or a new layer. */
export function paintTarget(create = true): Obj | null {
  const sel = selected().find(o => o.type === 'raster' && isEditable(o));
  if (sel) return sel;
  const top = [...page().objects].reverse().find(o => o.type === 'raster' && isEditable(o));
  if (top) { S.ui.sel = [top.id]; return top; }
  return create ? newRasterLayer() : null;
}

/** page point -> raster pixel */
export function toRasterPx(o: Obj, p: { x: number; y: number }) {
  const m = objMatrix(o, editTime()).inverse();
  const l = apply(m, p);
  const b = localBox(o);
  const c = rasterCanvas(o);
  return { x: ((l.x - b.x) / b.w) * c.width, y: ((l.y - b.y) / b.h) * c.height };
}
/** raster pixel -> page matrix */
export function rasterToPage(o: Obj) {
  const b = localBox(o);
  const c = rasterCanvas(o);
  return objMatrix(o, editTime()).translate(b.x, b.y).scale(b.w / c.width, b.h / c.height);
}

// ---------- layers ----------
export function addLayer() {
  const l: Layer = { id: uid('l'), name: `Layer ${S.doc.layers.length + 1}`, visible: true, locked: false, opacity: 1, open: true };
  S.doc.layers.push(l);
  commit();
}
export function deleteLayer(id: string) {
  if (S.doc.layers.length < 2) { toast('A document needs at least one layer'); return; }
  const i = S.doc.layers.findIndex(l => l.id === id);
  const to = S.doc.layers[i === 0 ? 1 : i - 1].id;
  for (const p of S.doc.pages) for (const o of p.objects) if (o.layerId === id) o.layerId = to;
  S.doc.layers.splice(i, 1);
  commit();
}
export function moveLayer(id: string, dir: 1 | -1) {
  const a = S.doc.layers, i = a.findIndex(l => l.id === id), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit();
}

// ---------- pages ----------
export function addPage(w: number, h: number, name?: string) {
  const masters = S.doc.pages.filter(p => p.isMaster);
  const pg = newPage(name || `Page ${S.doc.pages.filter(p => !p.isMaster).length + 1}`, w, h, { masterId: masters[0]?.id || null });
  const idx = S.doc.pages.findIndex(p => p.id === S.ui.pageId);
  S.doc.pages.splice(idx + 1, 0, pg);
  S.ui.pageId = pg.id; S.ui.sel = [];
  fitAll();
  commit();
}
export function duplicatePage(id = S.ui.pageId) {
  const src = S.doc.pages.find(p => p.id === id)!;
  const copy: Page = JSON.parse(JSON.stringify(src));
  copy.id = uid('p'); copy.name = `${src.name} copy`; copy.isMaster = src.isMaster;
  const map = new Map<string, string>();
  for (const o of copy.objects) { const n = uid(); map.set(o.id, n); o.id = n; }
  for (const o of copy.objects) o.linkNext = o.linkNext ? map.get(o.linkNext) || null : null;
  const gm = new Map<string, string>();
  for (const o of copy.objects) {
    if (o.group) { if (!gm.has(o.group)) gm.set(o.group, uid('g')); o.group = gm.get(o.group); }
    if (o.clipBy) o.clipBy = map.get(o.clipBy);
    if (o.textPath) o.textPath = map.get(o.textPath) ?? o.textPath;
  }
  S.doc.pages.splice(S.doc.pages.indexOf(src) + 1, 0, copy);
  S.ui.pageId = copy.id; S.ui.sel = [];
  fitAll();
  commit();
}
export function deletePage(id: string) {
  const pg = S.doc.pages.find(p => p.id === id)!;
  if (!pg.isMaster && S.doc.pages.filter(p => !p.isMaster).length < 2) { toast('Keep at least one page'); return; }
  const ids = new Set(pg.objects.map(o => o.id));
  for (const p of S.doc.pages) {
    for (const o of p.objects) if (o.linkNext && ids.has(o.linkNext)) o.linkNext = null;
    if (p.masterId === id) p.masterId = null;
    p.objects = p.objects.filter(o => !(o.type === 'embed' && o.pageId === id));
  }
  for (const tr of S.doc.timeline.tracks) tr.clips = tr.clips.filter(c => c.pageId !== id);
  S.doc.pages = S.doc.pages.filter(p => p.id !== id);
  if (S.ui.pageId === id) S.ui.pageId = S.doc.pages.find(p => !p.isMaster)!.id;
  S.ui.sel = [];
  commit();
}
export function movePage(id: string, dir: 1 | -1) {
  const a = S.doc.pages, i = a.findIndex(p => p.id === id), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit();
}
export function goPage(id: string) {
  S.ui.pageId = id; S.ui.sel = []; S.ui.nodeSel = []; S.ui.editingText = null;
  fitAll();
  emit();
}
export function fitAll() { for (const v of Object.values(S.ui.views)) v.fitted = false; }

export function placePage(pageId: string) {
  const target = S.doc.pages.find(p => p.id === pageId)!;
  const pg = page();
  if (target.id === pg.id) { toast('A page cannot be placed inside itself'); return; }
  const w = Math.min(pg.w * 0.8, target.w), h = (w * target.h) / target.w;
  addObj(newObj('embed', currentLayerId(), { name: `${target.name} (placed)`, pageId, x: pg.w / 2, y: pg.h / 2, w, h }));
  commit();
}

// ---------- text threading ----------
export function linkFrames(fromId: string, toId: string) {
  if (fromId === toId) return;
  const a = findObj(fromId)?.obj, b = findObj(toId)?.obj;
  if (!a || !b || a.type !== 'text' || b.type !== 'text') return;
  // avoid cycles
  for (let f: Obj | undefined = b; f; f = f.linkNext ? findObj(f.linkNext)?.obj : undefined) if (f.id === a.id) { toast('That would create a loop'); return; }
  for (const p of S.doc.pages) for (const o of p.objects) if (o.linkNext === b.id) o.linkNext = null;
  if (b.text) { a.text = (a.text || '') + '\n' + b.text; b.text = ''; }
  a.linkNext = b.id;
  commit();
  toast('Frames linked: text now flows between them');
}

/** Head frame of a thread (which owns the text). */
export function threadHead(o: Obj): Obj {
  let cur = o;
  const seen = new Set<string>();
  for (;;) {
    seen.add(cur.id);
    const prev = S.doc.pages.flatMap(p => p.objects).find(x => x.linkNext === cur.id);
    if (!prev || seen.has(prev.id)) return cur;
    cur = prev;
  }
}

// ---------- timeline ----------
export function addTrack(kind: 'video' | 'audio') {
  const tl = S.doc.timeline;
  const n = tl.tracks.filter(t => t.kind === kind).length + 1;
  const tr: Track = { id: uid('t'), kind, name: `${kind === 'video' ? 'V' : 'A'}${n}`, muted: false, hidden: false, locked: false, clips: [] };
  if (kind === 'video') tl.tracks.unshift(tr); else tl.tracks.push(tr);
  commit();
}
export function findClip(id: string | null): { clip: Clip; track: Track } | null {
  if (!id) return null;
  for (const track of S.doc.timeline.tracks) { const clip = track.clips.find(c => c.id === id); if (clip) return { clip, track }; }
  return null;
}
function baseClip(kind: Clip['kind'], name: string, start: number, dur: number): Clip {
  return { id: uid('c'), kind, name, start, dur, offset: 0, speed: 1, volume: 1, opacity: 1, fadeIn: 0, fadeOut: 0, x: 0, y: 0, scale: 1, fx: defaultFx() };
}
function freeTrack(kind: 'video' | 'audio', start: number, dur: number): Track {
  const tl = S.doc.timeline;
  const tracks = tl.tracks.filter(t => t.kind === kind && !t.locked);
  const ordered = kind === 'video' ? [...tracks].reverse() : tracks;
  const free = ordered.find(t => !t.clips.some(c => c.start < start + dur && c.start + c.dur > start));
  if (free) return free;
  addTrack(kind);
  return kind === 'video' ? tl.tracks[0] : tl.tracks[tl.tracks.length - 1];
}
export function addMediaClip(m: Media, start = T.time, trackId?: string) {
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const c = baseClip('media', m.name, start, m.duration);
  c.mediaId = m.id;
  const tr = (trackId && S.doc.timeline.tracks.find(t => t.id === trackId && t.kind === kind)) || freeTrack(kind, start, c.dur);
  tr.clips.push(c);
  S.ui.selClip = c.id;
  commit();
}
export function addSceneClip(pageId = S.ui.pageId, start = T.time) {
  const pg = S.doc.pages.find(p => p.id === pageId)!;
  const c = baseClip('scene', pg.name, start, 5);
  c.pageId = pageId;
  freeTrack('video', start, 5).clips.push(c);
  S.ui.selClip = c.id;
  commit();
}
export function addTitleClip(start = T.time) {
  const c = baseClip('title', 'Title', start, 3);
  Object.assign(c, { text: 'Your title', fontSize: 64, color: '#FFFDF7', font: 'Fraunces', x: S.doc.timeline.w / 2, y: S.doc.timeline.h / 2, fadeIn: 0.4, fadeOut: 0.4 });
  freeTrack('video', start, 3).clips.push(c);
  S.ui.selClip = c.id;
  commit();
}
export function splitClip(id = S.ui.selClip, t = T.time) {
  const f = findClip(id);
  if (!f) {
    // split everything under the playhead
    let n = 0;
    for (const tr of S.doc.timeline.tracks) for (const c of [...tr.clips]) if (t > c.start + 0.01 && t < c.start + c.dur - 0.01 && !tr.locked) { splitOne(tr, c, t); n++; }
    if (n) commit(); else toast('Nothing under the playhead to split');
    return;
  }
  if (t <= f.clip.start + 0.01 || t >= f.clip.start + f.clip.dur - 0.01) { toast('Move the playhead inside the clip to split it'); return; }
  splitOne(f.track, f.clip, t);
  commit();
}
function splitOne(tr: Track, c: Clip, t: number) {
  const right: Clip = JSON.parse(JSON.stringify(c));
  right.id = uid('c');
  const cut = t - c.start;
  right.start = t; right.dur = c.dur - cut; right.offset = c.offset + cut * c.speed; right.fadeIn = 0;
  c.dur = cut; c.fadeOut = 0;
  tr.clips.push(right);
}
export function deleteClip(id = S.ui.selClip, ripple = false) {
  const f = findClip(id);
  if (!f) return;
  f.track.clips = f.track.clips.filter(c => c !== f.clip);
  if (ripple) for (const c of f.track.clips) if (c.start > f.clip.start) c.start -= f.clip.dur;
  S.ui.selClip = null;
  commit();
}
export const duration = () => timelineDuration(S.doc);
