import { defaultFx, newObj, newPage, uid } from './model';
import type { Doc, Gradient, Key, Obj, Paint } from './model';
import { dToSubpaths, recentrePath } from './geometry';

function pathObj(name: string, layerId: string, d: string, fill: Paint, stroke: Paint = '#2B5D8C', sw = 3, extra: Partial<Obj> = {}): Obj {
  const o = newObj('path', layerId, { name, subpaths: dToSubpaths(d), fill, stroke, strokeWidth: sw, ...extra });
  recentrePath(o);
  return o;
}

function drift(o: Obj, dx: number, dy: number, dur: number) {
  const kx: Key[] = [{ t: 0, v: o.x, ease: 'ease' }, { t: dur, v: o.x + dx, ease: 'ease' }];
  const ky: Key[] = [{ t: 0, v: o.y, ease: 'ease' }, { t: dur, v: o.y + dy, ease: 'ease' }];
  o.keys = { ...(dx ? { x: kx } : {}), ...(dy ? { y: ky } : {}) };
}

const cloudD = (cx: number, cy: number, s: number) => {
  const p = (x: number, y: number) => `${cx + x * s} ${cy + y * s}`;
  return `M${p(-90, 20)} C${p(-118, 20)} ${p(-116, -18)} ${p(-82, -16)} C${p(-84, -48)} ${p(-36, -56)} ${p(-20, -32)} ` +
    `C${p(-8, -66)} ${p(44, -66)} ${p(52, -26)} C${p(84, -40)} ${p(112, -8)} ${p(92, 20)} Z`;
};

