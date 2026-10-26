import type { Media } from './model';
import { emit } from './store';

// One HTML media element per imported clip source. Elements are reused for
// preview, playback and export.
const els = new Map<string, HTMLMediaElement>();
export const mediaBlobs = new Map<string, Blob>();

export function mediaEl(m: Media): HTMLMediaElement {
  let e = els.get(m.id);
  if (!e || e.src !== m.url) {
    e = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
    e.preload = 'auto';
    e.crossOrigin = 'anonymous';
    (e as HTMLVideoElement).playsInline = true;
    e.src = m.url;
    e.addEventListener('seeked', () => emit());
    e.addEventListener('loadeddata', () => emit());
    els.set(m.id, e);
  }
  return e;
}

export const allMediaEls = () => [...els.entries()];

export function probeMedia(file: File): Promise<Media> {
  const url = URL.createObjectURL(file);
  const kind: Media['kind'] = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
  const id = 'm' + Math.random().toString(36).slice(2, 10);
  mediaBlobs.set(id, file);
  return new Promise(res => {
    if (kind === 'image') {
      const i = new Image();
      i.onload = () => res({ id, kind, name: file.name, url, duration: 5, w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res({ id, kind, name: file.name, url, duration: 5, w: 0, h: 0 });
      i.src = url;
      return;
    }
    const e = document.createElement(kind === 'video' ? 'video' : 'audio');
    e.preload = 'metadata';
    e.onloadedmetadata = () => res({
      id, kind, name: file.name, url, duration: isFinite(e.duration) ? e.duration : 10,
      w: (e as HTMLVideoElement).videoWidth || 0, h: (e as HTMLVideoElement).videoHeight || 0,
    });
    e.onerror = () => res({ id, kind, name: file.name, url, duration: 10, w: 0, h: 0 });
    e.src = url;
  });
}
