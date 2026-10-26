import { S, T, commit, emit, page, selected, toast, findObj } from './store';
import { newObj, newPage, uid } from './model';
import type { Obj } from './model';
import { dToSubpaths, recentrePath as recentre } from './geometry';
import * as ops from './ops';
import * as ink from './ink';
import * as io from './io';
import * as grain from './grain';
import * as motion from './motion';
import * as geometry from './geometry';
import * as model from './model';

/** The scripting API: available to the script console and as `window.promake`. */
export function makeApi() {
  const place = (o: Obj) => { o.layerId = ops.currentLayerId(); page().objects.push(o); return o; };
  const style = (o: Obj, p: Partial<Obj>) => Object.assign(o, p);
  return {
    S, T, commit, emit, toast, page, selected, findObj, ops, ink, io, grain, motion, geometry, model, newObj, newPage, uid,
    get doc() { return S.doc; },
    get objects() { return page().objects; },
    byName: (name: string) => page().objects.find(o => o.name === name),
    select: (...objs: Obj[]) => { S.ui.sel = objs.map(o => o.id); emit(); },
    rect: (x: number, y: number, w: number, h: number, p: Partial<Obj> = {}) => place(style(newObj('rect', '', { x: x + w / 2, y: y + h / 2, w, h, fill: S.ui.fg, stroke: S.ui.bg }), p)),
    ellipse: (cx: number, cy: number, w: number, h: number, p: Partial<Obj> = {}) => place(style(newObj('ellipse', '', { x: cx, y: cy, w, h, fill: S.ui.fg, stroke: S.ui.bg }), p)),
    text: (x: number, y: number, text: string, p: Partial<Obj> = {}) => place(style(newObj('text', '', { x: x + 160, y: y + 20, text }), p)),
    /** Add a path from SVG path data (M, L, H, V, C, Q, Z). */
    path: (d: string, p: Partial<Obj> = {}) => { const o = style(newObj('path', '', { subpaths: dToSubpaths(d), fill: S.ui.fg, stroke: S.ui.bg }), p); recentre(o); return place(o); },
    star: (cx: number, cy: number, size: number, points = 5, p: Partial<Obj> = {}) => place(style(newObj('star', '', { x: cx, y: cy, w: size, h: size, points, fill: S.ui.fg, stroke: S.ui.bg }), p)),
  };
}
export type Api = ReturnType<typeof makeApi>;

export const EXAMPLES: { name: string; code: string }[] = [
  { name: 'A grid of circles', code: `// Draw a 6 × 4 grid of coloured circles on the current page
const colours = ['#E76F51', '#F4A261', '#E9C46A', '#2A9D8F', '#264653'];
for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
  promake.ellipse(120 + c * 90, 120 + r * 90, 70, 70, { fill: colours[(r + c) % colours.length], stroke: null, strokeWidth: 0 });
}
promake.commit('Script: grid');` },
  { name: 'Randomise fill colours', code: `// Give every shape on the page a new random colour
for (const o of promake.objects) {
  if (['rect', 'ellipse', 'star', 'path'].includes(o.type) && o.fill) {
    o.fill = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
}
promake.commit('Script: random colours');` },
  { name: 'Spiral of stars', code: `// Stars along a spiral
for (let i = 0; i < 40; i++) {
  const a = i * 0.5, r = 14 + i * 7;
  promake.star(640 + Math.cos(a) * r, 360 + Math.sin(a) * r, 12 + i * 0.6, 5,
    { fill: 'hsl(' + (i * 9) + ', 80%, 60%)', stroke: null, strokeWidth: 0, rotation: i * 12 });
}
promake.commit('Script: spiral');` },
  { name: 'Rename and list objects', code: `// Number every object and print the list
promake.objects.forEach((o, i) => { o.name = String(i + 1).padStart(2, '0') + ' ' + o.name.replace(/^\\d+ /, ''); });
promake.commit('Script: rename');
console.log(promake.objects.map(o => o.name + ' (' + o.type + ')').join('\\n'));` },
  { name: 'Animate the selection', code: `// Add a bounce animation to the selected objects (use the Motion studio to play it)
const t = promake.geometry;
for (const o of promake.selected()) {
  o.keys = { y: [
    { t: 0, v: o.y, ease: 'ease' }, { t: 1, v: o.y - 120, ease: 'ease' }, { t: 2, v: o.y, ease: 'ease' },
  ] };
}
promake.commit('Script: bounce');` },
];

const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<unknown>;

export async function runScript(code: string, log: (s: string) => void): Promise<void> {
  const api = makeApi();
  const fmt = (v: unknown) => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, null, 1); } catch { return String(v); } })());
  const con = { log: (...a: unknown[]) => log(a.map(fmt).join(' ')), warn: (...a: unknown[]) => log('⚠ ' + a.map(fmt).join(' ')), error: (...a: unknown[]) => log('✖ ' + a.map(fmt).join(' ')) };
  try {
    const fn = new AsyncFunction('promake', 'console', code);
    const r = await fn(api, con);
    if (r !== undefined) log('→ ' + fmt(r));
    log('Done.');
  } catch (e) { log('✖ ' + (e as Error).message); }
  emit();
}
