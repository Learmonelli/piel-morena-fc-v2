// Podio del ranking: 2.º a la izquierda, 1.º al centro (más alto) y 3.º a la derecha.
// Cada tarjeta lleva: un emblema del premio prendido en el borde (un solo ícono), una corona de
// laurel alrededor del avatar y, abajo, el número de puesto como un bloque de podio.
// Con empates se repite el número y se avisa ("empate").
import { h } from '../dom.js';
import { avatarEl } from '../avatar.js';
import { TEAM } from '../team.js';
import { displayName } from '../domain/domain.js';
import { playerName } from './playerName.js';

// Ícono del emblema según la categoría.
export const AWARD_ICONS = {
  goles: '⚽', asist: '🤝', ga: '⚽🤝', mvp: '👑', gk: '🧤', pj: '👟', v: '🏆', d: '🌩️', e: '⚖️',
  invicto: '🛡️', racha: '🔥', golazos: '🔥', muros: '🧱', hachazos: '🪓', polemicas: '📣', golesContra: '🙈',
};

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export const LEAVES_PER_BRANCH = 12;

// Corona de laurel: dos ramas que suben desde abajo y dejan abierta la parte de arriba.
// Cada paso lleva una hoja hacia afuera y otra hacia adentro, como en un laurel de verdad.
export function wreath() {
  const svg = el('svg', { class: 'wreath', viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  const cx = 50; const cy = 52; const R = 38;
  const steps = LEAVES_PER_BRANCH / 2;
  for (const side of [-1, 1]) { // -1 = izquierda, 1 = derecha
    for (let i = 0; i < steps; i++) {
      const phi = 18 + (i * 128) / (steps - 1); // grados desde abajo hacia arriba
      const rad = (phi * Math.PI) / 180;
      const x = cx + side * R * Math.sin(rad);
      const y = cy + R * Math.cos(rad);
      // Dirección en que avanza la rama (tangente) para orientar las hojas.
      const tangent = (Math.atan2(-R * Math.sin(rad), side * R * Math.cos(rad)) * 180) / Math.PI;
      const size = 1 - i * 0.045; // las hojas de arriba son un poco más chicas
      for (const [turn, push, tone] of [[-32, 3.2, 'a'], [32, -3.2, 'b']]) {
        const lx = x + side * push * Math.sin(rad);
        const ly = y + push * Math.cos(rad);
        svg.append(el('ellipse', {
          class: `leaf leaf-${tone}`, cx: lx.toFixed(1), cy: ly.toFixed(1),
          rx: (5.4 * size).toFixed(2), ry: (2.3 * size).toFixed(2),
          transform: `rotate(${(tangent + side * turn).toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`,
        }));
      }
    }
  }
  return svg;
}

// items: filas de rankBy() ya ordenadas ({ player, value, pos }).
// avg(r) opcional: texto del promedio por partido ("0,57/pj"), o null si la categoría no lo usa.
export function podium(items, { cat, label, onOpen, avg = () => null }) {
  const top = items.slice(0, 3);
  if (!top.length) return null;
  const icon = AWARD_ICONS[cat] || '⭐';
  const nameOf = displayName;
  // Orden en pantalla: con 3, el clásico 2.º | 1.º | 3.º; con 2, de izquierda a derecha (1.º primero),
  // así el más grande no queda "al revés" a la derecha.
  const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);

  return h('ol', { class: `podium n${top.length}`, 'aria-label': `Podio de ${label}` },
    order.map((i) => {
      const r = top[i];
      // El tamaño depende del puesto real: si dos empatan en el 1.º, las dos tarjetas son grandes.
      const center = r.pos === 1;
      const tied = top.filter((x) => x.pos === r.pos).length > 1;
      return h('li', { class: `step ${center ? 'place-center' : 'place-side'} pos${Math.min(r.pos, 3)}` },
        h('span', { class: 'emblem', 'aria-hidden': 'true' }, icon),
        h('button', {
          class: 'linklike', onclick: () => onOpen(r.player),
          'aria-label': `${nameOf(r.player)}, ${r.value}, ver ficha`,
        },
        h('span', { class: 'pod-avatar' }, wreath(), avatarEl(r.player, TEAM, center ? 76 : 60, 'bust')),
        playerName(r.player, { stacked: true }),
        h('b', { class: 'val' }, String(r.value)),
        avg(r) ? h('span', { class: 'pod-avg' }, `(${avg(r)})`) : null),
        h('div', { class: 'pod-num' },
          h('span', { class: 'sr-only' }, 'Puesto '),
          h('b', {}, `${r.pos}°`),
          tied ? h('small', {}, 'empate') : null));
    }));
}
