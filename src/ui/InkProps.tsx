import { useState } from 'react';
import { S, commit, emit, page } from '../store';
import type { Marker, Obj } from '../model';
import { Num, Select, Section, Row, ColourInput, IconBtn } from './controls';
import { Icon } from './icons';
import {
  addNodes, applyTransform, autoSmooth, groupSel, textToOutlines, nodeBreak, nodeJoin, nodeSegmentType, offsetPaths, releaseClip, roughen, setClip, strokeToPath, textToPath, ungroupSel,
} from '../ink';
import { loadImageInto, pickFiles } from '../io';
import { isEditable } from '../store';

const live = () => emit();
const MARKERS: { value: Marker; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrow' }, { value: 'triangle', label: 'Triangle' },
  { value: 'dot', label: 'Dot' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'bar', label: 'Bar' },
];

export function EffectsSection({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  const each = (f: (x: Obj) => void) => { objs.filter(isEditable).forEach(f); live(); };
  const sh = o.shadow;
  return (
    <Section title="Effects" open={false}>
      <Num label="Blur" value={o.blur || 0} min={0} max={80} step={0.5} unit="px" onChange={v => each(x => (x.blur = v))} onCommit={commit} />
      <label className="check"><input type="checkbox" checked={!!sh} onChange={e => { each(x => (x.shadow = e.target.checked ? { dx: 6, dy: 6, blur: 8, color: '#00000066' } : null)); commit(); }} /> Drop shadow</label>
      {sh && (
        <>
          <div className="grid2">
            <Num label="X" value={sh.dx} onChange={v => each(x => x.shadow && (x.shadow.dx = v))} onCommit={commit} />
            <Num label="Y" value={sh.dy} onChange={v => each(x => x.shadow && (x.shadow.dy = v))} onCommit={commit} />
            <Num label="Blur" value={sh.blur} min={0} onChange={v => each(x => x.shadow && (x.shadow.blur = v))} onCommit={commit} />
            <ColourInput value={sh.color} onChange={c => each(x => x.shadow && (x.shadow.color = c))} onCommit={commit} />
          </div>
        </>
      )}
    </Section>
  );
}

export function MarkerSection({ o, objs }: { o: Obj; objs: Obj[] }) {
  const each = (f: (x: Obj) => void) => { objs.filter(isEditable).forEach(f); live(); };
  if (!objs.some(x => x.type === 'path')) return null;
  return (
    <Section title="Line ends" open={false}>
      <Row label="Start"><Select value={o.markerStart || 'none'} options={MARKERS} onChange={v => { each(x => (x.markerStart = v)); commit(); }} /></Row>
      <Row label="End"><Select value={o.markerEnd || 'none'} options={MARKERS} onChange={v => { each(x => (x.markerEnd = v)); commit(); }} /></Row>
      <p className="muted small">Markers draw on open paths and use the stroke colour.</p>
    </Section>
  );
}

export function GroupSection({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  return (
    <Section title="Group & clip" open={objs.length > 1 || !!o.group || !!o.clipBy}>
      <div className="btn-wrap">
        <button className="btn small" onClick={groupSel} disabled={objs.length < 2}><Icon name="group" size={14} /> Group</button>
        <button className="btn small" onClick={ungroupSel} disabled={!objs.some(x => x.group)}>Ungroup</button>
        <button className="btn small" onClick={setClip} disabled={objs.length < 2}><Icon name="clip" size={14} /> Set clip</button>
        <button className="btn small" onClick={releaseClip} disabled={!objs.some(x => x.clipBy)}>Release clip</button>
      </div>
      <p className="muted small">Grouped objects select and move together (Ctrl-click to pick one inside a group). Set clip uses the top shape as a mask for the others.</p>
    </Section>
  );
}

export function TransformSection() {
  const [v, setV] = useState({ dx: 0, dy: 0, sx: 100, sy: 100, lock: true, rot: 0, skx: 0, sky: 0 });
  const upd = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const apply = () => {
    applyTransform({ dx: v.dx, dy: v.dy, sx: v.sx / 100, sy: (v.lock ? v.sx : v.sy) / 100, rot: v.rot, skx: v.skx, sky: v.sky });
    setV({ ...v, dx: 0, dy: 0, sx: 100, sy: 100, rot: 0, skx: 0, sky: 0 });
  };
  return (
    <Section title="Transform" open={false}>
      <div className="field-label">Move (px)</div>
      <div className="grid2"><Num label="X" value={v.dx} onChange={x => upd({ dx: x })} /><Num label="Y" value={v.dy} onChange={x => upd({ dy: x })} /></div>
      <div className="field-label">Scale</div>
      <div className="grid2">
        <Num label="W" value={v.sx} unit="%" min={1} onChange={x => upd({ sx: x })} />
        <Num label="H" value={v.lock ? v.sx : v.sy} unit="%" min={1} onChange={x => upd({ sy: x })} />
      </div>
      <label className="check"><input type="checkbox" checked={v.lock} onChange={e => upd({ lock: e.target.checked })} /> Keep proportions</label>
      <div className="field-label">Rotate & skew (degrees)</div>
      <div className="grid2">
        <Num label="↻" value={v.rot} onChange={x => upd({ rot: x })} />
        <span />
        <Num label="Skew H" value={v.skx} min={-80} max={80} onChange={x => upd({ skx: x })} />
        <Num label="Skew V" value={v.sky} min={-80} max={80} onChange={x => upd({ sky: x })} />
      </div>
      <button className="btn small primary" onClick={apply}>Apply to selection</button>
      <p className="muted small">Transforms happen around the selection centre. Skew bakes shapes into editable paths.</p>
    </Section>
  );
}

export function PathExtras({ objs }: { objs: Obj[] }) {
  const [off, setOff] = useState(6);
  const [rough, setRough] = useState(3);
  const hasPath = objs.some(x => x.type === 'path');
  return (
    <>
      <div className="row">
        <Num label="Offset" value={off} min={0.5} unit="px" onChange={setOff} />
        <button className="btn small" onClick={() => offsetPaths(off)} title="Grow the shape">Outset</button>
        <button className="btn small" onClick={() => offsetPaths(-off)} title="Shrink the shape">Inset</button>
      </div>
      <div className="btn-wrap">
        <button className="btn small" onClick={strokeToPath}>Stroke to path</button>
        <button className="btn small" onClick={() => { S.ui.modal = { kind: 'tiles' }; emit(); }}>Tiled clones…</button>
        {hasPath && <button className="btn small" onClick={addNodes}>Add nodes</button>}
        {hasPath && <button className="btn small" onClick={autoSmooth}>Auto-smooth</button>}
      </div>
      {hasPath && (
        <div className="row">
          <Num label="Roughen" value={rough} min={0.5} unit="px" onChange={setRough} />
          <button className="btn small" onClick={() => roughen(rough)}>Apply</button>
        </div>
      )}
    </>
  );
}

export function NodeSection({ o }: { o: Obj }) {
  return (
    <Section title="Segments & joins">
      <div className="btn-wrap">
        <button className="btn small" onClick={() => nodeSegmentType('line')}>Segment: line</button>
        <button className="btn small" onClick={() => nodeSegmentType('curve')}>Segment: curve</button>
        <button className="btn small" onClick={nodeJoin}>Join ends</button>
        <button className="btn small" onClick={nodeBreak}>Break path</button>
      </div>
      <p className="muted small">Shift-click to select several nodes; Alt-click deletes one; double-click a segment to add a node.</p>
      <span hidden>{o.id}</span>
    </Section>
  );
}

export function TextPathSection({ o }: { o: Obj }) {
  const paths = page().objects.filter(x => x.type === 'path');
  return (
    <Section title="Text on path" open={!!o.textPath}>
      <Row label="Path">
        <Select value={o.textPath || ''} options={[{ value: '', label: 'None (normal frame)' }, ...paths.map(p => ({ value: p.id, label: p.name }))]}
          onChange={v => textToPath(o.id, v || null)} />
      </Row>
      {o.textPath && <Num label="Start offset" value={o.textOffset || 0} step={2} onChange={v => { o.textOffset = v; live(); }} onCommit={commit} />}
      <p className="muted small">Draw a path, then pick it here. Align centre or right in the Text section to position along the path.</p>
    </Section>
  );
}

export function TextExtras({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  const each = (f: (x: Obj) => void) => { objs.forEach(f); live(); };
  return (
    <>
      <button className="btn small" onClick={textToOutlines}>Convert text to outlines</button>
      <div className="grid2">
        <Num label="Indent" value={o.indent || 0} min={0} onChange={v => each(x => (x.indent = v))} onCommit={commit} />
        <Num label="Para gap" value={o.paraSpace || 0} min={0} onChange={v => each(x => (x.paraSpace = v))} onCommit={commit} />
        <Num label="Word gap" value={o.wordSpacing || 0} step={0.5} onChange={v => each(x => (x.wordSpacing = v))} onCommit={commit} />
        <Select value={o.valign || 'top'} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} onChange={v => { each(x => (x.valign = v)); commit(); }} title="Vertical alignment" />
      </div>
      <label className="check"><input type="checkbox" checked={!!o.markup} onChange={e => { each(x => (x.markup = e.target.checked)); commit(); }} /> Rich text: **bold** and *italic*</label>
      <Row label="Drop cap"><Num value={o.dropCap || 0} min={0} max={6} width={80} onChange={v => each(x => (x.dropCap = Math.round(v)))} onCommit={commit} /><span className="muted small">lines (0 = off)</span></Row>
      <Row label="Outline">
        <Num value={o.strokeWidth || 0} min={0} step={0.5} width={70} onChange={v => each(x => { x.strokeWidth = v; if (v && !x.stroke) x.stroke = S.ui.bg; })} onCommit={commit} />
        {typeof o.stroke === 'string' && <ColourInput value={o.stroke} onChange={c => each(x => (x.stroke = c))} onCommit={commit} />}
      </Row>
    </>
  );
}

export function TableProps({ o }: { o: Obj }) {
  const rows = o.rows || 1, cols = o.cols || 1;
  const cells = o.cells || [];
  const cell = (r: number, c: number) => cells[r]?.[c] ?? '';
  const resize = (nr: number, nc: number) => {
    nr = Math.max(1, Math.min(40, nr)); nc = Math.max(1, Math.min(20, nc));
    o.cells = Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => cell(r, c)));
    o.rows = nr; o.cols = nc; o.colW = undefined; o.rowH = undefined;
    commit();
  };
  return (
    <Section title="Table">
      <div className="grid2">
        <Num label="Rows" value={rows} min={1} max={40} onChange={v => resize(Math.round(v), cols)} />
        <Num label="Columns" value={cols} min={1} max={20} onChange={v => resize(rows, Math.round(v))} />
        <Num label="Padding" value={o.pad ?? 6} min={0} onChange={v => { o.pad = v; live(); }} onCommit={commit} />
        <Num label="Border" value={o.borderW ?? 1} min={0} step={0.5} onChange={v => { o.borderW = v; live(); }} onCommit={commit} />
      </div>
      <div className="row"><span className="muted small">Border</span><ColourInput value={o.borderColor || '#000000'} onChange={c => { o.borderColor = c; live(); }} onCommit={commit} /></div>
      <label className="check"><input type="checkbox" checked={!!o.header} onChange={e => { o.header = e.target.checked; commit(); }} /> Header row</label>
      {o.header && <div className="row"><span className="muted small">Header fill</span><ColourInput value={o.headerFill || '#E9D9B8'} onChange={c => { o.headerFill = c; live(); }} onCommit={commit} /></div>}
      <label className="check"><input type="checkbox" checked={!!o.zebra} onChange={e => { o.zebra = e.target.checked ? '#F3EBD8' : null; commit(); }} /> Alternate row shading</label>
      {o.zebra && <ColourInput value={o.zebra} onChange={c => { o.zebra = c; live(); }} onCommit={commit} />}
      <div className="table-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(70px, 1fr))` }}>
        {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
          <textarea key={`${r}-${c}`} rows={1} value={cell(r, c)} className={`cell ${o.header && r === 0 ? 'head' : ''}`}
            onChange={e => { o.cells = (o.cells || []).map(row => [...row]); o.cells[r][c] = e.target.value; live(); }} onBlur={commit} onKeyDown={e => e.stopPropagation()} aria-label={`Row ${r + 1}, column ${c + 1}`} />
        )))}
      </div>
      <div className="grid2">
        <Num label="Size" value={o.size || 14} min={4} onChange={v => { o.size = v; live(); }} onCommit={commit} />
        <Select value={o.align || 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} onChange={v => { o.align = v; commit(); }} />
      </div>
      <div className="row"><span className="muted small">Text colour</span><ColourInput value={typeof o.fill === 'string' ? o.fill : '#000000'} onChange={c => { o.fill = c; live(); }} onCommit={commit} /></div>
    </Section>
  );
}

