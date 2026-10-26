import { useEffect, useRef, useState } from 'react';
import { S, commit, emit, page, useStore, toast, getVersion } from '../store';
import type { Obj, Page, ParaStyle } from '../model';
import { PAGE_PRESETS, uid, FONTS } from '../model';
import { renderPage } from '../render';
import { Icon } from './icons';
import { IconBtn, Num, Select, Section, ColourInput, Text } from './controls';
import {
  addLayer, deleteLayer, moveLayer, addPage, duplicatePage, deletePage, movePage, goPage, placePage, newRasterLayer, flattenPage,
  rasterise, addMediaClip, addSceneClip, addTitleClip, paintTarget, editTime,
} from '../ops';
import { FILTERS, selectAllPixels, selectNone, invertSelection, fillSelection, cropRasterToSelection, selectionBounds, cropPageTo, hasSelection } from '../grain';
import { importFiles, pickFiles } from '../io';
import { rasterCanvas } from '../raster';
import { imageFor } from '../raster';

const typeIcon = (o: Obj) => ({ rect: 'rect', ellipse: 'ellipse', star: 'star', path: 'pen', text: 'text', raster: 'image', embed: 'place' } as Record<string, string>)[o.type];

// ---------- thumbnails ----------
export function Thumb({ pg, w = 120 }: { pg: Page; w?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const v = getVersion();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const c = ref.current;
      if (!c) return;
      const s = w / pg.w;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr); c.height = Math.round(pg.h * s * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
      renderPage(ctx, S.doc, pg, { time: editTime() });
    });
    return () => cancelAnimationFrame(id);
  }, [v, pg, w]);
  return <canvas ref={ref} className="thumb" style={{ width: w, height: (pg.h * w) / pg.w }} />;
}

