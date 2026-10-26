import { useEffect, useRef, useState } from 'react';
import { S, T, commit, emit, useStore, useTime, page } from '../store';
import type { Clip, Media, Track } from '../model';
import { fmtTime } from '../geometry';
import { Icon } from './icons';
import { IconBtn, Menu } from './controls';
import { addMediaClip, addTitleClip, addTrack, deleteClip, splitClip, duration, findClip } from '../ops';
import { addGenerator, addMarker, clearRange, copyClip, detachAudio, duplicateClip, fitTimeline, freezeFrame, overlapPrev, pasteClip, setInPoint, setOutPoint, setOverlap } from '../motion';
import { seek, togglePlay, pause, play } from '../playback';
import { mediaBlobs } from '../media';
import { Thumb } from './Panels';
import { meter } from '../audio';

const ROW = 46, TALL = 88;
const HEAD = 148;
const rowH = (t: Track) => (t.tall ? TALL : ROW);

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

function Wave({ clip, m, px, h }: { clip: Clip; m: Media; px: number; h: number }) {
  const data = usePeaks(m);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || !data.length) return;
    const w = Math.max(1, Math.round(clip.dur * px)), hh = Math.max(20, h - 22);
    c.width = w; c.height = hh;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(c).color;
    const perSec = data.length / m.duration;
    for (let x = 0; x < w; x++) {
      const t = clip.offset + (x / px) * clip.speed;
      const v = data[Math.min(data.length - 1, Math.floor(t * perSec))] || 0;
      const bh = Math.max(1, v * hh);
      ctx.fillRect(x, (hh - bh) / 2, 1, bh);
    }
  }, [data, clip.dur, clip.offset, clip.speed, px, m.duration, h]);
  return <canvas ref={ref} className="wave" />;
}

