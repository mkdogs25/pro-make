import { useEffect, useRef } from 'react';
import { historyList, jumpHistory, useStore, canUndo, canRedo, undo, redo } from '../store';
import { Icon } from './icons';

export function HistoryPanel() {
  useStore();
  const list = historyList();
  const cur = useRef<HTMLButtonElement>(null);
  useEffect(() => { cur.current?.scrollIntoView({ block: 'nearest' }); });
  return (
    <div className="panel-scroll">
      <div className="pad row">
        <button className="btn small" disabled={!canUndo()} onClick={undo}><Icon name="undo" size={13} /> Undo</button>
        <button className="btn small" disabled={!canRedo()} onClick={redo}><Icon name="redo" size={13} /> Redo</button>
      </div>
      <p className="muted small pad">Click any step to go back to that moment. Making a new change after going back replaces the later steps.</p>
      <div className="history-list">
        {list.map((h, i) => (
          <button key={i} ref={h.at ? cur : undefined} className={`hist ${h.at ? 'at' : i > list.findIndex(x => x.at) ? 'future' : ''}`} onClick={() => jumpHistory(i)}>
            <span className="n">{i}</span><span>{h.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
