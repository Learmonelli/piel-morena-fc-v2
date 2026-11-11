// Hojas modales con <dialog>: el navegador se encarga del foco, de Esc y de bloquear el fondo.
import { h } from '../dom.js';

let seq = 0;

export function openSheet(title, build) {
  const titleId = `sheet-title-${++seq}`;
  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': titleId });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' },
      h('h2', { id: titleId }, title),
      h('button', { class: 'ghost small', 'aria-label': 'Cerrar', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, build(close)));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // clic en el fondo
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

// Confirmación propia (en vez de window.confirm): resuelve true/false.
export function confirmDialog(message, { okLabel = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'sheet confirm', 'aria-label': message },
      h('p', {}, message),
      h('div', { class: 'row end' },
        h('button', { class: 'ghost', onclick: () => dlg.close('no') }, 'Cancelar'),
        h('button', { class: danger ? 'danger' : '', onclick: () => dlg.close('ok') }, okLabel)));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
