import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import P from 'paper';
import { S, T, commit, emit, page, useStore, useTime, toast, isEditable, layerOf, findObj } from '../store';
import { newObj } from '../model';
import type { Obj, PNode } from '../model';
import {
  anim, apply, bez, corners, dist, localBox, objMatrix, objPath2D, pageBox, recentrePath, setProp, toPathObj, unionBox, node,
  type Box, type Pt,
} from '../geometry';
import { renderFrame, renderPage, sceneMatrix } from '../render';
import { layoutAll } from '../text';
import { addObj, cloneObjects, contentMatrix, currentLayerId, editTime, fromPaper, linkFrames, paintTarget, threadHead, activeSceneClip } from '../ops';
import { GS, Stroke, bucketFill, cropPageTo, gradientFill, magicWand, pickColour, selectNone, selectShape, setCloneSource, hasSelection, type BrushKind } from '../grain';
import { importFiles, importImage, pickFiles, loadImageInto } from '../io';
import { calligraphyPath, expandGroups, spiralPath } from '../ink';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; start: Pt; items: { o: Obj; x: number; y: number }[]; box: Box; moved: boolean }
  | { kind: 'scale'; handle: number; box: Box; items: { o: Obj; x: number; y: number; sx: number; sy: number; w?: number; h?: number }[] }
  | { kind: 'rotate'; centre: Pt; a0: number; items: { o: Obj; x: number; y: number; r: number }[] }
  | { kind: 'marquee'; start: Pt; cur: Pt; add: boolean }
  | { kind: 'shape'; o: Obj; start: Pt }
  | { kind: 'textbox'; start: Pt; cur: Pt; what: 'text' | 'table' | 'image' }
  | { kind: 'spiral'; start: Pt; cur: Pt }
  | { kind: 'lineobj'; start: Pt; cur: Pt }
  | { kind: 'calli'; pts: Pt[] }
  | { kind: 'nodes'; o: Obj; start: Pt; orig: PNode[][] }
  | { kind: 'handle'; o: Obj; sp: number; i: number; which: 'i' | 'o' }
  | { kind: 'pen' }
  | { kind: 'pencil'; pts: Pt[] }
  | { kind: 'sel'; shape: 'rect' | 'ell'; start: Pt; cur: Pt; mode: typeof S.ui.selMode }
  | { kind: 'lasso'; pts: Pt[]; mode: typeof S.ui.selMode }
  | { kind: 'paint'; stroke: Stroke }
  | { kind: 'line'; start: Pt; cur: Pt; tool: 'gradient' | 'grad-ink' | 'crop' | 'measure' }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number };

const scratch = document.createElement('canvas').getContext('2d')!;
const RULER = 20;

