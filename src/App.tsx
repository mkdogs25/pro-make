import { useEffect, useRef, useState } from 'react';
import { S, T, commit, emit, page, redo, undo, canUndo, canRedo, setMode, setTool, tool, toast, useStore, useTime, selected } from './store';
import type { Mode } from './model';
import { FONTS } from './model';
import { MODES, TOOLS } from './tools';
import { Icon, Logo } from './ui/icons';
import { IconBtn, Menu, Num, Select, Slider, ColourInput } from './ui/controls';
import Stage, { stageApi, nodeApi, isTyping } from './ui/Stage';
import Props from './ui/Props';
import { LayersPanel, PagesPanel, StylesPanel, AdjustPanel, MediaPanel } from './ui/Panels';
import Timeline from './ui/Timeline';
import { ColourPanel } from './ui/ColourPanel';
import { SymbolsPanel } from './ui/SymbolsPanel';
import { TraceModal, TilesModal } from './ui/InkModals';
import { ExportOptsModal, SourceModal, ScopesPanel } from './ui/MotionModals';
import { FindModal, StoryModal, DocInfoModal, PdfModal, TocModal } from './ui/PrintModals';
import { copySel, cutSel, paste, duplicate, deleteSelection, deleteClip, splitClip, editTime, booleanOp, zorder } from './ops';
import { saveProject, openProject, importFiles, pickFiles, exportPNG, exportJPEG, exportSVG, exportPDF, exportSelectionPNG, exportSelectionSVG, exportState, newDocument, restoreAutosave, startAutosave } from './io';
import { togglePlay, seek, pause } from './playback';
import { groupSel, ungroupSel } from './ink';
import { addMarker, copyClip, duplicateClip, fitTimeline, pasteClip, setInPoint, setOutPoint } from './motion';
import { FILTERS, Adjust, selectAllPixels, selectNone, invertSelection, fillSelection, hasSelection } from './grain';
import { setProp, anim } from './geometry';
import { imageFor } from './raster';
import { layoutAll, invalidateText } from './text';
import { duration } from './ops';

