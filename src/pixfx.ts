// Pure pixel filters shared by Grain (layers) and Motion (clip filters).

export interface FilterDef { id: string; name: string; params: { key: string; label: string; min: number; max: number; step?: number; def: number }[] }
export const FILTERS: FilterDef[] = [
  { id: 'bc', name: 'Brightness / Contrast', params: [{ key: 'b', label: 'Brightness', min: -100, max: 100, def: 0 }, { key: 'c', label: 'Contrast', min: -100, max: 100, def: 0 }] },
  { id: 'hsl', name: 'Hue / Saturation', params: [{ key: 'h', label: 'Hue', min: -180, max: 180, def: 0 }, { key: 's', label: 'Saturation', min: -100, max: 100, def: 0 }, { key: 'l', label: 'Lightness', min: -100, max: 100, def: 0 }] },
  { id: 'levels', name: 'Levels', params: [{ key: 'lo', label: 'Input black', min: 0, max: 254, def: 0 }, { key: 'hi', label: 'Input white', min: 1, max: 255, def: 255 }, { key: 'g', label: 'Gamma', min: 0.1, max: 3, step: 0.01, def: 1 }] },
  { id: 'temp', name: 'Colour Temperature', params: [{ key: 't', label: 'Warmth', min: -100, max: 100, def: 20 }, { key: 'tint', label: 'Tint', min: -100, max: 100, def: 0 }] },
  { id: 'blur', name: 'Gaussian Blur', params: [{ key: 'r', label: 'Radius', min: 0, max: 40, def: 4 }] },
  { id: 'sharpen', name: 'Sharpen', params: [{ key: 'a', label: 'Amount', min: 0, max: 3, step: 0.05, def: 0.8 }] },
  { id: 'noise', name: 'Film Grain', params: [{ key: 'a', label: 'Amount', min: 0, max: 100, def: 18 }, { key: 'mono', label: 'Monochrome', min: 0, max: 1, def: 1 }] },
  { id: 'vignette', name: 'Vignette', params: [{ key: 'a', label: 'Strength', min: 0, max: 100, def: 45 }, { key: 'r', label: 'Radius', min: 10, max: 100, def: 70 }] },
  { id: 'pixelate', name: 'Pixelate', params: [{ key: 's', label: 'Cell size', min: 2, max: 64, def: 8 }] },
  { id: 'posterize', name: 'Posterise', params: [{ key: 'n', label: 'Levels', min: 2, max: 16, def: 4 }] },
  { id: 'threshold', name: 'Threshold', params: [{ key: 't', label: 'Threshold', min: 0, max: 255, def: 128 }] },
  { id: 'edges', name: 'Edge Detect', params: [{ key: 'a', label: 'Strength', min: 0.2, max: 4, step: 0.1, def: 1 }] },
  { id: 'emboss', name: 'Emboss', params: [{ key: 'a', label: 'Strength', min: 0.2, max: 4, step: 0.1, def: 1 }] },
  { id: 'invert', name: 'Invert Colours', params: [] },
  { id: 'desat', name: 'Desaturate', params: [] },
  { id: 'sepia', name: 'Sepia', params: [{ key: 'a', label: 'Amount', min: 0, max: 100, def: 80 }] },
  { id: 'curves', name: 'Curves…', params: [] },
  { id: 'colorbalance', name: 'Colour Balance', params: [
    { key: 'sr', label: 'Shadows cyan↔red', min: -100, max: 100, def: 0 }, { key: 'sg', label: 'Shadows magenta↔green', min: -100, max: 100, def: 0 }, { key: 'sb', label: 'Shadows yellow↔blue', min: -100, max: 100, def: 0 },
    { key: 'mr', label: 'Midtones cyan↔red', min: -100, max: 100, def: 0 }, { key: 'mg', label: 'Midtones magenta↔green', min: -100, max: 100, def: 0 }, { key: 'mb', label: 'Midtones yellow↔blue', min: -100, max: 100, def: 0 },
    { key: 'hr', label: 'Highlights cyan↔red', min: -100, max: 100, def: 0 }, { key: 'hg', label: 'Highlights magenta↔green', min: -100, max: 100, def: 0 }, { key: 'hb', label: 'Highlights yellow↔blue', min: -100, max: 100, def: 0 }] },
  { id: 'colorize', name: 'Colorize', params: [{ key: 'h', label: 'Hue', min: 0, max: 360, def: 30 }, { key: 's', label: 'Saturation', min: 0, max: 100, def: 50 }, { key: 'l', label: 'Lightness', min: -100, max: 100, def: 0 }] },
  { id: 'exposure', name: 'Exposure', params: [{ key: 'e', label: 'Exposure (stops)', min: -4, max: 4, step: 0.05, def: 0.5 }, { key: 'o', label: 'Black level', min: -50, max: 50, def: 0 }, { key: 'g', label: 'Gamma', min: 0.2, max: 3, step: 0.01, def: 1 }] },
  { id: 'shadhi', name: 'Shadows / Highlights', params: [{ key: 's', label: 'Shadows', min: -100, max: 100, def: 40 }, { key: 'h', label: 'Highlights', min: -100, max: 100, def: -30 }] },
  { id: 'autolevels', name: 'Auto Levels (stretch)', params: [{ key: 'clip', label: 'Clip %', min: 0, max: 10, step: 0.1, def: 0.5 }] },
  { id: 'equalize', name: 'Equalise Histogram', params: [] },
  { id: 'coloralpha', name: 'Colour to Alpha', params: [{ key: 'r', label: 'Red', min: 0, max: 255, def: 255 }, { key: 'g', label: 'Green', min: 0, max: 255, def: 255 }, { key: 'b', label: 'Blue', min: 0, max: 255, def: 255 }, { key: 't', label: 'Threshold', min: 0, max: 100, def: 20 }] },
  { id: 'gradmap', name: 'Gradient Map (FG → BG)', params: [] },
  { id: 'solarize', name: 'Solarise', params: [{ key: 't', label: 'Threshold', min: 0, max: 255, def: 128 }] },
  { id: 'unsharp', name: 'Unsharp Mask', params: [{ key: 'r', label: 'Radius', min: 0.5, max: 20, step: 0.5, def: 3 }, { key: 'a', label: 'Amount', min: 0, max: 5, step: 0.1, def: 1.2 }, { key: 't', label: 'Threshold', min: 0, max: 50, def: 2 }] },
  { id: 'motionblur', name: 'Motion Blur', params: [{ key: 'len', label: 'Length', min: 1, max: 80, def: 14 }, { key: 'ang', label: 'Angle', min: 0, max: 180, def: 0 }] },
  { id: 'zoomblur', name: 'Zoom Blur', params: [{ key: 'a', label: 'Amount', min: 0, max: 60, def: 12 }] },
  { id: 'median', name: 'Median / Despeckle', params: [{ key: 'r', label: 'Radius', min: 1, max: 4, def: 1 }] },
  { id: 'oilify', name: 'Oilify', params: [{ key: 'r', label: 'Radius', min: 1, max: 8, def: 3 }, { key: 'n', label: 'Levels', min: 4, max: 40, def: 20 }] },
  { id: 'cartoon', name: 'Cartoon', params: [{ key: 'n', label: 'Colour levels', min: 2, max: 12, def: 5 }, { key: 'e', label: 'Outline', min: 0, max: 100, def: 55 }] },
  { id: 'halftone', name: 'Halftone', params: [{ key: 's', label: 'Cell size', min: 3, max: 30, def: 8 }, { key: 'c', label: 'Contrast', min: 0.5, max: 3, step: 0.1, def: 1.2 }] },
  { id: 'dither', name: 'Ordered Dither', params: [{ key: 'n', label: 'Levels', min: 2, max: 8, def: 2 }] },
  { id: 'ripple', name: 'Ripple', params: [{ key: 'a', label: 'Amplitude', min: 0, max: 60, def: 8 }, { key: 'l', label: 'Wavelength', min: 4, max: 200, def: 40 }, { key: 'v', label: 'Vertical (0/1)', min: 0, max: 1, def: 0 }] },
  { id: 'twirl', name: 'Whirl & Pinch', params: [{ key: 'a', label: 'Whirl angle', min: -720, max: 720, def: 90 }, { key: 'p', label: 'Pinch / bulge', min: -100, max: 100, def: 0 }, { key: 'r', label: 'Radius %', min: 10, max: 100, def: 80 }] },
  { id: 'glow', name: 'Glow', params: [{ key: 'r', label: 'Radius', min: 1, max: 40, def: 10 }, { key: 'a', label: 'Amount', min: 0, max: 100, def: 50 }, { key: 't', label: 'Threshold', min: 0, max: 255, def: 150 }] },
  { id: 'dropshadow', name: 'Drop Shadow', params: [{ key: 'x', label: 'Offset X', min: -100, max: 100, def: 8 }, { key: 'y', label: 'Offset Y', min: -100, max: 100, def: 8 }, { key: 'r', label: 'Blur', min: 0, max: 50, def: 8 }, { key: 'o', label: 'Opacity', min: 0, max: 100, def: 60 }] },
  { id: 'bw', name: 'Black & White (mixer)', params: [{ key: 'r', label: 'Red', min: -100, max: 200, def: 30 }, { key: 'g', label: 'Green', min: -100, max: 200, def: 59 }, { key: 'b', label: 'Blue', min: -100, max: 200, def: 11 }] },
  { id: 'noisehsv', name: 'Colour Noise', params: [{ key: 'a', label: 'Amount', min: 0, max: 100, def: 15 }] },
  { id: 'clouds', name: 'Clouds (render)', params: [{ key: 'scale', label: 'Scale', min: 20, max: 600, def: 160 }, { key: 'detail', label: 'Detail', min: 1, max: 7, def: 5 }, { key: 'seed', label: 'Seed', min: 1, max: 999, def: 7 }] },
  { id: 'checker', name: 'Checkerboard (render)', params: [{ key: 's', label: 'Square size', min: 2, max: 200, def: 32 }] },
  { id: 'lens', name: 'Lens Distortion', params: [{ key: 'a', label: 'Barrel / pincushion', min: -100, max: 100, def: 30 }] },
];


