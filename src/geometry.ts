import type { AnimProp, Ease, Key, Obj, PNode, SubPath } from './model';

export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

const K = 0.5522847498;

export const node = (x: number, y: number, ix = x, iy = y, ox = x, oy = y, smooth = false): PNode => ({ x, y, ix, iy, ox, oy, smooth });

// ---------- animation ----------
function easeFn(e: Ease, t: number) {
  switch (e) {
    case 'ease': return t * t * (3 - 2 * t);
    case 'in': return t * t;
    case 'out': return 1 - (1 - t) * (1 - t);
    default: return t;
  }
}

export function valueAt(keys: Key[] | undefined, base: number, t: number): number {
  if (!keys || keys.length === 0) return base;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      if (a.ease === 'hold') return a.v;
      const f = easeFn(a.ease, (t - a.t) / (b.t - a.t || 1));
      return a.v + (b.v - a.v) * f;
    }
  }
  return base;
}

export function anim(o: Obj, t: number) {
  const k = o.keys || {};
  return {
    x: valueAt(k.x, o.x, t), y: valueAt(k.y, o.y, t), rotation: valueAt(k.rotation, o.rotation, t),
    sx: valueAt(k.sx, o.sx, t), sy: valueAt(k.sy, o.sy, t), opacity: valueAt(k.opacity, o.opacity, t),
  };
}

/** Write a property: if it is animated, set/replace a key at time t; otherwise set the base value. */
export function setProp(o: Obj, p: AnimProp, v: number, t: number, forceKey = false) {
  const keys = o.keys?.[p];
  if ((keys && keys.length) || forceKey) {
    o.keys = o.keys || {};
    const arr = o.keys[p] = o.keys[p] || [];
    const ex = arr.find(k => Math.abs(k.t - t) < 1 / 120);
    if (ex) ex.v = v; else { arr.push({ t, v, ease: 'ease' }); arr.sort((a, b) => a.t - b.t); }
    if (!keys || !keys.length) o[p] = v;
  } else {
    o[p] = v;
  }
}

export function objMatrix(o: Obj, t: number): DOMMatrix {
  const a = anim(o, t);
  return new DOMMatrix().translate(a.x, a.y).rotate(a.rotation).scale(a.sx, a.sy);
}

// ---------- shapes to paths ----------
function rectPath(w: number, h: number, r: number): SubPath {
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r <= 0) return { closed: true, nodes: [node(x0, y0), node(x1, y0), node(x1, y1), node(x0, y1)] };
  const c = r * K;
  return {
    closed: true, nodes: [
      node(x0 + r, y0, x0 + r - c, y0, x0 + r, y0), node(x1 - r, y0, x1 - r, y0, x1 - r + c, y0),
      node(x1, y0 + r, x1, y0 + r - c, x1, y0 + r), node(x1, y1 - r, x1, y1 - r, x1, y1 - r + c),
      node(x1 - r, y1, x1 - r + c, y1, x1 - r, y1), node(x0 + r, y1, x0 + r, y1, x0 + r - c, y1),
      node(x0, y1 - r, x0, y1 - r + c, x0, y1 - r), node(x0, y0 + r, x0, y0 + r, x0, y0 + r - c),
    ],
  };
}

function ellipsePath(w: number, h: number): SubPath {
  const rx = w / 2, ry = h / 2, cx = rx * K, cy = ry * K;
  return {
    closed: true, nodes: [
      node(0, -ry, -cx, -ry, cx, -ry, true), node(rx, 0, rx, -cy, rx, cy, true),
      node(0, ry, cx, ry, -cx, ry, true), node(-rx, 0, -rx, cy, -rx, -cy, true),
    ],
  };
}

function starPath(w: number, h: number, n: number, inner: number, polygon: boolean): SubPath {
  const nodes: PNode[] = [];
  const count = polygon ? n : n * 2;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const r = polygon || i % 2 === 0 ? 1 : inner;
    nodes.push(node(Math.cos(a) * r * w / 2, Math.sin(a) * r * h / 2));
  }
  return { closed: true, nodes };
}

export function objSubpaths(o: Obj): SubPath[] {
  switch (o.type) {
    case 'rect': return [rectPath(o.w!, o.h!, o.rx || 0)];
    case 'ellipse': return [ellipsePath(o.w!, o.h!)];
    case 'star': return [starPath(o.w!, o.h!, o.points || 5, o.inner ?? 0.45, !!o.polygon)];
    case 'path': return o.subpaths || [];
    default: return [rectPath(o.w || 0, o.h || 0, 0)];
  }
}

const pathCache = new WeakMap<object, { key: string; p: Path2D }>();
export function objPath2D(o: Obj): Path2D {
  const sps = objSubpaths(o);
  const key = o.type === 'path' ? '' : `${o.type}${o.w}${o.h}${o.rx}${o.points}${o.inner}${o.polygon}`;
  const holder = o.type === 'path' ? (o.subpaths as object) : o;
  const c = holder && pathCache.get(holder);
  if (c && c.key === key) return c.p;
  const p = subpathsToPath2D(sps);
  if (holder) pathCache.set(holder, { key, p });
  return p;
}