export function sampleDoc(): Doc {
  const L = { bg: uid('l'), land: uid('l'), clouds: uid('l'), balloon: uid('l'), text: uid('l') };
  const sky: Gradient = { kind: 'linear', angle: 90, stops: [{ o: 0, c: '#F7EBD3' }, { o: 1, c: '#F2C7A0' }] };

  const scene = newPage('Balloon Journey', 1280, 720, { bg: '#F7EBD3', columns: 1 });
  const objs: Obj[] = [];
  objs.push(newObj('rect', L.bg, { name: 'Sky', x: 640, y: 360, w: 1280, h: 720, fill: sky, stroke: null, strokeWidth: 0, locked: true }));
  objs.push(newObj('ellipse', L.bg, { name: 'Sun', x: 1030, y: 170, w: 150, h: 150, fill: '#F8D342', stroke: null, strokeWidth: 0, opacity: 0.9 }));
  objs.push(pathObj('Far range', L.land, 'M0 560 L120 470 L220 520 L330 430 L470 540 L600 470 L760 560 L900 450 L1040 520 L1160 460 L1280 520 L1280 720 L0 720 Z', '#2B5D8C', null, 0, { opacity: 0.85 }));
  objs.push(pathObj('Mountains', L.land, 'M60 720 L260 430 L330 470 L420 360 L560 600 L640 520 L720 590 L840 400 L910 450 L1000 380 L1180 720 Z', '#A68A64'));
  objs.push(pathObj('Snow cap 1', L.land, 'M420 360 L450 412 L432 405 L418 420 L400 400 L388 414 Z', '#F4F1EA', '#2B5D8C', 2));
  objs.push(pathObj('Snow cap 2', L.land, 'M1000 380 L1040 440 L1020 432 L1005 446 L988 430 L972 440 Z', '#F4F1EA', '#2B5D8C', 2));
  objs.push(pathObj('Snow cap 3', L.land, 'M840 400 L868 444 L852 438 L838 450 L824 436 L812 446 Z', '#F4F1EA', '#2B5D8C', 2));
  objs.push(pathObj('Road', L.land, 'M640 720 C600 660 720 640 690 600 C660 560 600 560 640 520', null, '#F3E2C3', 14));

  const clouds = [cloudD(300, 250, 1.2), cloudD(880, 300, 1), cloudD(560, 170, 0.8)].map((d, i) =>
    pathObj(`Cloud ${i + 1}`, L.clouds, d, '#FFFDF7', '#2B5D8C', 2.5));
  clouds.forEach((c, i) => drift(c, [70, -60, 40][i], 0, 8));
  objs.push(...clouds);

  const bx = 0, by = 0;
  const balloon = [
    pathObj('Envelope', L.balloon, `M640 140 C720 140 760 200 760 260 C760 330 700 370 680 400 L600 400 C580 370 520 330 520 260 C520 200 560 140 640 140 Z`, '#E76F51'),
    pathObj('Crown', L.balloon, 'M640 140 C720 140 760 200 760 260 C700 240 580 240 520 260 C520 200 560 140 640 140 Z', '#E9E4DA'),
    pathObj('Band', L.balloon, 'M520 260 C580 240 700 240 760 260 C758 290 748 310 735 325 C690 305 590 305 545 325 C532 310 522 290 520 260 Z', '#F8D342'),
    pathObj('Seams', L.balloon, 'M640 140 C620 220 620 320 640 400 M640 140 C595 200 565 300 605 400 M640 140 C685 200 715 300 675 400', null, '#2B5D8C', 2),
    pathObj('Ropes', L.balloon, 'M605 400 L622 442 M675 400 L658 442', null, '#2B5D8C', 2),
    newObj('rect', L.balloon, { name: 'Basket', x: 640, y: 458, w: 44, h: 34, rx: 5, fill: '#8B5E3C' }),
  ];
  balloon.forEach(o => {
    o.x += bx; o.y += by;
    o.keys = {
      x: [{ t: 0, v: o.x - 160, ease: 'ease' }, { t: 4, v: o.x, ease: 'ease' }, { t: 8, v: o.x + 120, ease: 'ease' }],
      y: [{ t: 0, v: o.y + 150, ease: 'ease' }, { t: 4, v: o.y, ease: 'ease' }, { t: 8, v: o.y - 40, ease: 'ease' }],
    };
  });
  objs.push(...balloon);
  scene.objects = objs;

  // ----- print pages -----
  const master = newPage('A-Master', 794, 1123, { isMaster: true, bg: null });
  master.objects = [
    newObj('rect', L.text, { name: 'Footer rule', x: 397, y: 1072, w: 698, h: 1.5, fill: '#A68A64', stroke: null, strokeWidth: 0 }),
    newObj('text', L.text, { name: 'Folio', x: 397, y: 1092, w: 698, h: 24, text: 'Field Notes · page {page}', font: 'Inter', size: 11, fill: '#7A6A55', align: 'center' }),
  ];

  const poster = newPage('Field Notes', 794, 1123, { masterId: master.id, columns: 2 });
  const body1 = newObj('text', L.text, {
    name: 'Story (1)', x: 397, y: 846, w: 698, h: 300, columns: 2, gutter: 22, font: 'Lora', size: 14, lineHeight: 1.6, align: 'justify', styleId: 'st-body',
    text: 'We left the valley before dawn, when the air was cool and still enough to hold a balloon in the palm of the sky. The burner roared, the envelope swelled into its striped crown, and the basket lifted from the frost as gently as a held breath.\n\n' +
      'Below us the road unspooled between the ridges, a pale ribbon stitched through the foothills. Clouds drifted past at eye level, slow and enormous, their undersides tinted gold by the rising sun.\n\n' +
      'Every artwork in this document is shared. The balloon drawn in Ink is the same one animated in Motion, retouched in Grain and placed on this page in Print. Change it anywhere and it changes everywhere.\n\n' +
      'By mid-morning the thermals began to build. We traded altitude for distance, following the river toward the far range, where snow still clung to the highest peaks like folded paper.',
  });
  const body2 = newObj('text', L.text, {
    name: 'Story (2)', x: 397, y: 1018, w: 698, h: 40, columns: 2, gutter: 22, font: 'Lora', size: 14, lineHeight: 1.6, align: 'justify', styleId: 'st-body', text: '',
  });
  body1.linkNext = body2.id;
  poster.objects = [
    newObj('embed', L.balloon, { name: 'Balloon Journey (placed)', pageId: scene.id, x: 397, y: 300, w: 698, h: 392.6 }),
    newObj('rect', L.bg, { name: 'Photo frame', x: 397, y: 300, w: 698, h: 392.6, fill: null, stroke: '#3B2F22', strokeWidth: 1 }),
    newObj('text', L.text, { name: 'Kicker', x: 397, y: 72, w: 698, h: 24, text: 'ISSUE 04 · AUTUMN', font: 'Inter', size: 12, weight: 600, fill: '#C8803A', letterSpacing: 2, styleId: 'st-cap' }),
    newObj('text', L.text, { name: 'Headline', x: 397, y: 560, w: 698, h: 120, text: 'The Balloon Journey', font: 'Fraunces', size: 56, weight: 700, fill: '#3B2F22', styleId: 'st-head' }),
    newObj('text', L.text, { name: 'Standfirst', x: 397, y: 640, w: 698, h: 60, text: 'One illustration, four studios: drawn, painted, laid out and set in motion.', font: 'Lora', size: 18, italic: true, fill: '#5C4B37' }),
    body1, body2,
  ];

  return {
    version: 1,
    name: 'Balloon Journey',
    pages: [master, scene, poster],
    layers: [
      { id: L.bg, name: 'Background', visible: true, locked: false, opacity: 1 },
      { id: L.land, name: 'Landscape', visible: true, locked: false, opacity: 1 },
      { id: L.clouds, name: 'Clouds', visible: true, locked: false, opacity: 1 },
      { id: L.balloon, name: 'Balloon', visible: true, locked: false, opacity: 1, open: true },
      { id: L.text, name: 'Text', visible: true, locked: false, opacity: 1 },
    ],
    swatches: ['#2B5D8C', '#F8D342', '#E76F51', '#A68A64', '#E9E4DA', '#8B5E3C', '#2A9D8F', '#264653', '#F4A261', '#FFFDF7', '#3B2F22', '#000000'],
    styles: [
      { id: 'st-head', name: 'Headline', font: 'Fraunces', size: 56, weight: 700, italic: false, lineHeight: 1.1, align: 'left', color: '#3B2F22', letterSpacing: 0 },
      { id: 'st-body', name: 'Body', font: 'Lora', size: 14, weight: 400, italic: false, lineHeight: 1.6, align: 'justify', color: '#3B2F22', letterSpacing: 0 },
      { id: 'st-cap', name: 'Kicker', font: 'Inter', size: 12, weight: 600, italic: false, lineHeight: 1.3, align: 'left', color: '#C8803A', letterSpacing: 2 },
    ],
    timeline: {
      w: 1280, h: 720, fps: 30, loop: true,
      tracks: [
        { id: uid('t'), kind: 'video', name: 'V2', muted: false, hidden: false, locked: false, clips: [
          { id: uid('c'), kind: 'title', name: 'Title', start: 0.5, dur: 3.5, offset: 0, speed: 1, volume: 1, opacity: 1, fadeIn: 0.6, fadeOut: 0.6, x: 640, y: 600, scale: 1, fx: defaultFx(), text: 'The Balloon Journey', fontSize: 64, color: '#3B2F22', font: 'Fraunces' },
        ] },
        { id: uid('t'), kind: 'video', name: 'V1', muted: false, hidden: false, locked: false, clips: [
          { id: uid('c'), kind: 'scene', name: 'Balloon Journey', pageId: scene.id, start: 0, dur: 8, offset: 0, speed: 1, volume: 1, opacity: 1, fadeIn: 0, fadeOut: 0.8, x: 0, y: 0, scale: 1, fx: defaultFx() },
        ] },
        { id: uid('t'), kind: 'audio', name: 'A1', muted: false, hidden: false, locked: false, clips: [] },
      ],
    },
    media: [],
  };
}