export const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
export function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

export function convolve(src: ImageData, k: number[], div = 1, bias = 0): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
      const xx = Math.min(w - 1, Math.max(0, x + kx)), yy = Math.min(h - 1, Math.max(0, y + ky));
      const i = (yy * w + xx) * 4, kv = k[(ky + 1) * 3 + kx + 1];
      r += data[i] * kv; g += data[i + 1] * kv; b += data[i + 2] * kv;
    }
    const j = (y * w + x) * 4;
    o[j] = r / div + bias; o[j + 1] = g / div + bias; o[j + 2] = b / div + bias; o[j + 3] = data[j + 3];
  }
  return out;
}

export function boxBlur(img: ImageData, r: number) {
  const { width: w, height: h } = img;
  const d = img.data;
  const tmp = new Float32Array(d.length);
  r = Math.max(1, Math.round(r));
  // premultiplied horizontal then vertical passes
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? d : tmp;
    const dst = pass === 0 ? tmp : d;
    const len = pass === 0 ? w : h, lines = pass === 0 ? h : w;
    for (let l = 0; l < lines; l++) {
      const acc = [0, 0, 0, 0];
      const idx = (p: number) => (pass === 0 ? (l * w + Math.min(len - 1, Math.max(0, p))) : (Math.min(len - 1, Math.max(0, p)) * w + l)) * 4;
      for (let p = -r; p <= r; p++) { const i = idx(p); for (let c = 0; c < 4; c++) acc[c] += src[i + c]; }
      for (let p = 0; p < len; p++) {
        const o = idx(p);
        for (let c = 0; c < 4; c++) dst[o + c] = acc[c] / (2 * r + 1);
        const add = idx(p + r + 1), rem = idx(p - r);
        for (let c = 0; c < 4; c++) acc[c] += src[add + c] - src[rem + c];
      }
    }
  }
}

