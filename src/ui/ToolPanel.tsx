import { S, emit, useStore } from '../store';
import type { BrushState } from '../store';
import { Num, Section, Select, Slider, Row, ColourInput } from './controls';
import { BRUSH_TOOLS } from '../brush';
import { tool } from '../store';

export function ToolPanel() {
  useStore();
  const t = tool();
  const b = S.ui.brush;
  const set = <K extends keyof BrushState>(k: K, v: BrushState[K]) => { b[k] = v; emit(); };
  const brushy = (BRUSH_TOOLS as string[]).includes(t);
  return (
    <div className="panel-scroll">
      {brushy && (
        <>
          <Section title="Brush">
            <Slider label="Size" value={b.size} min={1} max={400} fmt={v => `${Math.round(v)} px`} onChange={v => set('size', v)} />
            {t !== 'pencil' && <Slider label="Hardness" value={Math.round(b.hardness * 100)} min={0} max={100} fmt={v => `${v}%`} onChange={v => set('hardness', v / 100)} />}
            <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={1} max={100} fmt={v => `${v}%`} onChange={v => set('opacity', v / 100)} />
            <Slider label="Flow (strength)" value={Math.round(b.flow * 100)} min={1} max={100} fmt={v => `${v}%`} onChange={v => set('flow', v / 100)} />
            <Row label="Shape"><Select value={b.shape} options={[{ value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'star', label: 'Star' }, { value: 'spray', label: 'Spray' }, { value: 'chalk', label: 'Chalk' }]} onChange={v => set('shape', v)} /></Row>
            <div className="grid2">
              <Num label="Angle" value={b.angle} unit="°" onChange={v => set('angle', v)} />
              <Num label="Aspect" value={b.aspect} min={5} max={100} unit="%" onChange={v => set('aspect', v)} />
            </div>
          </Section>
          <Section title="Dynamics" open={false}>
            <Slider label="Spacing" value={b.spacing} min={1} max={200} fmt={v => `${v}%`} onChange={v => set('spacing', v)} />
            <Slider label="Scatter" value={b.scatter} min={0} max={300} fmt={v => `${v}%`} onChange={v => set('scatter', v)} />
            <Slider label="Size variation" value={b.sizeJitter} min={0} max={100} fmt={v => `${v}%`} onChange={v => set('sizeJitter', v)} />
            <label className="check"><input type="checkbox" checked={b.pressure} onChange={e => set('pressure', e.target.checked)} /> Respond to pen pressure</label>
          </Section>
          <Section title="Symmetry" open={false}>
            <Select value={b.symmetry} options={[{ value: 'none', label: 'Off' }, { value: 'h', label: 'Mirror left–right' }, { value: 'v', label: 'Mirror top–bottom' }, { value: 'both', label: 'Mirror both ways' }, { value: 'radial', label: 'Radial (kaleidoscope)' }]} onChange={v => set('symmetry', v)} />
            {b.symmetry === 'radial' && <Num label="Segments" value={b.symN} min={2} max={24} onChange={v => set('symN', Math.round(v))} />}
            <p className="muted small">Strokes are mirrored around the centre of the canvas. Not available for smudge, clone or heal.</p>
          </Section>
        </>
      )}
      {(t === 'wand' || t === 'colorsel' || t === 'bucket') && (
        <Section title="Similarity">
          <Slider label="Threshold" value={S.ui.tolerance} min={0} max={255} onChange={v => { S.ui.tolerance = v; emit(); }} />
        </Section>
      )}
      {t === 'bucket' && (
        <Section title="Bucket fill">
          <Row label="Fill"><Select value={S.ui.bucket.mode} options={[{ value: 'similar', label: 'Similar colours' }, { value: 'selection', label: 'Whole selection' }]} onChange={v => { S.ui.bucket.mode = v; emit(); }} /></Row>
          <label className="check"><input type="checkbox" checked={S.ui.bucket.contiguous} onChange={e => { S.ui.bucket.contiguous = e.target.checked; emit(); }} /> Contiguous region only</label>
          <label className="check"><input type="checkbox" checked={S.ui.bucket.merged} onChange={e => { S.ui.bucket.merged = e.target.checked; emit(); }} /> Decide from all visible layers</label>
          <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={1} max={100} fmt={v => `${v}%`} onChange={v => set('opacity', v / 100)} />
        </Section>
      )}
      {t === 'gradient' && S.ui.mode === 'grain' && (
        <Section title="Gradient">
          <Row label="Shape"><Select value={S.ui.gradient.type} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conical', label: 'Conical' }, { value: 'square', label: 'Square' }, { value: 'bilinear', label: 'Bi-linear' }]} onChange={v => { S.ui.gradient.type = v; emit(); }} /></Row>
          <Row label="Repeat"><Select value={S.ui.gradient.repeat} options={[{ value: 'none', label: 'None' }, { value: 'sawtooth', label: 'Sawtooth wave' }, { value: 'triangle', label: 'Triangular wave' }]} onChange={v => { S.ui.gradient.repeat = v; emit(); }} /></Row>
          <label className="check"><input type="checkbox" checked={S.ui.gradient.toTransparent} onChange={e => { S.ui.gradient.toTransparent = e.target.checked; emit(); }} /> Foreground to transparent</label>
          <label className="check"><input type="checkbox" checked={S.ui.gradient.reverse} onChange={e => { S.ui.gradient.reverse = e.target.checked; emit(); }} /> Reverse</label>
          <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={1} max={100} fmt={v => `${v}%`} onChange={v => set('opacity', v / 100)} />
        </Section>
      )}
      {t === 'eyedropper' && (
        <Section title="Colour picker">
          <Row label="Sample"><Select value={String(S.ui.picker.size)} options={[{ value: '1', label: 'Single pixel' }, { value: '3', label: 'Average 3×3' }, { value: '5', label: 'Average 5×5' }, { value: '11', label: 'Average 11×11' }, { value: '31', label: 'Average 31×31' }]} onChange={v => { S.ui.picker.size = +v; emit(); }} /></Row>
          <label className="check"><input type="checkbox" checked={S.ui.picker.merged} onChange={e => { S.ui.picker.merged = e.target.checked; emit(); }} /> Sample all visible layers</label>
          <Row label="Foreground"><ColourInput value={S.ui.fg} onChange={c => { S.ui.fg = c; emit(); }} /></Row>
          <Row label="Background"><ColourInput value={S.ui.bg} onChange={c => { S.ui.bg = c; emit(); }} /></Row>
        </Section>
      )}
      {!brushy && !['wand', 'colorsel', 'bucket', 'gradient', 'eyedropper'].includes(t) && (
        <div className="empty-hint"><p>Pick a painting, fill or selection tool to see its options here.</p></div>
      )}
    </div>
  );
}
