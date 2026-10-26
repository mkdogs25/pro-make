import type { Doc, Obj } from './model';

export interface Line { text: string; x: number; y: number; w: number; justify: boolean; colW: number }
export interface FrameLayout { lines: Line[]; overflow: boolean }

const mctx = document.createElement('canvas').getContext('2d')!;
export const fontString = (o: Pick<Obj, 'italic' | 'weight' | 'size' | 'font'>) =>
  `${o.italic ? 'italic ' : ''}${o.weight || 400} ${o.size || 16}px "${o.font || 'Inter'}"`;

function measure(s: string, o: Obj) {
  mctx.font = fontString(o);
  return mctx.measureText(s).width + (o.letterSpacing || 0) * s.length;
}

let cacheKey = '';
let cache = new Map<string, FrameLayout>();
let fontEpoch = 0;
export function invalidateText() { fontEpoch++; }

/** Lay out every text frame in the doc, flowing threaded chains across frames (and pages). */
export function layoutAll(doc: Doc): Map<string, FrameLayout> {
  const frames = doc.pages.flatMap(p => p.objects).filter(o => o.type === 'text');
  const key = fontEpoch + JSON.stringify(frames.map(f => [f.id, f.text, f.w, f.h, f.font, f.size, f.weight, f.italic, f.lineHeight, f.columns, f.gutter, f.linkNext, f.letterSpacing, f.align]));
  if (key === cacheKey) return cache;
  const byId = new Map(frames.map(f => [f.id, f]));
  const targets = new Set(frames.map(f => f.linkNext).filter(Boolean) as string[]);
  const out = new Map<string, FrameLayout>();
  for (const head of frames) {
    if (targets.has(head.id)) continue;
    const chain: Obj[] = [];
    const seen = new Set<string>();
    for (let f: Obj | undefined = head; f && !seen.has(f.id); f = f.linkNext ? byId.get(f.linkNext) : undefined) { seen.add(f.id); chain.push(f); }
    flow(head, chain, out);
  }
  // frames caught in a cycle
  for (const f of frames) if (!out.has(f.id)) flow(f, [f], out);
  cacheKey = key; cache = out;
  return out;
}

function flow(head: Obj, chain: Obj[], out: Map<string, FrameLayout>) {
  const style = head;
  const lh = (style.size || 16) * (style.lineHeight || 1.3);
  // tokens: words, with paragraph breaks
  const paras = (head.text || '').split('\n');
  type Tok = { w: string; br: boolean };
  const toks: Tok[] = [];
  paras.forEach((p, i) => {
    const words = p.split(/ +/).filter(Boolean);
    words.forEach(w => toks.push({ w, br: false }));
    if (i < paras.length - 1) toks.push({ w: '', br: true });
  });
  let ti = 0;
  const space = measure(' ', style);
  for (const f of chain) {
    const lines: Line[] = [];
    const cols = Math.max(1, f.columns || 1), gut = f.gutter || 0;
    const fw = f.w!, fh = f.h!;
    const colW = (fw - gut * (cols - 1)) / cols;
    for (let c = 0; c < cols && ti < toks.length; c++) {
      const cx = -fw / 2 + c * (colW + gut);
      let y = -fh / 2;
      while (ti < toks.length && y + lh <= fh / 2 + 0.5) {
        // build a line
        let line = '', lw = 0, ended = false;
        while (ti < toks.length) {
          const t = toks[ti];
          if (t.br) { ti++; ended = true; break; }
          const ww = measure(t.w, style);
          if (line && lw + space + ww > colW) break;
          if (!line && ww > colW) {
            // break an over-long word
            let cut = t.w.length;
            while (cut > 1 && measure(t.w.slice(0, cut), style) > colW) cut--;
            line = t.w.slice(0, cut); lw = measure(line, style);
            toks[ti] = { w: t.w.slice(cut), br: false };
            break;
          }
          line += (line ? ' ' : '') + t.w; lw += (lw ? space : 0) + ww; ti++;
        }
        const justify = !ended && ti < toks.length && !toks[ti].br;
        lines.push({ text: line, x: cx, y, w: lw, justify, colW });
        y += lh;
      }
    }
    out.set(f.id, { lines, overflow: false });
  }
  if (ti < toks.length && chain.length) out.get(chain[chain.length - 1].id)!.overflow = true;
  for (const f of chain) if (f !== chain[chain.length - 1]) out.get(f.id)!.overflow = false;
}

export function drawTextLines(ctx: CanvasRenderingContext2D, o: Obj, lay: FrameLayout | undefined, pageNo: number) {
  if (!lay) return;
  ctx.font = fontString(o);
  ctx.textBaseline = 'top';
  const ls = o.letterSpacing || 0;
  const lh = (o.size || 16) * (o.lineHeight || 1.3);
  const pad = (lh - (o.size || 16)) / 2;
  for (const l of lay.lines) {
    const text = l.text.replace(/\{page\}/g, String(pageNo));
    const align = o.align || 'left';
    const y = l.y + pad;
    if (align === 'justify' && l.justify) {
      const words = text.split(' ');
      if (words.length > 1) {
        const total = words.reduce((s, w) => s + ctx.measureText(w).width + ls * w.length, 0);
        const gap = (l.colW - total) / (words.length - 1);
        let x = l.x;
        for (const w of words) { drawSpaced(ctx, w, x, y, ls); x += ctx.measureText(w).width + ls * w.length + gap; }
        continue;
      }
    }
    const tw = ctx.measureText(text).width + ls * text.length;
    const x = align === 'center' ? l.x + (l.colW - tw) / 2 : align === 'right' || align === 'end' ? l.x + l.colW - tw : l.x;
    drawSpaced(ctx, text, x, y, ls);
  }
}

function drawSpaced(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, ls: number) {
  if (!ls) { ctx.fillText(s, x, y); return; }
  for (const ch of s) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + ls; }
}
