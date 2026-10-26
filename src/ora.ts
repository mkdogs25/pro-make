import { S, commit, page, toast } from './store';
import { newObj, newPage } from './model';
import type { Obj } from './model';
import { pageBox, unionBox } from './geometry';
import { makeCanvas, storeRaster } from './raster';
import { renderObjectsToCanvas } from './ops';
import { renderPage } from './render';
import { unzip, zipFiles } from './zip';

const BLEND: Record<string, string> = { 'source-over': 'svg:src-over', multiply: 'svg:multiply', screen: 'svg:screen', overlay: 'svg:overlay', darken: 'svg:darken', lighten: 'svg:lighten', 'color-dodge': 'svg:color-dodge', 'color-burn': 'svg:color-burn', 'hard-light': 'svg:hard-light', 'soft-light': 'svg:soft-light', difference: 'svg:difference', exclusion: 'svg:exclusion', hue: 'svg:hue', saturation: 'svg:saturation', color: 'svg:color', luminosity: 'svg:luminosity' };
const UNBLEND = Object.fromEntries(Object.entries(BLEND).map(([k, v]) => [v, k]));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const png = (c: HTMLCanvasElement) => new Promise<Uint8Array>(r => c.toBlob(async b => r(new Uint8Array(await b!.arrayBuffer())), 'image/png'));

/** Export the current page as an OpenRaster file: every object becomes its own layer. */
export async function exportORA(): Promise<Blob> {
  const pg = page();
  const files: { name: string; data: Uint8Array }[] = [{ name: 'mimetype', data: new TextEncoder().encode('image/openraster') }];
  const layers: string[] = [];
  const ordered: Obj[] = [];
  for (const l of S.doc.layers) for (const o of pg.objects) if ((S.doc.layers.some(x => x.id === o.layerId) ? o.layerId : S.doc.layers[0].id) === l.id && !o.isClip) ordered.push(o);
  let i = 0;
  if (pg.bg) {
    const c = makeCanvas(pg.w, pg.h); const x = c.getContext('2d')!; x.fillStyle = pg.bg; x.fillRect(0, 0, pg.w, pg.h);
    files.push({ name: 'data/layer0.png', data: await png(c) });
    layers.push(`<layer name="Page background" src="data/layer0.png" x="0" y="0" opacity="1.0" visibility="visible" composite-op="svg:src-over"/>`);
    i = 1;
  }
  for (const o of ordered) {
    const b = unionBox([pageBox(o, 0)])!;
    const bx = { x: Math.floor(b.x), y: Math.floor(b.y), w: Math.max(1, Math.ceil(b.w + 2)), h: Math.max(1, Math.ceil(b.h + 2)) };
    const c = renderObjectsToCanvas([{ ...o, blend: 'source-over' }], bx, 0);
    const src = `data/layer${i}.png`;
    files.push({ name: src, data: await png(c) });
    layers.push(`<layer name="${esc(o.name)}" src="${src}" x="${bx.x}" y="${bx.y}" opacity="1.0" visibility="${o.visible ? 'visible' : 'hidden'}" composite-op="${BLEND[o.blend] || 'svg:src-over'}"/>`);
    i++;
  }
  const merged = makeCanvas(pg.w, pg.h);
  renderPage(merged.getContext('2d')!, S.doc, pg, { time: 0, print: true });
  const th = makeCanvas(Math.min(256, pg.w), Math.max(1, Math.round((Math.min(256, pg.w) * pg.h) / pg.w)));
  th.getContext('2d')!.drawImage(merged, 0, 0, th.width, th.height);
  files.push({ name: 'mergedimage.png', data: await png(merged) }, { name: 'Thumbnails/thumbnail.png', data: await png(th) });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="${pg.w}" h="${pg.h}"><stack>${layers.reverse().join('')}</stack></image>`;
  files.splice(1, 0, { name: 'stack.xml', data: new TextEncoder().encode(xml) });
  return zipFiles(files);
}

const loadImg = (data: Uint8Array) => new Promise<HTMLImageElement>((res, rej) => {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/png' }));
  const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = rej; im.src = url;
});

/** Import an OpenRaster file (from GIMP, Krita, MyPaint…) as a new page with one pixel layer per ORA layer. */
export async function importORA(file: File) {
  const entries = await unzip(await file.arrayBuffer());
  const xmlBytes = entries.get('stack.xml');
  if (!xmlBytes) throw new Error('This OpenRaster file has no stack.xml');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
  const root = xml.documentElement;
  const W = +(root.getAttribute('w') || 0), H = +(root.getAttribute('h') || 0);
  const pg = newPage(file.name.replace(/\.ora$/i, ''), W || 1024, H || 768, { bg: null, columns: 1 });
  const layerId = S.doc.layers[0].id;
  const nodes: Element[] = [];
  const walk = (el: Element, ox: number, oy: number) => {
    // children are listed top-to-bottom; walk reversed so the bottom layer is added first
    for (const ch of [...el.children].reverse()) {
      if (ch.tagName === 'stack') walk(ch, ox + +(ch.getAttribute('x') || 0), oy + +(ch.getAttribute('y') || 0));
      else if (ch.tagName === 'layer') { ch.setAttribute('__ox', String(ox)); ch.setAttribute('__oy', String(oy)); nodes.push(ch); }
    }
  };
  walk(root.querySelector('stack')!, 0, 0);
  for (const n of nodes) {
    const data = entries.get(n.getAttribute('src') || '');
    if (!data) continue;
    const im = await loadImg(data);
    const c = makeCanvas(im.naturalWidth, im.naturalHeight);
    c.getContext('2d')!.drawImage(im, 0, 0);
    const x = +(n.getAttribute('x') || 0) + +(n.getAttribute('__ox') || 0), y = +(n.getAttribute('y') || 0) + +(n.getAttribute('__oy') || 0);
    const o = newObj('raster', layerId, {
      name: n.getAttribute('name') || 'Layer', x: x + c.width / 2, y: y + c.height / 2, w: c.width, h: c.height,
      opacity: parseFloat(n.getAttribute('opacity') || '1'), visible: n.getAttribute('visibility') !== 'hidden', blend: (UNBLEND[n.getAttribute('composite-op') || ''] || 'source-over') as GlobalCompositeOperation,
    });
    storeRaster(o, c);
    pg.objects.push(o);
  }
  if (!pg.objects.length) throw new Error('No layers found in that file');
  S.doc.pages.push(pg);
  S.ui.pageId = pg.id; S.ui.sel = [];
  for (const v of Object.values(S.ui.views)) v.fitted = false;
  commit('Import OpenRaster');
  toast(`Imported ${pg.objects.length} layer${pg.objects.length > 1 ? 's' : ''} from ${file.name}`);
}
