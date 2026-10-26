import { useEffect, useRef, useState } from 'react';
import { S, T, commit, emit, useStore, useTime, page } from '../store';
import type { Clip, Media, Track } from '../model';
import { fmtTime } from '../geometry';
import { Icon } from './icons';
import { IconBtn } from './controls';
import { addMediaClip, addTitleClip, addTrack, deleteClip, splitClip, duration, findClip } from '../ops';
import { seek, togglePlay, pause } from '../playback';
import { mediaBlobs } from '../media';
import { Thumb } from './Panels';

const ROW = 46;
const HEAD = 132;

const peaks = new Map<string, Float32Array | 'loading'>();
function usePeaks(m: Media | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!m || m.kind === 'image' || peaks.has(m.id)) return;
    const blob = mediaBlobs.get(m.id);
    if (!blob) return;
    peaks.set(m.id, 'loading');
    (async () => {
      try {
        const ac = new OfflineAudioContext(1, 44100, 44100);
        const buf = await ac.decodeAudioData(await blob.arrayBuffer());
        const ch = buf.getChannelData(0);
        const n = Math.min(4000, Math.ceil(buf.duration * 50));
        const out = new Float32Array(n);
        const step = ch.length / n;
        for (let i = 0; i < n; i++) { let mx = 0; for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j += 8) mx = Math.max(mx, Math.abs(ch[j])); out[i] = mx; }
        peaks.set(m.id, out);
      } catch { peaks.set(m.id, new Float32Array(0)); }
      force(x => x + 1);
    })();
  }, [m]);
  const p = m ? peaks.get(m.id) : undefined;
  return p instanceof Float32Array ? p : null;
}

function Wave({ clip, m, px }: { clip: Clip; m: Media; px: number }) {
  const data = usePeaks(m);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || !data.length) return;
    const w = Math.max(1, Math.round(clip.dur * px)), h = 26;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(c).color;
    const perSec = data.length / m.duration;
    for (let x = 0; x < w; x++) {
      const t = clip.offset + (x / px) * clip.speed;
      const v = data[Math.min(data.length - 1, Math.floor(t * perSec))] || 0;
      const bh = Math.max(1, v * h);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [data, clip.dur, clip.offset, clip.speed, px, m.duration]);
  return <canvas ref={ref} className="wave" />;
}

