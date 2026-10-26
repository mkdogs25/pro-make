import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Gradient, Paint, PatternKind } from '../model';
import { isGradient, isPattern } from '../model';
import { S } from '../store';

export function IconBtn({ icon, title, onClick, active, disabled, size = 16, className = '', children }: {
  icon: string; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; size?: number; className?: string; children?: ReactNode;
}) {
  return (
    <button type="button" className={`icon-btn ${active ? 'on' : ''} ${className}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={size} />{children}
    </button>
  );
}

/** Number field with a draggable label (scrub left/right to change). */
export function Num({ label, value, onChange, step = 1, min, max, unit, width, title, onCommit }: {
  label?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; width?: number; title?: string; onCommit?: () => void;
}) {
  const [txt, setTxt] = useState<string | null>(null);
  const clampv = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const shown = txt ?? (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '');
  const scrub = (e: React.PointerEvent) => {
    const x0 = e.clientX, v0 = value;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let moved = false;
    const mv = (ev: PointerEvent) => { moved = true; onChange(clampv(Math.round((v0 + (ev.clientX - x0) * step * (ev.shiftKey ? 10 : 1)) / step) * step)); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (moved) onCommit?.(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  return (
    <label className="num" title={title} style={width ? { width } : undefined}>
      {label && <span className="num-label" onPointerDown={scrub}>{label}</span>}
      <input
        value={shown} inputMode="decimal"
        onFocus={e => { setTxt(shown); e.target.select(); }}
        onChange={e => { setTxt(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(clampv(v)); }}
        onBlur={() => { setTxt(null); onCommit?.(); }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = clampv(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            onChange(v); setTxt(String(Math.round(v * 100) / 100));
          }
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </label>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, onCommit, fmt }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: () => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="slider">
      <span className="slider-top"><span>{label}</span><span className="muted">{fmt ? fmt(value) : Math.round(value * 100) / 100}</span></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} onPointerUp={() => onCommit?.()} onKeyUp={() => onCommit?.()}
        style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }} />
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, title, width }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; title?: string; width?: number;
}) {
  return (
    <select className="select" value={value} title={title} onChange={e => onChange(e.target.value as T)} style={width ? { width } : undefined}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Section({ title, children, right, open: initial = true }: { title: string; children: ReactNode; right?: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="section">
      <header onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevdown' : 'chevron'} size={13} />
        <span>{title}</span>
        <span className="section-right" onClick={e => e.stopPropagation()}>{right}</span>
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Row({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="row">{label && <span className="row-label">{label}</span>}{children}</div>;
}

export function Text({ value, onChange, placeholder, onCommit }: { value: string; onChange: (v: string) => void; placeholder?: string; onCommit?: () => void }) {
  return <input className="text-input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
    onBlur={() => onCommit?.()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

export function ColourInput({ value, onChange, onCommit, title }: { value: string; onChange: (v: string) => void; onCommit?: () => void; title?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState<string | null>(null);
  const hex6 = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  useEffect(() => {
    const el = ref.current!;
    const ch = () => onCommit?.();
    el.addEventListener('change', ch);
    return () => el.removeEventListener('change', ch);
  });
  return (
    <span className="colour-input" title={title}>
      <span className="swatch" style={{ background: value }} onClick={() => ref.current!.click()}>
        <input ref={ref} type="color" value={hex6} onChange={e => onChange(e.target.value.toUpperCase())} tabIndex={-1} />
      </span>
      <input className="hex" value={hex ?? value} onFocus={() => setHex(value)}
        onChange={e => { setHex(e.target.value); if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value)) onChange(e.target.value.toUpperCase()); }}
        onBlur={() => { setHex(null); onCommit?.(); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </span>
  );
}

export const paintCss = (p: Paint): string => {
  if (!p) return 'transparent';
  if (typeof p === 'string') return p;
  if (isPattern(p)) return p.c1;
  return `${p.kind === 'radial' ? 'radial-gradient(circle' : `linear-gradient(${p.angle + 90}deg`}, ${p.stops.map(s => `${s.c} ${s.o * 100}%`).join(', ')})`;
};

const PATTERNS: { value: PatternKind; label: string }[] = [
  { value: 'stripes', label: 'Stripes' }, { value: 'diagonal', label: 'Diagonal stripes' }, { value: 'dots', label: 'Polka dots' }, { value: 'checks', label: 'Checks' },
  { value: 'grid', label: 'Grid' }, { value: 'cross', label: 'Crosses' }, { value: 'waves', label: 'Waves' },
];

/** Fill/stroke editor: none, flat colour, linear or radial gradient, or a pattern. */
export function PaintField({ value, onChange, onCommit, allowNone = true }: { value: Paint; onChange: (p: Paint) => void; onCommit: () => void; allowNone?: boolean }) {
  const kind = !value ? 'none' : typeof value === 'string' ? 'flat' : value.kind;
  const first = typeof value === 'string' ? value : isGradient(value) ? value.stops[0].c : isPattern(value) ? value.c2 : S.ui.fg;
  const setKind = (k: string) => {
    if (k === 'none') onChange(null);
    else if (k === 'flat') onChange(first);
    else if (k === 'pattern') onChange(isPattern(value) ? value : { kind: 'pattern', pattern: 'stripes', c1: '#FFFDF7', c2: first, size: 16, angle: 0 });
    else {
      const g: Gradient = isGradient(value) ? { ...value, kind: k as 'linear' | 'radial' } : { kind: k as 'linear' | 'radial', angle: 90, stops: [{ o: 0, c: first }, { o: 1, c: S.ui.bg }] };
      onChange(g);
    }
    onCommit();
  };
  const kinds = allowNone ? ['none', 'flat', 'linear', 'radial', 'pattern'] : ['flat', 'linear', 'radial', 'pattern'];
  return (
    <div className="paint-field">
      <div className="seg">
        {kinds.map(k => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} title={k === 'none' ? 'No paint' : k === 'flat' ? 'Flat colour' : k === 'pattern' ? 'Pattern' : `${k[0].toUpperCase()}${k.slice(1)} gradient`}>
            <span className={`paint-chip k-${k}`} />
          </button>
        ))}
      </div>
      {typeof value === 'string' && <ColourInput value={value} onChange={onChange} onCommit={onCommit} />}
      {isPattern(value) && (
        <div className="gradient-edit">
          <Select value={value.pattern} options={PATTERNS} onChange={v => { onChange({ ...value, pattern: v }); onCommit(); }} />
          <div className="row">
            <ColourInput value={value.c1} onChange={c => onChange({ ...value, c1: c })} onCommit={onCommit} title="Background" />
            <ColourInput value={value.c2} onChange={c => onChange({ ...value, c2: c })} onCommit={onCommit} title="Pattern colour" />
          </div>
          <div className="grid2">
            <Num label="Size" value={value.size} min={4} max={200} onChange={v => onChange({ ...value, size: v })} onCommit={onCommit} />
            <Num label="∠" value={value.angle} unit="°" onChange={v => onChange({ ...value, angle: v })} onCommit={onCommit} />
          </div>
        </div>
      )}
      {isGradient(value) && (
        <div className="gradient-edit">
          <div className="gradient-bar" style={{ background: paintCss({ ...value, kind: 'linear', angle: 0 }) }} />
          {value.stops.map((s, i) => (
            <div className="row" key={i}>
              <ColourInput value={s.c} onChange={c => { const st = [...value.stops]; st[i] = { ...s, c }; onChange({ ...value, stops: st }); }} onCommit={onCommit} />
              <Num value={Math.round(s.o * 100)} min={0} max={100} unit="%" width={64} onChange={v => { const st = [...value.stops]; st[i] = { ...s, o: v / 100 }; onChange({ ...value, stops: st.sort((a, b) => a.o - b.o) }); }} onCommit={onCommit} />
              {value.stops.length > 2 && <IconBtn icon="x" title="Remove stop" onClick={() => { onChange({ ...value, stops: value.stops.filter((_, j) => j !== i) }); onCommit(); }} />}
            </div>
          ))}
          <div className="row">
            {value.kind === 'linear' && <Num label="∠" value={value.angle} step={1} unit="°" onChange={v => onChange({ ...value, angle: v })} onCommit={onCommit} />}
            <button className="btn small" onClick={() => { const st = [...value.stops, { o: 0.5, c: '#FFFFFF' }].sort((a, b) => a.o - b.o); onChange({ ...value, stops: st }); onCommit(); }}>+ Stop</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Menu({ label, icon, items, align = 'left' }: { label?: string; icon?: string; items: ({ label: string; icon?: string; kbd?: string; onClick: () => void; disabled?: boolean } | 'sep')[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`btn ghost ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {icon && <Icon name={icon} size={16} />}{label}
      </button>
      {open && (
        <div className={`menu-pop ${align}`} role="menu">
          {items.map((it, i) => it === 'sep' ? <hr key={i} /> : (
            <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={15} />}<span>{it.label}</span>{it.kbd && <kbd>{it.kbd}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
