import { S, commit, emit, toast } from './store';
import { fitAll } from './ops';

export interface FindOpts { matchCase: boolean; whole: boolean }
export interface Hit { pageId: string; objId: string; kind: 'text' | 'cell'; r?: number; c?: number }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = (q: string, o: FindOpts) => new RegExp(o.whole ? `\\b${esc(q)}\\b` : esc(q), o.matchCase ? 'g' : 'gi');

export function findAll(q: string, o: FindOpts): Hit[] {
  if (!q) return [];
  const out: Hit[] = [];
  for (const pg of S.doc.pages) for (const ob of pg.objects) {
    if (ob.type === 'text' && re(q, o).test(ob.text || '')) out.push({ pageId: pg.id, objId: ob.id, kind: 'text' });
    if (ob.type === 'table') ob.cells?.forEach((row, r) => row.forEach((cell, c) => { if (re(q, o).test(cell)) out.push({ pageId: pg.id, objId: ob.id, kind: 'cell', r, c }); }));
  }
  return out;
}

export function goTo(h: Hit) {
  S.ui.pageId = h.pageId; S.ui.sel = [h.objId]; fitAll();
  emit();
}

export function replaceOne(h: Hit, q: string, rep: string, o: FindOpts) {
  const pg = S.doc.pages.find(p => p.id === h.pageId);
  const ob = pg?.objects.find(x => x.id === h.objId);
  if (!ob) return false;
  const one = new RegExp(re(q, o).source, o.matchCase ? '' : 'i');
  if (h.kind === 'text') ob.text = (ob.text || '').replace(one, () => rep);
  else if (ob.cells && h.r !== undefined && h.c !== undefined) ob.cells[h.r][h.c] = ob.cells[h.r][h.c].replace(one, () => rep);
  commit();
  return true;
}

export function replaceAllText(q: string, rep: string, o: FindOpts): number {
  let n = 0;
  const g = re(q, o);
  for (const pg of S.doc.pages) for (const ob of pg.objects) {
    if (ob.type === 'text' && ob.text) { const m = ob.text.match(g); if (m) { n += m.length; ob.text = ob.text.replace(g, () => rep); } }
    if (ob.type === 'table' && ob.cells) ob.cells = ob.cells.map(row => row.map(cell => { const m = cell.match(g); if (m) { n += m.length; return cell.replace(g, () => rep); } return cell; }));
  }
  if (n) commit(); else toast('No matches');
  return n;
}

export function docStats() {
  const pages = S.doc.pages.filter(p => !p.isMaster);
  let words = 0, chars = 0, frames = 0, images = 0, objects = 0, vectors = 0, tables = 0, rasters = 0;
  const fonts = new Set<string>();
  const lowRes: string[] = [];
  for (const pg of S.doc.pages) for (const o of pg.objects) {
    objects++;
    if (o.type === 'text') { frames++; fonts.add(o.font || 'Inter'); if (o.text) { words += (o.text.match(/\S+/g) || []).length; chars += o.text.length; } }
    else if (o.type === 'image') images++;
    else if (o.type === 'raster') rasters++;
    else if (o.type === 'table') { tables++; fonts.add(o.font || 'Inter'); }
    else if (['rect', 'ellipse', 'star', 'path'].includes(o.type)) vectors++;
  }
  return { pages: pages.length, masters: S.doc.pages.length - pages.length, layers: S.doc.layers.length, objects, frames, words, chars, images, rasters, vectors, tables, fonts: [...fonts], lowRes, styles: S.doc.styles.length, swatches: S.doc.swatches.length };
}
