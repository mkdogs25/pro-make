import { useEffect, useRef, useState } from 'react';
import { S, emit, page, selected } from '../store';
import { Icon } from './icons';
import { Num, Select } from './controls';
import { Adjust, canvasSize, scaleImage } from '../grain';
import { curveLUT, histogram } from '../pixfx';

const close = () => { S.ui.modal = null; emit(); };
const Back = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}><div className="modal" role="dialog" aria-label={label}>{children}</div></div>
);

// ---------- generic "type a number" dialog ----------
export interface Ask { title: string; label: string; value: number; unit?: string; min?: number; max?: number; ok: string; run: (v: number) => void }
export function ask(a: Ask) { S.ui.modal = { kind: 'ask', data: a }; emit(); }

export function AskModal({ a }: { a: Ask }) {
  const [v, setV] = useState(a.value);
  return (
    <Back label={a.title}>
      <h3>{a.title}</h3>
      <Num label={a.label} value={v} min={a.min} max={a.max} unit={a.unit} onChange={setV} />
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); a.run(v); }}>{a.ok}</button></div>
    </Back>
  );
}

export function ScaleImageModal() {
  const pg = page();
  const [w, setW] = useState(pg.w), [h, setH] = useState(pg.h), [lock, setLock] = useState(true);
  return (
    <Back label="Scale image">
      <h3><Icon name="image" size={16} /> Scale image</h3>
      <div className="grid2">
        <Num label="Width" value={w} min={1} max={16000} unit="px" onChange={v => { setW(Math.round(v)); if (lock) setH(Math.round((v * pg.h) / pg.w)); }} />
        <Num label="Height" value={h} min={1} max={16000} unit="px" onChange={v => { setH(Math.round(v)); if (lock) setW(Math.round((v * pg.w) / pg.h)); }} />
      </div>
      <label className="check"><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} /> Keep proportions</label>
      <p className="muted small">Pixel layers are resampled; vector shapes and text scale with them. Currently {pg.w} × {pg.h}.</p>
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); scaleImage(w / pg.w, h / pg.h); }}>Scale</button></div>
    </Back>
  );
}

export function CanvasSizeModal() {
  const pg = page();
  const [w, setW] = useState(pg.w), [h, setH] = useState(pg.h), [a, setA] = useState<[number, number]>([0.5, 0.5]);
  return (
    <Back label="Canvas size">
      <h3><Icon name="crop" size={16} /> Canvas size</h3>
      <div className="grid2">
        <Num label="Width" value={w} min={1} max={16000} unit="px" onChange={v => setW(Math.round(v))} />
        <Num label="Height" value={h} min={1} max={16000} unit="px" onChange={v => setH(Math.round(v))} />
      </div>
      <div className="field-label">Where the existing image sits on the new canvas</div>
      <div className="anchor-grid">
        {[0, 0.5, 1].map(y => [0, 0.5, 1].map(x => <button key={`${x}${y}`} className={a[0] === x && a[1] === y ? 'on' : ''} onClick={() => setA([x, y])} aria-label={`Anchor ${x},${y}`} />))}
      </div>
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); canvasSize(w, h, a[0], a[1]); }}>Resize</button></div>
    </Back>
  );
}

// ---------- curves ----------
type Pt = { x: number; y: number };
const CH = ['rgb', 'r', 'g', 'b'] as const;
const CH_LABEL = { rgb: 'Value', r: 'Red', g: 'Green', b: 'Blue' };
const CH_COLOUR = { rgb: '#ddd', r: '#ff5050', g: '#50d070', b: '#5090ff' };

