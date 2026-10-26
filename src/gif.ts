// Small animated-GIF encoder: fixed 6×7×6 colour cube, 4×4 ordered dither, LZW compression.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class GifEncoder {
  private out: number[] = [];
  private w: number;
  private h: number;
  constructor(w: number, h: number, loops = 0) {
    this.w = w; this.h = h;
    const o = this.out;
    o.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0);
    for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) o.push(r * 51, Math.round(g * 42.5), b * 51);
    for (let i = 252; i < 256; i++) o.push(0, 0, 0);
    o.push(0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', c => c.charCodeAt(0)), 3, 1, loops & 255, loops >> 8, 0);
  }
  addFrame(rgba: Uint8ClampedArray, delayCs: number) {
    const { w, h, out: o } = this;
    const idx = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, d = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 36;
      const r = Math.max(0, Math.min(255, rgba[i] + d)), g = Math.max(0, Math.min(255, rgba[i + 1] + d)), b = Math.max(0, Math.min(255, rgba[i + 2] + d));
      idx[y * w + x] = Math.round(r / 51) * 42 + Math.round(g / 42.5) * 6 + Math.round(b / 51);
    }
    o.push(0x21, 0xf9, 4, 0, delayCs & 255, delayCs >> 8, 0, 0);
    o.push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0);
    // LZW
    const minCode = 8;
    o.push(minCode);
    const bytes: number[] = [];
    let bitBuf = 0, bitLen = 0;
    const emit = (code: number, size: number) => {
      bitBuf |= code << bitLen; bitLen += size;
      while (bitLen >= 8) { bytes.push(bitBuf & 255); bitBuf >>= 8; bitLen -= 8; }
    };
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1;
    let dict = new Map<number, number>();
    emit(clear, size);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const c = idx[i], key = (prefix << 8) | c, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix, size);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear, size); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      prefix = c;
    }
    emit(prefix, size); emit(eoi, size);
    if (bitLen > 0) bytes.push(bitBuf & 255);
    for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); o.push(n); for (let k = 0; k < n; k++) o.push(bytes[i + k]); }
    o.push(0);
  }
  finish(): Blob { this.out.push(0x3b); return new Blob([new Uint8Array(this.out)], { type: 'image/gif' }); }
}