// ---------- layers ----------
export function LayersPanel() {
  useStore();
  const pg = page();
  const [renaming, setRenaming] = useState<string | null>(null);
  const layers = [...S.doc.layers].reverse();
  const active = S.ui.activeLayer || (S.ui.sel.length ? pg.objects.find(o => o.id === S.ui.sel[0])?.layerId : null);
  const selectObj = (o: Obj, e: React.MouseEvent) => {
    S.ui.sel = e.shiftKey ? (S.ui.sel.includes(o.id) ? S.ui.sel.filter(x => x !== o.id) : [...S.ui.sel, o.id]) : [o.id];
    S.ui.activeLayer = o.layerId; S.ui.selClip = null;
    emit();
  };
  return (
    <div className="panel-scroll">
      <div className="layer-list" role="tree">
        {layers.map(l => {
          const objs = pg.objects.filter(o => o.layerId === l.id).reverse();
          return (
            <div key={l.id} className="layer-group">
              <div className={`layer-row layer ${active === l.id ? 'active' : ''}`} onClick={() => { S.ui.activeLayer = l.id; emit(); }} role="treeitem" aria-expanded={!!l.open}>
                <button className="tw" onClick={e => { e.stopPropagation(); l.open = !l.open; emit(); }} aria-label={l.open ? 'Collapse' : 'Expand'}><Icon name={l.open ? 'chevdown' : 'chevron'} size={12} /></button>
                <Icon name="layers" size={14} className="muted" />
                {renaming === l.id
                  ? <input className="rename" autoFocus defaultValue={l.name} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { l.name = e.target.value || l.name; setRenaming(null); commit(); }} />
                  : <span className="name" onDoubleClick={() => setRenaming(l.id)}>{l.name}</span>}
                <span className="count">{objs.length || ''}</span>
                <IconBtn icon={l.locked ? 'lock' : 'unlock'} title={l.locked ? 'Unlock layer' : 'Lock layer'} active={l.locked} onClick={e => { e.stopPropagation(); l.locked = !l.locked; commit(); }} size={13} className={l.locked ? '' : 'dim'} />
                <IconBtn icon={l.visible ? 'eye' : 'eyeoff'} title={l.visible ? 'Hide layer' : 'Show layer'} onClick={e => { e.stopPropagation(); l.visible = !l.visible; commit(); }} size={13} className={l.visible ? '' : 'dim'} />
              </div>
              {l.open && objs.map(o => (
                <div key={o.id} className={`layer-row obj ${S.ui.sel.includes(o.id) ? 'sel' : ''} ${o.visible ? '' : 'hidden'}`} onClick={e => selectObj(o, e)}
                  draggable onDragStart={e => e.dataTransfer.setData('text/obj', o.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    const id = e.dataTransfer.getData('text/obj'); if (!id || id === o.id) return;
                    const moving = pg.objects.find(x => x.id === id)!;
                    pg.objects = pg.objects.filter(x => x !== moving);
                    moving.layerId = o.layerId;
                    pg.objects.splice(pg.objects.indexOf(o) + 1, 0, moving);
                    commit();
                  }}>
                  <span className="indent" />
                  <Icon name={typeIcon(o)} size={13} className="muted" />
                  {renaming === o.id
                    ? <input className="rename" autoFocus defaultValue={o.name} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { o.name = e.target.value || o.name; setRenaming(null); commit(); }} />
                    : <span className="name" onDoubleClick={() => setRenaming(o.id)}>{o.name}</span>}
                  {o.keys && Object.values(o.keys).some(k => k?.length) && <span className="anim-dot" title="Animated">◆</span>}
                  <IconBtn icon={o.locked ? 'lock' : 'unlock'} title={o.locked ? 'Unlock' : 'Lock'} onClick={e => { e.stopPropagation(); o.locked = !o.locked; commit(); }} size={12} className={o.locked ? '' : 'dim'} />
                  <IconBtn icon={o.visible ? 'eye' : 'eyeoff'} title={o.visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); o.visible = !o.visible; commit(); }} size={12} className={o.visible ? '' : 'dim'} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {active && (() => {
        const l = S.doc.layers.find(x => x.id === active);
        return l ? (
          <div className="pad">
            <label className="slider-inline"><span className="muted small">Layer opacity</span>
              <input type="range" min={0} max={100} value={Math.round(l.opacity * 100)} onChange={e => { l.opacity = +e.target.value / 100; emit(); }} onPointerUp={commit} />
            </label>
          </div>
        ) : null;
      })()}
      <div className="panel-foot">
        <IconBtn icon="plus" title="New layer" onClick={addLayer} />
        <IconBtn icon="up" title="Move layer up" disabled={!active} onClick={() => active && moveLayer(active, 1)} />
        <IconBtn icon="down" title="Move layer down" disabled={!active} onClick={() => active && moveLayer(active, -1)} />
        <IconBtn icon="trash" title="Delete layer" disabled={!active} onClick={() => active && deleteLayer(active)} />
        {S.ui.mode === 'grain' && <>
          <span className="sep" />
          <IconBtn icon="image" title="New pixel layer" onClick={() => newRasterLayer()} />
          <IconBtn icon="grid" title="Flatten page to pixels" onClick={flattenPage} />
        </>}
      </div>
    </div>
  );
}

// ---------- pages ----------
export function PagesPanel() {
  useStore();
  const [preset, setPreset] = useState('794x1123');
  const masters = S.doc.pages.filter(p => p.isMaster), pages = S.doc.pages.filter(p => !p.isMaster);
  const card = (p: Page, i?: number) => (
    <div key={p.id} className={`page-card ${p.id === S.ui.pageId ? 'on' : ''}`} onClick={() => goPage(p.id)} title={`${p.name} · ${p.w}×${p.h}`}>
      <Thumb pg={p} w={p.w > p.h ? 112 : 78} />
      <div className="page-card-label">{i !== undefined ? <b>{i + 1}</b> : <b>M</b>} {p.name}</div>
      <div className="page-card-tools" onClick={e => e.stopPropagation()}>
        <IconBtn icon="up" title="Move earlier" size={12} onClick={() => movePage(p.id, -1)} />
        <IconBtn icon="down" title="Move later" size={12} onClick={() => movePage(p.id, 1)} />
        <IconBtn icon="copy" title="Duplicate" size={12} onClick={() => duplicatePage(p.id)} />
        <IconBtn icon="place" title="Place this page into the current page" size={12} onClick={() => placePage(p.id)} />
        <IconBtn icon="trash" title="Delete" size={12} onClick={() => deletePage(p.id)} />
      </div>
    </div>
  );
  return (
    <div className="panel-scroll">
      <Section title="Master pages">
        <div className="page-grid">{masters.map(p => card(p))}</div>
        <button className="btn small" onClick={() => {
          const m: Page = { ...JSON.parse(JSON.stringify(page())), id: uid('p'), name: `${String.fromCharCode(65 + masters.length)}-Master`, isMaster: true, objects: [], masterId: null, bg: null };
          S.doc.pages.unshift(m); commit(); toast('Master page added. Assign it to pages from Page properties.');
        }}><Icon name="plus" size={13} /> New master</button>
      </Section>
      <Section title={`Pages (${pages.length})`}>
        <div className="page-grid">{pages.map((p, i) => card(p, i))}</div>
        <div className="row">
          <Select value={preset} options={PAGE_PRESETS.map(p => ({ value: `${p.w}x${p.h}`, label: p.name }))} onChange={setPreset} />
          <button className="btn small primary" onClick={() => { const [w, h] = preset.split('x').map(Number); addPage(w, h); }}><Icon name="plus" size={13} /> Page</button>
        </div>
      </Section>
    </div>
  );
}

// ---------- paragraph styles ----------
export function StylesPanel() {
  useStore();
  const [open, setOpen] = useState<string | null>(null);
  const textSel = S.doc.pages.flatMap(p => p.objects).filter(o => S.ui.sel.includes(o.id) && o.type === 'text');
  const apply = (st: ParaStyle) => {
    if (!textSel.length) { toast('Select one or more text frames first'); return; }
    for (const o of textSel) Object.assign(o, { styleId: st.id, font: st.font, size: st.size, weight: st.weight, italic: st.italic, lineHeight: st.lineHeight, align: st.align, fill: st.color, letterSpacing: st.letterSpacing });
    commit();
  };
  const propagate = (st: ParaStyle) => {
    for (const o of S.doc.pages.flatMap(p => p.objects)) if (o.styleId === st.id) Object.assign(o, { font: st.font, size: st.size, weight: st.weight, italic: st.italic, lineHeight: st.lineHeight, align: st.align, fill: st.color, letterSpacing: st.letterSpacing });
  };
  return (
    <div className="panel-scroll">
      <p className="muted small pad">Paragraph styles keep type consistent. Editing a style updates every frame that uses it.</p>
      {S.doc.styles.map(st => (
        <div key={st.id} className="style-row">
          <div className="style-head" onClick={() => apply(st)} title="Apply to the selected frames">
            <span style={{ fontFamily: st.font, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : 'normal', color: st.color, fontSize: Math.min(22, st.size) }}>{st.name}</span>
            <span className="muted small">{st.font} {st.size}</span>
            <IconBtn icon={open === st.id ? 'chevdown' : 'sliders'} title="Edit style" onClick={e => { e.stopPropagation(); setOpen(open === st.id ? null : st.id); }} />
          </div>
          {open === st.id && (
            <div className="style-edit">
              <Text value={st.name} onChange={v => { st.name = v; emit(); }} onCommit={commit} />
              <Select value={st.font} options={FONTS.map(f => ({ value: f, label: f }))} onChange={v => { st.font = v; propagate(st); commit(); }} />
              <div className="grid2">
                <Num label="Size" value={st.size} min={4} onChange={v => { st.size = v; propagate(st); emit(); }} onCommit={commit} />
                <Num label="Weight" value={st.weight} step={100} min={100} max={900} onChange={v => { st.weight = v; propagate(st); emit(); }} onCommit={commit} />
                <Num label="Leading" value={st.lineHeight} step={0.05} onChange={v => { st.lineHeight = v; propagate(st); emit(); }} onCommit={commit} />
                <Num label="Tracking" value={st.letterSpacing} step={0.5} onChange={v => { st.letterSpacing = v; propagate(st); emit(); }} onCommit={commit} />
              </div>
              <div className="row">
                <Select value={st.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justified' }]} onChange={v => { st.align = v; propagate(st); commit(); }} />
                <label className="check"><input type="checkbox" checked={st.italic} onChange={e => { st.italic = e.target.checked; propagate(st); commit(); }} /> Italic</label>
              </div>
              <ColourInput value={st.color} onChange={v => { st.color = v; propagate(st); emit(); }} onCommit={commit} />
              <button className="btn small danger" onClick={() => { S.doc.styles = S.doc.styles.filter(x => x !== st); for (const o of S.doc.pages.flatMap(p => p.objects)) if (o.styleId === st.id) o.styleId = null; commit(); }}>Delete style</button>
            </div>
          )}
        </div>
      ))}
      <div className="pad">
        <button className="btn small" onClick={() => {
          const o = textSel[0];
          const st: ParaStyle = o
            ? { id: uid('st'), name: `${o.name} style`, font: o.font || 'Inter', size: o.size || 16, weight: o.weight || 400, italic: !!o.italic, lineHeight: o.lineHeight || 1.3, align: o.align || 'left', color: typeof o.fill === 'string' ? o.fill : '#3B2F22', letterSpacing: o.letterSpacing || 0 }
            : { id: uid('st'), name: 'New style', font: 'Inter', size: 16, weight: 400, italic: false, lineHeight: 1.4, align: 'left', color: '#3B2F22', letterSpacing: 0 };
          S.doc.styles.push(st);
          if (o) o.styleId = st.id;
          setOpen(st.id);
          commit();
        }}><Icon name="plus" size={13} /> {textSel.length ? 'Style from selection' : 'New style'}</button>
      </div>
    </div>
  );
}

// ---------- Grain adjustments ----------
export function AdjustPanel() {
  useStore();
  const target = () => {
    const o = paintTarget(false);
    if (!o) { toast('Select a pixel layer first (or rasterise a shape)'); return null; }
    return o;
  };
  return (
    <div className="panel-scroll">
      <Section title="Colours & filters">
        <div className="filter-list">
          {FILTERS.map(f => (
            <button key={f.id} className="filter-btn" onClick={() => { const o = target(); if (o) { S.ui.sel = [o.id]; S.ui.modal = { kind: 'filter', data: f.id }; emit(); } }}>
              <Icon name="sliders" size={13} /> {f.name}
            </button>
          ))}
        </div>
        <p className="muted small">Filters apply to the selected pixel layer, limited to the current selection if there is one.</p>
      </Section>
      <Section title="Selection">
        <div className="btn-wrap">
          <button className="btn small" onClick={selectAllPixels}>All</button>
          <button className="btn small" onClick={selectNone}>None</button>
          <button className="btn small" onClick={invertSelection}>Invert</button>
        </div>
        <div className="seg wide" role="radiogroup" aria-label="Selection mode">
          {(['replace', 'add', 'subtract', 'intersect'] as const).map(m => (
            <button key={m} className={S.ui.selMode === m ? 'on' : ''} onClick={() => { S.ui.selMode = m; emit(); }}>{m[0].toUpperCase() + m.slice(1)}</button>
          ))}
        </div>
        <div className="btn-wrap">
          <button className="btn small" disabled={!hasSelection()} onClick={() => { const o = target(); if (o) fillSelection(o, S.ui.fg); }}>Fill with FG</button>
          <button className="btn small" disabled={!hasSelection()} onClick={() => { const o = target(); if (o) fillSelection(o, S.ui.bg); }}>Fill with BG</button>
          <button className="btn small" disabled={!hasSelection()} onClick={() => { const o = target(); if (o) fillSelection(o, '#000', true); }}>Clear</button>
          <button className="btn small" disabled={!hasSelection()} onClick={() => { const o = target(); if (o) cropRasterToSelection(o); }}>Crop layer</button>
          <button className="btn small" disabled={!hasSelection()} onClick={() => { const b = selectionBounds(); if (b) cropPageTo(b); }}>Crop canvas</button>
        </div>
      </Section>
      <Section title="Layers">
        <div className="btn-wrap">
          <button className="btn small" onClick={() => newRasterLayer()}>New pixel layer</button>
          <button className="btn small" onClick={() => newRasterLayer('#FFFFFF')}>New white layer</button>
          <button className="btn small" onClick={rasterise}>Rasterise selected</button>
          <button className="btn small" onClick={flattenPage}>Flatten page</button>
          <button className="btn small" onClick={async () => { const fs = await pickFiles('image/*'); importFiles(fs); }}>Open image as layer</button>
        </div>
      </Section>
    </div>
  );
}

// ---------- Motion media bin ----------
export function MediaPanel() {
  useStore();
  return (
    <div className="panel-scroll">
      <Section title="Media" right={<button className="btn small" onClick={async () => importFiles(await pickFiles('video/*,audio/*,image/*'))}><Icon name="upload" size={13} /> Import</button>}>
        {!S.doc.media.length && <p className="muted small">Import video, audio or images, or drop files anywhere on the window.</p>}
        <div className="media-list">
          {S.doc.media.map(m => (
            <div key={m.id} className="media-item" draggable onDragStart={e => e.dataTransfer.setData('text/media', m.id)} title="Drag onto a track, or use + to add at the playhead">
              <div className="media-thumb">
                {m.kind === 'image' ? <img src={imageFor(m.url).src} alt="" /> : m.kind === 'video' ? <video src={m.url} muted preload="metadata" /> : <Icon name="wave" size={22} />}
              </div>
              <div className="media-meta"><span className="name">{m.name}</span><span className="muted small">{m.kind} · {m.duration.toFixed(1)}s{m.w ? ` · ${m.w}×${m.h}` : ''}</span></div>
              <IconBtn icon="plus" title="Add at playhead" onClick={() => addMediaClip(m)} />
              <IconBtn icon="trash" title="Remove from project" onClick={() => {
                S.doc.media = S.doc.media.filter(x => x !== m);
                S.doc.timeline.tracks.forEach(t => (t.clips = t.clips.filter(c => c.mediaId !== m.id)));
                commit();
              }} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Pages as scenes">
        <p className="muted small">Any page can become an animated scene clip, the same artwork you draw in Ink and lay out in Print.</p>
        <div className="media-list">
          {S.doc.pages.filter(p => !p.isMaster).map(p => (
            <div key={p.id} className="media-item">
              <div className="media-thumb"><Thumb pg={p} w={56} /></div>
              <div className="media-meta"><span className="name">{p.name}</span><span className="muted small">{p.w}×{p.h}</span></div>
              <IconBtn icon="plus" title="Add as scene clip at playhead" onClick={() => addSceneClip(p.id)} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Generators">
        <button className="btn small" onClick={() => addTitleClip()}><Icon name="type" size={13} /> Title</button>
      </Section>
    </div>
  );
}

export { rasterCanvas };
