import type { ClipFilter, FilterType } from './model';
import { runFilter } from './pixfx';

export interface ParamDef { key: string; label: string; type: 'range' | 'colour' | 'select'; min?: number; max?: number; step?: number; def: number | string; options?: { v: number; label: string }[] }
export interface ClipFilterDef { type: FilterType; name: string; desc: string; params: ParamDef[] }

const R = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamDef => ({ key, label, type: 'range', min, max, def, step });

export const CLIP_FILTERS: ClipFilterDef[] = [
  { type: 'chroma', name: 'Chroma key (green screen)', desc: 'Make a colour transparent', params: [{ key: 'color', label: 'Key colour', type: 'colour', def: '#00B140' }, R('tol', 'Tolerance', 0, 100, 32), R('soft', 'Edge softness', 0, 100, 14), R('spill', 'Spill removal', 0, 100, 40)] },
  { type: 'crop', name: 'Crop', desc: 'Trim the edges', params: [R('l', 'Left %', 0, 90, 0), R('t', 'Top %', 0, 90, 0), R('r', 'Right %', 0, 90, 0), R('b', 'Bottom %', 0, 90, 0)] },
  { type: 'mirror', name: 'Mirror', desc: 'Reflect one half onto the other', params: [{ key: 'mode', label: 'Mode', type: 'select', def: 0, options: [{ v: 0, label: 'Left → right' }, { v: 1, label: 'Right → left' }, { v: 2, label: 'Top → bottom' }, { v: 3, label: 'Bottom → top' }] }] },
  { type: 'flip', name: 'Flip', desc: 'Flip horizontally or vertically', params: [{ key: 'mode', label: 'Axis', type: 'select', def: 0, options: [{ v: 0, label: 'Horizontal' }, { v: 1, label: 'Vertical' }, { v: 2, label: 'Both' }] }] },
  { type: 'rotate', name: 'Rotate & zoom', desc: 'Rotate or scale the picture', params: [R('angle', 'Angle', -180, 180, 0), R('zoom', 'Zoom %', 10, 400, 100)] },
  { type: 'invert', name: 'Invert colours', desc: 'Negative', params: [] },
  { type: 'tint', name: 'Tint', desc: 'Colour wash', params: [{ key: 'color', label: 'Colour', type: 'colour', def: '#E8AE5E' }, R('amount', 'Amount', 0, 100, 30)] },
  { type: 'duotone', name: 'Duotone', desc: 'Map shadows and highlights to two colours', params: [{ key: 'c1', label: 'Shadows', type: 'colour', def: '#1B2A49' }, { key: 'c2', label: 'Highlights', type: 'colour', def: '#F6D6A8' }] },
  { type: 'vignette', name: 'Vignette', desc: 'Darken the corners', params: [R('a', 'Strength', 0, 100, 45), R('r', 'Radius', 10, 100, 70)] },
  { type: 'glow', name: 'Glow', desc: 'Soft bloom on highlights', params: [R('r', 'Radius', 1, 40, 10), R('a', 'Amount', 0, 100, 40), R('t', 'Threshold', 0, 255, 170)] },
  { type: 'sharpen', name: 'Sharpen', desc: 'Crisper detail', params: [R('a', 'Amount', 0, 3, 0.8, 0.05)] },
  { type: 'pixelate', name: 'Pixelate', desc: 'Mosaic', params: [R('s', 'Cell size', 2, 64, 10)] },
  { type: 'posterize', name: 'Posterise', desc: 'Reduce colour levels', params: [R('n', 'Levels', 2, 16, 5)] },
  { type: 'noise', name: 'Film grain', desc: 'Animated-looking noise', params: [R('a', 'Amount', 0, 100, 18), R('mono', 'Monochrome', 0, 1, 1)] },
  { type: 'wave', name: 'Wave', desc: 'Ripple distortion', params: [R('a', 'Amplitude', 0, 60, 10), R('l', 'Wavelength', 4, 200, 60), R('v', 'Vertical (0/1)', 0, 1, 0)] },
];

export const filterDef = (t: FilterType) => CLIP_FILTERS.find(f => f.type === t)!;
export const newFilter = (type: FilterType): ClipFilter => ({
  id: 'f' + Math.random().toString(36).slice(2, 9), type, on: true,
  params: Object.fromEntries(filterDef(type).params.map(p => [p.key, p.def])),
});

