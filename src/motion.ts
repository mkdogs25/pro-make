import { S, T, commit, toast } from './store';
import { uid } from './model';
import type { Clip, ClipProp, Key, Media, Track } from './model';
import { addTrack, baseClip, findClip, freeTrack } from './ops';
import { clipValue } from './render';
import { seek } from './playback';

// ---------- clip keyframes ----------
export function setClipProp(c: Clip, p: ClipProp, v: number, t = T.time, forceKey = false) {
  const lt = Math.max(0, Math.min(c.dur, t - c.start));
  const keys = c.keys?.[p];
  if ((keys && keys.length) || forceKey) {
    c.keys = c.keys || {};
    const arr = (c.keys[p] = c.keys[p] || []);
    const ex = arr.find(k => Math.abs(k.t - lt) < 1 / 60);
    if (ex) ex.v = v; else { arr.push({ t: lt, v, ease: 'ease' }); arr.sort((a, b) => a.t - b.t); }
    if (!keys?.length) setBase(c, p, v);
  } else setBase(c, p, v);
}
function setBase(c: Clip, p: ClipProp, v: number) {
  if (p === 'x') c.x = v; else if (p === 'y') c.y = v; else if (p === 'scale') c.scale = v;
  else if (p === 'rotation') c.rotation = v; else if (p === 'opacity') c.opacity = v; else c.volume = v;
}
export function toggleClipKey(c: Clip, p: ClipProp, t = T.time) {
  const lt = Math.max(0, Math.min(c.dur, t - c.start));
  const keys = c.keys?.[p] || [];
  const at = keys.find(k => Math.abs(k.t - lt) < 1 / 60);
  if (at) {
    c.keys![p] = keys.filter(k => k !== at);
    if (!c.keys![p]!.length) { setBase(c, p, at.v); delete c.keys![p]; }
  } else setClipProp(c, p, clipValue(c, p, t), t, true);
  commit();
}
export function clearClipKeys(c: Clip, p: ClipProp) {
  const v = clipValue(c, p, T.time);
  delete c.keys?.[p]; setBase(c, p, v); commit();
}
export const clipKeyList = (c: Clip, p: ClipProp): Key[] => c.keys?.[p] || [];
export function jumpClipKey(c: Clip, p: ClipProp, dir: 1 | -1) {
  const lt = T.time - c.start, ks = clipKeyList(c, p);
  const k = dir > 0 ? ks.find(x => x.t > lt + 0.01) : [...ks].reverse().find(x => x.t < lt - 0.01);
  if (k) seek(c.start + k.t);
}

// ---------- transitions ----------
export function overlapPrev(c: Clip): number {
  const f = findClip(c.id);
  if (!f) return 0;
  let end = -1;
  for (const o of f.track.clips) if (o !== c && o.start < c.start && o.start + o.dur > c.start) end = Math.max(end, o.start + o.dur);
  return end < 0 ? 0 : end - c.start;
}
/** Slide a clip back so it overlaps the clip before it by `secs` (the overlap becomes the transition). */
export function setOverlap(c: Clip, secs: number) {
  const f = findClip(c.id);
  if (!f) return;
  const prev = f.track.clips.filter(o => o !== c && o.start < c.start + 0.05).sort((a, b) => b.start + b.dur - (a.start + a.dur))[0];
  if (!prev) { toast('Put another clip before this one on the same track first'); return; }
  const prevEnd = prev.start + prev.dur;
  c.start = Math.max(prev.start + 0.1, prevEnd - Math.max(0, secs));
  commit();
}

// ---------- markers & range ----------
export function addMarker(t = T.time) {
  const tl = S.doc.timeline;
  tl.markers = tl.markers || [];
  tl.markers.push({ id: uid('mk'), t, label: `Marker ${tl.markers.length + 1}`, color: '#E0457B' });
  tl.markers.sort((a, b) => a.t - b.t);
  commit();
}
export function setInPoint(t = T.time) { const tl = S.doc.timeline; tl.inPoint = t; if (tl.outPoint != null && tl.outPoint <= t) tl.outPoint = null; commit(); }
export function setOutPoint(t = T.time) { const tl = S.doc.timeline; tl.outPoint = t; if (tl.inPoint != null && tl.inPoint >= t) tl.inPoint = null; commit(); }
export function clearRange() { const tl = S.doc.timeline; tl.inPoint = null; tl.outPoint = null; commit(); }

// ---------- clip editing ----------
let clipClip: Clip | null = null;
export function copyClip() {
  const f = findClip(S.ui.selClip);
  if (!f) return false;
  clipClip = JSON.parse(JSON.stringify(f.clip));
  toast('Clip copied');
  return true;
}
export function pasteClip() {
  if (!clipClip) { toast('Copy a clip first'); return; }
  const c: Clip = JSON.parse(JSON.stringify(clipClip));
  c.id = uid('c'); c.start = T.time;
  const f = findClip(clipClip.id);
  const kind = f?.track.kind || (c.kind === 'media' && S.doc.media.find(m => m.id === c.mediaId)?.kind === 'audio' ? 'audio' : 'video');
  freeTrack(kind, c.start, c.dur).clips.push(c);
  S.ui.selClip = c.id;
  commit();
}
export function duplicateClip() {
  const f = findClip(S.ui.selClip);
  if (!f) { toast('Select a clip first'); return; }
  const c: Clip = JSON.parse(JSON.stringify(f.clip));
  c.id = uid('c'); c.start = f.clip.start + f.clip.dur;
  const tr = f.track.clips.some(o => o.start < c.start + c.dur - 0.01 && o.start + o.dur > c.start + 0.01) ? freeTrack(f.track.kind, c.start, c.dur) : f.track;
  tr.clips.push(c);
  S.ui.selClip = c.id;
  commit();
}