// ---------------- top bar ----------------
function TopBar() {
  useStore();
  const tabs = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const curMode = S.ui.mode;
  useEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(`[data-mode="${curMode}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [curMode]);
  useEffect(() => {
    const r = () => { const el = tabs.current?.querySelector<HTMLElement>(`[data-mode="${S.ui.mode}"]`); if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth }); };
    window.addEventListener('resize', r); document.fonts?.ready.then(r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const mode = S.ui.mode;
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="brand-name">ProMake</span>
        <input className="doc-name" value={S.doc.name} onChange={e => { S.doc.name = e.target.value; emit(); }} onBlur={commit} onKeyDown={e => e.stopPropagation()} aria-label="Document name" />
      </div>
      <nav className="modes" ref={tabs} role="tablist" aria-label="Studio">
        {MODES.map((m, i) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} data-mode={m.id} className={`mode-tab ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)} title={`${m.name}: ${m.sub.toLowerCase()} editing (Alt+${i + 1})`}>
            <Icon name={m.icon} size={16} />
            <span className="mode-name">{m.name}</span>
            <span className="mode-sub">{m.sub}</span>
          </button>
        ))}
        <span className="mode-indicator" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }}><span className="glow" /></span>
      </nav>
      <div className="top-actions">
        <IconBtn icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo()} />
        <IconBtn icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo()} />
        <Menu label="Edit" icon="sliders" align="right" items={[
          { label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', onClick: undo, disabled: !canUndo() },
          { label: 'Redo', icon: 'redo', kbd: 'Ctrl+Shift+Z', onClick: redo, disabled: !canRedo() },
          'sep',
          { label: 'Cut', icon: 'scissors', kbd: 'Ctrl+X', onClick: cutSel },
          { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', onClick: copySel },
          { label: 'Paste', icon: 'download', kbd: 'Ctrl+V', onClick: () => paste() },
          { label: 'Duplicate', icon: 'copy', kbd: 'Ctrl+D', onClick: duplicate },
          { label: 'Select all', icon: 'rect', kbd: 'Ctrl+A', onClick: () => { S.ui.sel = page().objects.filter(o => !o.locked && o.visible).map(o => o.id); emit(); } },
          'sep',
          { label: 'Group', icon: 'group', kbd: 'Ctrl+G', onClick: groupSel },
          { label: 'Ungroup', icon: 'group', kbd: 'Ctrl+Shift+G', onClick: ungroupSel },
          'sep',
          { label: 'Find & replace…', icon: 'type', kbd: 'Ctrl+F', onClick: () => { S.ui.modal = { kind: 'find' }; emit(); } },
          { label: 'Story editor…', icon: 'frame', onClick: () => { if (selected().some(o => o.type === 'text')) { S.ui.modal = { kind: 'story' }; emit(); } else toast('Select a text frame first'); } },
          { label: 'Insert table of contents…', icon: 'menu', onClick: () => { S.ui.modal = { kind: 'toc' }; emit(); } },
          { label: 'Document info…', icon: 'file', onClick: () => { S.ui.modal = { kind: 'docinfo' }; emit(); } },
        ]} />
        <Menu label="File" icon="file" align="right" items={[
          { label: 'New document', icon: 'file', onClick: () => { if (confirm('Start a new document? Unsaved changes will be lost.')) newDocument(); } },
          { label: 'Open project…', icon: 'upload', kbd: 'Ctrl+O', onClick: () => openProject() },
          { label: 'Save project', icon: 'download', kbd: 'Ctrl+S', onClick: saveProject },
          'sep',
          { label: 'Import image, SVG, video or audio…', icon: 'image', kbd: 'Ctrl+I', onClick: async () => importFiles(await pickFiles('image/*,.svg,video/*,audio/*,.promake')) },
        ]} />
        <Menu label="Export" icon="download" align="right" items={[
          { label: mode === 'motion' ? 'Current frame as PNG' : 'Page as PNG (2×)', icon: 'image', kbd: 'Ctrl+E', onClick: () => exportPNG() },
          { label: 'Page as JPEG', icon: 'image', onClick: () => exportJPEG(), disabled: mode === 'motion' },
          { label: 'Page as SVG', icon: 'pen', onClick: exportSVG, disabled: mode === 'motion' },
          { label: 'PDF… (bleed, crop marks, links)', icon: 'pages', onClick: () => { S.ui.modal = { kind: 'pdf' }; emit(); } },
          { label: 'Selection as PNG', icon: 'image', onClick: () => exportSelectionPNG(), disabled: mode === 'motion' },
          { label: 'Selection as SVG', icon: 'pen', onClick: exportSelectionSVG, disabled: mode === 'motion' },
          'sep',
          { label: 'Video, GIF, frames or audio… (Motion)', icon: 'film', onClick: () => { setMode('motion'); S.ui.modal = { kind: 'export-opts' }; emit(); } },
          'sep',
          { label: 'Preflight check…', icon: 'warn', onClick: () => { S.ui.modal = { kind: 'preflight' }; emit(); } },
        ]} />
        <IconBtn icon="keyboard" title="Keyboard shortcuts (?)" onClick={() => { S.ui.modal = { kind: 'shortcuts' }; emit(); }} />
        <IconBtn icon={S.ui.theme === 'dark' ? 'sun' : 'moon'} title={S.ui.theme === 'dark' ? 'Parchment (light) theme' : 'Dark theme'} onClick={() => { S.ui.theme = S.ui.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('promake-theme', S.ui.theme); } catch { /* ignore */ } emit(); }} />
      </div>
    </header>
  );
}

