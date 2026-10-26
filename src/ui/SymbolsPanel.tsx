import { useStore } from '../store';
import { SYMBOLS, insertSymbol } from '../ink';
import { subpathsToD } from '../geometry';
import { Section } from './controls';

const GROUPS = [...new Set(SYMBOLS.map(s => s.group))];

export function SymbolsPanel() {
  useStore();
  return (
    <div className="panel-scroll">
      <p className="muted small pad">Click a symbol to place it on the page. It arrives as an ordinary editable path using your current fill and stroke.</p>
      {GROUPS.map(g => (
        <Section key={g} title={g}>
          <div className="symbol-grid">
            {SYMBOLS.filter(s => s.group === g).map(s => (
              <button key={s.id} className="symbol" title={s.name} onClick={() => insertSymbol(s)}>
                <svg viewBox="0 0 100 100" width="34" height="34"><path d={subpathsToD(s.build())} fill="currentColor" fillRule={s.evenodd ? 'evenodd' : 'nonzero'} /></svg>
              </button>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
