import { useState } from 'react';
import { S, emit, page } from '../store';
import { Icon } from './icons';
import { Select, Slider } from './controls';
import { defaultImgOpts, exportImage, type ImgOpts } from '../io';

const close = () => { S.ui.modal = null; emit(); };

export function ImageExportModal() {
  const [o, setO] = useState<ImgOpts>({ ...defaultImgOpts });
  const pg = page();
  const set = <K extends keyof ImgOpts>(k: K, v: ImgOpts[K]) => setO({ ...o, [k]: v });
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Export image">
        <h3><Icon name="image" size={16} /> Export image</h3>
        <div className="row"><span className="row-label">Format</span><Select value={o.format} options={[{ value: 'png', label: 'PNG (lossless, transparency)' }, { value: 'jpeg', label: 'JPEG (small photos)' }, { value: 'webp', label: 'WebP (small, transparency)' }]} onChange={v => set('format', v)} /></div>
        {o.format !== 'png' && <Slider label="Quality" value={Math.round(o.quality * 100)} min={10} max={100} fmt={v => `${v}%`} onChange={v => set('quality', v / 100)} />}
        <div className="row"><span className="row-label">Area</span><Select value={o.scope} options={[{ value: 'page', label: 'Whole page' }, { value: 'selection', label: 'Selection only' }]} onChange={v => set('scope', v)} /></div>
        <div className="row"><span className="row-label">Scale</span><Select value={String(o.scale)} options={[0.25, 0.5, 1, 2, 3, 4].map(v => ({ value: String(v), label: `${v * 100}% · ${Math.round(pg.w * v)} × ${Math.round(pg.h * v)} px` }))} onChange={v => set('scale', +v)} /></div>
        {o.format !== 'jpeg' && <div className="row"><span className="row-label">Background</span><Select value={o.bg} options={[{ value: 'transparent', label: 'Transparent' }, { value: 'white', label: 'White' }, { value: 'page', label: 'Page colour' }]} onChange={v => set('bg', v)} /></div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => exportImage(o, true)}><Icon name="copy" size={13} /> Copy</button>
          <span className="grow" /><button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={() => { close(); exportImage(o); }}>Export</button>
        </div>
      </div>
    </div>
  );
}