export interface FxExtra { fg?: string; bg?: string; curves?: { rgb: number[]; r: number[]; g: number[]; b: number[] } }
export function runFilter(id: string, src: ImageData, p: Record<string, number>, extra: FxExtra = {}): ImageData {
  const w = src.width, h = src.height;
  let out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data;
  switch (id) {
    case 'bc': {
      const b = p.b * 2.55, c = p.c;
      const f = (259 * (c + 255)) / (255 * (259 - c));
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = f * (d[i + k] - 128) + 128 + b;
      break;
    }
    case 'hsl': for (let i = 0; i < d.length; i += 4) {
      let [hh, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      hh = (hh + p.h / 360 + 1) % 1; s = Math.min(1, Math.max(0, s * (1 + p.s / 100)));
      l = p.l > 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100);
      [d[i], d[i + 1], d[i + 2]] = hsl2rgb(hh, s, l);
    } break;
    case 'levels': {
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - p.lo) / Math.max(1, p.hi - p.lo))), 1 / p.g);
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
      break;
    }
    case 'temp': for (let i = 0; i < d.length; i += 4) { d[i] += p.t * 0.5; d[i + 2] -= p.t * 0.5; d[i + 1] += p.tint * 0.4; } break;
    case 'blur': if (p.r > 0) { boxBlur(out, p.r / 2); boxBlur(out, p.r / 2); boxBlur(out, p.r / 2); } break;
    case 'sharpen': { const a = p.a; out = convolve(src, [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]); break; }
    case 'edges': { const a = p.a; out = convolve(src, [-a, -a, -a, -a, 8 * a, -a, -a, -a, -a]); break; }
    case 'emboss': { const a = p.a; out = convolve(src, [-2 * a, -a, 0, -a, 1, a, 0, a, 2 * a], 1, 0); break; }
    case 'noise': for (let i = 0; i < d.length; i += 4) {
      const n = () => (Math.random() - 0.5) * p.a * 2.2;
      if (p.mono >= 0.5) { const v = n(); d[i] += v; d[i + 1] += v; d[i + 2] += v; } else { d[i] += n(); d[i + 1] += n(); d[i + 2] += n(); }
    } break;
    case 'vignette': {
      const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy) * (p.r / 100);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = Math.max(0, (Math.hypot(x - cx, y - cy) - R * 0.5) / (R * 0.8));
        const f = 1 - Math.min(1, t * t) * (p.a / 100);
        const i = (y * w + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
      break;
    }
    case 'pixelate': {
      const s = Math.max(2, Math.round(p.s));
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const acc = [0, 0, 0, 0]; let n = 0;
        for (let yy = y; yy < Math.min(h, y + s); yy++) for (let xx = x; xx < Math.min(w, x + s); xx++) { const i = (yy * w + xx) * 4; for (let c = 0; c < 4; c++) acc[c] += d[i + c]; n++; }
        for (let yy = y; yy < Math.min(h, y + s); yy++) for (let xx = x; xx < Math.min(w, x + s); xx++) { const i = (yy * w + xx) * 4; for (let c = 0; c < 4; c++) d[i + c] = acc[c] / n; }
      }
      break;
    }
    case 'posterize': { const n = Math.max(2, Math.round(p.n)) - 1; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] / 255) * n) * (255 / n); break; }
    case 'threshold': for (let i = 0; i < d.length; i += 4) { const v = lum(d[i], d[i + 1], d[i + 2]) >= p.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } break;
    case 'invert': for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } break;
    case 'desat': for (let i = 0; i < d.length; i += 4) { const v = lum(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v; } break;
    case 'sepia': {
      const a = p.a / 100;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = r * (1 - a) + Math.min(255, r * 0.393 + g * 0.769 + b * 0.189) * a;
        d[i + 1] = g * (1 - a) + Math.min(255, r * 0.349 + g * 0.686 + b * 0.168) * a;
        d[i + 2] = b * (1 - a) + Math.min(255, r * 0.272 + g * 0.534 + b * 0.131) * a;
      }
      break;
    }
    default: return runExtra(id, src, p, extra);
  }
  return out;
}


