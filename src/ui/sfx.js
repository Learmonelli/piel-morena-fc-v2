// Efectos 8-bit con Web Audio. El silencio se recuerda entre visitas.
const KEY = 'pm2_sfx_off';
let off = false;
try { off = localStorage.getItem(KEY) === '1'; } catch { /* sin almacenamiento */ }
let ctx = null;

export const isMuted = () => off;
export function setMuted(value) {
  off = !!value;
  try { localStorage.setItem(KEY, off ? '1' : '0'); } catch { /* ignorar */ }
}

function tone(freq, start, dur, vol = 0.12, type = 'square') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

const SOUNDS = {
  goal: [[523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.2]],
  assist: [[659, 0, 0.08], [784, 0.08, 0.12]],
  mvp: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]],
  undo: [[392, 0, 0.1], [262, 0.1, 0.16]],
};

export function sfx(name) {
  if (off || !SOUNDS[name]) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name].forEach(([f, s, d]) => tone(f, s, d));
  } catch { /* sin audio disponible: no pasa nada */ }
}

export const buzz = (ms = 25) => { try { navigator.vibrate?.(ms); } catch { /* ignorar */ } };
