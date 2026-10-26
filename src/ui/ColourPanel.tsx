import { useEffect, useRef, useState } from 'react';
import { S, commit, emit, selected, useStore } from '../store';
import { cmykToRgb, hexToRgb, hslToRgb, hsvToRgb, rgbToCmyk, rgbToHex, rgbToHsl, rgbToHsv } from '../colour';
import { Num, Section } from './controls';
import { isEditable } from '../store';

export function ColourPanel() {
  useStore();
  const grain = S.ui.mode === 'grain';
  const [target, setTarget] = useState<'fg' | 'bg'>('fg');
  const [space, setSpace] = useState<'rgb' | 'hsl' | 'cmyk'>('rgb');
  const hex = S.ui[target];
  const [r, g, b] = hexToRgb(hex);
  const [hsvH, hsvS, hsvV] = rgbToHsv(r, g, b);
  // keep the hue stable while the colour is greyscale
  const hueRef = useRef(hsvH);
  if (hsvS > 0.001 && hsvV > 0.001) hueRef.current = hsvH;
  const hue = hueRef.current;
  const sv = useRef<HTMLCanvasElement>(null);

  const set = (c: string, final = false) => {
    S.ui[target] = c.toUpperCase();
    if (!grain) {
      for (const o of selected().filter(isEditable)) { if (['raster', 'embed', 'image', 'table'].includes(o.type)) continue; if (target === 'fg') o.fill = c.toUpperCase(); else o.stroke = c.toUpperCase(); }
    }
    if (final) {
      const rec = S.ui.recent.filter(x => x !== c.toUpperCase()); rec.unshift(c.toUpperCase()); S.ui.recent = rec.slice(0, 18);
      commit();
    } else emit();
  };

  useEffect(() => {
    const c = sv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const w = c.width, h = c.height;
    ctx.fillStyle = `hsl(${hue},100%,50%)`; ctx.fillRect(0, 0, w, h);
    const gw = ctx.createLinearGradient(0, 0, w, 0); gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gw; ctx.fillRect(0, 0, w, h);
    const gb = ctx.createLinearGradient(0, 0, 0, h); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000');
    ctx.fillStyle = gb; ctx.fillRect(0, 0, w, h);
  }, [hue]);

  const pick = (e: React.PointerEvent) => {
    const el = sv.current!, rc = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width)), v = 1 - Math.max(0, Math.min(1, (e.clientY - rc.top) / rc.height));
    const [rr, gg, bb] = hsvToRgb(hue, s, v);
    set(rgbToHex(rr, gg, bb));
  };
  const hsl = rgbToHsl(r, g, b), cmyk = rgbToCmyk(r, g, b);
  const sw = (c: string) => <button key={c} className="sw" style={{ background: c }} title={c} onClick={() => set(c, true)} />;

  return (
    <div className="panel-scroll">
      <Section title="Colour">
        <div className="seg wide">
          <button className={target === 'fg' ? 'on' : ''} onClick={() => setTarget('fg')}><span className="dot" style={{ background: S.ui.fg }} /> {grain ? 'Foreground' : 'Fill'}</button>
          <button className={target === 'bg' ? 'on' : ''} onClick={() => setTarget('bg')}><span className="dot" style={{ background: S.ui.bg }} /> {grain ? 'Background' : 'Stroke'}</button>
        </div>
        <canvas ref={sv} width={240} height={150} className="sv-box"
          onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); pick(e); }}
          onPointerMove={e => e.buttons && pick(e)} onPointerUp={() => set(S.ui[target], true)} />
        <input type="range" className="hue-range" min={0} max={360} value={Math.round(hue)}
          onChange={e => { hueRef.current = +e.target.value; const [rr, gg, bb] = hsvToRgb(+e.target.value, hsvS || 1, hsvV || 1); set(rgbToHex(rr, gg, bb)); }}
          onPointerUp={() => set(S.ui[target], true)} aria-label="Hue" />
        <div className="seg wide">
          {(['rgb', 'hsl', 'cmyk'] as const).map(m => <button key={m} className={space === m ? 'on' : ''} onClick={() => setSpace(m)}>{m.toUpperCase()}</button>)}
        </div>
        {space === 'rgb' && (
          <div className="grid2">
            <Num label="R" value={r} min={0} max={255} onChange={v => set(rgbToHex(v, g, b))} onCommit={() => set(S.ui[target], true)} />
            <Num label="G" value={g} min={0} max={255} onChange={v => set(rgbToHex(r, v, b))} onCommit={() => set(S.ui[target], true)} />
            <Num label="B" value={b} min={0} max={255} onChange={v => set(rgbToHex(r, g, v))} onCommit={() => set(S.ui[target], true)} />
          </div>
        )}
        {space === 'hsl' && (
          <div className="grid2">
            <Num label="H" value={hsl[0]} min={0} max={360} unit="°" onChange={v => { hueRef.current = v; set(rgbToHex(...hslToRgb(v, hsl[1], hsl[2]))); }} onCommit={() => set(S.ui[target], true)} />
            <Num label="S" value={hsl[1] * 100} min={0} max={100} unit="%" onChange={v => set(rgbToHex(...hslToRgb(hsl[0], v / 100, hsl[2])))} onCommit={() => set(S.ui[target], true)} />
            <Num label="L" value={hsl[2] * 100} min={0} max={100} unit="%" onChange={v => set(rgbToHex(...hslToRgb(hsl[0], hsl[1], v / 100)))} onCommit={() => set(S.ui[target], true)} />
          </div>
        )}
        {space === 'cmyk' && (
          <div className="grid2">
            {(['C', 'M', 'Y', 'K'] as const).map((l, i) => (
              <Num key={l} label={l} value={cmyk[i] * 100} min={0} max={100} unit="%" onChange={v => { const c = [...cmyk] as [number, number, number, number]; c[i] = v / 100; set(rgbToHex(...cmykToRgb(...c))); }} onCommit={() => set(S.ui[target], true)} />
            ))}
          </div>
        )}
        <div className="row"><span className="muted small">Hex</span>
          <input className="text-input hexfield" value={hex} onChange={e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) set(e.target.value); else { S.ui[target] = e.target.value; emit(); } }} onBlur={() => set(/^#[0-9a-f]{6}$/i.test(S.ui[target]) ? S.ui[target] : hex, true)} onKeyDown={e => e.stopPropagation()} />
        </div>
        <p className="muted small">CMYK here is a simple conversion for mixing; exported files are RGB.</p>
      </Section>
      {S.ui.recent.length > 0 && <Section title="Recent colours"><div className="swatch-grid">{S.ui.recent.map(sw)}</div></Section>}
      <Section title="Palette"><div className="swatch-grid">{S.doc.swatches.map(sw)}</div></Section>
    </div>
  );
}