export function Meter() {
  useTime();
  const { l, r } = T.playing ? meter() : { l: 0, r: 0 };
  const db = (v: number) => Math.max(0, Math.min(1, (20 * Math.log10(v || 1e-4) + 54) / 54));
  return (
    <span className="vu" title="Master level" aria-label="Master level meter">
      <i style={{ width: `${db(l) * 100}%` }} className={db(l) > 0.92 ? 'hot' : ''} />
      <i style={{ width: `${db(r) * 100}%` }} className={db(r) > 0.92 ? 'hot' : ''} />
    </span>
  );
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
  const fps = tl.fps;

  useEffect(() => {
    const el = laneRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      S.ui.tlZoom = Math.max(10, Math.min(400, S.ui.tlZoom * Math.exp(-e.deltaY * 0.002)));
      emit();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number) => {
    const r = laneRef.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + laneRef.current!.scrollLeft - HEAD) / px);
  };

  const snapT = (t: number, exclude?: Clip) => {
    if (!snapOn) return t;
    const th = 8 / px;
    const c = [0, T.time, ...(tl.markers || []).map(m => m.t)];
    if (tl.inPoint != null) c.push(tl.inPoint);
    if (tl.outPoint != null) c.push(tl.outPoint);
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

  const trackAtY = (clientY: number): Track | null => {
    for (const el of laneRef.current!.querySelectorAll<HTMLElement>('[data-track]')) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return tl.tracks.find(t => t.id === el.dataset.track) || null;
    }
    return null;
  };

  const clipDown = (e: React.PointerEvent, tr: Track, c: Clip) => {
    e.stopPropagation();
    S.ui.selClip = c.id; S.ui.sel = []; S.ui.selTrack = null;
    emit();
    if (tr.locked) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const local = e.clientX - r.left;
    const mode = local < 7 ? 'l' : local > r.width - 7 ? 'r' : 'm';
    const t0 = timeAt(e.clientX);
    const orig = { ...c };
    const md = c.mediaId ? S.doc.media.find(m => m.id === c.mediaId) : null;
    const maxLen = md && md.kind !== 'image' && !c.freeze ? md.duration : Infinity;
    const later = tr.clips.filter(x => x !== c && x.start >= orig.start + orig.dur - 1e-6).map(x => ({ x, s: x.start }));
    let moved = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      const dt = timeAt(ev.clientX) - t0;
      if (mode === 'm') {
        let ns = Math.max(0, orig.start + dt);
        const s1 = snapT(ns, c), s2 = snapT(ns + c.dur, c) - c.dur;
        ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2;
        c.start = Math.max(0, ns);
        const target = trackAtY(ev.clientY);
        const cur = tl.tracks.find(t => t.clips.includes(c))!;
        if (target && target !== cur && target.kind === cur.kind && !target.locked) { cur.clips = cur.clips.filter(x => x !== c); target.clips.push(c); }
      } else if (mode === 'l') {
        let ns = snapT(orig.start + dt, c);
        ns = Math.min(ns, orig.start + orig.dur - 0.1);
        ns = Math.max(ns, orig.start - (c.freeze ? 1e9 : orig.offset / orig.speed), 0);
        c.start = ns; c.dur = orig.dur - (ns - orig.start);
        if (!c.freeze) c.offset = orig.offset + (ns - orig.start) * orig.speed;
      } else {
        let ne = snapT(orig.start + orig.dur + dt, c);
        ne = Math.max(ne, orig.start + 0.1);
        ne = Math.min(ne, orig.start + (maxLen - orig.offset) / orig.speed);
        c.dur = ne - orig.start;
        if (S.ui.ripple) later.forEach(l => (l.x.start = l.s + (c.dur - orig.dur)));
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

  const tickStep = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find(s => s * px >= 70) || 60;
  const ticks: number[] = [];
  for (let t = 0; t <= width / px; t += tickStep) ticks.push(t);
  const selClip = findClip(S.ui.selClip);
  const range = tl.inPoint != null || tl.outPoint != null;
  const rIn = tl.inPoint ?? 0, rOut = tl.outPoint ?? dur;

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
          <Meter />
        </div>
        <div className="tl-tools">
          <Menu label="Clip" icon="scissors" items={[
            { label: 'Split at playhead', icon: 'scissors', kbd: 'S', onClick: () => splitClip() },
            { label: 'Duplicate', icon: 'copy', kbd: 'Ctrl+D', onClick: duplicateClip, disabled: !selClip },
            { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', onClick: () => { copyClip(); }, disabled: !selClip },
            { label: 'Paste at playhead', icon: 'download', kbd: 'Ctrl+V', onClick: pasteClip },
            'sep',
            { label: 'Detach audio', icon: 'music', onClick: detachAudio, disabled: !selClip },
            { label: 'Freeze frame (2 s)', icon: 'image', onClick: () => freezeFrame(2), disabled: !selClip },
            { label: 'Overlap previous clip by 1 s (transition)', icon: 'film', onClick: () => selClip && setOverlap(selClip.clip, 1), disabled: !selClip },
            'sep',
            { label: 'Delete', icon: 'trash', kbd: 'Del', onClick: () => deleteClip(), disabled: !selClip },
            { label: 'Ripple delete (close the gap)', icon: 'trash', onClick: () => deleteClip(S.ui.selClip, true), disabled: !selClip },
          ]} />
          <Menu label="Add" icon="plus" items={[
            { label: 'Title', icon: 'type', onClick: () => addTitleClip() },
            { label: 'Colour clip', icon: 'rect', onClick: () => addGenerator('color') },
            { label: 'Colour bars', icon: 'grid', onClick: () => addGenerator('bars') },
            { label: 'Countdown', icon: 'stop', onClick: () => addGenerator('countdown') },
            'sep',
            { label: 'Video track', icon: 'film', onClick: () => addTrack('video') },
            { label: 'Audio track', icon: 'music', onClick: () => addTrack('audio') },
          ]} />
          <span className="sep" />
          <IconBtn icon="flag" title="Add marker at playhead (M)" onClick={() => addMarker()} />
          <button className="btn small ghost" title="Set in point (I)" onClick={() => setInPoint()}>In</button>
          <button className="btn small ghost" title="Set out point (O)" onClick={() => setOutPoint()}>Out</button>
          {range && <IconBtn icon="play" title="Play the in/out range" size={13} onClick={() => play({ from: rIn, until: rOut })} />}
          {range && <IconBtn icon="x" title="Clear in/out points" size={13} onClick={clearRange} />}
          <span className="sep" />
          <IconBtn icon="magnet" title="Snapping" active={snapOn} onClick={() => setSnap(!snapOn)} />
          <button className={`btn small ghost ${S.ui.ripple ? 'on' : ''}`} onClick={() => { S.ui.ripple = !S.ui.ripple; emit(); }} title="Ripple: trimming a clip's end moves everything after it">Ripple</button>
          <IconBtn icon="loop" title="Loop playback" active={tl.loop} onClick={() => { tl.loop = !tl.loop; commit(); }} />
          <button className={`btn small ghost autokey ${S.ui.autoKey ? 'on' : ''}`} onClick={() => { S.ui.autoKey = !S.ui.autoKey; emit(); }} title="When on, moving or changing objects creates keyframes">
            <Icon name="key" size={12} fill={S.ui.autoKey} /> Auto-key
          </button>
          <span className="sep" />
          <IconBtn icon="zoom" title="Fit the timeline to the window ( \ )" size={14} onClick={() => { fitTimeline(laneRef.current?.clientWidth || 900); emit(); }} />
          <input type="range" className="tl-zoom" min={10} max={400} value={px} onChange={e => { S.ui.tlZoom = +e.target.value; emit(); }} aria-label="Timeline zoom" />
        </div>
      </div>
      <div className="tl-body" ref={laneRef}>
        <div className="tl-inner" style={{ width: width + HEAD }}>
          <div className="tl-ruler" onPointerDown={scrub}>
            <div className="tl-corner" />
            {range && <div className="range-band" style={{ left: HEAD + rIn * px, width: Math.max(2, (rOut - rIn) * px) }} />}
            {ticks.map(t => (
              <div key={t} className="tick" style={{ left: HEAD + t * px }}><span>{tickStep < 1 ? t.toFixed(2).replace(/0$/, '') : fmtTime(t, fps).slice(0, 5)}</span></div>
            ))}
            {(tl.markers || []).map(m => (
              <div key={m.id} className="marker" style={{ left: HEAD + m.t * px, ['--mc' as string]: m.color }} title={`${m.label} · double-click to rename, Alt-click to delete`}
                onPointerDown={e => { e.stopPropagation(); if (e.altKey) { tl.markers = tl.markers!.filter(x => x !== m); commit(); } else { pause(); seek(m.t); } }}
                onDoubleClick={() => { const n = prompt('Marker name', m.label); if (n !== null) { m.label = n; commit(); } }}>
                <span>{m.label}</span>
              </div>
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
          {tl.tracks.map(tr => {
            const h = rowH(tr);
            const solo = tl.tracks.some(x => x.solo);
            return (
              <div key={tr.id} data-track={tr.id} className={`tl-row ${tr.kind} ${S.ui.selTrack === tr.id ? 'selrow' : ''}`} style={{ height: h }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { const id = e.dataTransfer.getData('text/media'); const m = S.doc.media.find(x => x.id === id); if (m) addMediaClip(m, snapT(timeAt(e.clientX)), tr.id); }}>
                <div className="tl-head" onPointerDown={() => { S.ui.selTrack = tr.id; S.ui.selClip = null; S.ui.sel = []; S.ui.sideTab = 'props'; emit(); }}>
                  <Icon name={tr.kind === 'video' ? 'film' : 'music'} size={13} />
                  <input className="track-name" value={tr.name} onChange={e => { tr.name = e.target.value; emit(); }} onBlur={commit} onKeyDown={e => e.stopPropagation()} aria-label="Track name" />
                  {tr.kind === 'video' && <IconBtn icon={tr.hidden ? 'eyeoff' : 'eye'} title={tr.hidden ? 'Show track' : 'Hide track'} size={12} className={tr.hidden ? 'dim' : ''} onClick={() => { tr.hidden = !tr.hidden; commit(); }} />}
                  <IconBtn icon={tr.muted ? 'minus' : 'wave'} title={tr.muted ? 'Unmute' : 'Mute'} size={12} active={tr.muted} onClick={() => { tr.muted = !tr.muted; commit(); }} />
                  <button className={`solo-btn ${tr.solo ? 'on' : ''}`} title="Solo: only soloed tracks are heard" onClick={e => { e.stopPropagation(); tr.solo = !tr.solo; commit(); }} aria-pressed={!!tr.solo}>S</button>
                  <IconBtn icon={tr.locked ? 'lock' : 'unlock'} title={tr.locked ? 'Unlock track' : 'Lock track'} size={12} className={tr.locked ? '' : 'dim rm'} onClick={() => { tr.locked = !tr.locked; commit(); }} />
                </div>
                <div className={`tl-lane ${solo && !tr.solo && tr.kind === 'audio' ? 'dimmed' : ''}`} onPointerDown={e => { S.ui.selClip = null; emit(); scrub(e); }}>
                  {range && <div className="range-lane" style={{ left: rIn * px, width: (rOut - rIn) * px }} />}
                  {tr.clips.map(c => {
                    const md = c.mediaId ? S.doc.media.find(m => m.id === c.mediaId) : undefined;
                    const scenePg = c.kind === 'scene' ? S.doc.pages.find(p => p.id === c.pageId) : undefined;
                    const ov = tr.kind === 'video' ? overlapPrev(c) : 0;
                    const keyTs = [...new Set(Object.values(c.keys || {}).flatMap(k => (k || []).map(x => x.t)))];
                    return (
                      <div key={c.id} className={`clip k-${c.kind} ${md?.kind || ''} ${S.ui.selClip === c.id ? 'sel' : ''} ${tr.locked ? 'locked' : ''}`}
                        style={{ left: c.start * px, width: Math.max(4, c.dur * px) }}
                        onPointerDown={e => clipDown(e, tr, c)} title={`${c.name} · ${c.dur.toFixed(2)}s${c.speed !== 1 ? ` · ${c.speed}×` : ''}`}>
                        {c.fadeIn > 0 && <div className="fade in" style={{ width: c.fadeIn * px }} />}
                        {c.fadeOut > 0 && <div className="fade out" style={{ width: c.fadeOut * px }} />}
                        {ov > 0 && <div className="overlap" style={{ width: ov * px }} title={`Transition: ${c.trans || 'dissolve'}`}><span>{c.trans || 'dissolve'}</span></div>}
                        <div className="clip-label">
                          {scenePg && h > 60 && <span className="clip-thumb"><Thumb pg={scenePg} w={36} /></span>}
                          <Icon name={c.kind === 'scene' ? 'pen' : c.kind === 'title' ? 'type' : c.kind === 'media' ? (md?.kind === 'audio' ? 'music' : md?.kind === 'image' ? 'image' : 'film') : 'rect'} size={11} />
                          <span>{c.name}</span>{c.speed !== 1 && <span className="badge">{c.speed}×</span>}{c.freeze && <span className="badge">❄</span>}
                        </div>
                        {md && md.kind !== 'image' && !c.freeze && <Wave clip={c} m={md} px={px} h={h - 8} />}
                        {keyTs.map(k => <i key={k} className="ckey" style={{ left: k * px }} onPointerDown={e => { e.stopPropagation(); S.ui.selClip = c.id; seek(c.start + k); emit(); }} title="Keyframe" />)}
                        <div className="trim l" /><div className="trim r" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {range && <div className="range-shade" style={{ left: HEAD, width: rIn * px }} />}
          <div className="playhead" style={{ left: HEAD + T.time * px }}><div className="ph-cap" onPointerDown={scrub} /></div>
        </div>
      </div>
    </div>
  );
}
