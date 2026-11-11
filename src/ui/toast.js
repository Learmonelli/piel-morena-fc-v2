import { h } from '../dom.js';

// Aviso breve y no bloqueante (se anuncia a lectores de pantalla). Con acción opcional, p. ej. "Deshacer".
export function toast(message, { actionLabel, onAction, ms = 5000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  while (host.children.length >= 3) host.firstChild.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  const remove = () => el.remove();
  if (actionLabel) {
    el.append(h('button', { class: 'small', onclick: () => { onAction?.(); remove(); } }, actionLabel));
  }
  host.append(el);
  setTimeout(remove, ms);
}
