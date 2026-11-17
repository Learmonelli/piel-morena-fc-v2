// "Instalar la app": en Android/Chrome se usa el aviso del navegador; si no está, se explican los pasos.
import { h } from '../dom.js';

let deferred = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; });
}

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export function installSection() {
  if (isStandalone()) return h('p', { class: 'muted small-note' }, '📲 Ya la tenés instalada como app.');
  const steps = h('div', { class: 'help-body', hidden: true },
    isIOS()
      ? [h('p', {}, 'En iPhone (Safari): tocá Compartir ⬆️ y elegí "Agregar a inicio".')]
      : [h('p', {}, 'En Android (Chrome): menú ⋮ → "Instalar app" o "Agregar a la pantalla principal".'),
        h('p', {}, 'En iPhone (Safari): Compartir ⬆️ → "Agregar a inicio".'),
        h('p', {}, 'En la compu (Chrome o Edge): el ícono de instalar en la barra de direcciones.')]);
  return h('div', { class: 'install-box' },
    h('button', { class: 'ghost', onclick: async () => {
      if (deferred) {
        deferred.prompt();
        await deferred.userChoice.catch(() => null);
        deferred = null;
      } else steps.hidden = !steps.hidden;
    } }, '📲 Instalar en el celular'),
    steps);
}
