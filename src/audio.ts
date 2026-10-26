// Web Audio graph: every media element → gain → pan → master → (speakers, meter, export stream)
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyserL: AnalyserNode | null = null, analyserR: AnalyserNode | null = null;
let dest: MediaStreamAudioDestinationNode | null = null;
const nodes = new WeakMap<HTMLMediaElement, { gain: GainNode; pan: StereoPannerNode }>();
const failed = new WeakSet<HTMLMediaElement>();

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  analyserL = ctx.createAnalyser(); analyserR = ctx.createAnalyser();
  analyserL.fftSize = analyserR.fftSize = 1024;
  master.connect(split);
  split.connect(analyserL, 0); split.connect(analyserR, 1);
  master.connect(ctx.destination);
  dest = ctx.createMediaStreamDestination();
  master.connect(dest);
  return ctx;
}

export function resumeAudio() { try { ensure().resume(); } catch { /* unsupported */ } }

export function routeEl(e: HTMLMediaElement) {
  if (failed.has(e)) return null;
  const have = nodes.get(e);
  if (have) return have;
  try {
    const c = ensure();
    const src = c.createMediaElementSource(e);
    const gain = c.createGain(), pan = c.createStereoPanner();
    src.connect(gain); gain.connect(pan); pan.connect(master!);
    const n = { gain, pan };
    nodes.set(e, n);
    return n;
  } catch { failed.add(e); return null; }
}

export function setLevels(e: HTMLMediaElement, volume: number, pan: number, masterVol = 1) {
  const n = routeEl(e);
  if (n) { n.gain.gain.value = Math.max(0, volume); n.pan.pan.value = Math.max(-1, Math.min(1, pan)); if (master) master.gain.value = masterVol; e.volume = 1; }
  else e.volume = Math.max(0, Math.min(1, volume * masterVol));
}

export function exportStream(): MediaStream | null { ensure(); return dest ? dest.stream : null; }

const buf = new Float32Array(1024);
function peak(a: AnalyserNode | null) {
  if (!a) return 0;
  a.getFloatTimeDomainData(buf);
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  return m;
}
export const meter = () => ({ l: peak(analyserL), r: peak(analyserR) });
