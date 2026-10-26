import P from 'paper';
import { PaperOffset } from 'paperjs-offset';
import { S, commit, page, selected, toast, isEditable } from './store';
import { newObj, uid } from './model';
import type { Obj, SubPath, PNode } from './model';
import {
  anim, apply, dist, dToSubpaths, localBox, mapNodes, node, objMatrix, pageBox, recentrePath, setProp, skewMatrix, splitSegment, toPathObj, unionBox, type Pt,
} from './geometry';
import { currentLayerId, editTime, fromPaper, toPaper, addObj, renderObjectsToCanvas } from './ops';
import { rasterCanvas } from './raster';

// ---------- groups ----------
export function expandGroups(ids: string[]): string[] {
  const pg = page();
  const groups = new Set(pg.objects.filter(o => ids.includes(o.id) && o.group).map(o => o.group!));
  if (!groups.size) return ids;
  return [...new Set([...ids, ...pg.objects.filter(o => o.group && groups.has(o.group)).map(o => o.id)])];
}
export function groupSel() {
  const sel = selected();
  if (sel.length < 2) { toast('Select two or more objects to group'); return; }
  const g = uid('g');
  sel.forEach(o => (o.group = g));
  commit();
  toast(`Grouped ${sel.length} objects`);
}
export function ungroupSel() {
  const sel = selected().filter(o => o.group);
  if (!sel.length) { toast('The selection has no groups'); return; }
  sel.forEach(o => delete o.group);
  commit();
}

// ---------- clipping ----------
export function setClip() {
  const pg = page();
  const sel = pg.objects.filter(o => S.ui.sel.includes(o.id) && isEditable(o));
  if (sel.length < 2) { toast('Select the objects to clip, with the clipping shape on top'); return; }
  const clipper = sel[sel.length - 1];
  const rest = sel.slice(0, -1);
  const g = uid('g');
  clipper.isClip = true;
  clipper.group = g;
  for (const o of rest) { o.clipBy = clipper.id; o.group = g; }
  S.ui.sel = rest.map(o => o.id);
  commit();
  toast('Clip set: the top shape now masks the others');
}
export function releaseClip() {
  const pg = page();
  const clipped = selected().filter(o => o.clipBy);
  if (!clipped.length) { toast('Select a clipped object first'); return; }
  const ids = new Set<string>();
  for (const o of clipped) { ids.add(o.clipBy!); delete o.clipBy; }
  for (const id of ids) {
    const c = pg.objects.find(x => x.id === id);
    if (c && !pg.objects.some(x => x.clipBy === id)) { c.isClip = false; c.visible = true; }
  }
  commit();
}

// ---------- geometry helpers ----------
/** Replace an object's outline with new page-space subpaths. */
export function setPageGeometry(o: Obj, sps: SubPath[]) {
  o.type = 'path';
  for (const k of ['w', 'h', 'rx', 'points', 'inner', 'polygon'] as const) delete o[k];
  o.subpaths = sps;
  o.x = 0; o.y = 0; o.rotation = 0; o.sx = 1; o.sy = 1;
  if (o.keys) for (const k of ['x', 'y', 'rotation', 'sx', 'sy'] as const) delete o.keys[k];
  recentrePath(o);
}

const isShape = (o: Obj) => ['rect', 'ellipse', 'star', 'path'].includes(o.type);