export function detachAudio() {
  const f = findClip(S.ui.selClip);
  if (!f || f.clip.kind !== 'media') { toast('Select a video clip on the timeline'); return; }
  const m = S.doc.media.find(x => x.id === f.clip.mediaId);
  if (!m || m.kind !== 'video') { toast('Only video clips carry audio to detach'); return; }
  const a: Clip = JSON.parse(JSON.stringify(f.clip));
  a.id = uid('c'); a.name = `${f.clip.name} (audio)`; a.fadeIn = f.clip.fadeIn; a.fadeOut = f.clip.fadeOut; a.keys = undefined;
  a.volume = f.clip.volume;
  f.clip.volume = 0; f.clip.keys = { ...f.clip.keys }; delete f.clip.keys.volume;
  freeTrack('audio', a.start, a.dur).clips.push(a);
  commit();
  toast('Audio detached to an audio track');
}

function splitAt(tr: Track, c: Clip, t: number): Clip {
  const right: Clip = JSON.parse(JSON.stringify(c));
  right.id = uid('c');
  const cut = t - c.start;
  right.start = t; right.dur = c.dur - cut; right.offset = c.offset + cut * c.speed; right.fadeIn = 0;
  c.dur = cut; c.fadeOut = 0;
  tr.clips.push(right);
  return right;
}

export function freezeFrame(secs = 2) {
  const f = findClip(S.ui.selClip);
  const t = T.time;
  if (!f || t <= f.clip.start + 0.02 || t >= f.clip.start + f.clip.dur - 0.02) { toast('Select a clip and put the playhead inside it'); return; }
  const lt = f.clip.offset + (t - f.clip.start) * f.clip.speed;
  const right = splitAt(f.track, f.clip, t);
  const fr: Clip = JSON.parse(JSON.stringify(f.clip));
  fr.id = uid('c'); fr.start = t; fr.dur = secs; fr.offset = lt; fr.freeze = true; fr.fadeIn = 0; fr.fadeOut = 0; fr.name = `${f.clip.name} (freeze)`; fr.volume = 0;
  for (const o of f.track.clips) if (o.start >= t - 1e-6) o.start += secs;
  void right;
  f.track.clips.push(fr);
  commit();
}

function cutRegion(tr: Track, a: number, b: number) {
  for (const c of [...tr.clips]) {
    const s = c.start, e = c.start + c.dur;
    if (e <= a + 1e-6 || s >= b - 1e-6) continue;
    if (s >= a && e <= b) tr.clips = tr.clips.filter(x => x !== c);
    else if (s < a && e > b) { const r = splitAt(tr, c, a); const cut = b - r.start; r.offset += cut * r.speed; r.start = b; r.dur -= cut; }
    else if (s < a) { c.dur = a - s; c.fadeOut = 0; }
    else { const cut = b - s; c.offset += cut * c.speed; c.start = b; c.dur -= cut; c.fadeIn = 0; }
  }
}

export type PlaceMode = 'append' | 'insert' | 'overwrite';
export function placeMedia(m: Media, mode: PlaceMode, range?: { in: number; out: number }) {
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const dur = range ? Math.max(0.1, range.out - range.in) : m.duration;
  const tracks = S.doc.timeline.tracks.filter(t => t.kind === kind && !t.locked);
  let tr = (S.ui.selTrack && tracks.find(t => t.id === S.ui.selTrack)) || (kind === 'video' ? tracks[tracks.length - 1] : tracks[0]);
  if (!tr) { addTrack(kind); tr = S.doc.timeline.tracks.filter(t => t.kind === kind).slice(-1)[0]; }
  const start = mode === 'append' ? Math.max(0, ...tr.clips.map(c => c.start + c.dur)) : T.time;
  const c = baseClip('media', m.name, start, dur);
  c.mediaId = m.id; c.offset = range?.in || 0;
  if (mode === 'insert') {
    for (const o of [...tr.clips]) if (o.start < start - 1e-6 && o.start + o.dur > start + 1e-6) splitAt(tr, o, start);
    for (const o of tr.clips) if (o.start >= start - 1e-6) o.start += dur;
  } else if (mode === 'overwrite') cutRegion(tr, start, start + dur);
  tr.clips.push(c);
  S.ui.selClip = c.id;
  commit();
}

export function addGenerator(kind: 'color' | 'bars' | 'countdown') {
  const c = baseClip(kind, kind === 'color' ? 'Colour' : kind === 'bars' ? 'Colour bars' : 'Countdown', T.time, 5);
  if (kind === 'color') c.color = '#2B5D8C';
  if (kind === 'countdown') { c.color = '#F3E2C3'; c.color2 = '#14110E'; c.font = 'Fraunces'; c.dur = 5; }
  freeTrack('video', c.start, c.dur).clips.push(c);
  S.ui.selClip = c.id;
  commit();
}

export function moveTrack(id: string, dir: 1 | -1) {
  const a = S.doc.timeline.tracks, i = a.findIndex(t => t.id === id), j = i + dir;
  if (j < 0 || j >= a.length || a[i].kind !== a[j].kind) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit();
}

export function fitTimeline(widthPx: number) {
  const dur = Math.max(1, ...S.doc.timeline.tracks.flatMap(t => t.clips.map(c => c.start + c.dur)));
  S.ui.tlZoom = Math.max(10, Math.min(400, (widthPx - 160) / (dur + 1)));
}
