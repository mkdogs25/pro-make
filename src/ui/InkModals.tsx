import { useState } from 'react';
import { S, emit } from '../store';
import { Num, Select, Slider } from './controls';
import { Icon } from './icons';
import { tiledClones, traceBitmap, type TileOpts, type TraceOpts } from '../ink';

const close = () => { S.ui.modal = null; emit(); };

export function TraceModal() {
  const [o, setO] = useState<TraceOpts>({ mode: 'mono', threshold: 128, levels: 4, speckle: 6, smooth: 1.2, invert: false });
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Trace bitmap">
        <h3><Icon name="pen" size={16} /> Trace bitmap</h3>
        <p className="muted small">Turns the selected pixel layer into editable vector paths.</p>
        <Select value={o.mode} options={[{ value: 'mono', label: 'Brightness cutoff (single path)' }, { value: 'colour', label: 'Colour bands (several stacked paths)' }]} onChange={v => setO({ ...o, mode: v })} />
        {o.mode === 'mono'
          ? <><Slider label="Threshold" value={o.threshold} min={1} max={254} onChange={v => setO({ ...o, threshold: v })} />
            <label className="check"><input type="checkbox" checked={o.invert} onChange={e => setO({ ...o, invert: e.target.checked })} /> Trace the light areas instead</label></>
          : <Slider label="Colour bands" value={o.levels} min={2} max={12} onChange={v => setO({ ...o, levels: v })} />}
        <Slider label="Remove speckles smaller than" value={o.speckle} min={0} max={80} fmt={v => `${v} px²`} onChange={v => setO({ ...o, speckle: v })} />
        <Slider label="Smoothing" value={o.smooth} min={0.2} max={5} step={0.1} onChange={v => setO({ ...o, smooth: v })} />
        <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); traceBitmap(o); }}>Trace</button></div>
      </div>
    </div>
  );
}

export function TilesModal() {
  const [o, setO] = useState<TileOpts>({ rows: 3, cols: 4, gapX: 10, gapY: 10, rotCol: 0, rotRow: 0, scaleCol: 0, scaleRow: 0, fadeCol: 0, fadeRow: 0 });
  const set = (k: keyof TileOpts) => (v: number) => setO({ ...o, [k]: v });
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Tiled clones">
        <h3><Icon name="grid" size={16} /> Create tiled clones</h3>
        <div className="grid2">
          <Num label="Rows" value={o.rows} min={1} max={30} onChange={v => set('rows')(Math.round(v))} />
          <Num label="Columns" value={o.cols} min={1} max={30} onChange={v => set('cols')(Math.round(v))} />
          <Num label="Gap X" value={o.gapX} unit="px" onChange={set('gapX')} />
          <Num label="Gap Y" value={o.gapY} unit="px" onChange={set('gapY')} />
          <Num label="Rotate/col" value={o.rotCol} unit="°" onChange={set('rotCol')} />
          <Num label="Rotate/row" value={o.rotRow} unit="°" onChange={set('rotRow')} />
          <Num label="Scale/col" value={o.scaleCol} unit="%" onChange={set('scaleCol')} />
          <Num label="Scale/row" value={o.scaleRow} unit="%" onChange={set('scaleRow')} />
          <Num label="Fade/col" value={o.fadeCol} unit="%" onChange={set('fadeCol')} />
          <Num label="Fade/row" value={o.fadeRow} unit="%" onChange={set('fadeRow')} />
        </div>
        <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); tiledClones(o); }}>Create</button></div>
      </div>
    </div>
  );
}