export default function Timeline() {
  useStore(); useTime();
  const tl = S.doc.timeline;
  const px = S.ui.tlZoom;
  const dur = duration();
  const laneRef = useRef<HTMLDivElement>(null);
  const [snapOn, setSnap] = useState(true);
  const width = Math.max((dur + 8) * px, 800);
  const pg = page();
  const selObj = pg.objects.find(o => S.ui.sel.includes(o.id));

  const timeAt = (clientX: number) => {
    const r = laneRef.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + laneRef.current!.scrollLeft - HEAD) / px);
  };

  const snapT = (t: number, exclude?: Clip) => {
    if (!snapOn) return t;
    const th = 8 / px;
    const c = [0, T.time];
    for (const tr of tl.tracks) for (const x of tr.clips) if (x !== exclude) c.push(x.start, x.start + x.dur);
    let best = t, bd = th;
    for (const v of c) if (Math.abs(v - t) < bd) { bd = Math.abs(v - t); best = v; }
    return best;
  };

  const scrub = (e: React.PointerEvent) => {
    pause();
    seek(timeAt(e.clientX));
    const mv = (ev: PointerEvent) => seek(timeAt(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const clipDown = (e: React.PointerEvent, tr: Track, c: Clip) => {
    e.stopPropagation();
    S.ui.selClip = c.id; S.ui.sel = [];
    emit();
    if (tr.locked) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const local = e.clientX - r.left;
    const mode = local < 7 ? 'l' : local > r.width - 7 ? 'r' : 'm';
    const t0 = timeAt(e.clientX);
    const orig = { ...c };
    const md = c.mediaId ? S.doc.media.find(m => m.id === c.mediaId) : null;
    const maxLen = md && md.kind !== 'image' ? md.duration : Infinity;
    const lanesTop = laneRef.current!.getBoundingClientRect().top + 24 + (selObj ? ROW * 0.6 : 0) - laneRef.current!.scrollTop;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      const dt = timeAt(ev.clientX) - t0;
      if (mode === 'm') {
        let ns = Math.max(0, orig.start + dt);
        const s1 = snapT(ns, c), s2 = snapT(ns + c.dur, c) - c.dur;
        ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2;
        c.start = Math.max(0, ns);
        // move between tracks of the same kind
        const idx = Math.floor((ev.clientY - lanesTop) / ROW);
        const target = tl.tracks[idx];
        const cur = tl.tracks.find(t => t.clips.includes(c))!;
        if (target && target !== cur && target.kind === cur.kind && !target.locked) { cur.clips = cur.clips.filter(x => x !== c); target.clips.push(c); }
      } else if (mode === 'l') {
        let ns = snapT(orig.start + dt, c);
        ns = Math.min(ns, orig.start + orig.dur - 0.1);
        ns = Math.max(ns, orig.start - orig.offset / orig.speed, 0);
        c.start = ns; c.dur = orig.dur - (ns - orig.start); c.offset = orig.offset + (ns - orig.start) * orig.speed;
      } else {
        let ne = snapT(orig.start + orig.dur + dt, c);
        ne = Math.max(ne, orig.start + 0.1);
        ne = Math.min(ne, orig.start + (maxLen - orig.offset) / orig.speed);
        c.dur = ne - orig.start;
      }
      emit();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  // keyframes of the selected object, mapped into timeline time via the active scene clip
  const sceneClip = tl.tracks.flatMap(t => t.clips).find(c => c.kind === 'scene' && c.pageId === pg.id);
  const toGlobal = (lt: number) => sceneClip ? sceneClip.start + (lt - sceneClip.offset) / sceneClip.speed : lt;
  const toLocal = (gt: number) => sceneClip ? sceneClip.offset + (gt - sceneClip.start) * sceneClip.speed : gt;
  const keyTimes = selObj ? [...new Set(Object.values(selObj.keys || {}).flatMap(k => (k || []).map(x => Math.round(x.t * 1000) / 1000)))].sort((a, b) => a - b) : [];
  const animatedProps = selObj ? Object.entries(selObj.keys || {}).filter(([, k]) => k?.length).map(([p]) => p) : [];

  const keyDown = (e: React.PointerEvent, kt: number) => {
    e.stopPropagation();
    if (!selObj) return;
    seek(toGlobal(kt));
    const t0 = timeAt(e.clientX);
    const keys = Object.values(selObj.keys || {}).flatMap(k => (k || []).filter(x => Math.abs(x.t - kt) < 0.0006));
    let moved = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      const nt = Math.max(0, toLocal(snapT(toGlobal(kt) + timeAt(ev.clientX) - t0)));
      keys.forEach(k => (k.t = nt));
      Object.values(selObj.keys || {}).forEach(k => k?.sort((a, b) => a.t - b.t));
      emit();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const jumpKey = (dir: 1 | -1) => {
    const lt = toLocal(T.time);
    const k = dir > 0 ? keyTimes.find(t => t > lt + 0.001) : [...keyTimes].reverse().find(t => t < lt - 0.001);
    if (k !== undefined) seek(toGlobal(k));
  };

  // ruler ticks
  const tickStep = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find(s => s * px >= 70) || 60;
  const ticks: number[] = [];
  for (let t = 0; t <= width / px; t += tickStep) ticks.push(t);

  const selClip = findClip(S.ui.selClip);
  const fps = tl.fps;

  return (
    <div className="timeline">
      <div className="tl-bar">
        <div className="tl-transport">
          <IconBtn icon="prev" title="Go to start (Home)" onClick={() => seek(0)} />
          <IconBtn icon="stepb" title="Previous frame (←)" onClick={() => seek(T.time - 1 / fps)} />
          <button className={`play-btn ${T.playing ? 'on' : ''}`} onClick={togglePlay} title="Play / pause (Space)" aria-label={T.playing ? 'Pause' : 'Play'}>
            <Icon name={T.playing ? 'pause' : 'play'} size={16} fill />
          </button>
          <IconBtn icon="stepf" title="Next frame (→)" onClick={() => seek(T.time + 1 / fps)} />
          <IconBtn icon="next" title="Go to end (End)" onClick={() => seek(dur)} />
          <span className="timecode">{fmtTime(T.time, fps)} <span className="muted">/ {fmtTime(dur, fps)}</span></span>
        </div>
        <div className="tl-tools">
          <IconBtn icon="scissors" title="Split at playhead (S)" onClick={() => splitClip()} />
          <IconBtn icon="trash" title="Delete clip (Del)" disabled={!selClip} onClick={() => deleteClip()} />
          <button className="btn small ghost" disabled={!selClip} onClick={() => deleteClip(S.ui.selClip, true)} title="Delete and close the gap">Ripple delete</button>
          <span className="sep" />
          <button className="btn small ghost" onClick={() => addTitleClip()}><Icon name="type" size={13} /> Title</button>
          <button className="btn small ghost" onClick={() => addTrack('video')}><Icon name="plus" size={13} /> Video track</button>
          <button className="btn small ghost" onClick={() => addTrack('audio')}><Icon name="plus" size={13} /> Audio track</button>
          <span className="sep" />
          <IconBtn icon="magnet" title="Snapping" active={snapOn} onClick={() => setSnap(!snapOn)} />
          <IconBtn icon="loop" title="Loop playback" active={tl.loop} onClick={() => { tl.loop = !tl.loop; commit(); }} />
          <button className={`btn small ghost autokey ${S.ui.autoKey ? 'on' : ''}`} onClick={() => { S.ui.autoKey = !S.ui.autoKey; emit(); }} title="When on, moving or changing objects creates keyframes">
            <Icon name="key" size={12} fill={S.ui.autoKey} /> Auto-key
          </button>
          <span className="sep" />
          <Icon name="zoom" size={14} className="muted" />
          <input type="range" className="tl-zoom" min={10} max={400} value={px} onChange={e => { S.ui.tlZoom = +e.target.value; emit(); }} aria-label="Timeline zoom" />
        </div>
      </div>
      <div className="tl-body" ref={laneRef}>
        <div className="tl-inner" style={{ width: width + HEAD }}>
          <div className="tl-ruler" onPointerDown={scrub}>
            <div className="tl-corner" />
            {ticks.map(t => (
              <div key={t} className="tick" style={{ left: HEAD + t * px }}><span>{tickStep < 1 ? t.toFixed(2).replace(/0$/, '') : fmtTime(t, fps).slice(0, 5)}</span></div>
            ))}
          </div>
          {selObj && (
            <div className="tl-row keys" style={{ height: ROW * 0.6 }}>
              <div className="tl-head">
                <Icon name="key" size={12} />
                <span className="name" title={selObj.name}>{selObj.name}</span>
                <IconBtn icon="stepb" title="Previous keyframe" size={12} onClick={() => jumpKey(-1)} />
                <IconBtn icon="stepf" title="Next keyframe" size={12} onClick={() => jumpKey(1)} />
              </div>
              <div className="tl-lane" onPointerDown={scrub}>
                {sceneClip && <div className="key-range" style={{ left: sceneClip.start * px, width: sceneClip.dur * px }} />}
                {keyTimes.map(k => (
                  <div key={k} className={`kf ${Math.abs(toGlobal(k) - T.time) < 1 / fps ? 'now' : ''}`} style={{ left: toGlobal(k) * px }} onPointerDown={e => keyDown(e, k)}
                    title={`${animatedProps.join(', ')} @ ${k.toFixed(2)}s · drag to retime`} />
                ))}
                {!keyTimes.length && <span className="lane-hint">No keyframes yet. With auto-key on, move this object to create some.</span>}
              </div>
            </div>
          )}
          {tl.tracks.map(tr => (
            <div key={tr.id} className={`tl-row ${tr.kind}`} style={{ height: ROW }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData('text/media'); const m = S.doc.media.find(x => x.id === id); if (m) addMediaClip(m, snapT(timeAt(e.clientX)), tr.id); }}>
              <div className="tl-head">
                <Icon name={tr.kind === 'video' ? 'film' : 'music'} size={13} />
                <input className="track-name" value={tr.name} onChange={e => { tr.name = e.target.value; emit(); }} onBlur={commit} onKeyDown={e => e.stopPropagation()} aria-label="Track name" />
                {tr.kind === 'video' && <IconBtn icon={tr.hidden ? 'eyeoff' : 'eye'} title={tr.hidden ? 'Show track' : 'Hide track'} size={12} className={tr.hidden ? 'dim' : ''} onClick={() => { tr.hidden = !tr.hidden; commit(); }} />}
                <IconBtn icon={tr.muted ? 'minus' : 'wave'} title={tr.muted ? 'Unmute' : 'Mute'} size={12} active={tr.muted} onClick={() => { tr.muted = !tr.muted; commit(); }} />
                <IconBtn icon={tr.locked ? 'lock' : 'unlock'} title={tr.locked ? 'Unlock track' : 'Lock track'} size={12} className={tr.locked ? '' : 'dim'} onClick={() => { tr.locked = !tr.locked; commit(); }} />
                <IconBtn icon="x" title="Remove track" size={12} className="dim rm" onClick={() => { if (tr.clips.length && !confirm('Remove this track and its clips?')) return; tl.tracks = tl.tracks.filter(x => x !== tr); commit(); }} />
              </div>
              <div className="tl-lane" onPointerDown={e => { S.ui.selClip = null; emit(); scrub(e); }}>
                {tr.clips.map(c => {
                  const md = c.mediaId ? S.doc.media.find(m => m.id === c.mediaId) : undefined;
                  const scenePg = c.kind === 'scene' ? S.doc.pages.find(p => p.id === c.pageId) : undefined;
                  return (
                    <div key={c.id} className={`clip k-${c.kind} ${md?.kind || ''} ${S.ui.selClip === c.id ? 'sel' : ''}`}
                      style={{ left: c.start * px, width: Math.max(4, c.dur * px) }}
                      onPointerDown={e => clipDown(e, tr, c)} title={`${c.name} · ${c.dur.toFixed(2)}s`}>
                      {c.fadeIn > 0 && <div className="fade in" style={{ width: c.fadeIn * px }} />}
                      {c.fadeOut > 0 && <div className="fade out" style={{ width: c.fadeOut * px }} />}
                      <div className="clip-label">
                        {scenePg && <span className="clip-thumb"><Thumb pg={scenePg} w={36} /></span>}
                        <Icon name={c.kind === 'scene' ? 'pen' : c.kind === 'title' ? 'type' : md?.kind === 'audio' ? 'music' : md?.kind === 'image' ? 'image' : 'film'} size={11} />
                        <span>{c.name}</span>{c.speed !== 1 && <span className="badge">{c.speed}×</span>}
                      </div>
                      {md && md.kind !== 'image' && <Wave clip={c} m={md} px={px} />}
                      <div className="trim l" /><div className="trim r" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="playhead" style={{ left: HEAD + T.time * px }}><div className="ph-cap" onPointerDown={scrub} /></div>
        </div>
      </div>
    </div>
  );
}
