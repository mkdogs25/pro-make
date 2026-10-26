import { useEffect, useRef, useState } from 'react';
import { S, T, emit, useStore, useTime } from '../store';
import { Icon } from './icons';
import { Select } from './controls';
import { defaultVideoOpts, exportVideo, type VideoOpts } from '../io';
import { placeMedia } from '../motion';
import { fmtTime } from '../geometry';
import { renderFrame } from '../render';
import { imageFor } from '../raster';

const close = () => { S.ui.modal = null; emit(); };
const Back = ({ children, label, wide }: { children: React.ReactNode; label: string; wide?: boolean }) => (
  <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
    <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={label}>{children}</div>
  </div>
);

export function ExportOptsModal() {
  const tl = S.doc.timeline;
  const [o, setO] = useState<VideoOpts>({ ...defaultVideoOpts, fps: tl.fps });
  const set = <K extends keyof VideoOpts>(k: K, v: VideoOpts[K]) => setO({ ...o, [k]: v });
  const hasRange = tl.inPoint != null || tl.outPoint != null;
  const sec = ((o.range === 'inout' ? (tl.outPoint ?? 0) - (tl.inPoint ?? 0) : 0));
  void sec;
  return (
    <Back label="Export video">
      <h3><Icon name="film" size={16} /> Export</h3>
      <div className="row"><span className="row-label">Format</span>
        <Select value={o.format} options={[{ value: 'video', label: 'Video (WebM / MP4, with sound)' }, { value: 'gif', label: 'Animated GIF' }, { value: 'png', label: 'PNG image sequence (.zip)' }, { value: 'audio', label: 'Audio only' }]} onChange={v => set('format', v)} /></div>
      {o.format !== 'audio' && o.format !== 'gif' && (
        <div className="row"><span className="row-label">Size</span>
          <Select value={String(o.scale)} options={[{ value: '0.25', label: `25% · ${Math.round(tl.w * 0.25)}×${Math.round(tl.h * 0.25)}` }, { value: '0.5', label: `50% · ${Math.round(tl.w * 0.5)}×${Math.round(tl.h * 0.5)}` }, { value: '0.75', label: `75% · ${Math.round(tl.w * 0.75)}×${Math.round(tl.h * 0.75)}` }, { value: '1', label: `Full · ${tl.w}×${tl.h}` }, { value: '1.5', label: `150% · ${Math.round(tl.w * 1.5)}×${Math.round(tl.h * 1.5)}` }]} onChange={v => set('scale', +v)} /></div>
      )}
      {o.format === 'gif' && (
        <div className="row"><span className="row-label">Width</span>
          <Select value={String(o.gifWidth)} options={[{ value: '240', label: '240 px (small)' }, { value: '360', label: '360 px' }, { value: '480', label: '480 px' }, { value: '640', label: '640 px' }, { value: '800', label: '800 px (large file)' }]} onChange={v => set('gifWidth', +v)} /></div>
      )}
      {o.format !== 'audio' && (
        <div className="row"><span className="row-label">Frame rate</span>
          <Select value={String(o.fps)} options={(o.format === 'gif' ? [8, 10, 12, 15, 20] : [12, 15, 24, 25, 30, 50, 60]).map(v => ({ value: String(v), label: `${v} fps` }))} onChange={v => set('fps', +v)} /></div>
      )}
      {o.format === 'video' && (
        <div className="row"><span className="row-label">Quality</span>
          <Select value={String(o.mbps)} options={[{ value: '2', label: '2 Mbps (small)' }, { value: '4', label: '4 Mbps' }, { value: '8', label: '8 Mbps (good)' }, { value: '16', label: '16 Mbps (high)' }, { value: '30', label: '30 Mbps (near lossless)' }]} onChange={v => set('mbps', +v)} /></div>
      )}
      <div className="row"><span className="row-label">Range</span>
        <Select value={o.range} options={[{ value: 'all', label: 'Whole timeline' }, { value: 'inout', label: hasRange ? `In/out: ${fmtTime(tl.inPoint ?? 0, tl.fps).slice(0, 5)} – ${tl.outPoint != null ? fmtTime(tl.outPoint, tl.fps).slice(0, 5) : 'end'}` : 'In/out points (none set yet)' }]} onChange={v => set('range', v)} /></div>
      {(o.format === 'video' || o.format === 'audio') && <p className="muted small">Video and audio render in real time so sound stays in sync. Keep this tab visible while it runs. GIF and PNG frames render offline, frame by frame.</p>}
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => exportVideo(o)}>Export</button></div>
    </Back>
  );
}