// ---------- transform dialog ----------
export interface XformOpts { dx: number; dy: number; sx: number; sy: number; rot: number; skx: number; sky: number }
export function applyTransform(x: XformOpts) {
  const objs = selected().filter(isEditable);
  if (!objs.length) return;
  const t = editTime();
  const box = unionBox(objs.map(o => pageBox(o, t)))!;
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const M = new DOMMatrix().translate(x.dx, x.dy).translate(c.x, c.y).rotate(x.rot).multiply(skewMatrix(x.skx, x.sky)).scale(x.sx, x.sy).translate(-c.x, -c.y);
  const skewed = Math.abs(x.skx) > 1e-6 || Math.abs(x.sky) > 1e-6;
  const nonUniform = Math.abs(x.sx - x.sy) > 1e-6;
  let skipped = 0;
  for (const o of objs) {
    const a = anim(o, t);
    const rotMod = ((a.rotation % 90) + 90) % 90;
    const needsBake = skewed || (nonUniform && rotMod > 0.01 && isShape(o) && Math.abs(x.rot) < 1e-6 ? true : skewed);
    if (needsBake) {
      if (!isShape(o)) { skipped++; continue; }
      toPathObj(o);
      setPageGeometry(o, mapNodes(o.subpaths!, M.multiply(objMatrix(o, t))));
      continue;
    }
    const p = apply(M, { x: a.x, y: a.y });
    setProp(o, 'x', p.x, t); setProp(o, 'y', p.y, t);
    if (x.rot) setProp(o, 'rotation', a.rotation + x.rot, t);
    if (x.sx !== 1 || x.sy !== 1) {
      if (['rect', 'ellipse', 'star', 'text', 'embed', 'image', 'table'].includes(o.type) && !o.keys?.sx?.length && rotMod < 0.01) {
        const swap = Math.abs(((a.rotation % 180) + 180) % 180 - 90) < 0.01;
        o.w = Math.max(1, (o.w || 1) * (swap ? x.sy : x.sx)); o.h = Math.max(1, (o.h || 1) * (swap ? x.sx : x.sy));
      } else { setProp(o, 'sx', a.sx * x.sx, t); setProp(o, 'sy', a.sy * x.sy, t); }
    }
  }
  commit();
  if (skipped) toast(`Skew applies to shapes and paths only; ${skipped} object${skipped > 1 ? 's were' : ' was'} skipped`);
}

// ---------- tiled clones ----------
export interface TileOpts { rows: number; cols: number; gapX: number; gapY: number; rotCol: number; rotRow: number; scaleCol: number; scaleRow: number; fadeCol: number; fadeRow: number }
export function tiledClones(o: TileOpts) {
  const pg = page();
  const src = selected();
  if (!src.length) { toast('Select an object to tile'); return; }
  const t = editTime();
  const box = unionBox(src.map(s => pageBox(s, t)))!;
  const g = uid('g');
  const all: string[] = [];
  src.forEach(s => (s.group = g));
  for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
    if (!r && !c) continue;
    const ox = c * (box.w + o.gapX), oy = r * (box.h + o.gapY);
    const sc = Math.pow(1 + o.scaleCol / 100, c) * Math.pow(1 + o.scaleRow / 100, r);
    for (const s of src) {
      const copy: Obj = JSON.parse(JSON.stringify(s));
      copy.id = uid(); copy.group = g; copy.linkNext = null; copy.name = `${s.name} (${r + 1},${c + 1})`;
      const a = anim(s, t);
      copy.x = a.x + ox; copy.y = a.y + oy; copy.keys = undefined;
      copy.rotation = a.rotation + c * o.rotCol + r * o.rotRow;
      copy.sx = a.sx * sc; copy.sy = a.sy * sc;
      copy.opacity = Math.max(0, a.opacity * Math.max(0, 1 - (c * o.fadeCol + r * o.fadeRow) / 100));
      pg.objects.push(copy);
      all.push(copy.id);
    }
  }
  S.ui.sel = [...src.map(s => s.id), ...all];
  commit();
  toast(`Created ${o.rows * o.cols - 1} clones in a group`);
}

// ---------- trace bitmap ----------
export interface TraceOpts { mode: 'mono' | 'colour'; threshold: number; levels: number; speckle: number; smooth: number; invert: boolean }

