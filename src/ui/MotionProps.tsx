import { S, T, commit, emit, useTime } from '../store';
import type { Clip, ClipProp, Track, TransitionType } from '../model';
import { FONTS } from '../model';
import { Num, Slider, Select, Section, Row, Text, ColourInput, IconBtn } from './controls';
import { Icon } from './icons';
import { CLIP_FILTERS, filterDef, newFilter } from '../clipfx';
import { clearClipKeys, clipKeyList, jumpClipKey, moveTrack, overlapPrev, setClipProp, setOverlap, toggleClipKey } from '../motion';
import { clipValue } from '../render';
import { fmtTime } from '../geometry';
import { seek } from '../playback';
import { addTrack } from '../ops';

const live = () => emit();

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: 'dissolve', label: 'Dissolve' }, { value: 'wipel', label: 'Wipe from left' }, { value: 'wiper', label: 'Wipe from right' },
  { value: 'wipeu', label: 'Wipe from top' }, { value: 'wiped', label: 'Wipe from bottom' }, { value: 'slidel', label: 'Slide in from left' },
  { value: 'slider', label: 'Slide in from right' }, { value: 'zoom', label: 'Zoom in' }, { value: 'iris', label: 'Iris' }, { value: 'barn', label: 'Barn doors' }, { value: 'dip', label: 'Dip to black' },
];