// ---------------- toolbox ----------------
function Toolbox() {
  useStore();
  const mode = S.ui.mode;
  const grain = mode === 'grain';
  return (
    <aside className="toolbox" aria-label="Tools">
      <div className={`tools ${TOOLS[mode].length > 12 ? 'dense' : ''}`}>
        {TOOLS[mode].map(t => (
          <button key={t.id} className={`tool ${tool() === t.id ? 'on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`} aria-pressed={tool() === t.id}>
            <Icon name={t.icon} size={19} />
            <span>{t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      <div className="colours" title={grain ? 'Foreground / background' : 'Fill / stroke colours for new shapes'}>
        <label className="chip fg" style={{ background: S.ui.fg }} title={grain ? 'Foreground colour' : 'Fill colour'}>
          <input type="color" value={S.ui.fg.slice(0, 7)} onChange={e => { S.ui.fg = e.target.value.toUpperCase(); emit(); }} />
        </label>
        <label className="chip bg" style={{ background: S.ui.bg }} title={grain ? 'Background colour' : 'Stroke colour'}>
          <input type="color" value={S.ui.bg.slice(0, 7)} onChange={e => { S.ui.bg = e.target.value.toUpperCase(); emit(); }} />
        </label>
        <button className="swap" title="Swap colours (X)" onClick={() => { [S.ui.fg, S.ui.bg] = [S.ui.bg, S.ui.fg]; emit(); }}><Icon name="swap" size={11} /></button>
        <span className="chip-labels">{grain ? 'FG / BG' : 'Fill / Stroke'}</span>
      </div>
    </aside>
  );
}

// ---------------- tool options ----------------
function ToolOptions() {
  useStore();
  const mode = S.ui.mode, t = tool();
  const def = TOOLS[mode].find(x => x.id === t);
  const b = S.ui.brush;
  const brushy = mode === 'grain' && ['brush', 'pencil', 'eraser', 'smudge', 'clone', 'dodge', 'burn'].includes(t);
  const sel = selected();
  return (
    <div className="tool-options">
      <span className="tool-title"><Icon name={def?.icon || 'select'} size={15} /> {def?.label}</span>
      {brushy && <>
        <Num label="Size" value={b.size} min={1} max={500} unit="px" width={96} onChange={v => { b.size = v; emit(); }} />
        {t !== 'pencil' && <Num label="Hardness" value={Math.round(b.hardness * 100)} min={0} max={100} unit="%" width={122} onChange={v => { b.hardness = v / 100; emit(); }} />}
        <Num label="Opacity" value={Math.round(b.opacity * 100)} min={1} max={100} unit="%" width={116} onChange={v => { b.opacity = v / 100; emit(); }} />
        {['brush', 'pencil'].includes(t) && <Num label="Flow" value={Math.round(b.flow * 100)} min={1} max={100} unit="%" width={100} onChange={v => { b.flow = v / 100; emit(); }} />}
      </>}
      {mode === 'grain' && ['rectsel', 'ellsel', 'lasso', 'wand'].includes(t) && (
        <div className="seg" role="radiogroup" aria-label="Selection mode">
          {(['replace', 'add', 'subtract', 'intersect'] as const).map(m => <button key={m} className={S.ui.selMode === m ? 'on' : ''} onClick={() => { S.ui.selMode = m; emit(); }}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
      )}
      {(t === 'wand' || t === 'bucket') && <Num label="Threshold" value={S.ui.tolerance} min={0} max={255} width={118} onChange={v => { S.ui.tolerance = v; emit(); }} />}
      {(t === 'bucket' || t === 'gradient') && mode === 'grain' && <Num label="Opacity" value={Math.round(b.opacity * 100)} min={1} max={100} unit="%" width={116} onChange={v => { b.opacity = v / 100; emit(); }} />}
      {t === 'rect' && <Num label="Radius" value={S.ui.rectRadius} min={0} width={92} onChange={v => { S.ui.rectRadius = v; emit(); }} />}
      {t === 'star' && <>
        <Num label="Points" value={S.ui.star.points} min={3} max={64} width={90} onChange={v => { S.ui.star.points = Math.round(v); emit(); }} />
        {!S.ui.star.polygon && <Num label="Inner" value={Math.round(S.ui.star.inner * 100)} min={5} max={100} unit="%" width={92} onChange={v => { S.ui.star.inner = v / 100; emit(); }} />}
        <label className="check"><input type="checkbox" checked={S.ui.star.polygon} onChange={e => { S.ui.star.polygon = e.target.checked; emit(); }} /> Polygon</label>
      </>}
      {['rect', 'ellipse', 'star', 'pen', 'pencil', 'line', 'spiral'].includes(t) && mode !== 'grain' && <Num label="Stroke" value={S.ui.strokeWidth} min={0} step={0.5} width={92} onChange={v => { S.ui.strokeWidth = v; emit(); }} />}
      {t === 'spiral' && <Num label="Turns" value={S.ui.spiralTurns} min={1} max={20} step={0.5} width={92} onChange={v => { S.ui.spiralTurns = v; emit(); }} />}
      {t === 'calli' && <>
        <Num label="Width" value={S.ui.calli.width} min={1} max={80} width={96} onChange={v => { S.ui.calli.width = v; emit(); }} />
        <Num label="Angle" value={S.ui.calli.angle} unit="°" width={100} onChange={v => { S.ui.calli.angle = v; emit(); }} />
        <Num label="Thinning" value={S.ui.calli.thinning} min={0} max={100} unit="%" width={116} onChange={v => { S.ui.calli.thinning = v; emit(); }} />
      </>}
      {t === 'table' && <>
        <Num label="Rows" value={S.ui.tableDef.rows} min={1} max={30} width={84} onChange={v => { S.ui.tableDef.rows = Math.round(v); emit(); }} />
        <Num label="Columns" value={S.ui.tableDef.cols} min={1} max={12} width={104} onChange={v => { S.ui.tableDef.cols = Math.round(v); emit(); }} />
      </>}
      {t === 'text' && <>
        <Select value={S.ui.textDefaults.font} options={FONTS.map(f => ({ value: f, label: f }))} onChange={v => { S.ui.textDefaults.font = v; sel.filter(o => o.type === 'text').forEach(o => (o.font = v)); commit(); }} width={150} />
        <Num label="Size" value={S.ui.textDefaults.size} min={4} width={86} onChange={v => { S.ui.textDefaults.size = v; emit(); }} />
      </>}
      {t === 'select' && (mode === 'ink' || mode === 'print') && sel.length > 1 && (
        <span className="opt-group">
          <IconBtn icon="unite" title="Union" onClick={() => booleanOp('unite')} />
          <IconBtn icon="subtract" title="Difference" onClick={() => booleanOp('subtract')} />
          <IconBtn icon="intersect" title="Intersection" onClick={() => booleanOp('intersect')} />
          <IconBtn icon="exclude" title="Exclusion" onClick={() => booleanOp('exclude')} />
        </span>
      )}
      {t === 'select' && sel.length > 0 && (
        <span className="opt-group">
          <IconBtn icon="up" title="Bring to front" onClick={() => zorder('top')} />
          <IconBtn icon="down" title="Send to back" onClick={() => zorder('bottom')} />
          <IconBtn icon="copy" title="Duplicate (Ctrl+D)" onClick={duplicate} />
          <IconBtn icon="trash" title="Delete" onClick={deleteSelection} />
        </span>
      )}
      {t === 'pen' && stageApi.pen && <button className="btn small primary" onClick={() => stageApi.finishPen()}>Finish path</button>}
      {mode === 'grain' && hasSelection() && <button className="btn small ghost" onClick={selectNone}>Deselect</button>}
      <span className="tool-hint">{def?.hint}</span>
    </div>
  );
}

// ---------------- status bar ----------------
function StatusBar() {
  useStore();
  const pg = page();
  const v = S.ui.views[S.ui.mode];
  const sel = selected();
  const overflow = [...layoutAll(S.doc).entries()].filter(([, l]) => l.overflow).length;
  return (
    <footer className="statusbar">
      <span className="zoom-ctl">
        <IconBtn icon="minus" title="Zoom out (−)" size={13} onClick={() => stageApi.zoomBy(1 / 1.25)} />
        <button className="zoom-val" onClick={() => stageApi.fit()} title="Fit to window (0)">{Math.round(v.zoom * 100)}%</button>
        <IconBtn icon="plus" title="Zoom in (+)" size={13} onClick={() => stageApi.zoomBy(1.25)} />
      </span>
      <span id="cursor-readout" className="muted">–</span>
      <span>{pg.name} · {pg.w} × {pg.h} px</span>
      {sel.length > 0 && <span>{sel.length} selected{sel.length === 1 ? `: ${sel[0].name}` : ''}</span>}
      {overflow > 0 && <button className="status-warn" onClick={() => { S.ui.modal = { kind: 'preflight' }; emit(); }}><Icon name="warn" size={12} /> {overflow} overflowing frame{overflow > 1 ? 's' : ''}</button>}
      <span className="grow" />
      <span className="muted">Autosaved locally</span>
    </footer>
  );
}

// ---------------- sidebar ----------------
const TABS: Record<Mode, { id: string; label: string; icon: string }[]> = {
  motion: [{ id: 'props', label: 'Inspector', icon: 'sliders' }, { id: 'media', label: 'Media', icon: 'film' }, { id: 'layers', label: 'Layers', icon: 'layers' }, { id: 'scopes', label: 'Scopes', icon: 'wave' }],
  ink: [{ id: 'layers', label: 'Layers', icon: 'layers' }, { id: 'props', label: 'Properties', icon: 'sliders' }, { id: 'colour', label: 'Colour', icon: 'colour' }, { id: 'symbols', label: 'Symbols', icon: 'symbols' }],
  print: [{ id: 'pages', label: 'Pages', icon: 'pages' }, { id: 'props', label: 'Properties', icon: 'sliders' }, { id: 'styles', label: 'Styles', icon: 'type' }, { id: 'layers', label: 'Layers', icon: 'layers' }, { id: 'colour', label: 'Colour', icon: 'colour' }, { id: 'symbols', label: 'Symbols', icon: 'symbols' }],
  grain: [{ id: 'layers', label: 'Layers', icon: 'layers' }, { id: 'props', label: 'Properties', icon: 'sliders' }, { id: 'colour', label: 'Colour', icon: 'colour' }, { id: 'adjust', label: 'Adjust', icon: 'sparkle' }],
};

function Swatches() {
  useStore();
  const apply = (c: string, stroke: boolean) => {
    if (stroke) S.ui.bg = c; else S.ui.fg = c;
    const sel = selected();
    if (sel.length && S.ui.mode !== 'grain') { sel.forEach(o => { if (stroke) o.stroke = c; else o.fill = c; }); commit(); } else emit();
  };
  return (
    <div className="swatches">
      <div className="swatch-head"><span>Palette</span><span className="muted small">click: {S.ui.mode === 'grain' ? 'FG' : 'fill'} · shift: {S.ui.mode === 'grain' ? 'BG' : 'stroke'}</span></div>
      <div className="swatch-grid">
        {S.doc.swatches.map((c, i) => (
          <button key={i} className="sw" style={{ background: c }} title={`${c}`} onClick={e => apply(c, e.shiftKey)}
            onContextMenu={e => { e.preventDefault(); S.doc.swatches.splice(i, 1); commit(); }} />
        ))}
        <button className="sw add" title="Add the current colour to the palette (right-click a swatch to remove it)" onClick={() => { if (!S.doc.swatches.includes(S.ui.fg)) { S.doc.swatches.push(S.ui.fg); commit(); } }}><Icon name="plus" size={12} /></button>
      </div>
    </div>
  );
}

function Sidebar() {
  useStore();
  const tabs = TABS[S.ui.mode];
  const tab = tabs.some(t => t.id === S.ui.sideTab) ? S.ui.sideTab : tabs[0].id;
  return (
    <aside className="sidebar">
      <div className={`side-tabs ${tabs.length > 4 ? 'many' : ''}`} role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" title={t.label} aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { S.ui.sideTab = t.id; emit(); }}>
            <Icon name={t.icon} size={14} /> <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="side-body">
        {tab === 'layers' && <LayersPanel />}
        {tab === 'props' && <Props />}
        {tab === 'pages' && <PagesPanel />}
        {tab === 'styles' && <StylesPanel />}
        {tab === 'adjust' && <AdjustPanel />}
        {tab === 'media' && <MediaPanel />}
        {tab === 'colour' && <ColourPanel />}
        {tab === 'scopes' && <ScopesPanel />}
        {tab === 'symbols' && <SymbolsPanel />}
      </div>
      {S.ui.mode !== 'motion' && <Swatches />}
    </aside>
  );
}

// ---------------- modals ----------------
function FilterModal({ id }: { id: string }) {
  const def = FILTERS.find(f => f.id === id)!;
  const [params, setParams] = useState<Record<string, number>>(() => Object.fromEntries(def.params.map(p => [p.key, p.def])));
  const adj = useRef<Adjust | null>(null);
  const [preview, setPreview] = useState(true);
  useEffect(() => {
    const o = selected().find(x => x.type === 'raster');
    if (!o) { S.ui.modal = null; emit(); return; }
    adj.current = new Adjust(o);
    adj.current.preview(id, params);
    return () => { if (adj.current) adj.current.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!adj.current) return;
    const h = setTimeout(() => (preview ? adj.current!.preview(id, params) : adj.current!.cancel()), 30);
    return () => clearTimeout(h);
  }, [params, preview, id]);
  const close = (apply: boolean) => {
    if (adj.current) { if (apply) { adj.current.preview(id, params); adj.current.apply(); } else adj.current.cancel(); adj.current = null; }
    S.ui.modal = null; emit();
  };
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close(false)}>
      <div className="modal filter-modal" role="dialog" aria-label={def.name}>
        <h3><Icon name="sliders" size={16} /> {def.name}</h3>
        {def.params.length === 0 && <p className="muted">No settings. Apply to commit.</p>}
        {def.params.map(p => (
          <Slider key={p.key} label={p.label} value={params[p.key]} min={p.min} max={p.max} step={p.step || 1} onChange={v => setParams({ ...params, [p.key]: v })} />
        ))}
        <label className="check"><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /> Preview</label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => setParams(Object.fromEntries(def.params.map(p => [p.key, p.def])))}>Reset</button>
          <span className="grow" />
          <button className="btn" onClick={() => close(false)}>Cancel</button>
          <button className="btn primary" onClick={() => close(true)}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function Preflight() {
  const issues: { msg: string; pageId: string; id?: string; level: 'warn' | 'info' }[] = [];
  const lay = layoutAll(S.doc);
  for (const pg of S.doc.pages) {
    for (const o of pg.objects) {
      const where = `${pg.name}: “${o.name}”`;
      if (o.type === 'text' && lay.get(o.id)?.overflow) issues.push({ msg: `${where} has overflowing text`, pageId: pg.id, id: o.id, level: 'warn' });
      if (o.type === 'text' && !o.text && !S.doc.pages.some(p => p.objects.some(x => x.linkNext === o.id))) issues.push({ msg: `${where} is an empty text frame`, pageId: pg.id, id: o.id, level: 'info' });
      if (o.type === 'raster' && !pg.isMaster) {
        const a = anim(o, 0);
        const ppi = (o.w! / (Math.abs(o.w! * a.sx) / 96)) * (96 / 96);
        if (ppi < 150) issues.push({ msg: `${where} is ${Math.round(ppi)} ppi when printed (150+ recommended)`, pageId: pg.id, id: o.id, level: 'warn' });
      }
      if (o.type === 'image' && !pg.isMaster) {
        if (!o.src) issues.push({ msg: `${where} is an empty image frame`, pageId: pg.id, id: o.id, level: 'warn' });
        else {
          const im = imageFor(o.src);
          if (im.naturalWidth) {
            const fitK = o.fit === 'fit' ? Math.min(o.w! / im.naturalWidth, o.h! / im.naturalHeight) : o.fit === 'stretch' ? o.w! / im.naturalWidth : o.fit === 'none' ? 1 : Math.max(o.w! / im.naturalWidth, o.h! / im.naturalHeight);
            const ppi = 96 / (fitK * (o.imgScale || 1) * Math.abs(anim(o, 0).sx || 1));
            if (ppi < 150) issues.push({ msg: `${where} is ${Math.round(ppi)} ppi when printed (150+ recommended)`, pageId: pg.id, id: o.id, level: 'warn' });
          }
        }
      }
      if (!pg.isMaster && o.visible) {
        const a = anim(o, 0);
        if (a.x < -pg.bleed || a.y < -pg.bleed || a.x > pg.w + pg.bleed || a.y > pg.h + pg.bleed) issues.push({ msg: `${where} sits outside the page`, pageId: pg.id, id: o.id, level: 'info' });
      }
      if (!o.visible) issues.push({ msg: `${where} is hidden and won't print`, pageId: pg.id, id: o.id, level: 'info' });
    }
  }
  const go = (i: typeof issues[0]) => { S.ui.pageId = i.pageId; if (i.id) S.ui.sel = [i.id]; S.ui.modal = null; Object.values(S.ui.views).forEach(v => (v.fitted = false)); emit(); };
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && (S.ui.modal = null, emit())}>
      <div className="modal" role="dialog" aria-label="Preflight">
        <h3><Icon name="warn" size={16} /> Preflight</h3>
        {issues.length === 0 ? <p className="ok"><Icon name="check" size={16} /> No problems found. Ready to export.</p> : (
          <ul className="issues">
            {issues.map((i, k) => <li key={k} className={i.level} onClick={() => go(i)}><Icon name={i.level === 'warn' ? 'warn' : 'sparkle'} size={13} /> {i.msg}</li>)}
          </ul>
        )}
        <div className="modal-actions"><span className="grow" /><button className="btn" onClick={() => { S.ui.modal = null; emit(); }}>Close</button><button className="btn primary" onClick={() => { S.ui.modal = null; emit(); exportPDF(true); }}>Export PDF</button></div>
      </div>
    </div>
  );
}

function VideoProgress() {
  useTime();
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-label="Rendering video">
        <h3><Icon name="film" size={16} /> Rendering video…</h3>
        <p className="muted small">Rendering runs in real time so audio stays in sync. Keep this tab visible.</p>
        <div className="progress"><div style={{ width: `${Math.round(exportState.progress * 100)}%` }} /></div>
        <div className="modal-actions"><span className="grow" /><button className="btn" onClick={() => { exportState.cancel(); S.ui.modal = null; emit(); }}>Cancel</button></div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Alt+1 … Alt+4', 'Switch studio: Motion, Ink, Print, Grain'],
  ['Letter keys', 'Choose tools (shown in each tool’s tooltip)'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+C / X / V / D', 'Copy, cut, paste, duplicate'],
  ['Delete', 'Delete selection, nodes or clip'],
  ['Arrows (+Shift)', 'Nudge by 1px (10px); in Motion with nothing selected, step frames'],
  ['Space', 'Hold to pan; in Motion, play or pause'],
  ['Ctrl+scroll, + / − / 0', 'Zoom, fit to window'],
  ['Ctrl+A / Ctrl+Shift+A', 'Select all / deselect'],
  ['Ctrl+Shift+I', 'Invert selection (Grain)'],
  ['[ / ]', 'Brush size'],
  ['X', 'Swap colours'],
  ['S', 'Split clip at playhead (Motion)'],
  ['K', 'Add keyframe for the selected object (Motion)'],
  ['M / I / O', 'Marker, in point, out point at the playhead (Motion)'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup (Ink, Print)'],
  ['Ctrl+F', 'Find and replace'],
  ['Home / End', 'Jump to start or end of timeline'],
  ['Enter / Esc', 'Finish pen path / deselect'],
  ['Ctrl+S / Ctrl+O / Ctrl+E', 'Save, open, export PNG'],
];
function Shortcuts() {
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && (S.ui.modal = null, emit())}>
      <div className="modal wide" role="dialog" aria-label="Keyboard shortcuts">
        <h3><Icon name="keyboard" size={16} /> Keyboard shortcuts</h3>
        <dl className="shortcuts">{SHORTCUTS.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
        <div className="modal-actions"><span className="grow" /><button className="btn primary" onClick={() => { S.ui.modal = null; emit(); }}>Done</button></div>
      </div>
    </div>
  );
}

// ---------------- keyboard ----------------
function useShortcuts() {
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (isTyping(e) || S.ui.modal) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const mode = S.ui.mode;
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); setMode(MODES[+e.key - 1].id); return; }
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); setMode(MODES[+e.code.slice(5) - 1].id); return; }
      if (mod) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (k === 'y') { e.preventDefault(); redo(); return; }
        const clipMode = mode === 'motion' && !!S.ui.selClip && !S.ui.sel.length;
        if (k === 'c') { if (clipMode && copyClip()) return; copySel(); return; }
        if (k === 'x') { cutSel(); return; }
        if (k === 'v') { e.preventDefault(); if (clipMode) pasteClip(); else paste(); return; }
        if (k === 'd') { e.preventDefault(); if (clipMode) duplicateClip(); else duplicate(); return; }
        if (k === 'f') { e.preventDefault(); S.ui.modal = { kind: 'find' }; emit(); return; }
        if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); return; }
        if (k === 's') { e.preventDefault(); saveProject(); return; }
        if (k === 'o') { e.preventDefault(); openProject(); return; }
        if (k === 'e') { e.preventDefault(); exportPNG(); return; }
        if (k === 'a' && e.shiftKey) { e.preventDefault(); S.ui.sel = []; selectNone(); emit(); return; }
        if (k === 'a') { e.preventDefault(); if (mode === 'grain' && tool() !== 'select') selectAllPixels(); else { S.ui.sel = page().objects.filter(o => !o.locked && o.visible).map(o => o.id); emit(); } return; }
        if (k === 'i' && e.shiftKey && mode === 'grain') { e.preventDefault(); invertSelection(); return; }
        if (k === 'i') { e.preventDefault(); pickFiles('image/*,.svg,video/*,audio/*').then(fs => importFiles(fs)); return; }
        if (k === '0') { e.preventDefault(); stageApi.fit(); return; }
        if (k === '=' || k === '+') { e.preventDefault(); stageApi.zoomBy(1.25); return; }
        if (k === '-') { e.preventDefault(); stageApi.zoomBy(0.8); return; }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (tool() === 'node' && nodeApi.deleteNodes()) return;
        if (S.ui.sel.length) { deleteSelection(); return; }
        if (mode === 'motion' && S.ui.selClip) { deleteClip(); return; }
        if (mode === 'grain' && hasSelection()) { const o = selected().find(x => x.type === 'raster'); if (o) fillSelection(o, '#000', true); }
        return;
      }
      if (e.key === 'Escape') { if (stageApi.pen) stageApi.finishPen(); else { S.ui.sel = []; S.ui.nodeSel = []; S.ui.linkFrom = null; S.ui.selClip = null; emit(); } return; }
      if (e.key === 'Enter' && stageApi.pen) { stageApi.finishPen(); return; }
      if (e.key === ' ' && mode === 'motion') { e.preventDefault(); togglePlay(); return; }
      if (e.key === '?') { S.ui.modal = { kind: 'shortcuts' }; emit(); return; }
      if (e.key.startsWith('Arrow')) {
        const sel = selected().filter(o => !o.locked);
        if (mode === 'motion' && !sel.length) { e.preventDefault(); const f = 1 / S.doc.timeline.fps * (e.shiftKey ? 10 : 1); seek(T.time + (e.key === 'ArrowRight' ? f : e.key === 'ArrowLeft' ? -f : 0)); return; }
        if (!sel.length) return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1, t = editTime();
        for (const o of sel) {
          const a = anim(o, t);
          if (e.key === 'ArrowLeft') setProp(o, 'x', a.x - d, t); if (e.key === 'ArrowRight') setProp(o, 'x', a.x + d, t);
          if (e.key === 'ArrowUp') setProp(o, 'y', a.y - d, t); if (e.key === 'ArrowDown') setProp(o, 'y', a.y + d, t);
        }
        commit(); return;
      }
      if (e.key === 'Home') { seek(0); return; }
      if (e.key === 'End') { seek(duration()); return; }
      if (e.key === '[') { S.ui.brush.size = Math.max(1, Math.round(S.ui.brush.size / 1.2)); emit(); return; }
      if (e.key === ']') { S.ui.brush.size = Math.min(500, Math.round(S.ui.brush.size * 1.2) + 1); emit(); return; }
      if (e.key === '+' || e.key === '=') { stageApi.zoomBy(1.25); return; }
      if (e.key === '-') { stageApi.zoomBy(0.8); return; }
      if (e.key === '0') { stageApi.fit(); return; }
      if (e.altKey) return;
      if (k === 'x' && !e.shiftKey && mode !== 'grain') { [S.ui.fg, S.ui.bg] = [S.ui.bg, S.ui.fg]; emit(); return; }
      if (k === 'x' && e.shiftKey) { [S.ui.fg, S.ui.bg] = [S.ui.bg, S.ui.fg]; emit(); return; }
      if (mode === 'motion' && k === 's') { splitClip(); return; }
      if (mode === 'motion' && k === 'm') { addMarker(); return; }
      if (mode === 'motion' && k === 'i') { setInPoint(); return; }
      if (mode === 'motion' && k === 'o') { setOutPoint(); return; }
      if (mode === 'motion' && e.key === '\\') { fitTimeline(window.innerWidth - 160); emit(); return; }
      if (mode === 'motion' && k === 'k') {
        const t = editTime();
        for (const o of selected()) { const a = anim(o, t); (['x', 'y', 'rotation', 'sx', 'sy', 'opacity'] as const).forEach(p => setProp(o, p, a[p], t, true)); }
        if (selected().length) { commit(); toast('Keyframe added'); }
        return;
      }
      const tdef = TOOLS[mode].find(t => t.key === e.key || t.key === k);
      if (tdef) { if (stageApi.pen && tdef.id !== 'pen') stageApi.finishPen(); setTool(tdef.id); }
    };
    window.addEventListener('keydown', kd);
    const pasteEv = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); importFiles(files); }
    };
    window.addEventListener('paste', pasteEv);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('paste', pasteEv); };
  }, []);
}