function loopsOf(mask: Uint8Array, w: number, h: number): Pt[][] {
  const edges: number[][] = [];
  const out = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const i = edges.length;
    edges.push([x0, y0, x1, y1, 0]);
    const k = key(x0, y0);
    (out.get(k) || out.set(k, []).get(k)!).push(i);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!on(x, y - 1)) add(x, y, x + 1, y);
    if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops: Pt[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (edges[i][4]) continue;
    const loop: Pt[] = [];
    let e = edges[i];
    for (;;) {
      e[4] = 1;
      loop.push({ x: e[0], y: e[1] });
      const next = (out.get(key(e[2], e[3])) || []).map(j => edges[j]).filter(q => !q[4]);
      if (!next.length) break;
      // prefer the tightest turn so touching regions stay separate
      const dx = e[2] - e[0], dy = e[3] - e[1];
      next.sort((a, b) => (dx * (a[3] - a[1]) - dy * (a[2] - a[0])) - (dx * (b[3] - b[1]) - dy * (b[2] - b[0])));
      e = next[0];
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

const areaOf = (pts: Pt[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };

function loopsToSubpaths(loops: Pt[][], smooth: number, speckle: number, toLocal: (p: Pt) => Pt): SubPath[] {
  const res: SubPath[] = [];
  for (let pts of loops) {
    if (Math.abs(areaOf(pts)) < speckle) continue;
    // drop collinear vertices
    pts = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x); });
    if (pts.length < 3) continue;
    // soften the staircase before fitting curves
    for (let it = 0; it < 2; it++) pts = pts.map((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 }; });
    const path = new P.Path({ insert: false, closed: true, segments: pts.map(p => [p.x, p.y]) });
    path.simplify(Math.max(0.1, smooth));
    for (const sp of fromPaper(path)) {
      sp.nodes = sp.nodes.map(n => {
        const p = toLocal(n), i = toLocal({ x: n.ix, y: n.iy }), o = toLocal({ x: n.ox, y: n.oy });
        return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, smooth: n.smooth };
      });
      res.push(sp);
    }
  }
  return res;
}

/** Outline a binary mask as editable Bézier subpaths (used by selection → path). */
export function maskToSubpaths(mask: Uint8Array, w: number, h: number, smooth = 0.8, speckle = 4): SubPath[] {
  return loopsToSubpaths(loopsOf(mask, w, h), smooth, speckle, p => p);
}

export function traceBitmap(opts: TraceOpts) {
  const src = selected().find(o => o.type === 'raster' || o.type === 'image');
  if (!src) { toast('Select a pixel layer to trace'); return; }
  let cv: HTMLCanvasElement | HTMLImageElement;
  if (src.type === 'raster') cv = rasterCanvas(src);
  else { toast('Rasterise the image frame first'); return; }
  const maxDim = 640;
  const k = Math.min(1, maxDim / Math.max(cv.width, cv.height));
  const w = Math.max(2, Math.round(cv.width * k)), h = Math.max(2, Math.round(cv.height * k));
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d', { willReadFrequently: true })!;
  tc.drawImage(cv, 0, 0, w, h);
  const d = tc.getImageData(0, 0, w, h).data;
  const lumAt = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const t = editTime();
  const M = objMatrix(src, t);
  const b = localBox(src);
  const toPage = (p: Pt) => apply(M, { x: b.x + (p.x / w) * b.w, y: b.y + (p.y / h) * b.h });
  const made: Obj[] = [];
  const speck = Math.max(0, opts.speckle);
  const lid = src.layerId;
  if (opts.mode === 'mono') {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const dark = lumAt(i * 4) < opts.threshold; mask[i] = d[i * 4 + 3] > 127 && (opts.invert ? !dark : dark) ? 1 : 0; }
    const sps = loopsToSubpaths(loopsOf(mask, w, h), opts.smooth, speck, toPage);
    if (sps.length) { const o = newObj('path', lid, { name: 'Trace', subpaths: sps, fill: '#111111', stroke: null, strokeWidth: 0, fillRule: 'evenodd' }); recentrePath(o); made.push(o); }
  } else {
    const n = Math.max(2, Math.min(12, Math.round(opts.levels)));
    for (let lv = n; lv >= 1; lv--) {
      const hi = (lv / n) * 255, lo = ((lv - 1) / n) * 255;
      const mask = new Uint8Array(w * h);
      let r = 0, g = 0, bl = 0, cnt = 0;
      for (let i = 0; i < w * h; i++) {
        if (d[i * 4 + 3] <= 127) continue;
        const l = lumAt(i * 4);
        if (l <= hi) mask[i] = 1;
        if (l > lo && l <= hi) { r += d[i * 4]; g += d[i * 4 + 1]; bl += d[i * 4 + 2]; cnt++; }
      }
      if (!cnt) continue;
      const col = '#' + [r, g, bl].map(v => Math.round(v / cnt).toString(16).padStart(2, '0')).join('').toUpperCase();
      const sps = loopsToSubpaths(loopsOf(mask, w, h), opts.smooth, speck, toPage);
      if (!sps.length) continue;
      const o = newObj('path', lid, { name: `Trace ${col}`, subpaths: sps, fill: col, stroke: null, strokeWidth: 0, fillRule: 'evenodd' });
      recentrePath(o); made.push(o);
    }
  }
  if (!made.length) { toast('Nothing to trace at this threshold'); return; }
  const g = uid('g'); made.forEach(o => (o.group = g));
  const pg = page();
  pg.objects.splice(pg.objects.indexOf(src) + 1, 0, ...made);
  S.ui.sel = made.map(o => o.id);
  commit();
  toast(`Traced into ${made.length} path${made.length > 1 ? 's' : ''}. Hide or delete the original bitmap.`);
}