const hex = (h: string): [number, number, number] => { let s = h.replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join(''); const n = parseInt(s.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

let scratch: HTMLCanvasElement | null = null;
const scratchOf = (w: number, h: number) => {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const c = scratch.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  return { c, el: scratch };
};

const num = (p: Record<string, number | string>, k: string) => Number(p[k]);

/** Apply a clip's filter stack in place to a frame-sized canvas. */
export function applyClipFilters(cv: HTMLCanvasElement, filters: ClipFilter[]) {
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const w = cv.width, h = cv.height;
  for (const f of filters) {
    if (!f.on) continue;
    const p = f.params;
    switch (f.type) {
      case 'crop': {
        ctx.save(); ctx.globalCompositeOperation = 'destination-in';
        const x = (w * num(p, 'l')) / 100, y = (h * num(p, 't')) / 100;
        ctx.fillRect(x, y, w - x - (w * num(p, 'r')) / 100, h - y - (h * num(p, 'b')) / 100);
        ctx.restore(); break;
      }
      case 'flip': case 'mirror': case 'rotate': {
        const { c, el } = scratchOf(w, h);
        c.drawImage(cv, 0, 0);
        ctx.save(); ctx.clearRect(0, 0, w, h);
        const m = num(p, 'mode');
        if (f.type === 'flip') { ctx.translate(w / 2, h / 2); ctx.scale(m === 0 || m === 2 ? -1 : 1, m === 1 || m === 2 ? -1 : 1); ctx.translate(-w / 2, -h / 2); ctx.drawImage(el, 0, 0); }
        else if (f.type === 'rotate') { ctx.translate(w / 2, h / 2); ctx.rotate((num(p, 'angle') * Math.PI) / 180); const z = num(p, 'zoom') / 100; ctx.scale(z, z); ctx.translate(-w / 2, -h / 2); ctx.drawImage(el, 0, 0); }
        else {
          ctx.drawImage(el, 0, 0);
          ctx.beginPath();
          if (m === 0) { ctx.rect(w / 2, 0, w / 2, h); ctx.clip(); ctx.clearRect(0, 0, w, h); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(el, 0, 0, w / 2, h, 0, 0, w / 2, h); }
          else if (m === 1) { ctx.rect(0, 0, w / 2, h); ctx.clip(); ctx.clearRect(0, 0, w, h); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(el, w / 2, 0, w / 2, h, w / 2, 0, w / 2, h); }
          else if (m === 2) { ctx.rect(0, h / 2, w, h / 2); ctx.clip(); ctx.clearRect(0, 0, w, h); ctx.translate(0, h); ctx.scale(1, -1); ctx.drawImage(el, 0, 0, w, h / 2, 0, 0, w, h / 2); }
          else { ctx.rect(0, 0, w, h / 2); ctx.clip(); ctx.clearRect(0, 0, w, h); ctx.translate(0, h); ctx.scale(1, -1); ctx.drawImage(el, 0, h / 2, w, h / 2, 0, h / 2, w, h / 2); }
        }
        ctx.restore(); break;
      }
      case 'tint': {
        ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = num(p, 'amount') / 100;
        ctx.fillStyle = String(p.color); ctx.fillRect(0, 0, w, h); ctx.restore(); break;
      }
      case 'chroma': {
        const img = ctx.getImageData(0, 0, w, h), d = img.data;
        const [kr, kg, kb] = hex(String(p.color));
        const tol = (num(p, 'tol') / 100) * 441, soft = Math.max(1, (num(p, 'soft') / 100) * 441), spill = num(p, 'spill') / 100;
        // work in a luma-insensitive chroma space so shadows on the screen still key out
        const kcb = -0.169 * kr - 0.331 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.419 * kg - 0.081 * kb;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const cb = -0.169 * r - 0.331 * g + 0.5 * b, cr = 0.5 * r - 0.419 * g - 0.081 * b;
          const dist = Math.hypot(cb - kcb, cr - kcr) * 1.7;
          if (dist < tol) d[i + 3] = 0;
          else if (dist < tol + soft) d[i + 3] = d[i + 3] * ((dist - tol) / soft);
          if (spill > 0 && d[i + 3] > 0) {
            // pull the key colour's dominant channel down towards the others
            const dom = kg >= kr && kg >= kb ? 1 : kr >= kb ? 0 : 2;
            const others = (d[i + (dom + 1) % 3] + d[i + (dom + 2) % 3]) / 2;
            if (d[i + dom] > others) d[i + dom] = d[i + dom] * (1 - spill) + others * spill;
          }
        }
        ctx.putImageData(img, 0, 0); break;
      }
      case 'invert': case 'vignette': case 'pixelate': case 'sharpen': case 'posterize': case 'noise': case 'glow': case 'wave': case 'duotone': {
        const img = ctx.getImageData(0, 0, w, h);
        const params = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(v)]));
        let id: string = f.type;
        if (f.type === 'wave') id = 'ripple';
        if (f.type === 'duotone') id = 'gradmap';
        const out = runFilter(id, img, params, f.type === 'duotone' ? { fg: String(p.c1), bg: String(p.c2) } : {});
        // keep transparency
        for (let i = 3; i < out.data.length; i += 4) out.data[i] = img.data[i];
        ctx.putImageData(out, 0, 0); break;
      }
    }
  }
}
