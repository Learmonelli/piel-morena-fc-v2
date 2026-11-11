// Cómo se muestra un jugador en listas y tarjetas: número de camiseta (si tiene), nombre y apodo.
// Ej.: [10] Juan Pérez «Tuti». El nombre va en <strong> para que destaque.
import { h } from '../dom.js';
import { displayName } from '../domain/domain.js';

export function playerName(p, { stacked = false } = {}) {
  const nick = p.nickname && p.nickname !== displayName(p) ? p.nickname : '';
  // [número] a la izquierda; a la derecha el nombre y, debajo, el apodo.
  return h('span', { class: `pname${stacked ? ' stacked' : ''}` },
    p.number ? h('span', { class: 'num' }, h('span', { class: 'sr-only' }, 'Camiseta '), p.number) : null,
    h('span', { class: 'ptxt' },
      h('strong', { class: 'pname-main' }, displayName(p)),
      nick ? h('span', { class: 'nick' }, `«${nick}»`) : null));
}