// ---------- offset, outline, simplify ----------
export function offsetPaths(amount: number) {
  const objs = selected().filter(o => isShape(o) && isEditable(o));
  if (!objs.length) { toast('Select shapes to inset or outset'); return; }
  const t = editTime();
  let n = 0;
  for (const o of objs) {
    try {
      const item = toPaper(o, t);
      const res = PaperOffset.offset(item as paper.Path, amount, { join: 'round', insert: false }) as paper.PathItem;
      const sps = fromPaper(res);
      if (sps.length) { setPageGeometry(o, sps); n++; }
    } catch { /* leave the shape unchanged */ }
  }
  commit();
  if (!n) toast('That offset collapsed the shape');
}

export function strokeToPath() {
  const pg = page();
  const objs = selected().filter(o => isShape(o) && isEditable(o) && o.stroke && o.strokeWidth > 0);
  if (!objs.length) { toast('Select shapes that have a stroke'); return; }
  const t = editTime();
  const made: Obj[] = [];
  for (const o of objs) {
    try {
      const item = toPaper(o, t);
      const join = (o.join === 'miter' ? 'miter' : o.join === 'bevel' ? 'bevel' : 'round') as 'miter' | 'bevel' | 'round';
      const cap = (o.cap === 'butt' ? 'butt' : 'round') as 'butt' | 'round';
      const res = PaperOffset.offsetStroke(item as paper.Path, o.strokeWidth / 2, { join, cap, insert: false }) as paper.PathItem;
      const sps = fromPaper(res);
      if (!sps.length) continue;
      const out = newObj('path', o.layerId, { name: `${o.name} outline`, fill: typeof o.stroke === 'string' ? o.stroke : '#000', stroke: null, strokeWidth: 0, opacity: o.opacity, fillRule: 'nonzero' });
      out.subpaths = sps; recentrePath(out);
      pg.objects.splice(pg.objects.indexOf(o) + 1, 0, out);
      o.stroke = null; o.strokeWidth = 0;
      made.push(out);
    } catch { /* skip */ }
  }
  if (made.length) { S.ui.sel = made.map(o => o.id); commit(); toast('Stroke converted to a filled outline'); }
  else toast('Could not outline that stroke');
}

// ---------- node operations ----------
function selectedPath(): Obj | null { return selected().find(o => o.type === 'path' && isEditable(o)) || null; }

export function nodeSegmentType(kind: 'line' | 'curve') {
  const o = selectedPath();
  if (!o || !S.ui.nodeSel.length) { toast('Select nodes with the Edit tool first'); return; }
  const set = new Set(S.ui.nodeSel.map(s => `${s.sp}:${s.i}`));
  o.subpaths!.forEach((sub, si) => {
    const n = sub.nodes.length, segs = sub.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const both = set.has(`${si}:${i}`) && set.has(`${si}:${j}`);
      const single = S.ui.nodeSel.length === 1 && set.has(`${si}:${i}`);
      if (!both && !single) continue;
      const a = sub.nodes[i], b = sub.nodes[j];
      if (kind === 'line') { a.ox = a.x; a.oy = a.y; b.ix = b.x; b.iy = b.y; a.smooth = b.smooth = false; }
      else {
        a.ox = a.x + (b.x - a.x) / 3; a.oy = a.y + (b.y - a.y) / 3; b.ix = b.x - (b.x - a.x) / 3; b.iy = b.y - (b.y - a.y) / 3;
      }
    }
  });
  o.subpaths = [...o.subpaths!];
  commit();
}

