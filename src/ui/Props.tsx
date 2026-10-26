import { S, commit, emit, page, selected, useStore, useTime, T, isEditable } from '../store';
import { BLEND_MODES, FONTS, PAGE_PRESETS, blendLabel } from '../model';
import type { AnimProp, Obj } from '../model';
import { anim, localBox, setProp, valueAt } from '../geometry';
import {
  align, booleanOp, breakApart, combine, editTime, findClip, flip, objectToPath, rasterise, reversePaths, simplifyPaths, zorder, threadHead,
} from '../ops';
import { Num, Slider, Select, Section, Row, Text, ColourInput, PaintField, IconBtn } from './controls';
import { Icon } from './icons';
import { layoutAll } from '../text';
import { rasterCanvas } from '../raster';
import { ClipInspector, TrackInspector, SequenceInspector } from './MotionProps';
import { addLayerMask, applyLayerMask, autocropLayer, deleteLayerMask, invertLayerMask, layerToImageSize, mergeDown } from '../grain';
import { EffectsSection, MarkerSection, GroupSection, TransformSection, PathExtras, NodeSection, TextPathSection, TextExtras, TableProps, ImageProps, LayoutSection } from './InkProps';

const live = () => emit();

function KeyBtn({ o, prop }: { o: Obj; prop: AnimProp }) {
  const t = editTime();
  const keys = o.keys?.[prop] || [];
  const on = keys.some(k => Math.abs(k.t - t) < 1 / 60);
  const animated = keys.length > 0;
  return (
    <button className={`key-btn ${on ? 'on' : animated ? 'anim' : ''}`} title={on ? 'Remove keyframe here' : 'Add keyframe at playhead'}
      onClick={() => {
        if (on) { o.keys![prop] = keys.filter(k => Math.abs(k.t - t) >= 1 / 60); if (!o.keys![prop]!.length) { o[prop] = valueAt(keys, o[prop], t); delete o.keys![prop]; } }
        else setProp(o, prop, anim(o, t)[prop], t, true);
        commit();
      }}>
      <Icon name="key" size={10} fill={on} />
    </button>
  );
}

