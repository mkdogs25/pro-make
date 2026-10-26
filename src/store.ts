import { useSyncExternalStore } from 'react';
import type { Doc, Mode, Obj, Page } from './model';
import { sampleDoc } from './sample';

export interface View { zoom: number; x: number; y: number; fitted: boolean; manual?: boolean }

export interface UI {
  mode: Mode;
  tools: Record<Mode, string>;
  sel: string[];
  pageId: string;
  views: Record<Mode, View>;
  theme: 'light' | 'dark';
  fg: string; bg: string;
  strokeWidth: number;
  brush: { size: number; hardness: number; opacity: number; flow: number };
  tolerance: number;
  selMode: 'replace' | 'add' | 'subtract' | 'intersect';
  star: { points: number; inner: number; polygon: boolean };
  rectRadius: number;
  textDefaults: { font: string; size: number };
  selClip: string | null;
  nodeSel: { sp: number; i: number }[];
  autoKey: boolean;
  snap: boolean;
  showGuides: boolean;
  sideTab: string;
  tlZoom: number;
  editingText: string | null;
  linkFrom: string | null;
  modal: null | { kind: string; data?: unknown };
  toast: string | null;
  cursor: { x: number; y: number } | null;
  activeLayer: string | null;
  measure: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  grid: { show: boolean; size: number; snap: boolean };
  spiralTurns: number;
  calli: { width: number; angle: number; thinning: number };
  tableDef: { rows: number; cols: number };
  recent: string[];
}

const initialDoc = sampleDoc();

export const S: { doc: Doc; ui: UI } = {
  doc: initialDoc,
  ui: {
    mode: 'ink',
    tools: { motion: 'select', ink: 'select', print: 'select', grain: 'brush' },
    sel: [],
    pageId: initialDoc.pages.find(p => !p.isMaster)!.id,
    views: {
      motion: { zoom: 1, x: 0, y: 0, fitted: false }, ink: { zoom: 1, x: 0, y: 0, fitted: false },
      print: { zoom: 1, x: 0, y: 0, fitted: false }, grain: { zoom: 1, x: 0, y: 0, fitted: false },
    },
    theme: (localStorage.getItem('promake-theme') as 'light' | 'dark') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    fg: '#E76F51', bg: '#2B5D8C',
    strokeWidth: 2,
    brush: { size: 24, hardness: 0.6, opacity: 1, flow: 1 },
    tolerance: 32,
    selMode: 'replace',
    star: { points: 5, inner: 0.45, polygon: false },
    rectRadius: 0,
    textDefaults: { font: 'Inter', size: 24 },
    selClip: null,
    nodeSel: [],
    autoKey: true,
    snap: true,
    showGuides: true,
    sideTab: 'layers',
    tlZoom: 80,
    editingText: null,
    linkFrom: null,
    modal: null,
    toast: null,
    cursor: null,
    activeLayer: null,
    measure: null,
    grid: { show: false, size: 20, snap: false },
    spiralTurns: 4,
    calli: { width: 16, angle: 45, thinning: 40 },
    tableDef: { rows: 4, cols: 3 },
    recent: [],
  },
};

// ---------- subscriptions ----------
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
let scheduled = false;
export function emit() {
  version++;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach(l => l()); });
}
export const getVersion = () => version;
export function useStore() { return useSyncExternalStore(subscribe, () => version); }

// Time lives in its own tiny store so playback doesn't re-render the whole UI.
export const T = { time: 4, playing: false };
let tVersion = 0;
const tListeners = new Set<() => void>();
const tSubscribe = (l: () => void) => { tListeners.add(l); return () => tListeners.delete(l); };
export function emitTime() { tVersion++; tListeners.forEach(l => l()); }
export function useTime() { return useSyncExternalStore(tSubscribe, () => tVersion); }
export function setTime(t: number) { T.time = Math.max(0, t); emitTime(); }

// ---------- history ----------
const past: string[] = [];
const future: string[] = [];
let current = JSON.stringify(S.doc);
const LIMIT = 80;

export function commit() {
  const next = JSON.stringify(S.doc);
  if (next === current) { emit(); return; }
  past.push(current);
  if (past.length > LIMIT) past.shift();
  future.length = 0;
  current = next;
  emit();
  afterCommit.forEach(f => f());
}
export const afterCommit: (() => void)[] = [];

function restore(json: string) {
  current = json;
  S.doc = JSON.parse(json);
  const ids = new Set(allObjects().map(o => o.id));
  S.ui.sel = S.ui.sel.filter(id => ids.has(id));
  if (!S.doc.pages.find(p => p.id === S.ui.pageId)) S.ui.pageId = S.doc.pages[0].id;
  S.ui.nodeSel = [];
  emit();
  afterCommit.forEach(f => f());
}
export function undo() { if (past.length) { future.push(current); restore(past.pop()!); } }
export function redo() { if (future.length) { past.push(current); restore(future.pop()!); } }
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function replaceDoc(doc: Doc) {
  S.doc = doc;
  past.length = 0; future.length = 0;
  current = JSON.stringify(doc);
  S.ui.sel = []; S.ui.selClip = null; S.ui.nodeSel = [];
  S.ui.pageId = doc.pages.find(p => !p.isMaster)?.id || doc.pages[0].id;
  for (const m of Object.values(S.ui.views)) m.fitted = false;
  emit();
}

// ---------- helpers ----------
export const page = (): Page => S.doc.pages.find(p => p.id === S.ui.pageId) || S.doc.pages[0];
export const allObjects = () => S.doc.pages.flatMap(p => p.objects);
export function findObj(id: string): { obj: Obj; page: Page } | null {
  for (const p of S.doc.pages) { const obj = p.objects.find(o => o.id === id); if (obj) return { obj, page: p }; }
  return null;
}
export const selected = (): Obj[] => page().objects.filter(o => S.ui.sel.includes(o.id));
export function layerOf(o: Obj) { return S.doc.layers.find(l => l.id === o.layerId) || S.doc.layers[0]; }
export function isEditable(o: Obj) { const l = layerOf(o); return o.visible && !o.locked && l.visible && !l.locked; }

let toastTimer = 0;
export function toast(msg: string) {
  S.ui.toast = msg; emit();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { S.ui.toast = null; emit(); }, 2600);
}

export function setMode(m: Mode) {
  S.ui.mode = m;
  S.ui.editingText = null; S.ui.linkFrom = null; S.ui.nodeSel = [];
  const tabs: Record<Mode, string[]> = { motion: ['props', 'layers', 'media'], ink: ['layers', 'props'], print: ['pages', 'props', 'layers', 'styles'], grain: ['layers', 'props', 'adjust'] };
  S.ui.sideTab = tabs[m][0];
  emit();
}

export function setTool(t: string) {
  S.ui.tools[S.ui.mode] = t;
  S.ui.linkFrom = null;
  if (t !== 'node') S.ui.nodeSel = [];
  emit();
}
export const tool = () => S.ui.tools[S.ui.mode];
