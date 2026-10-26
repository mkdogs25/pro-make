import type { Doc, Obj } from './model';

export interface Word { text: string; x: number; w: number; b: boolean; i: boolean }
export interface Line { text: string; x: number; y: number; w: number; justify: boolean; colW: number; words: Word[]; indent: number }
export interface FrameLayout { lines: Line[]; overflow: boolean }

const mctx = document.createElement('canvas').getContext('2d')!;
type FontLike = Pick<Obj, 'italic' | 'weight' | 'size' | 'font'>;
export const fontString = (o: FontLike, bold = false, italic = false) =>
  `${o.italic || italic ? 'italic ' : ''}${bold ? Math.max(700, o.weight || 400) : o.weight || 400} ${o.size || 16}px "${o.font || 'Inter'}"`;

function measure(s: string, o: Obj, b = false, i = false) {
  mctx.font = fontString(o, b, i);
  return mctx.measureText(s).width + (o.letterSpacing || 0) * s.length;
}

let cacheKey = '';
let cache = new Map<string, FrameLayout>();
let fontEpoch = 0;
export function invalidateText() { fontEpoch++; }

interface Tok { w: string; br: boolean; b: boolean; i: boolean }

/** Split text into styled words. With markup on, **bold** and *italic* toggle styles. */
function tokenise(text: string, markup: boolean): Tok[] {
  const toks: Tok[] = [];
  const paras = text.split('\n');
  let bold = false, ital = false;
  paras.forEach((p, pi) => {
    let word = '';
    const flush = () => { if (word) { toks.push({ w: word, br: false, b: bold, i: ital }); word = ''; } };
    for (let k = 0; k < p.length; k++) {
      const ch = p[k];
      if (markup && ch === '*') {
        if (p[k + 1] === '*') { flush(); bold = !bold; k++; continue; }
        flush(); ital = !ital; continue;
      }
      if (ch === ' ') { flush(); continue; }
      word += ch;
      // keep a style change mid-word attached to the right run by flushing on the toggle
    }
    flush();
    if (pi < paras.length - 1) toks.push({ w: '', br: true, b: false, i: false });
  });
  return toks;
}

/** Lay out every text frame in the doc, flowing threaded chains across frames (and pages). */
export function layoutAll(doc: Doc): Map<string, FrameLayout> {
  const frames = doc.pages.flatMap(p => p.objects).filter(o => o.type === 'text');
  const key = fontEpoch + JSON.stringify(frames.map(f => [f.id, f.text, f.w, f.h, f.font, f.size, f.weight, f.italic, f.lineHeight, f.columns, f.gutter, f.linkNext, f.letterSpacing, f.align, f.markup, f.indent, f.paraSpace, f.valign, f.wordSpacing, f.textPath]));
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
  for (const f of frames) if (!out.has(f.id)) flow(f, [f], out);
  cacheKey = key; cache = out;
  return out;
}

function flow(head: Obj, chain: Obj[], out: Map<string, FrameLayout>) {
  const style = head;
  const lh = (style.size || 16) * (style.lineHeight || 1.3);
  const toks = tokenise(head.text || '', !!head.markup);
  const space = measure(' ', style) + (head.wordSpacing || 0);
  const indent = head.indent || 0, paraSpace = head.paraSpace || 0;
  let ti = 0;
  let newPara = true;
  for (const f of chain) {
    const lines: Line[] = [];
    const cols = Math.max(1, f.columns || 1), gut = f.gutter || 0;
    const fw = f.w!, fh = f.h!;
    const colW = (fw - gut * (cols - 1)) / cols;
    for (let c = 0; c < cols && ti < toks.length; c++) {
      const cx = -fw / 2 + c * (colW + gut);
      let y = -fh / 2;
      while (ti < toks.length && y + lh <= fh / 2 + 0.5) {
        const ind = newPara ? indent : 0;
        const avail = colW - ind;
        const words: { t: string; w: number; b: boolean; i: boolean }[] = [];
        let lw = 0, ended = false;
        while (ti < toks.length) {
          const t = toks[ti];
          if (t.br) { ti++; ended = true; break; }
          const ww = measure(t.w, style, t.b, t.i);
          if (words.length && lw + space + ww > avail) break;
          if (!words.length && ww > avail) {
            let cut = t.w.length;
            while (cut > 1 && measure(t.w.slice(0, cut), style, t.b, t.i) > avail) cut--;
            const part = t.w.slice(0, cut);
            words.push({ t: part, w: measure(part, style, t.b, t.i), b: t.b, i: t.i });
            lw = words[0].w;
            toks[ti] = { ...t, w: t.w.slice(cut) };
            break;
          }
          words.push({ t: t.w, w: ww, b: t.b, i: t.i });
          lw += (words.length > 1 ? space : 0) + ww;
          ti++;
        }
        const last = ended || ti >= toks.length || toks[ti].br;
        const justify = !last;
        // position words
        const align = style.align || 'left';
        let gap = space;
        let x = cx + ind;
        if (align === 'justify' && justify && words.length > 1) gap = (avail - words.reduce((s, w) => s + w.w, 0)) / (words.length - 1);
        else if (align === 'center') x = cx + ind + (avail - lw) / 2;
        else if (align === 'right' || align === 'end') x = cx + ind + (avail - lw);
        const placed: Word[] = [];
        for (const w of words) { placed.push({ text: w.t, x, w: w.w, b: w.b, i: w.i }); x += w.w + gap; }
        lines.push({ text: words.map(w => w.t).join(' '), x: cx, y, w: lw, justify, colW, words: placed, indent: ind });
        y += lh;
        newPara = ended;
        if (ended && paraSpace) y += paraSpace;
      }
    }
    // vertical alignment inside the frame
    if (f.valign && f.valign !== 'top' && lines.length) {
      const used = Math.max(...lines.map(l => l.y + lh)) + fh / 2;
      const shift = f.valign === 'middle' ? (fh - used) / 2 : fh - used;
      if (shift > 0) for (const l of lines) { l.y += shift; }
    }
    out.set(f.id, { lines, overflow: false });
  }
  if (ti < toks.length && chain.length) out.get(chain[chain.length - 1].id)!.overflow = true;
}

export function drawTextLines(ctx: CanvasRenderingContext2D, o: Obj, lay: FrameLayout | undefined, pageNo: number) {
  if (!lay) return;
  ctx.textBaseline = 'top';
  const ls = o.letterSpacing || 0;
  const lh = (o.size || 16) * (o.lineHeight || 1.3);
  const pad = (lh - (o.size || 16)) / 2;
  const stroke = !!o.stroke && o.strokeWidth > 0 && typeof o.stroke === 'string';
  if (stroke) { ctx.strokeStyle = o.stroke as string; ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round'; }
  const put = (s: string, x: number, y: number) => {
    if (!ls) { if (stroke) ctx.strokeText(s, x, y); ctx.fillText(s, x, y); return; }
    for (const ch of s) { if (stroke) ctx.strokeText(ch, x, y); ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + ls; }
  };
  for (const l of lay.lines) {
    const y = l.y + pad;
    if (l.text.includes('{page}')) {
      ctx.font = fontString(o);
      const text = l.text.replace(/\{page\}/g, String(pageNo));
      const tw = ctx.measureText(text).width + ls * text.length;
      const align = o.align || 'left';
      const x = align === 'center' ? l.x + (l.colW - tw) / 2 : align === 'right' || align === 'end' ? l.x + l.colW - tw : l.x + l.indent;
      put(text, x, y);
      continue;
    }
    for (const w of l.words) { ctx.font = fontString(o, w.b, w.i); put(w.text, w.x, y); }
  }
}