export function nodeJoin() {
  const o = selectedPath();
  const sel = S.ui.nodeSel;
  if (!o || sel.length !== 2) { toast('Select exactly two end nodes to join'); return; }
  const [A, B] = sel;
  const sa = o.subpaths![A.sp], sb = o.subpaths![B.sp];
  const isEnd = (sp: SubPath, i: number) => !sp.closed && (i === 0 || i === sp.nodes.length - 1);
  if (!isEnd(sa, A.i) || !isEnd(sb, B.i)) { toast('Only the end nodes of open paths can be joined'); return; }
  if (A.sp === B.sp) {
    if (A.i === B.i) return;
    const first = sa.nodes[0], last = sa.nodes[sa.nodes.length - 1];
    first.ix = last.ix; first.iy = last.iy;
    sa.nodes.pop(); sa.closed = true;
  } else {
    if (A.i === 0) sa.nodes.reverse().forEach(n => { [n.ix, n.ox] = [n.ox, n.ix]; [n.iy, n.oy] = [n.oy, n.iy]; });
    if (B.i !== 0) sb.nodes.reverse().forEach(n => { [n.ix, n.ox] = [n.ox, n.ix]; [n.iy, n.oy] = [n.oy, n.iy]; });
    const end = sa.nodes[sa.nodes.length - 1], start = sb.nodes[0];
    const mx = (end.x + start.x) / 2, my = (end.y + start.y) / 2;
    const dix = end.ix - end.x, diy = end.iy - end.y, dox = start.ox - start.x, doy = start.oy - start.y;
    end.x = mx; end.y = my; end.ix = mx + dix; end.iy = my + diy; end.ox = mx + dox; end.oy = my + doy;
    sa.nodes.push(...sb.nodes.slice(1));
    o.subpaths!.splice(B.sp, 1);
  }
  S.ui.nodeSel = [];
  commit();
}

export function nodeBreak() {
  const o = selectedPath();
  if (!o || S.ui.nodeSel.length !== 1) { toast('Select one node to break the path at'); return; }
  const { sp, i } = S.ui.nodeSel[0];
  const sub = o.subpaths![sp];
  const clone = (n: PNode): PNode => ({ ...n });
  if (sub.closed) {
    const rot = [...sub.nodes.slice(i), ...sub.nodes.slice(0, i)].map(clone);
    const endNode = clone(rot[0]);
    endNode.ox = endNode.x; endNode.oy = endNode.y;
    rot[0].ix = rot[0].x; rot[0].iy = rot[0].y;
    rot.push(endNode);
    // the closing segment's incoming handle belongs to the new last node
    const prev = sub.nodes[(i - 1 + sub.nodes.length) % sub.nodes.length];
    void prev;
    endNode.ix = sub.nodes[i].ix; endNode.iy = sub.nodes[i].iy;
    o.subpaths![sp] = { nodes: rot, closed: false };
  } else {
    if (i === 0 || i === sub.nodes.length - 1) { toast('That node is already an end'); return; }
    const left = sub.nodes.slice(0, i + 1).map(clone), right = sub.nodes.slice(i).map(clone);
    left[left.length - 1].ox = left[left.length - 1].x; left[left.length - 1].oy = left[left.length - 1].y;
    right[0].ix = right[0].x; right[0].iy = right[0].y;
    o.subpaths!.splice(sp, 1, { nodes: left, closed: false }, { nodes: right, closed: false });
  }
  S.ui.nodeSel = [];
  commit();
}

export function addNodes() {
  const objs = selected().filter(o => o.type === 'path' && isEditable(o));
  if (!objs.length) { toast('Select paths first'); return; }
  for (const o of objs) for (const sub of o.subpaths!) {
    const segs = sub.closed ? sub.nodes.length : sub.nodes.length - 1;
    for (let i = segs - 1; i >= 0; i--) splitSegment(sub, i, 0.5);
  }
  commit();
}

