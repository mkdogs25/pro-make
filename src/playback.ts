import { S, T, emitTime, setTime } from './store';
import { clipActive, clipAlpha, timelineDuration } from './render';
import { allMediaEls, mediaEl } from './media';
import type { Clip, Doc } from './model';

let raf = 0;
let wallStart = 0, timeStart = 0;
let stopAt: number | null = null;
let onFrame: ((t: number) => void) | null = null;
let onEnd: (() => void) | null = null;

export function play(opts?: { from?: number; until?: number; frame?: (t: number) => void; end?: () => void }) {
  if (opts?.from !== undefined) T.time = opts.from;
  stopAt = opts?.until ?? null;
  onFrame = opts?.frame || null;
  onEnd = opts?.end || null;
  const dur = timelineDuration(S.doc);
  if (T.time >= dur - 0.01) T.time = 0;
  T.playing = true;
  wallStart = performance.now(); timeStart = T.time;
  emitTime();
  cancelAnimationFrame(raf);
  const step = () => {
    if (!T.playing) return;
    let t = timeStart + (performance.now() - wallStart) / 1000;
    const end = stopAt ?? timelineDuration(S.doc);
    if (t >= end) {
      if (stopAt === null && S.doc.timeline.loop) { wallStart = performance.now(); timeStart = 0; t = 0; pauseMedia(); }
      else { T.time = end; pause(); onEnd?.(); return; }
    }
    T.time = t;
    syncMedia(S.doc, t, true);
    onFrame?.(t);
    emitTime();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function pause() {
  T.playing = false;
  cancelAnimationFrame(raf);
  pauseMedia();
  emitTime();
}

export const togglePlay = () => (T.playing ? pause() : play());

export function seek(t: number) {
  const playing = T.playing;
  if (playing) pause();
  setTime(Math.max(0, t));
  syncMedia(S.doc, T.time, false);
  if (playing) play();
}

function pauseMedia() { for (const [, e] of allMediaEls()) if (!e.paused) e.pause(); }

export function syncMedia(doc: Doc, t: number, playing: boolean) {
  const used = new Set<string>();
  for (const tr of doc.timeline.tracks) {
    for (const c of tr.clips) {
      if (c.kind !== 'media' || !clipActive(c, t)) continue;
      const m = doc.media.find(x => x.id === c.mediaId);
      if (!m || m.kind === 'image') continue;
      const e = mediaEl(m);
      used.add(m.id);
      const want = c.offset + (t - c.start) * c.speed;
      e.muted = tr.muted || (tr.kind === 'video' && tr.hidden);
      e.volume = Math.max(0, Math.min(1, c.volume * (tr.kind === 'audio' ? fadeGain(c, t) : clipAlpha(c, t) / (c.opacity || 1))));
      if (playing) {
        e.playbackRate = c.speed;
        if (Math.abs(e.currentTime - want) > 0.25) e.currentTime = want;
        if (e.paused) e.play().catch(() => {});
      } else {
        if (!e.paused) e.pause();
        if (Math.abs(e.currentTime - want) > 0.02) e.currentTime = want;
      }
    }
  }
  for (const [id, e] of allMediaEls()) if (!used.has(id) && !e.paused) e.pause();
}

function fadeGain(c: Clip, t: number) {
  const lt = t - c.start;
  let g = 1;
  if (c.fadeIn > 0 && lt < c.fadeIn) g *= lt / c.fadeIn;
  if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) g *= Math.max(0, (c.dur - lt) / c.fadeOut);
  return g;
}

// Route media audio through Web Audio so it can be recorded on export.
let actx: AudioContext | null = null;
let dest: MediaStreamAudioDestinationNode | null = null;
const routed = new WeakSet<HTMLMediaElement>();
export function audioStream(): MediaStream | null {
  try {
    actx = actx || new AudioContext();
    dest = dest || actx.createMediaStreamDestination();
    for (const m of S.doc.media) {
      if (m.kind === 'image') continue;
      const e = mediaEl(m);
      if (routed.has(e)) continue;
      const src = actx.createMediaElementSource(e);
      src.connect(dest); src.connect(actx.destination);
      routed.add(e);
    }
    actx.resume();
    return dest.stream;
  } catch { return null; }
}
