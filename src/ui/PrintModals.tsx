import { useMemo, useRef, useState } from 'react';
import { S, commit, emit, selected, toast } from '../store';
import { newObj } from '../model';
import { Icon } from './icons';
import { Num, Select } from './controls';
import { docStats, findAll, goTo, replaceAllText, replaceOne, type FindOpts } from '../findrep';
import { defaultPdfOpts, exportPDF, type PdfOpts } from '../io';
import { addObj, currentLayerId, threadHead } from '../ops';
import { page } from '../store';

const close = () => { S.ui.modal = null; emit(); };
const Back = ({ children, label, wide }: { children: React.ReactNode; label: string; wide?: boolean }) => (
  <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
    <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={label}>{children}</div>
  </div>
);

export function FindModal() {
  const [q, setQ] = useState(''), [rep, setRep] = useState('');
  const [opts, setOpts] = useState<FindOpts>({ matchCase: false, whole: false });
  const [idx, setIdx] = useState(0);
  const hits = useMemo(() => findAll(q, opts), [q, opts, S.doc]);  // eslint-disable-line react-hooks/exhaustive-deps
  const cur = hits.length ? Math.min(idx, hits.length - 1) : 0;
  const go = (i: number) => { if (!hits.length) return; const n = (i + hits.length) % hits.length; setIdx(n); goTo(hits[n]); };
  return (
    <Back label="Find and replace">
      <h3><Icon name="type" size={16} /> Find &amp; replace</h3>
      <input className="text-input" autoFocus placeholder="Find…" value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') go(cur + 1); }} />
      <input className="text-input" placeholder="Replace with…" value={rep} onChange={e => setRep(e.target.value)} onKeyDown={e => e.stopPropagation()} />
      <div className="row">
        <label className="check"><input type="checkbox" checked={opts.matchCase} onChange={e => setOpts({ ...opts, matchCase: e.target.checked })} /> Match case</label>
        <label className="check"><input type="checkbox" checked={opts.whole} onChange={e => setOpts({ ...opts, whole: e.target.checked })} /> Whole word</label>
        <span className="grow" />
        <span className="muted small">{q ? `${hits.length ? cur + 1 : 0} of ${hits.length}` : 'Searches every page, text frame and table'}</span>
      </div>
      <div className="modal-actions">
        <button className="btn" disabled={!hits.length} onClick={() => go(cur - 1)}>Previous</button>
        <button className="btn" disabled={!hits.length} onClick={() => go(cur + 1)}>Next</button>
        <span className="grow" />
        <button className="btn" disabled={!hits.length} onClick={() => { replaceOne(hits[cur], q, rep, opts); setIdx(cur); }}>Replace</button>
        <button className="btn primary" disabled={!hits.length} onClick={() => { const n = replaceAllText(q, rep, opts); toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`); }}>Replace all</button>
      </div>
    </Back>
  );
}

export function StoryModal() {
  const frame = selected().find(o => o.type === 'text');
  const head = frame ? threadHead(frame) : null;
  const [, force] = useState(0);
  if (!head) { close(); return null; }
  const text = head.text || '';
  const words = (text.match(/\S+/g) || []).length;
  const paras = text.split('\n').filter(Boolean).length;
  return (
    <Back label="Story editor" wide>
      <h3><Icon name="frame" size={16} /> Story editor</h3>
      <textarea className="text-area story" autoFocus spellCheck value={text} rows={14}
        onChange={e => { head.text = e.target.value; force(x => x + 1); emit(); }} onKeyDown={e => e.stopPropagation()}
        style={{ fontFamily: head.font, fontSize: 15, lineHeight: 1.5 }} />
      <div className="muted small">{words} words · {text.length} characters · {paras} paragraph{paras === 1 ? '' : 's'}{head.markup ? ' · rich text on: **bold**, *italic*' : ''}</div>
      <div className="modal-actions"><span className="grow" /><button className="btn primary" onClick={() => { commit(); close(); }}>Done</button></div>
    </Back>
  );
}

export function DocInfoModal() {
  const st = docStats();
  const rows: [string, string | number][] = [
    ['Pages', `${st.pages} (+ ${st.masters} master)`], ['Layers', st.layers], ['Objects', st.objects], ['Text frames', st.frames], ['Words', st.words.toLocaleString()],
    ['Characters', st.chars.toLocaleString()], ['Image frames', st.images], ['Pixel layers', st.rasters], ['Vector shapes', st.vectors], ['Tables', st.tables],
    ['Paragraph styles', st.styles], ['Fonts', st.fonts.join(', ') || '–'],
  ];
  return (
    <Back label="Document info">
      <h3><Icon name="file" size={16} /> Document info</h3>
      <dl className="stats">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="modal-actions"><span className="grow" /><button className="btn primary" onClick={close}>Close</button></div>
    </Back>
  );
}

export function PdfModal() {
  const [o, setO] = useState<PdfOpts>({ ...defaultPdfOpts });
  const set = <K extends keyof PdfOpts>(k: K, v: PdfOpts[K]) => setO({ ...o, [k]: v });
  return (
    <Back label="Export PDF">
      <h3><Icon name="pages" size={16} /> Export PDF</h3>
      <div className="row"><span className="row-label">Pages</span><Select value={o.scope} options={[{ value: 'all', label: 'All pages' }, { value: 'current', label: 'Current page only' }]} onChange={v => set('scope', v)} /></div>
      <div className="row"><span className="row-label">Output</span>
        <Select value={o.vector ? 'vector' : 'raster'} options={[{ value: 'raster', label: 'Print-exact image pages (all effects, your fonts)' }, { value: 'vector', label: 'Vector (selectable shapes, standard fonts)' }]} onChange={v => set('vector', v === 'vector')} /></div>
      {!o.vector && <div className="row"><span className="row-label">Quality</span><Select value={String(o.ppi)} options={[{ value: '150', label: '150 ppi (screen)' }, { value: '220', label: '220 ppi' }, { value: '300', label: '300 ppi (print)' }, { value: '450', label: '450 ppi (high detail)' }]} onChange={v => set('ppi', +v)} /></div>}
      {!o.vector && <>
        <label className="check"><input type="checkbox" checked={o.bleed} onChange={e => set('bleed', e.target.checked)} /> Include bleed (as set in each page’s margins panel)</label>
        <label className="check"><input type="checkbox" checked={o.marks} onChange={e => set('marks', e.target.checked)} /> Add crop marks</label>
        <label className="check"><input type="checkbox" checked={o.grey} onChange={e => set('grey', e.target.checked)} /> Greyscale</label>
      </>}
      <label className="check"><input type="checkbox" checked={o.bookmarks} onChange={e => set('bookmarks', e.target.checked)} /> Bookmarks from page names</label>
      <label className="check"><input type="checkbox" checked={o.links} onChange={e => set('links', e.target.checked)} /> Clickable links (objects with a link set)</label>
      {o.vector && <p className="muted small">Vector output keeps shapes sharp but uses Helvetica, Times or Courier in place of web fonts, and some effects (blur, blend modes) are not carried over.</p>}
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { close(); exportPDF(o); }}>Export</button></div>
    </Back>
  );
}

export function TocModal() {
  const [styleId, setStyleId] = useState(S.doc.styles[0]?.id || '');
  const [title, setTitle] = useState('Contents');
  const ref = useRef(0); void ref;
  const build = () => {
    const entries: [string, number][] = [];
    const pages = S.doc.pages.filter(p => !p.isMaster);
    pages.forEach((pg, i) => { for (const o of pg.objects) if (o.type === 'text' && o.styleId === styleId && o.text) entries.push([o.text.split('\n')[0], i + 1]); });
    if (!entries.length) { toast('No text uses that paragraph style yet'); return; }
    const pg = page();
    const rows = entries.length + 1;
    const t = newObj('table', currentLayerId(), {
      name: 'Table of contents', x: pg.w / 2, y: 140 + rows * 14, w: Math.min(pg.w - 96, 520), h: rows * 28, rows, cols: 2, colW: [5, 1],
      cells: [[title, ''], ...entries.map(([a, n]) => [a, String(n)])], header: true, headerFill: null, borderW: 0, pad: 4, size: 15, font: 'Lora',
    });
    addObj(t); commit(); close(); toast(`Table of contents with ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} added`);
  };
  return (
    <Back label="Table of contents">
      <h3><Icon name="menu" size={16} /> Table of contents</h3>
      <p className="muted small">Collects the first line of every text frame that uses the chosen paragraph style, with its page number.</p>
      <div className="row"><span className="row-label">Style</span><Select value={styleId} options={S.doc.styles.map(s => ({ value: s.id, label: s.name }))} onChange={setStyleId} /></div>
      <div className="row"><span className="row-label">Title</span><input className="text-input" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.stopPropagation()} /></div>
      <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={build}>Insert</button></div>
    </Back>
  );
}
export { Num };