export function roughen(amount: number) {
  const objs = selected().filter(o => o.type === 'path' && isEditable(o));
  if (!objs.length) { toast('Select paths first'); return; }
  const j = () => (Math.random() - 0.5) * 2 * amount;
  for (const o of objs) for (const sub of o.subpaths!) for (const n of sub.nodes) {
    const dx = j(), dy = j();
    n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy;
  }
  for (const o of objs) recentrePath(o);
  commit();
}

export function autoSmooth() {
  const objs = selected().filter(o => o.type === 'path' && isEditable(o));
  if (!objs.length) { toast('Select paths first'); return; }
  for (const o of objs) for (const sub of o.subpaths!) {
    const n = sub.nodes.length;
    sub.nodes.forEach((nd, i) => {
      if (!sub.closed && (i === 0 || i === n - 1)) return;
      const p = sub.nodes[(i - 1 + n) % n], q = sub.nodes[(i + 1) % n];
      const dx = (q.x - p.x) / 6, dy = (q.y - p.y) / 6;
      nd.ix = nd.x - dx; nd.iy = nd.y - dy; nd.ox = nd.x + dx; nd.oy = nd.y + dy; nd.smooth = true;
    });
  }
  commit();
}

/** Catmull-Rom smooth bezier through points. */
export function smoothThrough(pts: Pt[], closed = false): SubPath {
  const n = pts.length;
  const nodes = pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = (b.x - a.x) / 6, dy = (b.y - a.y) / 6;
    const end = !closed && (i === 0 || i === n - 1);
    return end ? node(p.x, p.y) : { x: p.x, y: p.y, ix: p.x - dx, iy: p.y - dy, ox: p.x + dx, oy: p.y + dy, smooth: true };
  });
  return { nodes, closed };
}

export function spiralPath(c: Pt, radius: number, turns: number): SubPath {
  const steps = Math.max(12, Math.round(turns * 24));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) { const f = i / steps, a = f * turns * Math.PI * 2; pts.push({ x: c.x + Math.cos(a) * radius * f, y: c.y + Math.sin(a) * radius * f }); }
  return smoothThrough(pts);
}

/** Calligraphic stroke: a fixed-angle nib whose width thins with speed. */
export function calligraphyPath(pts: Pt[], width: number, angleDeg: number, thinning: number): SubPath | null {
  if (pts.length < 2) return null;
  const a = (angleDeg * Math.PI) / 180, nx = Math.cos(a), ny = Math.sin(a);
  // thin out points that are too close together
  const keep: Pt[] = [pts[0]];
  for (const p of pts) if (dist(p, keep[keep.length - 1]) > 1.5) keep.push(p);
  if (keep.length < 2) return null;
  const left: Pt[] = [], right: Pt[] = [];
  let wPrev = width;
  keep.forEach((p, i) => {
    const q = keep[Math.min(keep.length - 1, i + 1)], r = keep[Math.max(0, i - 1)];
    const speed = dist(q, r) / 2;
    const target = width * Math.max(0.25, 1 - (thinning / 100) * Math.min(1, speed / 14));
    wPrev = wPrev * 0.7 + target * 0.3;
    const taper = Math.min(1, (i + 1) / 4, (keep.length - i) / 4);
    const h = (wPrev * taper) / 2;
    left.push({ x: p.x + nx * h, y: p.y + ny * h }); right.push({ x: p.x - nx * h, y: p.y - ny * h });
  });
  return smoothThrough([...left, ...right.reverse()], true);
}

// ---------- text on path ----------
export function textToPath(textId: string, pathId: string | null) {
  const o = page().objects.find(x => x.id === textId);
  if (!o) return;
  o.textPath = pathId; o.textOffset = o.textOffset || 0;
  commit();
}