export function CurvesModal() {
  const [pts, setPts] = useState<Record<(typeof CH)[number], Pt[]>>({ rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] });
  const [ch, setCh] = useState<(typeof CH)[number]>('rgb');
  const cv = useRef<HTMLCanvasElement>(null);
  const adj = useRef<Adjust | null>(null);
  const hist = useRef<ReturnType<typeof histogram> | null>(null);
  const drag = useRef<number | null>(null);
  const SZ = 256;

  useEffect(() => {
    const o = selected().find(x => x.type === 'raster');
    if (!o) { close(); return; }
    adj.current = new Adjust(o);
    hist.current = histogram(adj.current.before);
    return () => { adj.current?.cancel(); };
  }, []);

  const luts = (p = pts) => ({ rgb: curveLUT(p.rgb), r: curveLUT(p.r), g: curveLUT(p.g), b: curveLUT(p.b) });
  useEffect(() => {
    const h = setTimeout(() => adj.current?.preview('curves', {}, { curves: luts() }), 25);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts]);

  useEffect(() => {
    const c = cv.current!, x = c.getContext('2d')!;
    x.fillStyle = '#14110e'; x.fillRect(0, 0, SZ, SZ);
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo((SZ * i) / 4, 0); x.lineTo((SZ * i) / 4, SZ); x.moveTo(0, (SZ * i) / 4); x.lineTo(SZ, (SZ * i) / 4); x.stroke(); }
    const hh = hist.current;
    if (hh) {
      const arr = ch === 'rgb' ? hh.l : hh[ch];
      let mx = 1; for (let i = 1; i < 255; i++) mx = Math.max(mx, arr[i]);
      x.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 256; i++) x.fillRect(i, SZ - Math.min(SZ, (arr[i] / mx) * SZ), 1, SZ);
    }
    x.strokeStyle = CH_COLOUR[ch]; x.lineWidth = 2; x.beginPath();
    const lut = curveLUT(pts[ch]);
    lut.forEach((v, i) => (i ? x.lineTo(i, SZ - v) : x.moveTo(i, SZ - v)));
    x.stroke();
    for (const p of pts[ch]) { x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.beginPath(); x.arc(p.x, SZ - p.y, 5, 0, 7); x.fill(); x.stroke(); }
  });

  const at = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(255, Math.round(((e.clientX - r.left) / r.width) * SZ))), y: Math.max(0, Math.min(255, Math.round(255 - ((e.clientY - r.top) / r.height) * SZ))) }; };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = at(e), list = pts[ch];
    let i = list.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 10);
    if (i < 0) { const nl = [...list, p].sort((a, b) => a.x - b.x); i = nl.indexOf(p); setPts({ ...pts, [ch]: nl }); }
    drag.current = i;
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const p = at(e), list = [...pts[ch]], i = drag.current;
    const lo = i > 0 ? list[i - 1].x + 1 : 0, hi = i < list.length - 1 ? list[i + 1].x - 1 : 255;
    list[i] = { x: i === 0 ? 0 : i === list.length - 1 ? 255 : Math.max(lo, Math.min(hi, p.x)), y: p.y };
    setPts({ ...pts, [ch]: list });
  };
  const dbl = (e: React.MouseEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * SZ, py = 255 - ((e.clientY - r.top) / r.height) * SZ;
    const list = pts[ch], i = list.findIndex(q => Math.hypot(q.x - px, q.y - py) < 10);
    if (i > 0 && i < list.length - 1) setPts({ ...pts, [ch]: list.filter((_, j) => j !== i) });
  };
  const finish = (apply: boolean) => {
    if (adj.current) { if (apply) { adj.current.preview('curves', {}, { curves: luts() }); adj.current.apply('Curves'); } else adj.current.cancel(); adj.current = null; }
    close();
  };
  return (
    <div className="modal-back transparent" onPointerDown={e => e.target === e.currentTarget && finish(false)}>
      <div className="modal filter-modal" role="dialog" aria-label="Curves">
        <h3><Icon name="sliders" size={16} /> Curves</h3>
        <div className="seg wide">{CH.map(c => <button key={c} className={ch === c ? 'on' : ''} onClick={() => setCh(c)}>{CH_LABEL[c]}</button>)}</div>
        <canvas ref={cv} width={SZ} height={SZ} className="curve-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onDoubleClick={dbl} />
        <p className="muted small">Click the line to add a point, drag to bend it, double-click a point to remove it.</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => setPts({ ...pts, [ch]: [{ x: 0, y: 0 }, { x: 255, y: 255 }] })}>Reset channel</button>
          <span className="grow" />
          <button className="btn" onClick={() => finish(false)}>Cancel</button><button className="btn primary" onClick={() => finish(true)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
export { Select };