export function ImageProps({ o }: { o: Obj }) {
  return (
    <Section title="Image frame">
      <div className="btn-wrap">
        <button className="btn small primary" onClick={async () => { const f = (await pickFiles('image/*', false))[0]; if (f) loadImageInto(o, f); }}><Icon name="upload" size={13} /> {o.src ? 'Replace image…' : 'Choose image…'}</button>
        {o.src && <button className="btn small" onClick={() => { o.src = undefined; commit(); }}>Remove</button>}
      </div>
      <Row label="Fit">
        <Select value={o.fit || 'fill'} options={[{ value: 'fill', label: 'Fill frame (crop)' }, { value: 'fit', label: 'Fit inside frame' }, { value: 'stretch', label: 'Stretch' }, { value: 'none', label: 'Original size' }]}
          onChange={v => { o.fit = v; o.imgX = 0; o.imgY = 0; o.imgScale = 1; commit(); }} />
      </Row>
      <div className="grid2">
        <Num label="Zoom" value={Math.round((o.imgScale || 1) * 100)} min={10} max={800} unit="%" onChange={v => { o.imgScale = v / 100; live(); }} onCommit={commit} />
        <Num label="Rotate" value={o.imgRot || 0} unit="°" onChange={v => { o.imgRot = v; live(); }} onCommit={commit} />
        <Num label="Offset X" value={o.imgX || 0} onChange={v => { o.imgX = v; live(); }} onCommit={commit} />
        <Num label="Offset Y" value={o.imgY || 0} onChange={v => { o.imgY = v; live(); }} onCommit={commit} />
      </div>
      <div className="btn-wrap">
        <button className="btn small" onClick={() => { o.imgX = 0; o.imgY = 0; o.imgScale = 1; o.imgRot = 0; commit(); }}>Reset position</button>
      </div>
      <Row label="Background"><ColourInput value={typeof o.fill === 'string' ? o.fill : '#EFE6D2'} onChange={c => { o.fill = c; live(); }} onCommit={commit} />
        <IconBtn icon="x" title="No background" onClick={() => { o.fill = null; commit(); }} /></Row>
      <p className="muted small">Use the pan controls to reposition the picture inside the frame; the frame itself resizes with the selection handles.</p>
    </Section>
  );
}

export function LayoutSection({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  const each = (f: (x: Obj) => void) => { objs.filter(isEditable).forEach(f); live(); };
  return (
    <Section title="Wrap & link" open={!!o.wrap || !!o.href}>
      <label className="check"><input type="checkbox" checked={!!o.wrap} onChange={e => { each(x => (x.wrap = e.target.checked)); commit(); }} /> Text flows around this object</label>
      {o.wrap && <Num label="Distance" value={o.wrapPad ?? 8} min={0} unit="px" onChange={v => each(x => (x.wrapPad = v))} onCommit={commit} />}
      <Row label="Link">
        <input className="text-input" placeholder="https://… or #page:3" value={o.href || ''} onChange={e => each(x => (x.href = e.target.value || undefined))} onBlur={commit} onKeyDown={e => e.stopPropagation()} />
      </Row>
      <p className="muted small">Wrap works for text frames that aren&apos;t rotated. Links become clickable areas in exported PDFs.</p>
    </Section>
  );
}