// ---------- symbols ----------
const poly = (pts: [number, number][]): SubPath => ({ closed: true, nodes: pts.map(([x, y]) => node(x, y)) });
const ngon = (n: number, r = 46, rot = -90): SubPath => poly(Array.from({ length: n }, (_, i) => { const a = ((rot + (360 / n) * i) * Math.PI) / 180; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as [number, number]; }));
const starPoly = (n: number, inner: number, r = 48): SubPath => poly(Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; return [50 + Math.cos(a) * rr, 50 + Math.sin(a) * rr] as [number, number]; }));
const circle = (cx: number, cy: number, r: number, ccw = false): SubPath => {
  const c = r * 0.5522847498;
  const nodes = [node(cx, cy - r, cx - c, cy - r, cx + c, cy - r, true), node(cx + r, cy, cx + r, cy - c, cx + r, cy + c, true), node(cx, cy + r, cx + c, cy + r, cx - c, cy + r, true), node(cx - r, cy, cx - r, cy + c, cx - r, cy - c, true)];
  if (ccw) { nodes.reverse().forEach(n => { [n.ix, n.ox] = [n.ox, n.ix]; [n.iy, n.oy] = [n.oy, n.iy]; }); }
  return { closed: true, nodes };
};
const d = (path: string) => () => dToSubpaths(path);

export interface Symbol { id: string; name: string; group: string; build: () => SubPath[]; evenodd?: boolean }
export const SYMBOLS: Symbol[] = [
  { id: 'arrow', name: 'Arrow', group: 'Arrows', build: d('M5 38 H58 V15 L96 50 L58 85 V62 H5 Z') },
  { id: 'darrow', name: 'Double arrow', group: 'Arrows', build: d('M2 50 L28 22 V40 H72 V22 L98 50 L72 78 V60 H28 V78 Z') },
  { id: 'uturn', name: 'Curved arrow', group: 'Arrows', build: d('M8 90 C8 40 30 22 62 22 V6 L94 34 L62 62 V46 C40 46 28 56 28 90 Z') },
  { id: 'chevron', name: 'Chevron', group: 'Arrows', build: d('M20 6 L68 6 L96 50 L68 94 L20 94 L48 50 Z') },
  { id: 'heart', name: 'Heart', group: 'Shapes', build: d('M50 90 C10 58 2 38 14 22 C26 8 44 14 50 30 C56 14 74 8 86 22 C98 38 90 58 50 90 Z') },
  { id: 'star5', name: 'Star', group: 'Shapes', build: () => [starPoly(5, 0.42)] },
  { id: 'burst', name: 'Burst', group: 'Shapes', build: () => [starPoly(12, 0.72)] },
  { id: 'sun', name: 'Sun rays', group: 'Shapes', build: () => [starPoly(16, 0.58)] },
  { id: 'hex', name: 'Hexagon', group: 'Shapes', build: () => [ngon(6)] },
  { id: 'penta', name: 'Pentagon', group: 'Shapes', build: () => [ngon(5)] },
  { id: 'octo', name: 'Octagon', group: 'Shapes', build: () => [ngon(8, 46, -67.5)] },
  { id: 'tri', name: 'Triangle', group: 'Shapes', build: d('M50 8 L94 90 H6 Z') },
  { id: 'diamond', name: 'Diamond', group: 'Shapes', build: d('M50 4 L96 50 L50 96 L4 50 Z') },
  { id: 'ring', name: 'Ring', group: 'Shapes', build: () => [circle(50, 50, 46), circle(50, 50, 28, true)], evenodd: true },
  { id: 'crescent', name: 'Crescent', group: 'Shapes', build: d('M62 6 C30 10 10 32 10 54 C10 78 34 96 60 94 C74 93 86 88 92 80 C62 84 40 66 40 46 C40 28 50 14 62 6 Z') },
  { id: 'gear', name: 'Gear', group: 'Shapes', build: () => [poly(Array.from({ length: 32 }, (_, i) => { const a = (i * Math.PI * 2) / 32, tooth = Math.floor(i / 2) % 2 === 0; const r = tooth ? 47 : 36; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as [number, number]; })), circle(50, 50, 14, true)], evenodd: true },
  { id: 'drop', name: 'Droplet', group: 'Nature', build: d('M50 4 C70 30 88 48 88 66 C88 86 70 96 50 96 C30 96 12 86 12 66 C12 48 30 30 50 4 Z') },
  { id: 'leaf', name: 'Leaf', group: 'Nature', build: d('M10 90 C10 40 40 10 92 8 C92 60 62 92 10 90 Z') },
  { id: 'cloud', name: 'Cloud', group: 'Nature', build: d('M26 78 C8 78 4 56 22 52 C20 32 44 22 56 36 C64 20 92 28 88 52 C102 56 96 78 78 78 Z') },
  { id: 'bolt', name: 'Lightning', group: 'Nature', build: d('M58 4 L20 56 H44 L36 96 L82 38 H56 Z') },
  { id: 'speech', name: 'Speech bubble', group: 'Callouts', build: d('M12 12 H88 Q96 12 96 20 V60 Q96 68 88 68 H44 L24 90 V68 H12 Q4 68 4 60 V20 Q4 12 12 12 Z') },
  { id: 'banner', name: 'Banner', group: 'Callouts', build: d('M2 26 H98 L84 50 L98 74 H2 L16 50 Z') },
  { id: 'tag', name: 'Tag', group: 'Callouts', build: d('M6 6 H56 L94 44 L58 94 L6 56 Z') },
  { id: 'flag', name: 'Flag', group: 'Callouts', build: d('M14 6 V96 H22 V60 H84 L68 33 L84 6 Z') },
  { id: 'bookmark', name: 'Bookmark', group: 'Callouts', build: d('M20 4 H80 V96 L50 72 L20 96 Z') },
  { id: 'pin', name: 'Map pin', group: 'Callouts', build: d('M50 96 C50 96 16 58 16 38 C16 18 31 4 50 4 C69 4 84 18 84 38 C84 58 50 96 50 96 Z') },
  { id: 'check', name: 'Check', group: 'Marks', build: d('M6 54 L22 38 L40 56 L78 14 L94 30 L40 90 Z') },
  { id: 'cross', name: 'Cross', group: 'Marks', build: d('M20 6 L50 36 L80 6 L94 20 L64 50 L94 80 L80 94 L50 64 L20 94 L6 80 L36 50 L6 20 Z') },
  { id: 'plus', name: 'Plus', group: 'Marks', build: d('M38 6 H62 V38 H94 V62 H62 V94 H38 V62 H6 V38 H38 Z') },
  { id: 'house', name: 'House', group: 'Marks', build: d('M50 6 L96 48 H82 V94 H58 V64 H42 V94 H18 V48 H4 Z') },
];

