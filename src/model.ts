// Shared document model. One document feeds all four modes: Ink edits its
// shapes, Grain paints its rasters, Print lays its pages out, and Motion
// animates them on a timeline.

export type Mode = 'motion' | 'ink' | 'print' | 'grain';

export interface GradientStop { o: number; c: string }
export interface Gradient { kind: 'linear' | 'radial'; angle: number; stops: GradientStop[] }
export type PatternKind = 'stripes' | 'dots' | 'checks' | 'grid' | 'cross' | 'waves' | 'diagonal';
export interface Pattern { kind: 'pattern'; pattern: PatternKind; c1: string; c2: string; size: number; angle: number }
export type Paint = string | Gradient | Pattern | null;
export const isGradient = (p: Paint): p is Gradient => !!p && typeof p !== 'string' && (p.kind === 'linear' || p.kind === 'radial');
export const isPattern = (p: Paint): p is Pattern => !!p && typeof p !== 'string' && p.kind === 'pattern';

/** A bezier node. Handles are absolute local coordinates; a handle equal to the node means "no handle". */
export interface PNode { x: number; y: number; ix: number; iy: number; ox: number; oy: number; smooth?: boolean }
export interface SubPath { nodes: PNode[]; closed: boolean }

export type AnimProp = 'x' | 'y' | 'rotation' | 'sx' | 'sy' | 'opacity';
export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'rotation', 'sx', 'sy', 'opacity'];
export type Ease = 'linear' | 'ease' | 'in' | 'out' | 'hold';
export interface Key { t: number; v: number; ease: Ease }

export type ObjType = 'rect' | 'ellipse' | 'star' | 'path' | 'text' | 'raster' | 'embed' | 'image' | 'table';
export type Marker = 'none' | 'arrow' | 'triangle' | 'dot' | 'square' | 'diamond' | 'bar';
export interface Shadow { dx: number; dy: number; blur: number; color: string }

export interface Obj {
  id: string;
  type: ObjType;
  name: string;
  layerId: string;
  // transform: (x, y) is the centre of the local geometry
  x: number; y: number; rotation: number; sx: number; sy: number;
  opacity: number;
  blend: GlobalCompositeOperation;
  visible: boolean;
  locked: boolean;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
  dash?: number[] | null;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  fillRule?: CanvasFillRule;
  keys?: Partial<Record<AnimProp, Key[]>>;
  // geometry
  w?: number; h?: number;
  rx?: number;                       // rect corner radius
  points?: number; inner?: number; polygon?: boolean; // star / polygon
  subpaths?: SubPath[];              // path
  // text
  text?: string; font?: string; size?: number; weight?: number; italic?: boolean;
  lineHeight?: number; align?: CanvasTextAlign | 'justify'; columns?: number; gutter?: number;
  linkNext?: string | null; styleId?: string | null; frameFill?: string | null; letterSpacing?: number;
  // raster
  src?: string; rev?: string;
  // embed (a live placement of another page)
  pageId?: string;
  // shared extras
  group?: string;                    // objects with the same group id move and select together
  clipBy?: string;                   // id of the object whose outline clips this one
  isClip?: boolean;                  // this object is used as a clip outline and isn't drawn itself
  blur?: number;                     // object blur radius (page units)
  shadow?: Shadow | null;
  markerStart?: Marker; markerEnd?: Marker;
  // text extras
  textPath?: string | null;          // id of a path to run the text along
  textOffset?: number;
  indent?: number; paraSpace?: number; valign?: 'top' | 'middle' | 'bottom'; markup?: boolean; wordSpacing?: number;
  // image frame (Print)
  fit?: 'fit' | 'fill' | 'stretch' | 'none'; imgX?: number; imgY?: number; imgScale?: number; imgRot?: number;
  // table (Print)
  rows?: number; cols?: number; cells?: string[][]; colW?: number[]; rowH?: number[]; pad?: number;
  headerFill?: string | null; header?: boolean; zebra?: string | null; borderColor?: string; borderW?: number;
  // raster extras (Grain)
  maskSrc?: string; maskRev?: string; lockAlpha?: boolean;
  // layout extras
  wrap?: boolean; wrapPad?: number;   // text in other frames flows around this object
  dropCap?: number;                   // lines tall (text frames)
  href?: string;                      // link target for PDF export (https://… or #page:N)
}

export interface Layer { id: string; name: string; visible: boolean; locked: boolean; opacity: number; open?: boolean; printable?: boolean }

export interface Page {
  id: string; name: string; w: number; h: number; bg: string | null;
  objects: Obj[];
  guides: { x: number[]; y: number[] };
  margins: { t: number; r: number; b: number; l: number };
  columns: number; gutter: number; bleed: number;
  isMaster?: boolean; masterId?: string | null;
}

export interface ParaStyle {
  id: string; name: string; font: string; size: number; weight: number; italic: boolean;
  lineHeight: number; align: CanvasTextAlign | 'justify'; color: string; letterSpacing: number;
}

export interface Media { id: string; kind: 'video' | 'audio' | 'image'; name: string; url: string; duration: number; w: number; h: number }

