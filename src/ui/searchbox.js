import { h } from '../dom.js';

// Buscador reutilizable. El campo se crea una sola vez: al escribir solo se repinta la lista
// (onInput), así no pierde el foco ni el cursor.
export function searchBox({ value = '', placeholder, label, onInput }) {
  const input = h('input', {
    type: 'search', value, placeholder, 'aria-label': label, autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => onInput(e.target.value),
  });
  return h('div', { class: 'search' }, h('span', { class: 'search-ico', 'aria-hidden': 'true' }, '🔍'), input);
}
