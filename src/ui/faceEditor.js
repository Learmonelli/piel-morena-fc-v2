// Editor de cara del jugador, con las mismas opciones y grupos que la app original:
// Rostro, Pelo y piel, Cabeza y Camiseta. La vista previa queda fija arriba mientras se elige.
import { h } from '../dom.js';
import {
  AV_SKIN, AV_HAIR, AV_SHIRT, AV_STYLE, AV_EYES, AV_EYESIZE, AV_FACIAL, AV_HAT, AV_GLASSES, AV_JERSEY,
  avatarSVGEl, randomFace, resolveFace,
} from '../pmAvatar.js';

const SKIN_NAMES = ['Muy clara', 'Clara', 'Clara cálida', 'Trigueña', 'Morena clara', 'Morena', 'Morena oscura', 'Oscura', 'Muy oscura', 'Ébano'];
const HAIR_NAMES = ['Negro', 'Castaño oscuro', 'Castaño', 'Castaño claro', 'Rubio oscuro', 'Rubio', 'Pelirrojo', 'Cobrizo', 'Canoso', 'Gris'];
const SHIRT_NAMES = ['Vinotinto', 'Dorado', 'Violeta', 'Verde', 'Crema', 'Marrón', 'Celeste', 'Rojo', 'Azul', 'Cielo', 'Negro', 'Blanco'];

// seed: id del jugador (para mostrar su cara actual si no tenía una guardada).
export function faceEditor(seed, initial) {
  let face = resolveFace(seed, initial);
  const preview = h('div', { class: 'face-preview' });
  const controls = [];

  const paint = () => {
    preview.replaceChildren(
      avatarSVGEl(seed, 96, face, 'body', 'Vista previa del jugador'),
      avatarSVGEl(seed, 64, face, 'bust', 'Vista previa del carnet'));
    for (const c of controls) {
      const on = face[c.key] === c.val;
      c.el.classList.toggle('on', on);
      c.el.setAttribute('aria-pressed', String(on));
    }
  };
  const set = (key, val) => { face = { ...face, [key]: val }; paint(); };

  const pill = (key, [label, val]) => {
    const el = h('button', { type: 'button', class: 'face-pill', onclick: () => set(key, val) }, label);
    controls.push({ key, val, el });
    return el;
  };
  const swatch = (key, names, color, i) => {
    const el = h('button', {
      type: 'button', class: 'swatch', style: `background:${color}`, title: names[i],
      'aria-label': names[i], onclick: () => set(key, i),
    });
    controls.push({ key, val: i, el });
    return el;
  };
  const optRow = (label, arr, key) => h('div', { class: 'face-row', role: 'group', 'aria-label': label },
    h('span', { class: 'face-lbl' }, label), arr.map((o) => pill(key, o)));
  const swRow = (label, colors, names, key) => h('div', { class: 'face-row', role: 'group', 'aria-label': label },
    h('span', { class: 'face-lbl' }, label), colors.map((c, i) => swatch(key, names, c, i)));
  const group = (title, open, ...rows) => h('details', { class: 'face-group', open }, h('summary', {}, title), rows);

  const el = h('div', { class: 'face-editor' },
    preview,
    group('Rostro', true,
      optRow('Corte', AV_STYLE, 'style'), optRow('Ojos', AV_EYESIZE, 'eyeSize'), optRow('Cara', AV_EYES, 'eyes'),
      optRow('Barba', AV_FACIAL, 'facial'), optRow('Anteojos', AV_GLASSES, 'glasses')),
    group('Pelo y piel', false,
      swRow('Piel', AV_SKIN, SKIN_NAMES, 'skin'), swRow('Pelo', AV_HAIR, HAIR_NAMES, 'hair')),
    group('Cabeza', false,
      optRow('Cabeza', AV_HAT, 'hat'), swRow('Color', AV_SHIRT, SHIRT_NAMES, 'hatColor')),
    group('Camiseta', false,
      swRow('Color', AV_SHIRT, SHIRT_NAMES, 'shirt'), swRow('Color 2', AV_SHIRT, SHIRT_NAMES, 'shirt2'),
      optRow('Diseño', AV_JERSEY, 'jersey')),
    h('button', { type: 'button', class: 'ghost small', onclick: () => { face = randomFace(); paint(); } }, '🎲 Aleatorio'));

  paint();
  return { el, get: () => ({ ...face }) };
}
