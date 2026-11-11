// Secciones plegables con <details>/<summary> (accesibles con teclado y lector de pantalla).
// La app se redibuja entera en cada cambio, así que el estado abierto/cerrado se recuerda acá.
import { h } from './dom.js';

const state = new Map();

// force = true abre la sección sin tocar lo que el usuario dejó guardado (p. ej. mientras busca).
export function collapsible(id, summary, body, { open = false, cls = '', force = false } = {}) {
  const isOpen = force ? true : state.has(id) ? state.get(id) : open;
  const details = h('details', { class: `fold ${cls}`.trim(), open: isOpen },
    h('summary', {
      // Se guarda lo que el usuario está a punto de provocar (antes de que el navegador alterne).
      onclick: () => { if (!force) state.set(id, !details.open); },
    }, summary),
    h('div', { class: 'fold-body' }, body));
  return details;
}