export function SourceModal({ id }: { id: string }) {
  const m = S.doc.media.find(x => x.id === id);
  const ref = useRef<HTMLVideoElement>(null);
  const [mark, setMark] = useState<{ in: number | null; out: number | null }>({ in: null, out: null });
  const [cur, setCur] = useState(0);
  useEffect(() => { if (!m) close(); }, [m]);
  if (!m) return null;
  const range = () => ({ in: mark.in ?? 0, out: mark.out ?? m.duration });
  const ok = (mark.in ?? 0) < (mark.out ?? m.duration);
  return (
    <Back label="Source player" wide>
      <h3><Icon name="film" size={16} /> {m.name}</h3>
      {m.kind === 'image' ? <img src={imageFor(m.url).src} alt="" className="source-view" />
        : m.kind === 'video' ? <video ref={ref} className="source-view" src={m.url} controls onTimeUpdate={e => setCur((e.target as HTMLVideoElement).currentTime)} />
          : <audio ref={ref as unknown as React.RefObject<HTMLAudioElement>} className="source-audio" src={m.url} controls onTimeUpdate={e => setCur((e.target as HTMLAudioElement).currentTime)} />}
      {m.kind !== 'image' && (
        <div className="row">
          <button className="btn small" onClick={() => setMark({ ...mark, in: cur })}>Mark in</button>
          <button className="btn small" onClick={() => setMark({ ...mark, out: cur })}>Mark out</button>
          <button className="btn small ghost" onClick={() => setMark({ in: null, out: null })}>Clear</button>
          <span className="grow" />
          <span className="muted small">{fmtTime(mark.in ?? 0, 30).slice(0, 8)} → {fmtTime(mark.out ?? m.duration, 30).slice(0, 8)} · {Math.max(0, (mark.out ?? m.duration) - (mark.in ?? 0)).toFixed(2)} s</span>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn" disabled={!ok} onClick={() => { placeMedia(m, 'append', range()); close(); }}>Append</button>
        <button className="btn" disabled={!ok} onClick={() => { placeMedia(m, 'insert', range()); close(); }}>Insert at playhead</button>
        <button className="btn" disabled={!ok} onClick={() => { placeMedia(m, 'overwrite', range()); close(); }}>Overwrite at playhead</button>
        <span className="grow" />
        <button className="btn primary" onClick={close}>Done</button>
      </div>
    </Back>
  );
}

/** Histogram and luma waveform of the frame under the playhead. */
export function ScopesPanel() {
  useStore(); useTime();
  const hist = useRef<HTMLCanvasElement>(null), wave = useRef<HTMLCanvasElement>(null);
  const tl = S.doc.timeline;
  useEffect(() => {
    const W = 256, H = Math.max(36, Math.round((256 * tl.h) / tl.w));
    const f = document.createElement('canvas'); f.width = W; f.height = H;
    const fc = f.getContext('2d', { willReadFrequently: true })!;
    fc.save(); fc.scale(W / tl.w, W / tl.w); renderFrame(fc, S.doc, T.time); fc.restore();
    const d = fc.getImageData(0, 0, W, H).data;
    const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
    const hc = hist.current!.getContext('2d')!, wc = wave.current!.getContext('2d')!;
    wc.fillStyle = '#0d0c0a'; wc.fillRect(0, 0, 256, 128);
    wc.fillStyle = 'rgba(120,255,160,.22)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      wc.fillRect(x, 127 - (l / 255) * 127, 1, 1);
    }
    hc.fillStyle = '#0d0c0a'; hc.fillRect(0, 0, 256, 100);
    const mx = Math.max(1, ...Array.from(r).slice(1, 255), ...Array.from(g).slice(1, 255), ...Array.from(b).slice(1, 255));
    hc.globalCompositeOperation = 'lighter';
    for (const [arr, col] of [[r, '#ff4040'], [g, '#40ff60'], [b, '#4080ff']] as const) {
      hc.fillStyle = col; hc.globalAlpha = 0.55;
      for (let x = 0; x < 256; x++) { const h2 = Math.min(100, (arr[x] / mx) * 100); hc.fillRect(x, 100 - h2, 1, h2); }
    }
    hc.globalAlpha = 1; hc.globalCompositeOperation = 'source-over';
  });
  return (
    <div className="panel-scroll">
      <div className="pad"><div className="field-label">Histogram (R, G, B)</div><canvas ref={hist} width={256} height={100} className="scope" /></div>
      <div className="pad"><div className="field-label">Waveform (brightness across the frame)</div><canvas ref={wave} width={256} height={128} className="scope" /></div>
      <p className="muted small pad">Scopes show the composited frame under the playhead and update as you scrub or play.</p>
    </div>
  );
}