function AnimRow({ c, prop, label, to, from, unit, min, max, step }: { c: Clip; prop: ClipProp; label: string; to: (v: number) => number; from: (v: number) => number; unit?: string; min?: number; max?: number; step?: number }) {
  useTime();
  const v = clipValue(c, prop, T.time);
  const keys = clipKeyList(c, prop);
  const lt = T.time - c.start;
  const on = keys.some(k => Math.abs(k.t - lt) < 1 / 60);
  return (
    <div className="anim-row">
      <Num label={label} value={to(v)} unit={unit} min={min} max={max} step={step} onChange={x => { setClipProp(c, prop, from(x)); live(); }} onCommit={commit} />
      <IconBtn icon="stepb" title="Previous keyframe" size={11} disabled={!keys.length} onClick={() => jumpClipKey(c, prop, -1)} />
      <button className={`key-btn ${on ? 'on' : keys.length ? 'anim' : ''}`} title={on ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'} onClick={() => toggleClipKey(c, prop)}><Icon name="key" size={10} fill={on} /></button>
      <IconBtn icon="stepf" title="Next keyframe" size={11} disabled={!keys.length} onClick={() => jumpClipKey(c, prop, 1)} />
    </div>
  );
}

export function ClipInspector({ c, track }: { c: Clip; track: Track }) {
  useTime();
  const set = (fn: () => void) => { fn(); live(); };
  const md = c.mediaId ? S.doc.media.find(m => m.id === c.mediaId) : null;
  const isVideo = track.kind === 'video';
  const hasAudio = track.kind === 'audio' || md?.kind === 'video';
  const ov = overlapPrev(c);
  const keyedAny = Object.values(c.keys || {}).some(k => k?.length);
  const lt = T.time - c.start;
  const keysHere = Object.values(c.keys || {}).flatMap(k => (k || []).filter(x => Math.abs(x.t - lt) < 1 / 60));
  return (
    <>
      <div className="obj-head">
        <span className="type-badge">{c.kind === 'scene' ? 'scene clip' : c.kind === 'media' ? md?.kind || 'clip' : c.kind}</span>
        <Text value={c.name} onChange={v => set(() => (c.name = v))} onCommit={commit} />
      </div>

      <Section title="Timing">
        <div className="grid2">
          <Num label="Start" value={c.start} step={0.1} min={0} unit="s" onChange={v => set(() => (c.start = v))} onCommit={commit} />
          <Num label="Length" value={c.dur} step={0.1} min={0.1} unit="s" onChange={v => set(() => (c.dur = v))} onCommit={commit} />
          <Num label="In" value={c.offset} step={0.1} min={0} unit="s" onChange={v => set(() => (c.offset = v))} onCommit={commit} />
          <Num label="Speed" value={c.speed} step={0.05} min={0.1} max={8} unit="×" onChange={v => set(() => (c.speed = v))} onCommit={commit} />
          <Num label="Fade in" value={c.fadeIn} step={0.1} min={0} unit="s" onChange={v => set(() => (c.fadeIn = v))} onCommit={commit} />
          <Num label="Fade out" value={c.fadeOut} step={0.1} min={0} unit="s" onChange={v => set(() => (c.fadeOut = v))} onCommit={commit} />
        </div>
        <label className="check"><input type="checkbox" checked={!!c.freeze} onChange={e => { c.freeze = e.target.checked; commit(); }} /> Hold a single frame (freeze at “In”)</label>
      </Section>

      {isVideo && (
        <Section title="Transition in">
          <Row label="Style"><Select value={c.trans || 'dissolve'} options={TRANSITIONS} onChange={v => { c.trans = v; commit(); }} /></Row>
          <Row label="Overlap"><Num value={Math.round(ov * 100) / 100} min={0} step={0.1} unit="s" onChange={v => { setOverlap(c, v); }} /></Row>
          <p className="muted small">A transition happens where this clip overlaps the one before it on the same track. {ov > 0 ? '' : 'Set an overlap to create one.'}</p>
        </Section>
      )}

      {isVideo && c.kind !== 'color' && c.kind !== 'bars' && c.kind !== 'countdown' && (
        <Section title="Animate" right={keyedAny ? <span className="muted small">◆ animated</span> : null}>
          {c.kind !== 'title' ? (
            <>
              <AnimRow c={c} prop="x" label="X" to={v => v} from={v => v} unit="px" />
              <AnimRow c={c} prop="y" label="Y" to={v => v} from={v => v} unit="px" />
              <AnimRow c={c} prop="scale" label="Scale" to={v => v * 100} from={v => v / 100} unit="%" min={1} />
            </>
          ) : (
            <>
              <AnimRow c={c} prop="x" label="X" to={v => v} from={v => v} unit="px" />
              <AnimRow c={c} prop="y" label="Y" to={v => v} from={v => v} unit="px" />
              <AnimRow c={c} prop="scale" label="Size" to={v => v * 100} from={v => v / 100} unit="%" min={5} />
            </>
          )}
          <AnimRow c={c} prop="rotation" label="Rotate" to={v => v} from={v => v} unit="°" />
          <AnimRow c={c} prop="opacity" label="Opacity" to={v => v * 100} from={v => v / 100} unit="%" min={0} max={100} />
          {keysHere.length > 0 && (
            <Row label="Easing"><Select value={keysHere[0].ease} options={[{ value: 'ease', label: 'Smooth' }, { value: 'linear', label: 'Linear' }, { value: 'in', label: 'Ease in' }, { value: 'out', label: 'Ease out' }, { value: 'hold', label: 'Hold (step)' }]}
              onChange={v => { keysHere.forEach(k => (k.ease = v)); commit(); }} /></Row>
          )}
          {keyedAny && (
            <div className="btn-wrap">
              {(['x', 'y', 'scale', 'rotation', 'opacity'] as ClipProp[]).filter(p => clipKeyList(c, p).length).map(p => (
                <button key={p} className="btn small" onClick={() => clearClipKeys(c, p)} title="Remove all keyframes for this property">Clear {p}</button>
              ))}
            </div>
          )}
          <p className="muted small">Move the playhead, then change a value or press ◆ to set a keyframe. Once a property has keyframes, changes at the playhead add more.</p>
        </Section>
      )}

      {c.kind === 'title' && (
        <Section title="Title">
          <textarea className="text-area" rows={2} value={c.text || ''} onChange={e => set(() => (c.text = e.target.value))} onBlur={commit} onKeyDown={e => e.stopPropagation()} />
          <Row><Select value={c.font || 'Fraunces'} options={FONTS.map(x => ({ value: x, label: x }))} onChange={v => { c.font = v; commit(); }} /></Row>
          <div className="grid2">
            <Num label="Size" value={c.fontSize || 48} min={6} onChange={v => set(() => (c.fontSize = v))} onCommit={commit} />
            <Select value={String(c.weight || 700)} options={[300, 400, 500, 600, 700, 800].map(w => ({ value: String(w), label: String(w) }))} onChange={v => { c.weight = +v; commit(); }} />
            <Select value={c.align || 'center'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} onChange={v => { c.align = v; commit(); }} />
            <Num label="Tracking" value={c.letterSpacing || 0} step={0.5} onChange={v => set(() => (c.letterSpacing = v))} onCommit={commit} />
          </div>
          <Row label="Colour"><ColourInput value={c.color || '#FFFFFF'} onChange={v => set(() => (c.color = v))} onCommit={commit} /></Row>
          <div className="grid2">
            <Num label="Outline" value={c.outline || 0} min={0} step={0.5} onChange={v => set(() => (c.outline = v))} onCommit={commit} />
            <ColourInput value={c.outlineColor || '#000000'} onChange={v => set(() => (c.outlineColor = v))} onCommit={commit} />
          </div>
          <label className="check"><input type="checkbox" checked={!!c.shadow} onChange={e => { c.shadow = e.target.checked; commit(); }} /> Shadow</label>
          <label className="check"><input type="checkbox" checked={!!c.box} onChange={e => { c.box = e.target.checked ? '#00000099' : null; commit(); }} /> Background box</label>
          {c.box && <ColourInput value={c.box} onChange={v => set(() => (c.box = v))} onCommit={commit} />}
          <Row label="Animation"><Select value={c.anim || 'none'} options={[{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade in' }, { value: 'slideup', label: 'Slide up' }, { value: 'slideleft', label: 'Slide from right' }, { value: 'zoom', label: 'Zoom in' }, { value: 'typewriter', label: 'Typewriter' }]} onChange={v => { c.anim = v; commit(); }} /></Row>
        </Section>
      )}

      {c.kind === 'color' && <Section title="Colour"><ColourInput value={c.color || '#000000'} onChange={v => set(() => (c.color = v))} onCommit={commit} /></Section>}
      {c.kind === 'countdown' && (
        <Section title="Countdown">
          <Row label="Ring"><ColourInput value={c.color || '#F3E2C3'} onChange={v => set(() => (c.color = v))} onCommit={commit} /></Row>
          <Row label="Background"><ColourInput value={c.color2 || '#14110E'} onChange={v => set(() => (c.color2 = v))} onCommit={commit} /></Row>
          <p className="muted small">Counts down over the length of the clip, one number per second.</p>
        </Section>
      )}

      {hasAudio && (
        <Section title="Audio">
          <Slider label="Volume" value={Math.round(c.volume * 100)} min={0} max={200} fmt={v => `${v}%`} onChange={v => set(() => (c.volume = v / 100))} onCommit={commit} />
          <Slider label="Pan" value={Math.round((c.pan ?? 0) * 100)} min={-100} max={100} fmt={v => (v === 0 ? 'Centre' : v < 0 ? `${-v}% L` : `${v}% R`)} onChange={v => set(() => (c.pan = v / 100))} onCommit={commit} />
          <AnimRow c={c} prop="volume" label="Vol" to={v => v * 100} from={v => v / 100} unit="%" min={0} max={200} />
          <p className="muted small">Keyframe the volume to duck music under speech or fade within a clip.</p>
        </Section>
      )}

      {isVideo && (
        <Section title="Colour & filters">
          <Slider label="Brightness" value={c.fx.brightness} min={0} max={200} fmt={v => `${v}%`} onChange={v => set(() => (c.fx.brightness = v))} onCommit={commit} />
          <Slider label="Contrast" value={c.fx.contrast} min={0} max={200} fmt={v => `${v}%`} onChange={v => set(() => (c.fx.contrast = v))} onCommit={commit} />
          <Slider label="Saturation" value={c.fx.saturate} min={0} max={300} fmt={v => `${v}%`} onChange={v => set(() => (c.fx.saturate = v))} onCommit={commit} />
          <Slider label="Hue" value={c.fx.hue} min={-180} max={180} fmt={v => `${v}°`} onChange={v => set(() => (c.fx.hue = v))} onCommit={commit} />
          <Slider label="Blur" value={c.fx.blur} min={0} max={30} step={0.5} fmt={v => `${v}px`} onChange={v => set(() => (c.fx.blur = v))} onCommit={commit} />
          <Slider label="Greyscale" value={c.fx.grayscale} min={0} max={100} fmt={v => `${v}%`} onChange={v => set(() => (c.fx.grayscale = v))} onCommit={commit} />
          <Slider label="Sepia" value={c.fx.sepia} min={0} max={100} fmt={v => `${v}%`} onChange={v => set(() => (c.fx.sepia = v))} onCommit={commit} />
          <button className="btn small" onClick={() => { c.fx = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 }; commit(); }}>Reset colour</button>
          <div className="field-label">Filter stack (applied top to bottom)</div>
          {(c.filters || []).map((f, i, arr) => {
            const def = filterDef(f.type);
            return (
              <div key={f.id} className={`fx-card ${f.on ? '' : 'off'}`}>
                <div className="fx-head">
                  <label className="check"><input type="checkbox" checked={f.on} onChange={e => { f.on = e.target.checked; commit(); }} /> <b>{def.name}</b></label>
                  <span className="grow" />
                  <IconBtn icon="up" title="Move up" size={11} disabled={i === 0} onClick={() => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; commit(); }} />
                  <IconBtn icon="down" title="Move down" size={11} disabled={i === arr.length - 1} onClick={() => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; commit(); }} />
                  <IconBtn icon="x" title="Remove filter" size={11} onClick={() => { c.filters = arr.filter(x => x !== f); commit(); }} />
                </div>
                {def.params.map(p => p.type === 'range' ? (
                  <Slider key={p.key} label={p.label} value={Number(f.params[p.key])} min={p.min!} max={p.max!} step={p.step} onChange={v => set(() => (f.params[p.key] = v))} onCommit={commit} />
                ) : p.type === 'colour' ? (
                  <Row key={p.key} label={p.label}><ColourInput value={String(f.params[p.key])} onChange={v => set(() => (f.params[p.key] = v))} onCommit={commit} /></Row>
                ) : (
                  <Row key={p.key} label={p.label}><Select value={String(f.params[p.key])} options={p.options!.map(o => ({ value: String(o.v), label: o.label }))} onChange={v => { f.params[p.key] = +v; commit(); }} /></Row>
                ))}
              </div>
            );
          })}
          <Select value="" options={[{ value: '', label: '＋ Add filter…' }, ...CLIP_FILTERS.map(f => ({ value: f.type, label: f.name }))]}
            onChange={v => { if (!v) return; c.filters = [...(c.filters || []), newFilter(v as never)]; commit(); }} />
        </Section>
      )}
      <p className="muted small pad">Clip ends at {fmtTime(c.start + c.dur, S.doc.timeline.fps)}. <button className="linkish" onClick={() => seek(c.start)}>Jump to start</button></p>
    </>
  );
}

export function TrackInspector({ tr }: { tr: Track }) {
  const set = (fn: () => void) => { fn(); live(); };
  const tracks = S.doc.timeline.tracks;
  return (
    <>
      <div className="obj-head"><span className="type-badge">{tr.kind} track</span><Text value={tr.name} onChange={v => set(() => (tr.name = v))} onCommit={commit} /></div>
      <Section title="Mix">
        <Slider label="Track volume" value={Math.round((tr.volume ?? 1) * 100)} min={0} max={200} fmt={v => `${v}%`} onChange={v => set(() => (tr.volume = v / 100))} onCommit={commit} />
        <Slider label="Pan" value={Math.round((tr.pan ?? 0) * 100)} min={-100} max={100} fmt={v => (v === 0 ? 'Centre' : v < 0 ? `${-v}% L` : `${v}% R`)} onChange={v => set(() => (tr.pan = v / 100))} onCommit={commit} />
        <div className="btn-wrap">
          <button className={`btn small ${tr.muted ? 'primary' : ''}`} onClick={() => { tr.muted = !tr.muted; commit(); }}>Mute</button>
          <button className={`btn small ${tr.solo ? 'primary' : ''}`} onClick={() => { tr.solo = !tr.solo; commit(); }}>Solo</button>
          {tr.kind === 'video' && <button className={`btn small ${tr.hidden ? 'primary' : ''}`} onClick={() => { tr.hidden = !tr.hidden; commit(); }}>Hide</button>}
          <button className={`btn small ${tr.locked ? 'primary' : ''}`} onClick={() => { tr.locked = !tr.locked; commit(); }}>Lock</button>
        </div>
      </Section>
      <Section title="Track">
        <label className="check"><input type="checkbox" checked={!!tr.tall} onChange={e => { tr.tall = e.target.checked; commit(); }} /> Tall track (bigger waveforms and thumbnails)</label>
        <div className="btn-wrap">
          <button className="btn small" onClick={() => moveTrack(tr.id, -1)}><Icon name="up" size={13} /> Up</button>
          <button className="btn small" onClick={() => moveTrack(tr.id, 1)}><Icon name="down" size={13} /> Down</button>
          <button className="btn small" onClick={() => addTrack(tr.kind)}>Add {tr.kind} track</button>
          <button className="btn small danger" onClick={() => { if (tr.clips.length && !confirm('Remove this track and its clips?')) return; S.doc.timeline.tracks = tracks.filter(t => t !== tr); S.ui.selTrack = null; commit(); }}>Remove</button>
        </div>
        <p className="muted small">New media you insert or append goes onto the selected track.</p>
      </Section>
    </>
  );
}

export function SequenceInspector() {
  const tl = S.doc.timeline;
  const set = (fn: () => void) => { fn(); live(); };
  return (
    <>
      <Section title="Sequence">
        <div className="grid2">
          <Num label="W" value={tl.w} min={16} unit="px" onChange={v => set(() => (tl.w = Math.round(v)))} onCommit={() => { S.ui.views.motion.fitted = false; commit(); }} />
          <Num label="H" value={tl.h} min={16} unit="px" onChange={v => set(() => (tl.h = Math.round(v)))} onCommit={() => { S.ui.views.motion.fitted = false; commit(); }} />
          <Select value={String(tl.fps)} options={['12', '15', '24', '25', '30', '50', '60'].map(v => ({ value: v, label: `${v} fps` }))} onChange={v => { tl.fps = +v; commit(); }} />
          <label className="check"><input type="checkbox" checked={tl.loop} onChange={e => { tl.loop = e.target.checked; commit(); }} /> Loop playback</label>
        </div>
        <div className="btn-wrap">
          {[[1280, 720, '720p'], [1920, 1080, '1080p'], [3840, 2160, '4K'], [1080, 1080, 'Square'], [1080, 1920, 'Vertical'], [854, 480, '480p']].map(([w, h, l]) => (
            <button key={l} className="btn small" onClick={() => { tl.w = +w; tl.h = +h; S.ui.views.motion.fitted = false; commit(); }}>{l}</button>
          ))}
        </div>
        <Slider label="Master volume" value={Math.round((tl.master ?? 1) * 100)} min={0} max={150} fmt={v => `${v}%`} onChange={v => set(() => (tl.master = v / 100))} onCommit={commit} />
        <button className="btn small primary" onClick={() => { S.ui.modal = { kind: 'export-opts' }; emit(); }}><Icon name="film" size={13} /> Export video…</button>
      </Section>
      <Section title={`Markers (${tl.markers?.length || 0})`} open={!!tl.markers?.length}>
        {!tl.markers?.length && <p className="muted small">Press M to drop a marker at the playhead. Click a marker on the ruler to jump to it.</p>}
        {(tl.markers || []).map(m => (
          <div key={m.id} className="row">
            <ColourInput value={m.color} onChange={v => set(() => (m.color = v))} onCommit={commit} />
            <Text value={m.label} onChange={v => set(() => (m.label = v))} onCommit={commit} />
            <button className="linkish" onClick={() => seek(m.t)}>{fmtTime(m.t, tl.fps).slice(0, 5)}</button>
            <IconBtn icon="x" title="Delete marker" size={12} onClick={() => { tl.markers = tl.markers!.filter(x => x !== m); commit(); }} />
          </div>
        ))}
      </Section>
      <div className="empty-hint">
        <Icon name="film" size={28} />
        <p>Select a clip in the timeline to edit timing, keyframes and filters, a track header for the mixer, or an object in the preview to animate it.</p>
      </div>
    </>
  );
}