// ---------------- app ----------------
export default function App() {
  useStore();
  useShortcuts();
  const [ready, setReady] = useState(false);
  document.documentElement.dataset.theme = S.ui.theme;
  useEffect(() => {
    restoreAutosave().then(ok => { if (ok) toast('Restored your last session'); setReady(true); startAutosave(); });
    document.fonts?.ready.then(() => { invalidateText(); emit(); });
    const onDrop = (e: DragEvent) => { if (e.dataTransfer?.files.length && !(e.target as HTMLElement).closest('.stage')) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } };
    const over = (e: DragEvent) => e.preventDefault();
    window.addEventListener('drop', onDrop); window.addEventListener('dragover', over);
    return () => { window.removeEventListener('drop', onDrop); window.removeEventListener('dragover', over); };
  }, []);
  const mode = S.ui.mode;
  useEffect(() => { if (mode !== 'motion' && T.playing) pause(); }, [mode]);
  const m = S.ui.modal;
  return (
    <div className={`app mode-${mode}`}>
      <TopBar />
      <div className="workspace">
        <Toolbox />
        <main className="centre">
          <ToolOptions />
          {ready && <Stage key={mode} />}
        </main>
        <Sidebar />
      </div>
      {mode === 'motion' ? <Timeline /> : <StatusBar />}
      {m?.kind === 'filter' && <FilterModal id={m.data as string} />}
      {m?.kind === 'preflight' && <Preflight />}
      {m?.kind === 'export-video' && <VideoProgress />}
      {m?.kind === 'shortcuts' && <Shortcuts />}
      {m?.kind === 'export-opts' && <ExportOptsModal />}
      {m?.kind === 'source' && <SourceModal id={m.data as string} />}
      {m?.kind === 'find' && <FindModal />}
      {m?.kind === 'story' && <StoryModal />}
      {m?.kind === 'docinfo' && <DocInfoModal />}
      {m?.kind === 'pdf' && <PdfModal />}
      {m?.kind === 'toc' && <TocModal />}
      {m?.kind === 'trace' && <TraceModal />}
      {m?.kind === 'tiles' && <TilesModal />}
      {S.ui.toast && <div className="toast" role="status">{S.ui.toast}</div>}
    </div>
  );
}

export { ColourInput };
