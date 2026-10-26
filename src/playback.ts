import { S, T, emitTime, setTime } from './store';
import { clipActive, clipLocalTime, timelineDuration } from './render';
import { exportStream, resumeAudio, setLevels } from './audio';
import { valueAt } from './geometry';
import { allMediaEls, mediaEl } from './media';
import type { Doc } from './model';

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
  resumeAudio();
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
  const solo = doc.timeline.tracks.some(tr => tr.solo);
  const masterVol = doc.timeline.master ?? 1;
  for (const tr of doc.timeline.tracks) {
    for (const c of tr.clips) {
      if (c.kind !== 'media' || !clipActive(c, t)) continue;
      const m = doc.media.find(x => x.id === c.mediaId);
      if (!m || m.kind === 'image') continue;
      const e = mediaEl(m);
      used.add(m.id);
      const want = clipLocalTime(c, t);
      const silent = tr.muted || (solo && !tr.solo) || c.freeze;
      e.muted = !!silent;
      const lt = t - c.start;
      let fade = 1;
      if (c.fadeIn > 0 && lt < c.fadeIn) fade *= lt / c.fadeIn;
      if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) fade *= Math.max(0, (c.dur - lt) / c.fadeOut);
      const clipVol = valueAt(c.keys?.volume, c.volume, lt);
      setLevels(e, clipVol * fade * (tr.volume ?? 1), Math.max(-1, Math.min(1, (c.pan ?? 0) + (tr.pan ?? 0))), masterVol);
      if (playing) {
        e.playbackRate = Math.max(0.0625, Math.min(16, c.speed));
        if (c.freeze) { if (!e.paused) e.pause(); if (Math.abs(e.currentTime - want) > 0.05) e.currentTime = want; }
        else {
          if (Math.abs(e.currentTime - want) > 0.25) e.currentTime = want;
          if (e.paused) e.play().catch(() => {});
        }
      } else {
        if (!e.paused) e.pause();
        if (Math.abs(e.currentTime - want) > 0.02) e.currentTime = want;
      }
    }
  }
  for (const [id, e] of allMediaEls()) if (!used.has(id) && !e.paused) e.pause();
}

export const audioStream = () => exportStream();