export const stageApi = {
  finishPen: () => {},
  redraw: () => {},
  zoomBy: ((f: number) => void f) as (f: number) => void,
  fit: () => {},
  pen: null as null | { id: string },
};

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export default function Stage() {
  useStore(); useTime();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const hover = useRef<Pt | null>(null);
  const snapLines = useRef<{ x?: number; y?: number }[]>([]);
  const raf = useRef(0);
  const mode = S.ui.mode;
  const tool = S.ui.tools[mode];
  const pg = page();
  const view = S.ui.views[mode];
  const content = mode === 'motion' ? { w: S.doc.timeline.w, h: S.doc.timeline.h } : { w: pg.w, h: pg.h };

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      for (const v of Object.values(S.ui.views)) if (!v.manual) v.fitted = false;
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = () => {
    const pad = mode === 'ink' || mode === 'print' ? 70 : 48;
    const z = Math.min((size.w - pad * 2) / content.w, (size.h - pad * 2) / content.h);
    view.zoom = Math.max(0.02, z);
    view.x = (size.w - content.w * view.zoom) / 2;
    view.y = (size.h - content.h * view.zoom) / 2 + (mode === 'ink' || mode === 'print' ? RULER / 2 : 0);
    view.fitted = true;
    view.manual = false;
  };
  if (!view.fitted && size.w > 50) { fit(); queueMicrotask(emit); }

  const viewM = () => new DOMMatrix().translate(view.x, view.y).scale(view.zoom);
  const p2s = (): DOMMatrix | null => { const cm = contentMatrix(); return cm ? viewM().multiply(cm) : null; };
  const toPage = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = cv.current!.getBoundingClientRect();
    const m = p2s();
    if (!m) return null;
    return apply(m.inverse(), { x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const toScreen = (p: Pt) => apply(p2s() || viewM(), p);
  const screenScale = () => { const m = p2s(); return m ? Math.hypot(m.a, m.b) : view.zoom; };

  // ---------- drawing ----------
  const draw = () => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const accent = cssVar('--accent') || '#c8803a';
    const sel = cssVar('--sel') || '#2f7fd8';
    const t = editTime();
    const hidden = new Set<string>(S.ui.editingText ? [S.ui.editingText] : []);

    // content
    ctx.save();
    const vm = viewM();
    ctx.setTransform(dpr * vm.a, 0, 0, dpr * vm.d, dpr * vm.e, dpr * vm.f);
    ctx.shadowColor = 'rgba(40,25,10,0.28)'; ctx.shadowBlur = 24 / view.zoom; ctx.shadowOffsetY = 6 / view.zoom;
    if (mode === 'motion') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, content.w, content.h);
      ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, content.w, content.h); ctx.clip();
      renderFrame(ctx, S.doc, T.time, { hidden });
      ctx.restore();
    } else {
      if (mode === 'grain' || !pg.bg) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h); ctx.shadowColor = 'transparent';
        if (!pg.bg) drawChecker(ctx, pg.w, pg.h, 10 / Math.max(0.25, view.zoom));
      } else { ctx.fillStyle = pg.bg; ctx.fillRect(0, 0, pg.w, pg.h); }
      ctx.shadowColor = 'transparent';
      ctx.save();
      if (mode === 'grain') { ctx.beginPath(); ctx.rect(0, 0, pg.w, pg.h); ctx.clip(); }
      renderPage(ctx, S.doc, pg, { time: t, hidden, noBg: mode === 'grain' && !pg.bg });
      ctx.restore();
    }
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const m = p2s();
    if (!m) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const msg = 'This page has no scene clip under the playhead. Add one from Media → Pages to animate it here.';
      ctx.font = '13px Inter'; const w = ctx.measureText(msg).width + 28;
      ctx.beginPath(); ctx.roundRect(size.w / 2 - w / 2, 14, w, 32, 16); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(msg, size.w / 2, 30); ctx.textAlign = 'left';
      return;
    }
    const sp = (p: Pt) => apply(m, p);
    const line = (a: Pt, b: Pt) => { const A = sp(a), B = sp(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); };
    const poly = (pts: Pt[], close = true) => { ctx.beginPath(); pts.map(sp).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); if (close) ctx.closePath(); };

    // grid
    if (S.ui.grid.show && mode !== 'motion') {
      const gs = S.ui.grid.size;
      if (gs * screenScale() >= 5) {
        ctx.strokeStyle = 'rgba(120,90,60,0.16)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x <= pg.w; x += gs) { const a = sp({ x, y: 0 }), b2 = sp({ x, y: pg.h }); ctx.moveTo(Math.round(a.x) + 0.5, a.y); ctx.lineTo(Math.round(b2.x) + 0.5, b2.y); }
        for (let y = 0; y <= pg.h; y += gs) { const a = sp({ x: 0, y }), b2 = sp({ x: pg.w, y }); ctx.moveTo(a.x, Math.round(a.y) + 0.5); ctx.lineTo(b2.x, Math.round(b2.y) + 0.5); }
        ctx.stroke();
      }
    }
    // page furniture
    if (mode === 'print' || mode === 'ink') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,90,60,0.55)';
      poly(corners({ x: 0, y: 0, w: pg.w, h: pg.h })); ctx.stroke();
    }
    if (mode === 'print' && S.ui.showGuides) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(214,72,72,0.6)';
      poly(corners({ x: -pg.bleed, y: -pg.bleed, w: pg.w + pg.bleed * 2, h: pg.h + pg.bleed * 2 })); ctx.stroke();
      ctx.setLineDash([]);
      const mg = pg.margins;
      ctx.strokeStyle = 'rgba(190,80,190,0.55)';
      poly(corners({ x: mg.l, y: mg.t, w: pg.w - mg.l - mg.r, h: pg.h - mg.t - mg.b })); ctx.stroke();
      const cols = Math.max(1, pg.columns), iw = pg.w - mg.l - mg.r, cw = (iw - pg.gutter * (cols - 1)) / cols;
      ctx.strokeStyle = 'rgba(70,140,210,0.4)';
      for (let i = 1; i < cols; i++) {
        const x1 = mg.l + i * cw + (i - 1) * pg.gutter, x2 = x1 + pg.gutter;
        line({ x: x1, y: mg.t }, { x: x1, y: pg.h - mg.b }); line({ x: x2, y: mg.t }, { x: x2, y: pg.h - mg.b });
      }
    }
    if ((mode === 'print' || mode === 'ink' || mode === 'grain') && S.ui.showGuides) {
      ctx.strokeStyle = 'rgba(40,170,190,0.85)'; ctx.lineWidth = 1;
      for (const gx of pg.guides.x) { const a = sp({ x: gx, y: 0 }); ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, size.h); ctx.stroke(); }
      for (const gy of pg.guides.y) { const a = sp({ x: 0, y: gy }); ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(size.w, a.y); ctx.stroke(); }
    }

    // text frames (Print shows them all; overflow is flagged)
    const lay = layoutAll(S.doc);
    if (mode === 'print' || mode === 'ink') {
      for (const o of pg.objects) {
        if (o.type !== 'text' || !o.visible) continue;
        const mm = m.multiply(objMatrix(o, t));
        const pts = corners(localBox(o)).map(q => apply(mm, q));
        const of = lay.get(o.id)?.overflow;
        if (mode === 'print' || of) {
          ctx.setLineDash(of ? [] : [3, 3]);
          ctx.strokeStyle = of ? '#d64545' : 'rgba(120,100,80,0.45)';
          ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (of) { const q = pts[2]; ctx.fillStyle = '#d64545'; ctx.fillRect(q.x - 9, q.y - 9, 10, 10); ctx.fillStyle = '#fff'; ctx.fillRect(q.x - 7, q.y - 4.5, 6, 1.2); ctx.fillRect(q.x - 4.6, q.y - 7, 1.2, 6); }
        if (mode === 'print' && o.linkNext) {
          const nx = pg.objects.find(x => x.id === o.linkNext);
          if (nx) {
            const a = apply(mm, { x: o.w! / 2, y: o.h! / 2 }), b = apply(m.multiply(objMatrix(nx, t)), { x: -nx.w! / 2, y: -nx.h! / 2 });
            ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(a.x + 40, a.y, b.x - 40, b.y, b.x, b.y); ctx.stroke();
            ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, 7); ctx.fill();
          }
        }
      }
    }
    if (S.ui.linkFrom) {
      const o = pg.objects.find(x => x.id === S.ui.linkFrom);
      if (o) { ctx.strokeStyle = accent; ctx.lineWidth = 2; const mm = m.multiply(objMatrix(o, t)); ctx.beginPath(); corners(localBox(o)).map(q => apply(mm, q)).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke(); }
    }

    // grain selection
    if (mode === 'grain' && GS.edges && GS.pageId === pg.id) {
      ctx.save();
      ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(GS.edges, 0, 0);
      ctx.restore();
    }

    // selection
    const selObjs = pg.objects.filter(o => S.ui.sel.includes(o.id));
    if (selObjs.length && tool !== 'node' && !(S.ui.editingText)) {
      ctx.lineWidth = 1; ctx.strokeStyle = sel;
      for (const o of selObjs) {
        const mm = m.multiply(objMatrix(o, t));
        ctx.setLineDash(selObjs.length > 1 ? [3, 3] : []);
        ctx.beginPath(); corners(localBox(o)).map(q => apply(mm, q)).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (tool === 'select') {
        const hs = handles();
        if (hs) {
          const rot = hs.rot;
          ctx.strokeStyle = sel; ctx.beginPath(); ctx.moveTo(hs.pts[1].x, hs.pts[1].y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
          ctx.fillStyle = '#fff';
          for (const h of hs.pts) { ctx.beginPath(); ctx.rect(h.x - 4, h.y - 4, 8, 8); ctx.fill(); ctx.stroke(); }
          ctx.beginPath(); ctx.arc(rot.x, rot.y, 5, 0, 7); ctx.fillStyle = sel; ctx.fill();
        }
      }
    }

    // node editing
    if (tool === 'node' || stageApi.pen) {
      const o = stageApi.pen ? pg.objects.find(x => x.id === stageApi.pen!.id) : selObjs.find(x => x.type === 'path');
      if (o && o.subpaths) {
        const mm = m.multiply(objMatrix(o, t));
        ctx.save(); ctx.setTransform(dpr * mm.a, dpr * mm.b, dpr * mm.c, dpr * mm.d, dpr * mm.e, dpr * mm.f);
        ctx.lineWidth = 1.2 / Math.hypot(mm.a, mm.b); ctx.strokeStyle = sel; ctx.stroke(objPath2D(o)); ctx.restore();
        o.subpaths.forEach((sub, si) => sub.nodes.forEach((n, ni) => {
          const q = apply(mm, n);
          const on = S.ui.nodeSel.some(s => s.sp === si && s.i === ni);
          if (on || stageApi.pen) {
            for (const [hx, hy] of [[n.ix, n.iy], [n.ox, n.oy]]) {
              if (hx === n.x && hy === n.y) continue;
              const hq = apply(mm, { x: hx, y: hy });
              ctx.strokeStyle = sel; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(hq.x, hq.y); ctx.stroke();
              ctx.fillStyle = sel; ctx.beginPath(); ctx.arc(hq.x, hq.y, 3.5, 0, 7); ctx.fill();
            }
          }
          ctx.fillStyle = on ? sel : '#fff'; ctx.strokeStyle = sel;
          ctx.beginPath();
          if (n.smooth) ctx.arc(q.x, q.y, 4.5, 0, 7); else ctx.rect(q.x - 4, q.y - 4, 8, 8);
          ctx.fill(); ctx.stroke();
        }));
        if (stageApi.pen && hover.current && o.subpaths[0]?.nodes.length && drag.current?.kind !== 'pen') {
          const last = o.subpaths[0].nodes[o.subpaths[0].nodes.length - 1];
          ctx.setLineDash([4, 4]); ctx.strokeStyle = sel; line(apply(objMatrix(o, t), last), hover.current); ctx.setLineDash([]);
        }
      }
    }

    // transient overlays
    const d = drag.current;
    ctx.strokeStyle = sel; ctx.lineWidth = 1;
    if (d?.kind === 'marquee' || d?.kind === 'textbox') {
      ctx.setLineDash([4, 3]); poly(corners(rectOf(d.start, d.cur))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(47,127,216,0.08)'; ctx.fill();
    }
    if (d?.kind === 'sel') {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#111';
      const b = rectOf(d.start, d.cur);
      if (d.shape === 'rect') poly(corners(b)); else { const c0 = sp({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); ctx.beginPath(); ctx.ellipse(c0.x, c0.y, (b.w / 2) * screenScale(), (b.h / 2) * screenScale(), 0, 0, 7); }
      ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineDashOffset = 5; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    if (d?.kind === 'lineobj') { ctx.strokeStyle = sel; ctx.lineWidth = 1.5; line(d.start, d.cur); }
    if (d?.kind === 'spiral') {
      const sp0 = spiralPath(d.start, dist(d.start, d.cur), S.ui.spiralTurns);
      ctx.strokeStyle = sel; ctx.lineWidth = 1.5; poly(sp0.nodes.map(n => ({ x: n.x, y: n.y })), false); ctx.stroke();
    }
    if (d?.kind === 'calli') { const sp0 = calligraphyPath(d.pts, S.ui.calli.width, S.ui.calli.angle, S.ui.calli.thinning); if (sp0) { ctx.fillStyle = 'rgba(47,127,216,0.45)'; poly(sp0.nodes.map(n => ({ x: n.x, y: n.y }))); ctx.fill(); } }
    if (S.ui.measure && (mode === 'ink' || mode === 'print')) {
      const A = sp(S.ui.measure.a), B = sp(S.ui.measure.b);
      ctx.strokeStyle = '#E0457B'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      for (const q of [A, B]) { ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fillStyle = '#E0457B'; ctx.fill(); }
      const dx = S.ui.measure.b.x - S.ui.measure.a.x, dy = S.ui.measure.b.y - S.ui.measure.a.y;
      const txt = `${Math.hypot(dx, dy).toFixed(1)} px · ${((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1)}° · Δ ${dx.toFixed(0)}, ${dy.toFixed(0)}`;
      ctx.font = '11.5px Inter'; const tw = ctx.measureText(txt).width + 14, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      ctx.fillStyle = 'rgba(30,20,10,.85)'; ctx.beginPath(); ctx.roundRect(mx - tw / 2, my - 26, tw, 20, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, mx, my - 16); ctx.textAlign = 'left';
    }
    if (d?.kind === 'lasso' || d?.kind === 'pencil') {
      ctx.strokeStyle = d.kind === 'lasso' ? '#111' : sel; ctx.setLineDash(d.kind === 'lasso' ? [5, 4] : []);
      poly(d.pts, false); ctx.stroke(); ctx.setLineDash([]);
    }
    if (d?.kind === 'line') {
      if (d.tool === 'crop') {
        const b = rectOf(d.start, d.cur);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        const tl = sp({ x: b.x, y: b.y }), br = sp({ x: b.x + b.w, y: b.y + b.h });
        ctx.beginPath(); ctx.rect(0, 0, size.w, size.h); ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y); ctx.fill('evenodd');
        ctx.strokeStyle = '#fff'; ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      } else {
        const a = sp(d.start), b = sp(d.cur);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
        for (const [q, col] of [[a, d.tool === 'gradient' ? S.ui.fg : S.ui.fg], [b, S.ui.bg]] as [Pt, string][]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); }
      }
    }
    ctx.strokeStyle = '#e0457b';
    for (const s of snapLines.current) {
      if (s.x !== undefined) { const a = sp({ x: s.x, y: 0 }); ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, size.h); ctx.stroke(); }
      if (s.y !== undefined) { const a = sp({ x: 0, y: s.y }); ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(size.w, a.y); ctx.stroke(); }
    }
    // brush cursor
    if (mode === 'grain' && hover.current && ['brush', 'pencil', 'eraser', 'smudge', 'clone', 'dodge', 'burn'].includes(tool)) {
      const q = sp(hover.current);
      const r = (S.ui.brush.size / 2) * screenScale();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1, 0, 7); ctx.stroke();
    }

    // rulers
    if (mode === 'ink' || mode === 'print') drawRulers(ctx, m);
  };

  const drawRulers = (ctx: CanvasRenderingContext2D, m: DOMMatrix) => {
    ctx.fillStyle = cssVar('--panel') || '#faf4e6';
    ctx.fillRect(0, 0, size.w, RULER); ctx.fillRect(0, 0, RULER, size.h);
    ctx.strokeStyle = cssVar('--line') || '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, RULER + 0.5); ctx.lineTo(size.w, RULER + 0.5); ctx.moveTo(RULER + 0.5, 0); ctx.lineTo(RULER + 0.5, size.h); ctx.stroke();
    const z = Math.hypot(m.a, m.b);
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const step = steps.find(s => s * z >= 60) || 1000;
    ctx.fillStyle = cssVar('--muted') || '#888'; ctx.font = '9px Inter'; ctx.textBaseline = 'top';
    const inv = m.inverse();
    const x0 = apply(inv, { x: RULER, y: 0 }).x, x1 = apply(inv, { x: size.w, y: 0 }).x;
    ctx.beginPath();
    for (let v = Math.floor(x0 / step) * step; v <= x1; v += step / 5) {
      const sx = apply(m, { x: v, y: 0 }).x;
      if (sx < RULER) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      ctx.moveTo(Math.round(sx) + 0.5, major ? 4 : 14); ctx.lineTo(Math.round(sx) + 0.5, RULER);
      if (major) ctx.fillText(String(Math.round(v)), sx + 3, 3);
    }
    const y0 = apply(inv, { x: 0, y: RULER }).y, y1 = apply(inv, { x: 0, y: size.h }).y;
    for (let v = Math.floor(y0 / step) * step; v <= y1; v += step / 5) {
      const sy = apply(m, { x: 0, y: v }).y;
      if (sy < RULER) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      ctx.moveTo(major ? 4 : 14, Math.round(sy) + 0.5); ctx.lineTo(RULER, Math.round(sy) + 0.5);
      if (major) { ctx.save(); ctx.translate(3, sy + 3); ctx.rotate(Math.PI / 2); ctx.fillText(String(Math.round(v)), 0, -8); ctx.restore(); }
    }
    ctx.stroke();
    ctx.fillStyle = cssVar('--panel') || '#faf4e6'; ctx.fillRect(0, 0, RULER, RULER);
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;
  stageApi.redraw = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => drawRef.current()); };
  useEffect(() => { cancelAnimationFrame(raf.current); draw(); });

  // ---------- selection handles ----------
  function selBox(): Box | null {
    const objs = pg.objects.filter(o => S.ui.sel.includes(o.id));
    return unionBox(objs.map(o => pageBox(o, editTime())));
  }
  function handles() {
    const b = selBox();
    if (!b) return null;
    const pts = [
      { x: b.x, y: b.y }, { x: b.x + b.w / 2, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h / 2 },
      { x: b.x + b.w, y: b.y + b.h }, { x: b.x + b.w / 2, y: b.y + b.h }, { x: b.x, y: b.y + b.h }, { x: b.x, y: b.y + b.h / 2 },
    ].map(toScreen);
    const rot = { x: pts[1].x, y: pts[1].y - 22 };
    return { pts, rot, box: b };
  }

  // ---------- hit testing ----------
  function renderOrder(): Obj[] {
    const out: Obj[] = [];
    for (const l of S.doc.layers) for (const o of pg.objects) if ((S.doc.layers.some(x => x.id === o.layerId) ? o.layerId : S.doc.layers[0].id) === l.id) out.push(o);
    return out;
  }
  function hit(p: Pt, filter: (o: Obj) => boolean = isEditable): Obj | null {
    const t = editTime();
    const tol = 5 / screenScale();
    const list = renderOrder().reverse();
    for (const o of list) {
      if (!filter(o) || o.isClip) continue;
      const m = objMatrix(o, t);
      const l = apply(m.inverse(), p);
      const b = localBox(o);
      const sc = Math.max(0.01, Math.hypot(m.a, m.b));
      if (o.type === 'text' || o.type === 'raster' || o.type === 'embed') {
        if (l.x >= b.x - tol && l.x <= b.x + b.w + tol && l.y >= b.y - tol && l.y <= b.y + b.h + tol) return o;
        continue;
      }
      const path = objPath2D(o);
      if (o.fill && scratch.isPointInPath(path, l.x, l.y, o.fillRule || 'nonzero')) return o;
      scratch.lineWidth = Math.max(o.stroke ? o.strokeWidth : 0, (tol * 2) / sc);
      if (scratch.isPointInStroke(path, l.x, l.y)) return o;
    }
    return null;
  }

  // ---------- snapping ----------
  function snapMove(box: Box, dx: number, dy: number, exclude: Set<string>) {
    snapLines.current = [];
    if (!S.ui.snap || mode === 'grain' || mode === 'motion') return { dx, dy };
    const th = 6 / screenScale();
    const t = editTime();
    const xs = [0, pg.w / 2, pg.w, ...pg.guides.x], ys = [0, pg.h / 2, pg.h, ...pg.guides.y];
    if (S.ui.grid.snap) {
      const gs = S.ui.grid.size;
      const nx = Math.round((box.x + dx) / gs) * gs, ny = Math.round((box.y + dy) / gs) * gs;
      xs.push(nx, Math.round((box.x + dx + box.w) / gs) * gs); ys.push(ny, Math.round((box.y + dy + box.h) / gs) * gs);
    }
    if (mode === 'print') { xs.push(pg.margins.l, pg.w - pg.margins.r); ys.push(pg.margins.t, pg.h - pg.margins.b); }
    for (const o of pg.objects) {
      if (exclude.has(o.id) || !o.visible) continue;
      const b = pageBox(o, t);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    const cand = (v0: (f: number) => number, arr: number[]) => {
      let best: { d: number; v: number; off: number } | null = null;
      for (const off of [0, 0.5, 1]) for (const v of arr) {
        const d = v - v0(off);
        if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v, off };
      }
      return best;
    };
    const bx = cand(f => box.x + dx + box.w * f, xs);
    const by = cand(f => box.y + dy + box.h * f, ys);
    if (bx) { dx += bx.d; snapLines.current.push({ x: bx.v }); }
    if (by) { dy += by.d; snapLines.current.push({ y: by.v }); }
    return { dx, dy };
  }

  // ---------- pen ----------
  stageApi.finishPen = () => {
    const pen = stageApi.pen;
    if (!pen) return;
    stageApi.pen = null;
    const o = pg.objects.find(x => x.id === pen.id);
    if (o) {
      const nodes = o.subpaths![0].nodes;
      if (nodes.length < 2) pg.objects = pg.objects.filter(x => x !== o);
      else { recentrePath(o); S.ui.sel = [o.id]; }
    }
    commit();
  };
  stageApi.zoomBy = (f: number) => zoomAt({ x: size.w / 2, y: size.h / 2 }, f);
  stageApi.fit = () => { fit(); emit(); };

  function zoomAt(s: Pt, f: number) {
    const nz = Math.min(64, Math.max(0.02, view.zoom * f));
    const k = nz / view.zoom;
    view.x = s.x - (s.x - view.x) * k; view.y = s.y - (s.y - view.y) * k; view.zoom = nz; view.manual = true;
    emit();
  }

  const modsMode = (e: React.PointerEvent): typeof S.ui.selMode => (e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : S.ui.selMode);

  // ---------- pointer handlers ----------
  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const r = cv.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (S.ui.editingText) { commitText(); }
    if (space.current || tool === 'hand' || e.button === 1) { drag.current = { kind: 'pan', sx, sy, vx: view.x, vy: view.y }; return; }
    if (tool === 'zoom') { zoomAt({ x: sx, y: sy }, e.altKey ? 1 / 1.5 : 1.5); return; }
    const p = toPage(e);
    if (!p) return;
    const t = editTime();

    // rulers → new guides
    if ((mode === 'ink' || mode === 'print') && (sx < RULER || sy < RULER)) {
      const axis = sy < RULER ? 'y' : 'x';
      pg.guides[axis].push(axis === 'x' ? p.x : p.y);
      drag.current = { kind: 'guide', axis, index: pg.guides[axis].length - 1 };
      return;
    }

    switch (tool) {
      case 'select': {
        const hs = handles();
        if (hs && S.ui.sel.length) {
          if (dist(hs.rot, { x: sx, y: sy }) < 8) {
            const c = { x: hs.box.x + hs.box.w / 2, y: hs.box.y + hs.box.h / 2 };
            drag.current = { kind: 'rotate', centre: c, a0: Math.atan2(p.y - c.y, p.x - c.x), items: selObjs().map(o => { const a = anim(o, t); return { o, x: a.x, y: a.y, r: a.rotation }; }) };
            return;
          }
          const hi = hs.pts.findIndex(h => Math.abs(h.x - sx) < 7 && Math.abs(h.y - sy) < 7);
          if (hi >= 0) {
            drag.current = { kind: 'scale', handle: hi, box: hs.box, items: selObjs().map(o => { const a = anim(o, t); return { o, x: a.x, y: a.y, sx: a.sx, sy: a.sy, w: o.w, h: o.h }; }) };
            return;
          }
        }
        // guides
        if (S.ui.showGuides && mode !== 'motion') {
          const th = 4 / screenScale();
          const gi = pg.guides.x.findIndex(v => Math.abs(v - p.x) < th), gj = pg.guides.y.findIndex(v => Math.abs(v - p.y) < th);
          const hitObj = hit(p);
          if (!hitObj && (gi >= 0 || gj >= 0)) { drag.current = { kind: 'guide', axis: gi >= 0 ? 'x' : 'y', index: gi >= 0 ? gi : gj }; return; }
        }
        const o = hit(p);
        if (o) {
          const within = e.ctrlKey || e.metaKey;
          const ex = (ids: string[]) => (within ? ids : expandGroups(ids));
          if (e.shiftKey) S.ui.sel = S.ui.sel.includes(o.id) ? S.ui.sel.filter(x => !ex([o.id]).includes(x)) : [...new Set([...S.ui.sel, ...ex([o.id])])];
          else if (!S.ui.sel.includes(o.id) || within) S.ui.sel = ex([o.id]);
          if (e.altKey) {
            const copies = cloneObjects(selObjs());
            pg.objects.push(...copies); S.ui.sel = copies.map(c => c.id);
          }
          const items = selObjs().filter(isEditable).map(x => { const a = anim(x, t); return { o: x, x: a.x, y: a.y }; });
          drag.current = { kind: 'move', start: p, items, box: selBox()!, moved: false };
          emit();
        } else {
          if (!e.shiftKey) S.ui.sel = [];
          drag.current = { kind: 'marquee', start: p, cur: p, add: e.shiftKey };
          emit();
        }
        return;
      }
      case 'rect': case 'ellipse': case 'star': {
        const o = newObj(tool, currentLayerId(), {
          x: p.x, y: p.y, w: 0, h: 0, fill: S.ui.fg, stroke: S.ui.bg, strokeWidth: S.ui.strokeWidth, name: tool === 'rect' ? 'Rectangle' : tool === 'ellipse' ? 'Ellipse' : S.ui.star.polygon ? 'Polygon' : 'Star',
          ...(tool === 'rect' ? { rx: S.ui.rectRadius } : {}), ...(tool === 'star' ? { points: S.ui.star.points, inner: S.ui.star.inner, polygon: S.ui.star.polygon } : {}),
        });
        if (mode === 'print') { o.stroke = null; o.strokeWidth = 0; }
        addObj(o);
        drag.current = { kind: 'shape', o, start: p };
        return;
      }
      case 'text': {
        drag.current = { kind: 'textbox', start: p, cur: p, what: 'text' };
        return;
      }
      case 'table': drag.current = { kind: 'textbox', start: p, cur: p, what: 'table' }; return;
      case 'imgframe': drag.current = { kind: 'textbox', start: p, cur: p, what: 'image' }; return;
      case 'line': drag.current = { kind: 'lineobj', start: p, cur: p }; return;
      case 'spiral': drag.current = { kind: 'spiral', start: p, cur: p }; return;
      case 'calli': drag.current = { kind: 'calli', pts: [p] }; return;
      case 'measure': S.ui.measure = null; drag.current = { kind: 'line', start: p, cur: p, tool: 'measure' }; emit(); return;
      case 'node': {
        const o = selObjs().find(x => x.type === 'path' || ['rect', 'ellipse', 'star'].includes(x.type));
        if (o && o.type === 'path' && isEditable(o)) {
          const mm = p2s()!.multiply(objMatrix(o, t));
          // handles of selected nodes first
          for (const s of S.ui.nodeSel) {
            const n = o.subpaths![s.sp]?.nodes[s.i];
            if (!n) continue;
            for (const which of ['i', 'o'] as const) {
              const hx = which === 'i' ? n.ix : n.ox, hy = which === 'i' ? n.iy : n.oy;
              if (hx === n.x && hy === n.y) continue;
              if (dist(apply(mm, { x: hx, y: hy }), { x: sx, y: sy }) < 7) { drag.current = { kind: 'handle', o, sp: s.sp, i: s.i, which }; return; }
            }
          }
          let found: { sp: number; i: number } | null = null;
          o.subpaths!.forEach((sub, si) => sub.nodes.forEach((n, ni) => { if (dist(apply(mm, n), { x: sx, y: sy }) < 7) found = { sp: si, i: ni }; }));
          if (found) {
            const f = found as { sp: number; i: number };
            const isOn = S.ui.nodeSel.some(s => s.sp === f.sp && s.i === f.i);
            if (e.altKey) { deleteNodes(o, [f]); return; }
            if (e.shiftKey) S.ui.nodeSel = isOn ? S.ui.nodeSel.filter(s => !(s.sp === f.sp && s.i === f.i)) : [...S.ui.nodeSel, f];
            else if (!isOn) S.ui.nodeSel = [f];
            drag.current = { kind: 'nodes', o, start: apply(objMatrix(o, t).inverse(), p), orig: o.subpaths!.map(sp2 => sp2.nodes.map(n => ({ ...n }))) };
            emit();
            return;
          }
        }
        const h = hit(p);
        if (h && ['rect', 'ellipse', 'star', 'path'].includes(h.type)) {
          if (h.type !== 'path') { toPathObj(h); commit(); toast('Converted to an editable path'); }
          S.ui.sel = [h.id]; S.ui.nodeSel = [];
        } else { S.ui.sel = []; S.ui.nodeSel = []; }
        emit();
        return;
      }
      case 'pen': {
        let o = stageApi.pen ? pg.objects.find(x => x.id === stageApi.pen!.id) : undefined;
        if (!o) {
          o = newObj('path', currentLayerId(), { name: 'Path', fill: null, stroke: S.ui.bg, strokeWidth: S.ui.strokeWidth, subpaths: [{ nodes: [node(p.x, p.y)], closed: false }] });
          addObj(o);
          stageApi.pen = { id: o.id };
        } else {
          const nodes = o.subpaths![0].nodes;
          const m0 = apply(objMatrix(o, t), nodes[0]);
          if (nodes.length > 1 && dist(toScreen(m0), { x: sx, y: sy }) < 9) {
            o.subpaths![0].closed = true; o.fill = S.ui.fg;
            stageApi.finishPen();
            return;
          }
          const l = apply(objMatrix(o, t).inverse(), p);
          nodes.push(node(l.x, l.y));
        }
        drag.current = { kind: 'pen' };
        emit();
        return;
      }
      case 'pencil': {
        if (mode === 'grain') break;
        drag.current = { kind: 'pencil', pts: [p] };
        return;
      }
      case 'gradient': {
        drag.current = { kind: 'line', start: p, cur: p, tool: mode === 'grain' ? 'gradient' : 'grad-ink' };
        return;
      }
      case 'eyedropper': {
        const c = pickColour(p);
        if (!c) return;
        if (e.shiftKey) S.ui.bg = c; else S.ui.fg = c;
        if (mode !== 'grain') { for (const o of selObjs().filter(isEditable)) { if (e.shiftKey) o.stroke = c; else o.fill = c; } commit(); }
        toast(`Picked ${c}`);
        emit();
        return;
      }
      case 'link': {
        const o = hit(p, x => x.type === 'text');
        if (!o) { S.ui.linkFrom = null; emit(); return; }
        if (!S.ui.linkFrom) { S.ui.linkFrom = o.id; toast('Now click the frame the text should flow into'); emit(); }
        else { linkFrames(S.ui.linkFrom, o.id); S.ui.linkFrom = null; }
        return;
      }
      case 'place': {
        pickFiles('image/*,.svg', false).then(fs => fs[0] && (fs[0].name.endsWith('.svg') ? importFiles(fs) : importImage(fs[0], p)));
        return;
      }
      case 'rectsel': case 'ellsel': {
        drag.current = { kind: 'sel', shape: tool === 'rectsel' ? 'rect' : 'ell', start: p, cur: p, mode: modsMode(e) };
        return;
      }
      case 'lasso': drag.current = { kind: 'lasso', pts: [p], mode: modsMode(e) }; return;
      case 'wand': magicWand(p, modsMode(e)); return;
      case 'crop': drag.current = { kind: 'line', start: p, cur: p, tool: 'crop' }; return;
      case 'bucket': {
        const o = paintTarget();
        if (o) bucketFill(o, p);
        return;
      }
    }
    if (mode === 'grain' && ['brush', 'pencil', 'eraser', 'smudge', 'clone', 'dodge', 'burn'].includes(tool)) {
      const o = paintTarget();
      if (!o) return;
      if (tool === 'clone' && e.altKey) { setCloneSource(o, p); return; }
      const st = new Stroke(o, tool as BrushKind);
      st.to(p);
      drag.current = { kind: 'paint', stroke: st };
      stageApi.redraw();
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toPage(e);
    hover.current = p;
    if (p) { S.ui.cursor = p; }
    const d = drag.current;
    const r = cv.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (!d) { stageApi.redraw(); updateCursorReadout(); return; }
    if (d.kind === 'pan') { view.x = d.vx + sx - d.sx; view.y = d.vy + sy - d.sy; view.manual = true; stageApi.redraw(); return; }
    if (!p) return;
    const t = editTime();
    switch (d.kind) {
      case 'move': {
        let dx = p.x - d.start.x, dy = p.y - d.start.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        ({ dx, dy } = snapMove(d.box, dx, dy, new Set(d.items.map(i => i.o.id))));
        if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
        for (const it of d.items) { setProp(it.o, 'x', it.x + dx, t, S.ui.mode === 'motion' && S.ui.autoKey); setProp(it.o, 'y', it.y + dy, t, S.ui.mode === 'motion' && S.ui.autoKey); }
        break;
      }
      case 'scale': {
        const b = d.box, h = d.handle;
        const ax = h === 0 || h === 6 || h === 7 ? b.x + b.w : h === 2 || h === 3 || h === 4 ? b.x : b.x + b.w / 2;
        const ay = h <= 2 ? b.y + b.h : h >= 4 && h <= 6 ? b.y : b.y + b.h / 2;
        const hx = h === 0 || h === 6 || h === 7 ? b.x : b.x + b.w, hy = h <= 2 ? b.y : b.y + b.h;
        let fx = h === 1 || h === 5 ? 1 : (p.x - ax) / ((hx - ax) || 1);
        let fy = h === 3 || h === 7 ? 1 : (p.y - ay) / ((hy - ay) || 1);
        if (e.shiftKey || ((h === 0 || h === 2 || h === 4 || h === 6) && d.items.some(i => i.o.type === 'raster') && !e.altKey)) {
          const f = Math.max(Math.abs(fx), Math.abs(fy)); fx = Math.sign(fx || 1) * f; fy = Math.sign(fy || 1) * f;
          if (h === 1 || h === 5) fx = fy; if (h === 3 || h === 7) fy = fx;
        }
        const ak = S.ui.mode === 'motion' && S.ui.autoKey;
        for (const it of d.items) {
          const o = it.o;
          setProp(o, 'x', ax + (it.x - ax) * fx, t, ak); setProp(o, 'y', ay + (it.y - ay) * fy, t, ak);
          const rot = ((anim(o, t).rotation % 180) + 180) % 180;
          const swap = Math.abs(rot - 90) < 1;
          const straight = rot < 1 || rot > 179 || swap;
          let lfx = swap ? fy : fx, lfy = swap ? fx : fy;
          if (!straight) { const u = Math.sqrt(Math.abs(fx * fy)); lfx = Math.sign(fx) * u; lfy = Math.sign(fy) * u; }
          if (['rect', 'ellipse', 'star', 'text', 'embed'].includes(o.type) && it.w !== undefined && !o.keys?.sx?.length) {
            o.w = Math.max(1, Math.abs(it.w * lfx)); o.h = Math.max(1, Math.abs(it.h! * lfy));
            if (lfx < 0 !== it.sx < 0) setProp(o, 'sx', -it.sx, t); if (lfy < 0 !== it.sy < 0) setProp(o, 'sy', -it.sy, t);
          } else { setProp(o, 'sx', it.sx * lfx, t, ak); setProp(o, 'sy', it.sy * lfy, t, ak); }
        }
        break;
      }
      case 'rotate': {
        let da = (Math.atan2(p.y - d.centre.y, p.x - d.centre.x) - d.a0) * 180 / Math.PI;
        if (e.shiftKey) da = Math.round(da / 15) * 15;
        const rad = da * Math.PI / 180, c = d.centre;
        const ak = S.ui.mode === 'motion' && S.ui.autoKey;
        for (const it of d.items) {
          const dx = it.x - c.x, dy = it.y - c.y;
          setProp(it.o, 'x', c.x + dx * Math.cos(rad) - dy * Math.sin(rad), t, ak);
          setProp(it.o, 'y', c.y + dx * Math.sin(rad) + dy * Math.cos(rad), t, ak);
          setProp(it.o, 'rotation', it.r + da, t, ak);
        }
        break;
      }
      case 'marquee': case 'textbox': d.cur = p; break;
      case 'shape': {
        let w = p.x - d.start.x, h = p.y - d.start.y;
        if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
        const o = d.o;
        if (e.altKey) { o.x = d.start.x; o.y = d.start.y; o.w = Math.abs(w) * 2; o.h = Math.abs(h) * 2; }
        else { o.x = d.start.x + w / 2; o.y = d.start.y + h / 2; o.w = Math.abs(w); o.h = Math.abs(h); }
        break;
      }
      case 'nodes': {
        const o = d.o;
        const l = apply(objMatrix(o, t).inverse(), p);
        const dx = l.x - d.start.x, dy = l.y - d.start.y;
        for (const s of S.ui.nodeSel) {
          const n = o.subpaths![s.sp].nodes[s.i], on = d.orig[s.sp][s.i];
          n.x = on.x + dx; n.y = on.y + dy; n.ix = on.ix + dx; n.iy = on.iy + dy; n.ox = on.ox + dx; n.oy = on.oy + dy;
        }
        o.subpaths = [...o.subpaths!];
        break;
      }
      case 'handle': {
        const o = d.o;
        const l = apply(objMatrix(o, t).inverse(), p);
        const n = o.subpaths![d.sp].nodes[d.i];
        if (d.which === 'i') { n.ix = l.x; n.iy = l.y; } else { n.ox = l.x; n.oy = l.y; }
        if (n.smooth && !e.altKey) {
          const hx = d.which === 'i' ? n.ix : n.ox, hy = d.which === 'i' ? n.iy : n.oy;
          const other = d.which === 'i' ? { x: n.ox, y: n.oy } : { x: n.ix, y: n.iy };
          const len = Math.hypot(other.x - n.x, other.y - n.y);
          const a = Math.atan2(n.y - hy, n.x - hx);
          const nx = n.x + Math.cos(a) * len, ny = n.y + Math.sin(a) * len;
          if (d.which === 'i') { n.ox = nx; n.oy = ny; } else { n.ix = nx; n.iy = ny; }
        }
        o.subpaths = [...o.subpaths!];
        break;
      }
      case 'pen': {
        const o = pg.objects.find(x => x.id === stageApi.pen?.id);
        if (!o) break;
        const nodes = o.subpaths![0].nodes, n = nodes[nodes.length - 1];
        const l = apply(objMatrix(o, t).inverse(), p);
        if (dist(l, n) * screenScale() > 3) { n.ox = l.x; n.oy = l.y; n.ix = 2 * n.x - l.x; n.iy = 2 * n.y - l.y; n.smooth = true; o.subpaths = [...o.subpaths!]; }
        break;
      }
      case 'pencil': case 'lasso': case 'calli': d.pts.push(p); break;
      case 'sel': case 'line': case 'spiral': d.cur = p; break;
      case 'lineobj': {
        d.cur = p;
        if (e.shiftKey) { const dx = p.x - d.start.x, dy = p.y - d.start.y, L = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12); d.cur = { x: d.start.x + Math.cos(a) * L, y: d.start.y + Math.sin(a) * L }; }
        break;
      }
      case 'paint': d.stroke.to(p); break;
      case 'guide': {
        const v = d.axis === 'x' ? p.x : p.y;
        pg.guides[d.axis][d.index] = v;
        break;
      }
    }
    stageApi.redraw();
    updateCursorReadout();
  };

  const updateCursorReadout = () => {
    const el = document.getElementById('cursor-readout');
    if (el && hover.current) el.textContent = `${Math.round(hover.current.x)}, ${Math.round(hover.current.y)} px`;
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    snapLines.current = [];
    if (!d) return;
    const t = editTime();
    switch (d.kind) {
      case 'pan': emit(); return;
      case 'move': if (d.moved) commit(); else emit(); return;
      case 'scale': case 'rotate': commit(); return;
      case 'marquee': {
        const b = rectOf(d.start, d.cur);
        if (b.w > 2 || b.h > 2) {
          const ids = pg.objects.filter(o => isEditable(o)).filter(o => { const ob = pageBox(o, t); return ob.x >= b.x && ob.y >= b.y && ob.x + ob.w <= b.x + b.w && ob.y + ob.h <= b.y + b.h; }).map(o => o.id);
          S.ui.sel = expandGroups(d.add ? [...new Set([...S.ui.sel, ...ids])] : ids);
        }
        emit(); return;
      }
      case 'shape': {
        if ((d.o.w || 0) < 2 && (d.o.h || 0) < 2) { pg.objects = pg.objects.filter(o => o !== d.o); S.ui.sel = []; emit(); return; }
        commit(); return;
      }
      case 'textbox': {
        const b = rectOf(d.start, d.cur);
        if (d.what === 'table') {
          const w = b.w > 40 ? b.w : 420, h = b.h > 30 ? b.h : S.ui.tableDef.rows * 34;
          const cx = b.w > 40 ? b.x + w / 2 : d.start.x + w / 2, cy = b.h > 30 ? b.y + h / 2 : d.start.y + h / 2;
          const { rows, cols } = S.ui.tableDef;
          const o = newObj('table', currentLayerId(), { name: 'Table', x: cx, y: cy, w, h, rows, cols, cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Column ${c + 1}` : ''))) });
          addObj(o); commit(); S.ui.sideTab = 'props'; return;
        }
        if (d.what === 'image') {
          const w = b.w > 20 ? b.w : 300, h = b.h > 20 ? b.h : 200;
          const cx = b.w > 20 ? b.x + w / 2 : d.start.x + w / 2, cy = b.h > 20 ? b.y + h / 2 : d.start.y + h / 2;
          const o = newObj('image', currentLayerId(), { name: 'Image frame', x: cx, y: cy, w, h, fill: mode === 'print' ? null : '#EFE6D2' });
          addObj(o); commit();
          pickFiles('image/*', false).then(fs => fs[0] && loadImageInto(o, fs[0]));
          return;
        }
        const size = S.ui.textDefaults.size;
        const big = b.w > 8 && b.h > 8;
        const o = newObj('text', currentLayerId(), {
          name: 'Text', text: '', font: S.ui.textDefaults.font, size, fill: mode === 'grain' ? S.ui.fg : (cssVarIsDark() ? '#3B2F22' : '#3B2F22'),
          w: big ? b.w : 320, h: big ? b.h : size * 1.4 * 2, x: big ? b.x + b.w / 2 : d.start.x + 160, y: big ? b.y + b.h / 2 : d.start.y + size * 1.4,
          ...(mode === 'print' ? { columns: 1 } : {}),
        });
        if (mode === 'motion' || mode === 'ink') o.fill = S.ui.fg;
        addObj(o);
        S.ui.editingText = o.id;
        emit();
        return;
      }
      case 'nodes': case 'handle': recentrePath(d.o); commit(); return;
      case 'pen': emit(); return;
      case 'pencil': {
        if (d.pts.length < 2) return;
        const path = new P.Path({ insert: false, segments: d.pts.map(q => [q.x, q.y]) });
        path.simplify(2.5 / Math.max(0.2, screenScale()));
        const sps = fromPaper(path);
        const o = newObj('path', currentLayerId(), { name: 'Freehand', subpaths: sps, fill: null, stroke: S.ui.bg, strokeWidth: S.ui.strokeWidth });
        if (dist(d.pts[0], d.pts[d.pts.length - 1]) * screenScale() < 10 && d.pts.length > 8) { o.subpaths![0].closed = true; o.fill = S.ui.fg; }
        recentrePath(o);
        addObj(o);
        commit(); return;
      }
      case 'lineobj': {
        if (dist(d.start, d.cur) * screenScale() < 4) { emit(); return; }
        const o = newObj('path', currentLayerId(), { name: 'Line', fill: null, stroke: S.ui.bg, strokeWidth: Math.max(1, S.ui.strokeWidth), subpaths: [{ closed: false, nodes: [node(d.start.x, d.start.y), node(d.cur.x, d.cur.y)] }] });
        recentrePath(o); addObj(o); commit(); return;
      }
      case 'spiral': {
        const r = dist(d.start, d.cur);
        if (r * screenScale() < 6) { emit(); return; }
        const o = newObj('path', currentLayerId(), { name: 'Spiral', fill: null, stroke: S.ui.bg, strokeWidth: Math.max(1, S.ui.strokeWidth), subpaths: [spiralPath(d.start, r, S.ui.spiralTurns)] });
        recentrePath(o); addObj(o); commit(); return;
      }
      case 'calli': {
        const sp = calligraphyPath(d.pts, S.ui.calli.width, S.ui.calli.angle, S.ui.calli.thinning);
        if (!sp) { emit(); return; }
        const o = newObj('path', currentLayerId(), { name: 'Calligraphy', fill: S.ui.fg, stroke: null, strokeWidth: 0, subpaths: [sp] });
        recentrePath(o); addObj(o); commit(); return;
      }
      case 'sel': {
        const b = rectOf(d.start, d.cur);
        if (b.w < 2 && b.h < 2) { selectNone(); return; }
        const path = new Path2D();
        if (d.shape === 'rect') path.rect(b.x, b.y, b.w, b.h); else path.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, 7);
        selectShape(path, d.mode);
        return;
      }
      case 'lasso': {
        if (d.pts.length < 3) { selectNone(); return; }
        const path = new Path2D();
        d.pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y))); path.closePath();
        selectShape(path, d.mode);
        return;
      }
      case 'paint': d.stroke.end(); return;
      case 'line': {
        if (dist(d.start, d.cur) * screenScale() < 3) { emit(); return; }
        if (d.tool === 'crop') { cropPageTo(rectOf(d.start, d.cur)); return; }
        if (d.tool === 'gradient') { const o = paintTarget(); if (o) gradientFill(o, d.start, d.cur); return; }
        const objs = selObjs().filter(o => isEditable(o) && o.type !== 'raster' && o.type !== 'embed');
        if (!objs.length) { toast('Select a shape first, then drag across it'); emit(); return; }
        for (const o of objs) {
          const a = anim(o, t);
          const ang = Math.atan2(d.cur.y - d.start.y, d.cur.x - d.start.x) * 180 / Math.PI - a.rotation;
          o.fill = { kind: e.altKey ? 'radial' : 'linear', angle: Math.round(ang), stops: [{ o: 0, c: S.ui.fg }, { o: 1, c: S.ui.bg }] };
        }
        commit(); return;
      }
      case 'guide': {
        const r = cv.current!.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        if (sx < RULER || sy < RULER) pg.guides[d.axis].splice(d.index, 1);
        commit(); return;
      }
    }
  };

  const onDouble = (e: React.MouseEvent) => {
    const p = toPage(e);
    if (!p) return;
    if (tool === 'pen') { stageApi.finishPen(); return; }
    if (tool === 'node') {
      const o = selObjs().find(x => x.type === 'path');
      if (o) { insertNodeNear(o, p); return; }
    }
    const im = hit(p, x => (x.type === 'image' || x.type === 'table') && isEditable(x));
    if (im && tool === 'select') {
      S.ui.sel = [im.id];
      if (im.type === 'image') pickFiles('image/*', false).then(fs => fs[0] && loadImageInto(im, fs[0]));
      else S.ui.sideTab = 'props';
      emit(); return;
    }
    const o = hit(p, x => x.type === 'text' && isEditable(x));
    if (o && (tool === 'select' || tool === 'text')) { S.ui.sel = [o.id]; S.ui.editingText = o.id; emit(); }
  };

  function insertNodeNear(o: Obj, p: Pt) {
    const l = apply(objMatrix(o, editTime()).inverse(), p);
    let best: { d: number; sp: number; i: number; t: number } | null = null;
    o.subpaths!.forEach((sub, si) => {
      const segs = sub.closed ? sub.nodes.length : sub.nodes.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = sub.nodes[i], b = sub.nodes[(i + 1) % sub.nodes.length];
        for (let k = 1; k < 40; k++) {
          const tt = k / 40, q = bez(a, { x: a.ox, y: a.oy }, { x: b.ix, y: b.iy }, b, tt);
          const dd = dist(q, l);
          if (!best || dd < best.d) best = { d: dd, sp: si, i, t: tt };
        }
      }
    });
    const b0 = best as { d: number; sp: number; i: number; t: number } | null;
    if (!b0 || b0.d * screenScale() > 10) return;
    const sub = o.subpaths![b0.sp];
    const a = sub.nodes[b0.i], b = sub.nodes[(b0.i + 1) % sub.nodes.length], tt = b0.t;
    const lerp = (u: Pt, v: Pt) => ({ x: u.x + (v.x - u.x) * tt, y: u.y + (v.y - u.y) * tt });
    const p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy };
    const q0 = lerp(a, p1), q1 = lerp(p1, p2), q2 = lerp(p2, b), r0 = lerp(q0, q1), r1 = lerp(q1, q2), s = lerp(r0, r1);
    a.ox = q0.x; a.oy = q0.y; b.ix = q2.x; b.iy = q2.y;
    const curved = !(a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y);
    const nn: PNode = curved ? { x: s.x, y: s.y, ix: r0.x, iy: r0.y, ox: r1.x, oy: r1.y, smooth: true } : node(s.x, s.y);
    sub.nodes.splice(b0.i + 1, 0, nn);
    S.ui.nodeSel = [{ sp: b0.sp, i: b0.i + 1 }];
    commit();
  }

  function deleteNodes(o: Obj, list = S.ui.nodeSel) {
    const rm = new Set(list.map(s => `${s.sp}:${s.i}`));
    o.subpaths = o.subpaths!.map((sub, si) => ({ ...sub, nodes: sub.nodes.filter((_, ni) => !rm.has(`${si}:${ni}`)) })).filter(sub => sub.nodes.length > 1);
    S.ui.nodeSel = [];
    if (!o.subpaths.length) { pg.objects = pg.objects.filter(x => x !== o); S.ui.sel = []; }
    else recentrePath(o);
    commit();
  }
  nodeApi.deleteNodes = () => { const o = selObjs().find(x => x.type === 'path'); if (o && S.ui.nodeSel.length) { deleteNodes(o); return true; } return false; };

  function selObjs() { return pg.objects.filter(o => S.ui.sel.includes(o.id)); }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = cv.current!.getBoundingClientRect();
      zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * 0.0025));
    } else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; view.manual = true; stageApi.redraw(); }
  };

  useEffect(() => {
    const el = cv.current!;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTyping(e)) { space.current = true; el.style.cursor = 'grab'; } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { space.current = false; el.style.cursor = ''; } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { el.removeEventListener('wheel', prevent); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  // ---------- inline text editing ----------
  function commitText() {
    const id = S.ui.editingText;
    S.ui.editingText = null;
    const f = id ? findObj(id) : null;
    if (f && f.obj.type === 'text' && !threadHead(f.obj).text && !f.obj.linkNext && f.page.objects.every(o => o.linkNext !== f.obj.id)) {
      f.page.objects = f.page.objects.filter(o => o !== f.obj);
      S.ui.sel = [];
    }
    commit();
  }
  const editing = S.ui.editingText ? pg.objects.find(o => o.id === S.ui.editingText) : null;
  let editor: React.ReactNode = null;
  const m = p2s();
  if (editing && m) {
    const head = threadHead(editing);
    const a = anim(editing, editTime());
    const centre = apply(m, { x: a.x, y: a.y });
    const sc = Math.hypot(m.a, m.b);
    const w = editing.w! * Math.abs(a.sx) * sc, h = editing.h! * Math.abs(a.sy) * sc;
    const fill = typeof editing.fill === 'string' ? editing.fill : '#333';
    editor = (
      <textarea
        className="text-editor"
        autoFocus
        value={head.text || ''}
        onChange={e => { head.text = e.target.value; emit(); }}
        onBlur={() => commitText()}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
        spellCheck
        placeholder="Type…"
        style={{
          left: centre.x - w / 2, top: centre.y - h / 2, width: w, height: Math.max(h, (editing.size || 16) * sc * 1.5),
          transform: `rotate(${a.rotation}deg)`,
          font: `${editing.italic ? 'italic ' : ''}${editing.weight || 400} ${(editing.size || 16) * sc * Math.abs(a.sy)}px "${editing.font}"`,
          lineHeight: editing.lineHeight, color: fill, textAlign: (editing.align === 'justify' ? 'justify' : editing.align) as React.CSSProperties['textAlign'],
          letterSpacing: (editing.letterSpacing || 0) * sc,
          columnCount: editing.columns || 1, columnGap: (editing.gutter || 0) * sc,
        }}
      />
    );
  }

  const cursor = tool === 'hand' ? 'grab' : tool === 'zoom' ? 'zoom-in' : ['pen', 'pencil', 'rect', 'ellipse', 'star', 'rectsel', 'ellsel', 'lasso', 'crop', 'gradient'].includes(tool) ? 'crosshair'
    : tool === 'text' ? 'text' : ['brush', 'eraser', 'smudge', 'clone', 'dodge', 'burn'].includes(tool) && mode === 'grain' ? 'none' : tool === 'pencil' && mode === 'grain' ? 'none' : tool === 'eyedropper' || tool === 'bucket' || tool === 'wand' ? 'crosshair' : 'default';

  return (
    <div className="stage" ref={wrap}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault(); const p = toPage(e);
        const files = [...e.dataTransfer.files];
        if (!files.length) return;
        const frame = p && files[0].type.startsWith('image/') && files[0].type !== 'image/svg+xml' ? hit(p, x => x.type === 'image' && isEditable(x)) : null;
        if (frame) { loadImageInto(frame, files[0]); return; }
        importFiles(files, p || undefined);
      }}>
      <canvas ref={cv} style={{ cursor }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={() => { hover.current = null; stageApi.redraw(); }}
        onDoubleClick={onDouble} onWheel={onWheel} onContextMenu={e => e.preventDefault()} />
      {editor}
      {mode === 'motion' && activeSceneClip() && <div className="stage-badge">{S.ui.autoKey ? '● Auto-key on: moves create keyframes' : 'Auto-key off'}</div>}
      {mode === 'grain' && hasSelection() && <div className="stage-badge">Selection active · Ctrl+Shift+A to deselect</div>}
    </div>
  );
}

export const nodeApi = { deleteNodes: () => false as boolean };

function rectOf(a: Pt, b: Pt): Box { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; }
function cssVarIsDark() { return document.documentElement.dataset.theme === 'dark'; }
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number, s: number) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.fillStyle = '#e6e2da';
  for (let y = 0; y < h; y += s) for (let x = ((y / s) % 2) * s; x < w; x += s * 2) ctx.fillRect(x, y, s, s);
  ctx.restore();
}

export { sceneMatrix, layerOf };