function ObjectProps({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  const t = editTime();
  const a = anim(o, t);
  const mode = S.ui.mode;
  const motion = mode === 'motion';
  const ak = motion && S.ui.autoKey;
  const b = localBox(o);
  const each = (f: (x: Obj) => void) => { objs.filter(isEditable).forEach(f); live(); };
  const kb = (p: AnimProp) => motion ? <KeyBtn o={o} prop={p} /> : null;
  const editable = isEditable(o);

  const W = Math.abs(b.w * a.sx), H = Math.abs(b.h * a.sy);
  const setW = (v: number) => {
    if (['rect', 'ellipse', 'star', 'text', 'embed'].includes(o.type) && !o.keys?.sx?.length) o.w = Math.max(1, v / Math.abs(a.sx));
    else setProp(o, 'sx', Math.sign(a.sx || 1) * v / (b.w || 1), t, ak);
    live();
  };
  const setH = (v: number) => {
    if (['rect', 'ellipse', 'star', 'text', 'embed'].includes(o.type) && !o.keys?.sy?.length) o.h = Math.max(1, v / Math.abs(a.sy));
    else setProp(o, 'sy', Math.sign(a.sy || 1) * v / (b.h || 1), t, ak);
    live();
  };
  const isText = o.type === 'text';
  const shapes = objs.filter(x => ['rect', 'ellipse', 'star', 'path'].includes(x.type));

  return (
    <>
      <div className="obj-head">
        <span className="type-badge">{o.type === 'embed' ? 'placed page' : o.type === 'raster' ? 'pixels' : o.type}</span>
        {objs.length === 1 ? <Text value={o.name} onChange={v => { o.name = v; live(); }} onCommit={commit} /> : <strong>{objs.length} objects</strong>}
      </div>
      {!editable && <div className="note"><Icon name="lock" size={13} /> Locked, or on a hidden or locked layer.</div>}

      <Section title="Transform" right={motion ? <span className="muted small">◆ keyframes</span> : null}>
        <div className="grid2">
          <Row><Num label="X" value={a.x} onChange={v => { setProp(o, 'x', v, t, ak); live(); }} onCommit={commit} />{kb('x')}</Row>
          <Row><Num label="Y" value={a.y} onChange={v => { setProp(o, 'y', v, t, ak); live(); }} onCommit={commit} />{kb('y')}</Row>
          <Row><Num label="W" value={W} min={1} onChange={setW} onCommit={commit} />{kb('sx')}</Row>
          <Row><Num label="H" value={H} min={1} onChange={setH} onCommit={commit} />{kb('sy')}</Row>
          <Row><Num label="↻" value={a.rotation} unit="°" title="Rotation" onChange={v => { setProp(o, 'rotation', v, t, ak); live(); }} onCommit={commit} />{kb('rotation')}</Row>
          <Row>
            <IconBtn icon="flipH" title="Flip horizontally" onClick={() => flip('h')} />
            <IconBtn icon="flipV" title="Flip vertically" onClick={() => flip('v')} />
          </Row>
        </div>
      </Section>

      <Section title="Appearance">
        {o.type !== 'raster' && o.type !== 'embed' && (
          <>
            <div className="field-label">{isText ? 'Text colour' : 'Fill'}</div>
            <PaintField value={o.fill} allowNone={!isText} onChange={p => each(x => (x.fill = p))} onCommit={commit} />
          </>
        )}
        {!isText && o.type !== 'raster' && o.type !== 'embed' && (
          <>
            <div className="field-label">Stroke</div>
            <PaintField value={o.stroke} onChange={p => each(x => { x.stroke = p; if (p && !x.strokeWidth) x.strokeWidth = 1; })} onCommit={commit} />
            {o.stroke && (
              <div className="grid2">
                <Num label="Width" value={o.strokeWidth} min={0} step={0.5} onChange={v => each(x => (x.strokeWidth = v))} onCommit={commit} />
                <Select value={o.dash?.length ? o.dash.join(',') : ''} title="Dash pattern"
                  options={[{ value: '', label: 'Solid' }, { value: '8,6', label: 'Dashed' }, { value: '2,5', label: 'Dotted' }, { value: '14,6,2,6', label: 'Dash-dot' }]}
                  onChange={v => { each(x => (x.dash = v ? v.split(',').map(Number) : null)); commit(); }} />
                <Select value={o.cap || 'round'} title="Line cap" options={[{ value: 'butt', label: 'Butt cap' }, { value: 'round', label: 'Round cap' }, { value: 'square', label: 'Square cap' }]} onChange={v => { each(x => (x.cap = v)); commit(); }} />
                <Select value={o.join || 'round'} title="Line join" options={[{ value: 'miter', label: 'Mitre join' }, { value: 'round', label: 'Round join' }, { value: 'bevel', label: 'Bevel join' }]} onChange={v => { each(x => (x.join = v)); commit(); }} />
              </div>
            )}
          </>
        )}
        <Row>
          <div style={{ flex: 1 }}><Slider label="Opacity" value={Math.round(a.opacity * 100)} min={0} max={100} fmt={v => `${v}%`} onChange={v => { objs.forEach(x => setProp(x, 'opacity', v / 100, t, ak)); live(); }} onCommit={commit} /></div>
          {kb('opacity')}
        </Row>
        <Row label="Blend">
          <Select value={o.blend} options={BLEND_MODES.map(m => ({ value: m, label: blendLabel(m) }))} onChange={v => { each(x => (x.blend = v)); commit(); }} />
        </Row>
      </Section>

      <EffectsSection objs={objs} />
      {(mode === 'ink' || mode === 'print') && <MarkerSection o={o} objs={objs} />}
      {o.type === 'rect' && (
        <Section title="Rectangle">
          <Num label="Corner radius" value={o.rx || 0} min={0} onChange={v => each(x => (x.rx = v))} onCommit={commit} />
        </Section>
      )}
      {o.type === 'star' && (
        <Section title={o.polygon ? 'Polygon' : 'Star'}>
          <div className="grid2">
            <Num label="Points" value={o.points || 5} min={3} max={64} onChange={v => each(x => (x.points = Math.round(v)))} onCommit={commit} />
            {!o.polygon && <Num label="Inner" value={Math.round((o.inner || 0.45) * 100)} min={5} max={100} unit="%" onChange={v => each(x => (x.inner = v / 100))} onCommit={commit} />}
          </div>
          <label className="check"><input type="checkbox" checked={!!o.polygon} onChange={e => { each(x => (x.polygon = e.target.checked)); commit(); }} /> Regular polygon</label>
        </Section>
      )}
      {isText && <TextProps objs={objs} />}
      {o.type === 'raster' && <RasterProps o={o} />}
      {o.type === 'embed' && (
        <Section title="Placed page">
          <Row label="Source">
            <Select value={o.pageId || ''} options={S.doc.pages.filter(p => p.id !== S.ui.pageId).map(p => ({ value: p.id, label: p.name }))} onChange={v => { o.pageId = v; commit(); }} />
          </Row>
          <p className="muted small">This is a live placement: edits to the source page appear here automatically.</p>
        </Section>
      )}

      {o.type === 'table' && <TableProps o={o} />}
      {o.type === 'image' && <ImageProps o={o} />}
      {isText && objs.length === 1 && (mode === 'ink' || mode === 'print') && <TextPathSection o={o} />}
      <Section title="Arrange">
        <div className="btn-row">
          <IconBtn icon="alignL" title="Align left" onClick={() => align('left')} />
          <IconBtn icon="alignCH" title="Align centres horizontally" onClick={() => align('hcenter')} />
          <IconBtn icon="alignR" title="Align right" onClick={() => align('right')} />
          <IconBtn icon="alignT" title="Align top" onClick={() => align('top')} />
          <IconBtn icon="alignCV" title="Align centres vertically" onClick={() => align('vcenter')} />
          <IconBtn icon="alignB" title="Align bottom" onClick={() => align('bottom')} />
          <IconBtn icon="distH" title="Distribute horizontally" onClick={() => align('dh')} />
          <IconBtn icon="distV" title="Distribute vertically" onClick={() => align('dv')} />
        </div>
        <p className="muted small">{objs.length > 1 ? 'Aligns to the selection bounds.' : 'Aligns to the page.'}</p>
        <div className="btn-row">
          <IconBtn icon="up" title="Bring to front" onClick={() => zorder('top')} />
          <IconBtn icon="raise" title="Bring forward" onClick={() => zorder('up')} />
          <IconBtn icon="lower" title="Send backward" onClick={() => zorder('down')} />
          <IconBtn icon="down" title="Send to back" onClick={() => zorder('bottom')} />
          <Select value={o.layerId} title="Move to layer" options={[...S.doc.layers].reverse().map(l => ({ value: l.id, label: `Layer: ${l.name}` }))} onChange={v => { each(x => (x.layerId = v)); commit(); }} />
        </div>
      </Section>

      {(mode === 'ink' || mode === 'print') && <GroupSection objs={objs} />}
      {mode === 'print' && <LayoutSection objs={objs} />}
      {(mode === 'ink' || mode === 'print') && <TransformSection />}
      {(mode === 'ink' || mode === 'print') && shapes.length > 0 && (
        <Section title="Path">
          <div className="btn-row">
            <IconBtn icon="unite" title="Union" onClick={() => booleanOp('unite')} />
            <IconBtn icon="subtract" title="Difference (bottom minus top)" onClick={() => booleanOp('subtract')} />
            <IconBtn icon="intersect" title="Intersection" onClick={() => booleanOp('intersect')} />
            <IconBtn icon="exclude" title="Exclusion" onClick={() => booleanOp('exclude')} />
            <IconBtn icon="divide" title="Division" onClick={() => booleanOp('divide')} />
          </div>
          <div className="btn-wrap">
            <button className="btn small" onClick={objectToPath}>Object to path</button>
            <button className="btn small" onClick={() => simplifyPaths()}>Simplify</button>
            <button className="btn small" onClick={reversePaths}>Reverse</button>
            <button className="btn small" onClick={combine}>Combine</button>
            <button className="btn small" onClick={breakApart}>Break apart</button>
          </div>
          <PathExtras objs={objs} />
        </Section>
      )}
      {mode === 'ink' && S.ui.tools.ink === 'node' && o.type === 'path' && S.ui.nodeSel.length > 0 && (
        <Section title={`Nodes (${S.ui.nodeSel.length})`}>
          <div className="btn-wrap">
            <button className="btn small" onClick={() => { setNodes(o, true); }}><Icon name="smooth" size={14} /> Smooth</button>
            <button className="btn small" onClick={() => { setNodes(o, false); }}><Icon name="corner" size={14} /> Corner</button>
          </div>
        </Section>
      )}
      {S.ui.mode === 'ink' && S.ui.tools.ink === 'node' && o.type === 'path' && <NodeSection o={o} />}
      {o.type !== 'raster' && (
        <div className="pad"><button className="btn small block" onClick={rasterise}><Icon name="grid" size={14} /> Rasterise for Grain</button></div>
      )}
    </>
  );
}

function setNodes(o: Obj, smooth: boolean) {
  for (const s of S.ui.nodeSel) {
    const n = o.subpaths![s.sp].nodes[s.i];
    const sub = o.subpaths![s.sp];
    n.smooth = smooth;
    if (!smooth) { n.ix = n.x; n.iy = n.y; n.ox = n.x; n.oy = n.y; continue; }
    const prev = sub.nodes[(s.i - 1 + sub.nodes.length) % sub.nodes.length], next = sub.nodes[(s.i + 1) % sub.nodes.length];
    const dx = (next.x - prev.x) / 6, dy = (next.y - prev.y) / 6;
    n.ix = n.x - dx; n.iy = n.y - dy; n.ox = n.x + dx; n.oy = n.y + dy;
  }
  o.subpaths = [...o.subpaths!];
  commit();
}

function TextProps({ objs }: { objs: Obj[] }) {
  const o = objs[0];
  const each = (f: (x: Obj) => void) => { objs.forEach(f); live(); };
  const lay = layoutAll(S.doc).get(o.id);
  const head = threadHead(o);
  return (
    <Section title="Text">
      <Row label="Style">
        <Select value={o.styleId || ''} options={[{ value: '', label: 'No paragraph style' }, ...S.doc.styles.map(s => ({ value: s.id, label: s.name }))]}
          onChange={v => {
            const st = S.doc.styles.find(s => s.id === v);
            each(x => { x.styleId = v || null; if (st) Object.assign(x, { font: st.font, size: st.size, weight: st.weight, italic: st.italic, lineHeight: st.lineHeight, align: st.align, fill: st.color, letterSpacing: st.letterSpacing }); });
            commit();
          }} />
      </Row>
      <Row><Select value={o.font || 'Inter'} options={FONTS.map(f => ({ value: f, label: f }))} onChange={v => { each(x => (x.font = v)); commit(); }} /></Row>
      <div className="grid2">
        <Num label="Size" value={o.size || 16} min={4} unit="px" onChange={v => each(x => (x.size = v))} onCommit={commit} />
        <Select value={String(o.weight || 400)} options={[300, 400, 500, 600, 700, 800].map(w => ({ value: String(w), label: { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Heavy' }[w]! }))} onChange={v => { each(x => (x.weight = +v)); commit(); }} />
        <Num label="Leading" value={o.lineHeight || 1.3} step={0.05} min={0.6} onChange={v => each(x => (x.lineHeight = v))} onCommit={commit} />
        <Num label="Tracking" value={o.letterSpacing || 0} step={0.5} onChange={v => each(x => (x.letterSpacing = v))} onCommit={commit} />
      </div>
      <div className="btn-row">
        {(['left', 'center', 'right', 'justify'] as const).map(al => (
          <IconBtn key={al} icon={al === 'left' ? 'alignL' : al === 'center' ? 'alignCH' : al === 'right' ? 'alignR' : 'menu'} title={`Align ${al}`} active={(o.align || 'left') === al} onClick={() => { each(x => (x.align = al)); commit(); }} />
        ))}
        <IconBtn icon="type" title="Italic" active={!!o.italic} onClick={() => { each(x => (x.italic = !x.italic)); commit(); }} />
      </div>
      <div className="grid2">
        <Num label="Columns" value={o.columns || 1} min={1} max={12} onChange={v => each(x => (x.columns = Math.round(v)))} onCommit={commit} />
        <Num label="Gutter" value={o.gutter || 0} min={0} onChange={v => each(x => (x.gutter = v))} onCommit={commit} />
      </div>
      <TextExtras objs={objs} />
      <div className="field-label">Frame background</div>
      <Row>
        <label className="check"><input type="checkbox" checked={!!o.frameFill} onChange={e => { each(x => (x.frameFill = e.target.checked ? '#FFF6E0' : null)); commit(); }} /> Fill frame</label>
        {o.frameFill && <ColourInput value={o.frameFill} onChange={c => each(x => (x.frameFill = c))} onCommit={commit} />}
      </Row>
      {objs.length === 1 && (
        <>
          <div className="field-label">Content{head !== o ? ' (from the first frame in the thread)' : ''}</div>
          <textarea className="text-area" value={head.text || ''} rows={4} onChange={e => { head.text = e.target.value; live(); }} onBlur={commit} onKeyDown={e => e.stopPropagation()} />
          <button className="btn small" onClick={() => { S.ui.modal = { kind: 'story' }; emit(); }}><Icon name="frame" size={14} /> Open story editor…</button>
          <p className="muted small">Use {'{page}'} for automatic page numbers.</p>
          {lay?.overflow && <div className="note warn"><Icon name="warn" size={13} /> Text overflows this frame. Enlarge it, or use the Link tool to thread it into another frame.</div>}
          {(o.linkNext || S.doc.pages.some(p => p.objects.some(x => x.linkNext === o.id))) && (
            <button className="btn small" onClick={() => {
              for (const p of S.doc.pages) for (const x of p.objects) if (x.linkNext === o.id) x.linkNext = null;
              o.linkNext = null; commit();
            }}><Icon name="link" size={14} /> Unlink this frame</button>
          )}
        </>
      )}
    </Section>
  );
}

function RasterProps({ o }: { o: Obj }) {
  const c = rasterCanvas(o);
  const a = anim(o, editTime());
  const dpi = Math.round((c.width / (Math.abs((o.w || c.width) * a.sx) / 96)));
  const hasMask = !!o.maskSrc;
  return (
    <Section title="Pixels">
      <p className="muted small">{c.width} × {c.height} px · effective resolution {dpi} ppi</p>
      <label className="check"><input type="checkbox" checked={!!o.lockAlpha} onChange={e => { o.lockAlpha = e.target.checked; commit('Lock transparency'); }} /> Lock transparency (paint only on existing pixels)</label>
      {S.ui.mode === 'grain' && (
        <>
          <div className="field-label">Layer mask</div>
          {!hasMask ? (
            <div className="btn-wrap">
              <button className="btn small" onClick={() => addLayerMask(o, 'white')}>Add (reveal all)</button>
              <button className="btn small" onClick={() => addLayerMask(o, 'black')}>Add (hide all)</button>
              <button className="btn small" onClick={() => addLayerMask(o, 'selection')}>From selection</button>
              <button className="btn small" onClick={() => addLayerMask(o, 'alpha')}>From transparency</button>
            </div>
          ) : (
            <>
              <label className="check"><input type="checkbox" checked={S.ui.maskEdit} onChange={e => { S.ui.maskEdit = e.target.checked; emit(); }} /> Paint on the mask instead of the pixels</label>
              <div className="btn-wrap">
                <button className="btn small" onClick={() => invertLayerMask(o)}>Invert</button>
                <button className="btn small" onClick={() => applyLayerMask(o)}>Apply</button>
                <button className="btn small danger" onClick={() => deleteLayerMask(o)}>Delete</button>
              </div>
              <p className="muted small">Light colours reveal the layer, dark colours hide it. Nothing is lost until you apply the mask.</p>
            </>
          )}
          <div className="btn-wrap">
            <button className="btn small" onClick={() => mergeDown(o)}>Merge down</button>
            <button className="btn small" onClick={() => layerToImageSize(o)}>Layer to image size</button>
            <button className="btn small" onClick={() => autocropLayer(o)}>Crop to content</button>
          </div>
        </>
      )}
      {S.ui.mode !== 'grain' && <button className="btn small" onClick={() => { S.ui.mode = 'grain'; S.ui.tools.grain = 'brush'; emit(); }}><Icon name="brush" size={14} /> Paint in Grain</button>}
      {(S.ui.mode === 'ink' || S.ui.mode === 'print') && <button className="btn small" onClick={() => { S.ui.modal = { kind: 'trace' }; emit(); }}><Icon name="pen" size={14} /> Trace bitmap…</button>}
    </Section>
  );
}

function PageProps() {
  const pg = page();
  const mode = S.ui.mode;
  const set = (fn: () => void) => { fn(); live(); };
  return (
    <>
      <Section title={pg.isMaster ? 'Master page' : 'Page'}>
        <Row><Text value={pg.name} onChange={v => set(() => (pg.name = v))} onCommit={commit} /></Row>
        <div className="grid2">
          <Num label="W" value={pg.w} min={16} unit="px" onChange={v => set(() => (pg.w = Math.round(v)))} onCommit={() => { Object.values(S.ui.views).forEach(v => (v.fitted = false)); commit(); }} />
          <Num label="H" value={pg.h} min={16} unit="px" onChange={v => set(() => (pg.h = Math.round(v)))} onCommit={() => { Object.values(S.ui.views).forEach(v => (v.fitted = false)); commit(); }} />
        </div>
        <Row>
          <Select value="" options={[{ value: '', label: 'Size preset…' }, ...PAGE_PRESETS.map(p => ({ value: `${p.w}x${p.h}`, label: `${p.name} (${p.w}×${p.h})` }))]}
            onChange={v => { if (!v) return; const [w, h] = v.split('x').map(Number); pg.w = w; pg.h = h; Object.values(S.ui.views).forEach(x => (x.fitted = false)); commit(); }} />
        </Row>
        <p className="muted small">{(pg.w / 96 * 25.4).toFixed(1)} × {(pg.h / 96 * 25.4).toFixed(1)} mm at 96 ppi</p>
        <Row>
          <label className="check"><input type="checkbox" checked={!!pg.bg} onChange={e => { pg.bg = e.target.checked ? '#FFFDF7' : null; commit(); }} /> Background</label>
          {pg.bg && <ColourInput value={pg.bg} onChange={c => set(() => (pg.bg = c))} onCommit={commit} />}
        </Row>
      </Section>
      {mode === 'print' && (
        <Section title="Margins & columns">
          <div className="grid2">
            <Num label="Top" value={pg.margins.t} min={0} onChange={v => set(() => (pg.margins.t = v))} onCommit={commit} />
            <Num label="Bottom" value={pg.margins.b} min={0} onChange={v => set(() => (pg.margins.b = v))} onCommit={commit} />
            <Num label="Left" value={pg.margins.l} min={0} onChange={v => set(() => (pg.margins.l = v))} onCommit={commit} />
            <Num label="Right" value={pg.margins.r} min={0} onChange={v => set(() => (pg.margins.r = v))} onCommit={commit} />
            <Num label="Columns" value={pg.columns} min={1} max={12} onChange={v => set(() => (pg.columns = Math.round(v)))} onCommit={commit} />
            <Num label="Gutter" value={pg.gutter} min={0} onChange={v => set(() => (pg.gutter = v))} onCommit={commit} />
            <Num label="Bleed" value={pg.bleed} min={0} onChange={v => set(() => (pg.bleed = v))} onCommit={commit} />
          </div>
          {!pg.isMaster && (
            <Row label="Master">
              <Select value={pg.masterId || ''} options={[{ value: '', label: 'None' }, ...S.doc.pages.filter(p => p.isMaster).map(p => ({ value: p.id, label: p.name }))]} onChange={v => { pg.masterId = v || null; commit(); }} />
            </Row>
          )}
        </Section>
      )}
      {(
        <Section title="Guides" open={mode === 'print'}>
          {mode === 'print' && (
            <>
              <label className="check"><input type="checkbox" checked={S.ui.baseline.show} onChange={e => { S.ui.baseline.show = e.target.checked; emit(); }} /> Show baseline grid</label>
              <div className="row"><Num label="Baseline" value={S.ui.baseline.size} min={4} max={100} unit="px" onChange={v => { S.ui.baseline.size = Math.round(v); emit(); }} />
                <label className="check"><input type="checkbox" checked={S.ui.baseline.snap} onChange={e => { S.ui.baseline.snap = e.target.checked; emit(); }} /> Snap</label></div>
            </>
          )}
          <label className="check"><input type="checkbox" checked={S.ui.grid.show} onChange={e => { S.ui.grid.show = e.target.checked; emit(); }} /> Show grid</label>
          <div className="row"><Num label="Grid" value={S.ui.grid.size} min={2} max={400} unit="px" onChange={v => { S.ui.grid.size = Math.round(v); emit(); }} />
            <label className="check"><input type="checkbox" checked={S.ui.grid.snap} onChange={e => { S.ui.grid.snap = e.target.checked; emit(); }} /> Snap</label></div>
          <label className="check"><input type="checkbox" checked={S.ui.showGuides} onChange={e => { S.ui.showGuides = e.target.checked; emit(); }} /> Show guides</label>
          <label className="check"><input type="checkbox" checked={S.ui.snap} onChange={e => { S.ui.snap = e.target.checked; emit(); }} /> Snap to page, guides and objects</label>
          <p className="muted small">Drag from the rulers to add guides; drag a guide back onto a ruler to remove it.</p>
          <div className="btn-wrap">
            <button className="btn small" onClick={() => { pg.guides.x.push(pg.w / 2); pg.guides.y.push(pg.h / 2); commit(); }}>Centre guides</button>
            <button className="btn small" onClick={() => { pg.guides = { x: [], y: [] }; commit(); }}>Clear guides</button>
          </div>
        </Section>
      )}
    </>
  );
}

export default function Props() {
  useStore(); useTime();
  void T;
  const objs = selected();
  if (S.ui.mode === 'motion' && !objs.length) {
    const f = S.ui.selClip ? findClip(S.ui.selClip) : null;
    const tr = S.ui.selTrack ? S.doc.timeline.tracks.find(t => t.id === S.ui.selTrack) : null;
    return <div className="panel-scroll">{f ? <ClipInspector c={f.clip} track={f.track} /> : tr ? <TrackInspector tr={tr} /> : <SequenceInspector />}</div>;
  }
  return <div className="panel-scroll">{objs.length ? <ObjectProps objs={objs} /> : <PageProps />}</div>;
}