export interface ClipFx { brightness: number; contrast: number; saturate: number; hue: number; blur: number; grayscale: number; sepia: number }
export type FilterType = 'invert' | 'mirror' | 'flip' | 'crop' | 'chroma' | 'vignette' | 'pixelate' | 'sharpen' | 'glow' | 'tint' | 'posterize' | 'noise' | 'rotate' | 'scale' | 'wave' | 'duotone';
export interface ClipFilter { id: string; type: FilterType; on: boolean; params: Record<string, number | string> }
export type TransitionType = 'dissolve' | 'wipel' | 'wiper' | 'wipeu' | 'wiped' | 'slidel' | 'slider' | 'zoom' | 'dip' | 'iris' | 'barn';
export type ClipProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';
export const CLIP_PROPS: ClipProp[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];
export interface Clip {
  id: string; kind: 'scene' | 'media' | 'title' | 'color' | 'countdown' | 'bars'; name: string;
  mediaId?: string; pageId?: string;
  start: number; dur: number; offset: number; speed: number;
  volume: number; opacity: number; fadeIn: number; fadeOut: number;
  x: number; y: number; scale: number;
  fx: ClipFx;
  text?: string; fontSize?: number; color?: string; font?: string;
  filters?: ClipFilter[]; trans?: TransitionType; keys?: Partial<Record<ClipProp, Key[]>>;
  rotation?: number; freeze?: boolean; pan?: number;
  // title extras
  weight?: number; italic?: boolean; align?: CanvasTextAlign; outline?: number; outlineColor?: string;
  shadow?: boolean; box?: string | null; anim?: 'none' | 'fade' | 'slideup' | 'typewriter' | 'zoom' | 'slideleft'; letterSpacing?: number;
  color2?: string; seconds?: number;
}
export interface Track { id: string; kind: 'video' | 'audio'; name: string; muted: boolean; hidden: boolean; locked: boolean; clips: Clip[]; volume?: number; pan?: number; solo?: boolean; tall?: boolean }
export interface Marker2 { id: string; t: number; label: string; color: string }
export interface Timeline { w: number; h: number; fps: number; tracks: Track[]; loop: boolean; markers?: Marker2[]; inPoint?: number | null; outPoint?: number | null; master?: number }

export interface Doc {
  version: 1;
  name: string;
  pages: Page[];
  layers: Layer[];
  swatches: string[];
  styles: ParaStyle[];
  timeline: Timeline;
  media: Media[];
}

let counter = 0;
export const uid = (p = 'o') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const defaultFx = (): ClipFx => ({ brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 });

export function newObj(type: ObjType, layerId: string, props: Partial<Obj> = {}): Obj {
  const base: Obj = {
    id: uid(), type, name: type[0].toUpperCase() + type.slice(1), layerId,
    x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 1, blend: 'source-over',
    visible: true, locked: false, fill: '#E9C46A', stroke: '#2B5D8C', strokeWidth: 2,
    cap: 'round', join: 'round',
  };
  if (type === 'text') Object.assign(base, {
    w: 320, h: 80, text: 'Type here', font: 'Inter', size: 24, weight: 400, italic: false, lineHeight: 1.3,
    align: 'left', columns: 1, gutter: 16, fill: '#3B2F22', stroke: null, strokeWidth: 0, linkNext: null, letterSpacing: 0,
  });
  if (type === 'star') Object.assign(base, { points: 5, inner: 0.45, polygon: false });
  if (type === 'raster') Object.assign(base, { fill: null, stroke: null, strokeWidth: 0 });
  if (type === 'image') Object.assign(base, { fill: '#EFE6D2', stroke: null, strokeWidth: 0, w: 300, h: 200, fit: 'fill', imgX: 0, imgY: 0, imgScale: 1, imgRot: 0 });
  if (type === 'table') Object.assign(base, {
    w: 480, h: 150, rows: 3, cols: 3, cells: [['Item', 'Detail', 'Value'], ['', '', ''], ['', '', '']], pad: 8, header: true,
    headerFill: '#E9D9B8', zebra: null, borderColor: '#8A7860', borderW: 1, font: 'Inter', size: 14, weight: 400, italic: false,
    lineHeight: 1.3, align: 'left', fill: '#3B2F22', stroke: null, strokeWidth: 0, frameFill: null,
  });
  if (type === 'embed') Object.assign(base, { fill: null, stroke: null, strokeWidth: 0 });
  return Object.assign(base, props);
}

export function newPage(name: string, w: number, h: number, props: Partial<Page> = {}): Page {
  return {
    id: uid('p'), name, w, h, bg: '#FFFDF7', objects: [], guides: { x: [], y: [] },
    margins: { t: 48, r: 48, b: 48, l: 48 }, columns: 2, gutter: 18, bleed: 9, masterId: null, ...props,
  };
}

export const PAGE_PRESETS: { name: string; w: number; h: number }[] = [
  { name: 'A4 portrait', w: 794, h: 1123 },
  { name: 'A4 landscape', w: 1123, h: 794 },
  { name: 'A5 portrait', w: 559, h: 794 },
  { name: 'US Letter', w: 816, h: 1056 },
  { name: 'Square 1080', w: 1080, h: 1080 },
  { name: 'HD 16:9', w: 1280, h: 720 },
  { name: 'Full HD', w: 1920, h: 1080 },
  { name: 'Story 9:16', w: 1080, h: 1920 },
];

export const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];
export const blendLabel = (b: string) => b === 'source-over' ? 'Normal' : b.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());

export const FONTS = ['Inter', 'Fraunces', 'Lora', 'Playfair Display', 'Space Grotesk', 'JetBrains Mono', 'Caveat', 'Georgia', 'Arial'];
