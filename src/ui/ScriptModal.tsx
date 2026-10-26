import { useRef, useState } from 'react';
import { S, emit } from '../store';
import { Icon } from './icons';
import { EXAMPLES, runScript } from '../api';

const close = () => { S.ui.modal = null; emit(); };
const KEY = 'promake-script';

export function ScriptModal() {
  const [code, setCode] = useState(() => { try { return localStorage.getItem(KEY) || EXAMPLES[0].code; } catch { return EXAMPLES[0].code; } });
  const [out, setOut] = useState<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);
  const save = (c: string) => { setCode(c); try { localStorage.setItem(KEY, c); } catch { /* ignore */ } };
  const run = async () => {
    setOut([]);
    await runScript(code, s => setOut(o => [...o, s]));
    setTimeout(() => logRef.current?.scrollTo(0, 1e6), 0);
  };
  return (
    <div className="modal-back" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="modal wide" role="dialog" aria-label="Script console">
        <h3><Icon name="code" size={16} /> Script console</h3>
        <p className="muted small">Write JavaScript against the <code>promake</code> object to automate drawing, layout, pixels and video. Everything the editor can do is reachable: <code>promake.rect()</code>, <code>.ellipse()</code>, <code>.text()</code>, <code>.path()</code>, <code>.ops</code>, <code>.ink</code>, <code>.grain</code>, <code>.motion</code>… Call <code>promake.commit()</code> to make changes undoable.</p>
        <select className="select" value="" onChange={e => { const ex = EXAMPLES.find(x => x.name === e.target.value); if (ex) save(ex.code); }}>
          <option value="">Load an example…</option>
          {EXAMPLES.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
        <textarea className="text-area code" value={code} rows={12} spellCheck={false} onChange={e => save(e.target.value)} onKeyDown={e => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); }} />
        <pre className="script-out" ref={logRef} aria-live="polite">{out.join('\n') || 'Output appears here. Press Ctrl+Enter to run.'}</pre>
        <div className="modal-actions"><span className="grow" /><button className="btn" onClick={close}>Close</button><button className="btn primary" onClick={run}><Icon name="play" size={13} fill /> Run</button></div>
      </div>
    </div>
  );
}