export function insertSymbol(sym: Symbol) {
  const pg = page();
  const o = newObj('path', currentLayerId(), { name: sym.name, subpaths: sym.build(), fill: S.ui.fg, stroke: S.ui.bg, strokeWidth: S.ui.strokeWidth, fillRule: sym.evenodd ? 'evenodd' : 'nonzero' });
  const k = Math.min(pg.w, pg.h) * 0.2 / 100;
  o.sx = o.sy = Math.max(0.5, k);
  recentrePath(o);
  o.x = pg.w / 2; o.y = pg.h / 2;
  addObj(o);
  commit();
}


/** Turn text into editable vector outlines by rendering it large and tracing the shapes. */
export function textToOutlines() {
  const pg = page(), t = editTime();
  const texts = selected().filter(o => o.type === 'text' && isEditable(o));
  if (!texts.length) { toast('Select text to convert'); return; }
  const K = 4;
  const made: Obj[] = [];
  for (const o of texts) {
    const b = pageBox(o, t);
    const box = { x: Math.floor(b.x) - 4, y: Math.floor(b.y) - 4, w: Math.ceil(b.w) + 8, h: Math.ceil(b.h) + 8 };
    const c = renderObjectsToCanvas([{ ...o, textPath: o.textPath }], box, t, K);
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    const mask = new Uint8Array(c.width * c.height);
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    const sps = mapNodes(maskToSubpaths(mask, c.width, c.height, 0.35, 3), new DOMMatrix().translate(box.x, box.y).scale(1 / K));
    if (!sps.length) continue;
    const out = newObj('path', o.layerId, { name: `${o.name} (outlines)`, subpaths: sps, fill: o.fill, stroke: null, strokeWidth: 0, fillRule: 'evenodd', opacity: anim(o, t).opacity, blend: o.blend });
    recentrePath(out);
    const i = pg.objects.indexOf(o);
    pg.objects.splice(i, 1, out);
    made.push(out);
  }
  if (!made.length) { toast('That text has nothing to outline'); return; }
  S.ui.sel = made.map(o => o.id);
  commit('Text to outlines');
  toast('Text converted to editable shapes. It no longer reflows when you edit it.');
}