// ---------- extra filters ----------
const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const hexRgb = (hex: string): [number, number, number] => { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function sample(src: ImageData, x: number, y: number, out: number[]) {
  const { width: w, height: h, data } = src;
  x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i = (y0 * w + x0) * 4, j = i + 4, k = i + w * 4, l = k + 4;
  for (let c = 0; c < 4; c++) out[c] = data[i + c] * (1 - fx) * (1 - fy) + data[j + c] * fx * (1 - fy) + data[k + c] * (1 - fx) * fy + data[l + c] * fx * fy;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hash2(x: number, y: number, seed: number) { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function runExtra(id: string, src: ImageData, p: Record<string, number>, extra: FxExtra): ImageData {
  const w = src.width, h = src.height;
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data, s = src.data;
  const tmp = [0, 0, 0, 0];
  switch (id) {
    case 'clouds': {
      const a = hexRgb(extra.fg || '#000000'), b = hexRgb(extra.bg || '#ffffff');
      const oct = Math.round(p.detail);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let amp = 1, f = 1 / p.scale, sum = 0, norm = 0;
        for (let o = 0; o < oct; o++) { sum += vnoise(x * f, y * f, p.seed + o * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
        const t = Math.max(0, Math.min(1, ((sum / norm) - 0.5) * 1.6 + 0.5)), i = (y * w + x) * 4;
        d[i] = a[0] + (b[0] - a[0]) * t; d[i + 1] = a[1] + (b[1] - a[1]) * t; d[i + 2] = a[2] + (b[2] - a[2]) * t; d[i + 3] = 255;
      }
      break;
    }
    case 'checker': {
      const a = hexRgb(extra.fg || '#000000'), b = hexRgb(extra.bg || '#ffffff'), sz = Math.max(1, Math.round(p.s));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const on = (Math.floor(x / sz) + Math.floor(y / sz)) % 2 === 0, c = on ? a : b, i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
      break;
    }
    case 'curves': {
      const c = extra.curves;
      if (!c) break;
      for (let i = 0; i < d.length; i += 4) { d[i] = c.r[c.rgb[d[i]]]; d[i + 1] = c.g[c.rgb[d[i + 1]]]; d[i + 2] = c.b[c.rgb[d[i + 2]]]; }
      break;
    }
    case 'colorbalance': {
      for (let i = 0; i < d.length; i += 4) {
        const L = lum(d[i], d[i + 1], d[i + 2]) / 255;
        const sh = Math.max(0, 1 - L * 2.2), hi = Math.max(0, L * 2.2 - 1.2), mid = Math.max(0, 1 - Math.abs(L - 0.5) * 2.4);
        d[i] = clamp8(d[i] + (p.sr * sh + p.mr * mid + p.hr * hi) * 0.7);
        d[i + 1] = clamp8(d[i + 1] + (p.sg * sh + p.mg * mid + p.hg * hi) * 0.7);
        d[i + 2] = clamp8(d[i + 2] + (p.sb * sh + p.mb * mid + p.hb * hi) * 0.7);
      }
      break;
    }
    case 'colorize': for (let i = 0; i < d.length; i += 4) {
      let l = lum(d[i], d[i + 1], d[i + 2]) / 255;
      l = p.l > 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100);
      [d[i], d[i + 1], d[i + 2]] = hsl2rgb(p.h / 360, p.s / 100, l);
    } break;
    case 'exposure': {
      const gain = Math.pow(2, p.e);
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = clamp8(255 * Math.pow(Math.max(0, (d[i + k] / 255 + p.o / 255) * gain), 1 / p.g));
      break;
    }
    case 'shadhi': for (let i = 0; i < d.length; i += 4) {
      const L = lum(d[i], d[i + 1], d[i + 2]) / 255;
      const add = (p.s / 100) * Math.pow(1 - L, 2) * 90 + (p.h / 100) * Math.pow(L, 2) * 90;
      d[i] = clamp8(d[i] + add); d[i + 1] = clamp8(d[i + 1] + add); d[i + 2] = clamp8(d[i + 2] + add);
    } break;
    case 'autolevels': {
      const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; n++; }
      const cut = (n * p.clip) / 100;
      const luts = hist.map(hh => {
        let lo = 0, hi = 255, a = 0;
        for (; lo < 255; lo++) { a += hh[lo]; if (a > cut) break; }
        a = 0;
        for (; hi > 0; hi--) { a += hh[hi]; if (a > cut) break; }
        const lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = hi > lo ? ((v - lo) * 255) / (hi - lo) : v;
        return lut;
      });
      for (let i = 0; i < d.length; i += 4) { d[i] = luts[0][d[i]]; d[i + 1] = luts[1][d[i + 1]]; d[i + 2] = luts[2][d[i + 2]]; }
      break;
    }
    case 'equalize': {
      const hist = new Uint32Array(256); let n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; n++; }
      const cdf = new Float32Array(256); let a = 0;
      for (let v = 0; v < 256; v++) { a += hist[v]; cdf[v] = a / (n || 1); }
      for (let i = 0; i < d.length; i += 4) {
        const l = lum(d[i], d[i + 1], d[i + 2]) || 1, nl = cdf[Math.round(l)] * 255, f = nl / l;
        d[i] = clamp8(d[i] * f); d[i + 1] = clamp8(d[i + 1] * f); d[i + 2] = clamp8(d[i + 2] * f);
      }
      break;
    }
    case 'coloralpha': {
      const th = p.t / 100 * 441;
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - p.r, d[i + 1] - p.g, d[i + 2] - p.b);
        if (dist < th) d[i + 3] = d[i + 3] * Math.min(1, dist / th);
      }
      break;
    }
    case 'gradmap': {
      const a = hexRgb(extra.fg || '#000000'), b = hexRgb(extra.bg || '#ffffff');
      for (let i = 0; i < d.length; i += 4) {
        const t = lum(d[i], d[i + 1], d[i + 2]) / 255;
        d[i] = a[0] + (b[0] - a[0]) * t; d[i + 1] = a[1] + (b[1] - a[1]) * t; d[i + 2] = a[2] + (b[2] - a[2]) * t;
      }
      break;
    }
    case 'solarize': for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) if (d[i + k] > p.t) d[i + k] = 255 - d[i + k]; break;
    case 'unsharp': {
      const blur = new ImageData(new Uint8ClampedArray(s), w, h);
      for (let k = 0; k < 3; k++) boxBlur(blur, p.r / 2);
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) {
        const diff = s[i + k] - blur.data[i + k];
        if (Math.abs(diff) >= p.t) d[i + k] = clamp8(s[i + k] + diff * p.a);
      }
      break;
    }
    case 'motionblur': {
      const n = Math.max(1, Math.round(p.len)), a = (p.ang * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < n; k++) { const t = k - n / 2; sample(src, x + dx * t, y + dy * t, tmp); r += tmp[0]; g += tmp[1]; b += tmp[2]; al += tmp[3]; }
        const i = (y * w + x) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; d[i + 3] = al / n;
      }
      break;
    }
    case 'zoomblur': {
      const n = 12, cx = w / 2, cy = h / 2, f = p.a / 100;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = 0; k < n; k++) { const t = 1 - (f * k) / n; sample(src, cx + (x - cx) * t, cy + (y - cy) * t, tmp); r += tmp[0]; g += tmp[1]; b += tmp[2]; al += tmp[3]; }
        const i = (y * w + x) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; d[i + 3] = al / n;
      }
      break;
    }
    case 'median': {
      const r = Math.round(p.r), win: number[][] = [[], [], []];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        win[0].length = win[1].length = win[2].length = 0;
        for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
          const i = (yy * w + xx) * 4; win[0].push(s[i]); win[1].push(s[i + 1]); win[2].push(s[i + 2]);
        }
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) { win[k].sort((a, b) => a - b); d[i + k] = win[k][win[k].length >> 1]; }
      }
      break;
    }
    case 'oilify': {
      const r = Math.round(p.r), levels = Math.round(p.n);
      const cnt = new Uint16Array(levels), sr = new Uint32Array(levels), sg = new Uint32Array(levels), sb = new Uint32Array(levels);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        cnt.fill(0); sr.fill(0); sg.fill(0); sb.fill(0);
        for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
          const i = (yy * w + xx) * 4, lv = Math.min(levels - 1, ((lum(s[i], s[i + 1], s[i + 2]) / 255) * levels) | 0);
          cnt[lv]++; sr[lv] += s[i]; sg[lv] += s[i + 1]; sb[lv] += s[i + 2];
        }
        let best = 0; for (let k = 1; k < levels; k++) if (cnt[k] > cnt[best]) best = k;
        const i = (y * w + x) * 4; d[i] = sr[best] / cnt[best]; d[i + 1] = sg[best] / cnt[best]; d[i + 2] = sb[best] / cnt[best];
      }
      break;
    }
    case 'cartoon': {
      const n = Math.round(p.n) - 1;
      const edges = convolve(src, [-1, -1, -1, -1, 8, -1, -1, -1, -1]).data;
      for (let i = 0; i < d.length; i += 4) {
        const e = lum(edges[i], edges[i + 1], edges[i + 2]);
        for (let k = 0; k < 3; k++) d[i + k] = Math.round((s[i + k] / 255) * n) * (255 / n);
        if (e > 255 - p.e * 2.4) { d[i] = d[i + 1] = d[i + 2] = 20; }
      }
      break;
    }
    case 'halftone': {
      const cs = Math.round(p.s);
      d.fill(255); for (let i = 3; i < d.length; i += 4) d[i] = s[i];
      for (let cy = 0; cy < h; cy += cs) for (let cx = 0; cx < w; cx += cs) {
        let sum = 0, n = 0;
        for (let y = cy; y < Math.min(h, cy + cs); y++) for (let x = cx; x < Math.min(w, cx + cs); x++) { const i = (y * w + x) * 4; sum += lum(s[i], s[i + 1], s[i + 2]); n++; }
        const dark = 1 - Math.min(1, (sum / n / 255) * p.c * 0.9 + (1 - p.c) * 0.1);
        const rad = Math.sqrt(dark) * cs * 0.72, mx = cx + cs / 2, my = cy + cs / 2;
        for (let y = cy; y < Math.min(h, cy + cs); y++) for (let x = cx; x < Math.min(w, cx + cs); x++) {
          if (Math.hypot(x + 0.5 - mx, y + 0.5 - my) <= rad) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 20; }
        }
      }
      break;
    }
    case 'dither': {
      const n = Math.round(p.n) - 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * (255 / n);
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) d[i + k] = Math.round(clamp8(s[i + k] + t) / 255 * n) * (255 / n);
      }
      break;
    }
    case 'ripple': {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = p.v ? Math.sin((x / p.l) * 6.2832) * p.a : 0, dy = p.v ? 0 : Math.sin((y / p.l) * 6.2832) * p.a;
        sample(src, x + (p.v ? 0 : dy) + dx * 0, y + (p.v ? dx : 0), tmp);
        const i = (y * w + x) * 4; d[i] = tmp[0]; d[i + 1] = tmp[1]; d[i + 2] = tmp[2]; d[i + 3] = tmp[3];
      }
      break;
    }
    case 'twirl': {
      const cx = w / 2, cy = h / 2, R = (Math.min(w, h) / 2) * (p.r / 100), ang = (p.a * Math.PI) / 180, pinch = p.p / 100;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        const i = (y * w + x) * 4;
        if (r >= R) continue;
        const f = 1 - r / R, th = Math.atan2(dy, dx) + ang * f * f;
        const rr = r * Math.pow(r / R, -pinch * 0.8 + 0) ;
        const r2 = pinch >= 0 ? r * (1 - pinch * f) : r * (1 - pinch * f);
        void rr;
        sample(src, cx + Math.cos(th) * r2, cy + Math.sin(th) * r2, tmp);
        d[i] = tmp[0]; d[i + 1] = tmp[1]; d[i + 2] = tmp[2]; d[i + 3] = tmp[3];
      }
      break;
    }
    case 'glow': {
      const bright = new ImageData(new Uint8ClampedArray(s), w, h);
      for (let i = 0; i < bright.data.length; i += 4) { const l = lum(s[i], s[i + 1], s[i + 2]); if (l < p.t) { bright.data[i] = bright.data[i + 1] = bright.data[i + 2] = 0; } }
      for (let k = 0; k < 3; k++) boxBlur(bright, p.r / 2);
      const a = p.a / 100;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = clamp8(255 - ((255 - s[i + k]) * (255 - bright.data[i + k] * a)) / 255);
      break;
    }
    case 'dropshadow': {
      const sh = new ImageData(w, h);
      const ox = Math.round(p.x), oy = Math.round(p.y);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = x - ox, sy = y - oy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        sh.data[(y * w + x) * 4 + 3] = s[(sy * w + sx) * 4 + 3];
      }
      if (p.r > 0) for (let k = 0; k < 3; k++) boxBlur(sh, p.r / 2);
      const op = p.o / 100;
      for (let i = 0; i < d.length; i += 4) {
        const sa = (sh.data[i + 3] / 255) * op, a = s[i + 3] / 255, oa = a + sa * (1 - a);
        if (oa <= 0) { d[i + 3] = 0; continue; }
        d[i] = (s[i] * a) / oa; d[i + 1] = (s[i + 1] * a) / oa; d[i + 2] = (s[i + 2] * a) / oa; d[i + 3] = oa * 255;
      }
      break;
    }
    case 'bw': {
      const t = p.r + p.g + p.b || 1;
      for (let i = 0; i < d.length; i += 4) { const v = clamp8((d[i] * p.r + d[i + 1] * p.g + d[i + 2] * p.b) / t); d[i] = d[i + 1] = d[i + 2] = v; }
      break;
    }
    case 'noisehsv': for (let i = 0; i < d.length; i += 4) {
      const [hh, ss, ll] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      [d[i], d[i + 1], d[i + 2]] = hsl2rgb((hh + (Math.random() - 0.5) * p.a / 100 + 1) % 1, Math.min(1, ss * (1 + (Math.random() - 0.5) * p.a / 100)), ll);
    } break;
    case 'lens': {
      const cx = w / 2, cy = h / 2, k = p.a / 100;
      const nr = Math.hypot(cx, cy);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - cx) / nr, dy = (y - cy) / nr, r2 = dx * dx + dy * dy, f = 1 + k * r2;
        sample(src, cx + dx * f * nr, cy + dy * f * nr, tmp);
        const i = (y * w + x) * 4; d[i] = tmp[0]; d[i + 1] = tmp[1]; d[i + 2] = tmp[2]; d[i + 3] = tmp[3];
      }
      break;
    }
  }
  return out;
}

export function histogram(img: ImageData) {
  const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; h.r[d[i]]++; h.g[d[i + 1]]++; h.b[d[i + 2]]++; h.l[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; }
  return h;
}

/** Monotone cubic LUT through control points (0-255 range). */
export function curveLUT(points: { x: number; y: number }[]): number[] {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  const lut: number[] = new Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1].x - pts[i].x || 1e-6); m.push((pts[i + 1].y - pts[i].y) / dx[i]); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s2 = a * a + b * b;
    if (s2 > 9) { const k = 3 / Math.sqrt(s2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  for (let x = 0; x < 256; x++) {
    let i = 0; while (i < n - 2 && x > pts[i + 1].x) i++;
    if (x <= pts[0].x) { lut[x] = Math.round(pts[0].y); continue; }
    if (x >= pts[n - 1].x) { lut[x] = Math.round(pts[n - 1].y); continue; }
    const h = dx[i], u = (x - pts[i].x) / h, u2 = u * u, u3 = u2 * u;
    const v = (2 * u3 - 3 * u2 + 1) * pts[i].y + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * pts[i + 1].y + (u3 - u2) * h * t[i + 1];
    lut[x] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return lut;
}