export function subpathsToPath2D(sps: SubPath[]): Path2D {
  return new Path2D(subpathsToD(sps));
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export function subpathsToD(sps: SubPath[]): string {
  let d = '';
  for (const sp of sps) {
    const ns = sp.nodes;
    if (!ns.length) continue;
    d += `M${r2(ns[0].x)} ${r2(ns[0].y)}`;
    const segs = sp.closed ? ns.length : ns.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      if (a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y) d += `L${r2(b.x)} ${r2(b.y)}`;
      else d += `C${r2(a.ox)} ${r2(a.oy)} ${r2(b.ix)} ${r2(b.iy)} ${r2(b.x)} ${r2(b.y)}`;
    }
    if (sp.closed) d += 'Z';
  }
  return d;
}

export function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function localBox(o: Obj): Box {
  if (o.type !== 'path') return { x: -(o.w || 0) / 2, y: -(o.h || 0) / 2, w: o.w || 0, h: o.h || 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sp of o.subpaths || []) {
    const ns = sp.nodes;
    const segs = sp.closed ? ns.length : ns.length - 1;
    for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    for (let i = 0; i < segs; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      for (let s = 1; s < 12; s++) {
        const p = bez(a, { x: a.ox, y: a.oy }, { x: b.ix, y: b.iy }, b, s / 12);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
  }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function corners(b: Box): Pt[] {
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}

export function apply(m: DOMMatrix, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function boundsOf(pts: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pageBox(o: Obj, t: number): Box {
  const m = objMatrix(o, t);
  return boundsOf(corners(localBox(o)).map(p => apply(m, p)));
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return boundsOf(boxes.flatMap(corners));
}

/** Translate path nodes so their bounding-box centre is at the local origin, compensating x/y. */
export function recentrePath(o: Obj) {
  if (o.type !== 'path' || !o.subpaths) return;
  const b = localBox(o);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) return;
  for (const sp of o.subpaths) for (const n of sp.nodes) {
    n.x -= cx; n.y -= cy; n.ix -= cx; n.iy -= cy; n.ox -= cx; n.oy -= cy;
  }
  const m = new DOMMatrix().rotate(o.rotation).scale(o.sx, o.sy);
  const d = apply(m, { x: cx, y: cy });
  o.x += d.x - m.e; o.y += d.y - m.f;
  if (o.keys?.x) for (const k of o.keys.x) k.v += d.x;
  if (o.keys?.y) for (const k of o.keys.y) k.v += d.y;
}

export function toPathObj(o: Obj) {
  if (o.type === 'path' || !['rect', 'ellipse', 'star'].includes(o.type)) return;
  o.subpaths = JSON.parse(JSON.stringify(objSubpaths(o)));
  o.type = 'path';
  delete o.w; delete o.h; delete o.rx; delete o.points; delete o.inner; delete o.polygon;
}

/** Transform all nodes of a path in local space by m (used to bake transforms). */
export function mapNodes(sps: SubPath[], m: DOMMatrix): SubPath[] {
  return sps.map(sp => ({
    closed: sp.closed,
    nodes: sp.nodes.map(n => {
      const p = apply(m, n), i = apply(m, { x: n.ix, y: n.iy }), o = apply(m, { x: n.ox, y: n.oy });
      return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, smooth: n.smooth };
    }),
  }));
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function fmtTime(t: number, fps = 30) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

/** Parse absolute SVG path data (M, L, H, V, C, Q, Z) into subpaths. */
export function dToSubpaths(d: string): SubPath[] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null, cmd = '', i = 0, cx = 0, cy = 0;
  const num = () => parseFloat(toks[i++]);
  const last = () => cur!.nodes[cur!.nodes.length - 1];
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    switch (cmd) {
      case 'M': cx = num(); cy = num(); cur = { nodes: [node(cx, cy)], closed: false }; out.push(cur); cmd = 'L'; break;
      case 'L': cx = num(); cy = num(); cur!.nodes.push(node(cx, cy)); break;
      case 'H': cx = num(); cur!.nodes.push(node(cx, cy)); break;
      case 'V': cy = num(); cur!.nodes.push(node(cx, cy)); break;
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(); cx = num(); cy = num();
        const l = last(); l.ox = x1; l.oy = y1;
        cur!.nodes.push(node(cx, cy, x2, y2, cx, cy)); break;
      }
      case 'Q': {
        const qx = num(), qy = num(), x = num(), y = num(); const l = last();
        l.ox = l.x + (2 / 3) * (qx - l.x); l.oy = l.y + (2 / 3) * (qy - l.y);
        cur!.nodes.push(node(x, y, x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y)); cx = x; cy = y; break;
      }
      case 'Z': case 'z': {
        if (cur) {
          cur.closed = true;
          const f = cur.nodes[0], l = last();
          if (cur.nodes.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.nodes.pop(); }
        }
        break;
      }
      default: i++;
    }
  }
  return out;
}
