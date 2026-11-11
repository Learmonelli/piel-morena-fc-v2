// Sección "Nube" de la hoja de datos e indicador de estado del encabezado.
import { h } from '../dom.js';
import {
  checkKey, checkUrl, loadConfig, normalizeUrl, cleanKey, DEFAULT_CONFIG, isAdminUser,
} from '../cloud.js';
import { toast } from './toast.js';
import { confirmDialog } from './sheet.js';

const LABEL = {
  off: ['Sin nube', 'off'],
  connecting: ['Conectando…', 'busy'],
  saving: ['Guardando…', 'busy'],
  ok: ['Sincronizado', 'ok'],
  error: ['Error de conexión', 'err'],
};

export function statusChip(session, onClick) {
  const chip = h('button', { class: 'ghost small icon-btn cloud-chip', onclick: onClick, hidden: true });
  const paint = () => {
    const s = session.cloud.status();
    const [text, cls] = LABEL[s] || LABEL.off;
    const admin = isAdminUser(session.cloud.user());
    chip.hidden = s === 'off';
    chip.className = `ghost small icon-btn cloud-chip ${cls}`;
    chip.setAttribute('aria-label', `Nube: ${text}${session.cloud.detail() ? `. ${session.cloud.detail()}` : ''}${admin ? '. Administrador' : ''}`);
    chip.title = chip.getAttribute('aria-label');
    chip.replaceChildren(h('span', { 'aria-hidden': 'true' }, admin ? '👑' : '☁️'), h('span', { class: 'dot', 'aria-hidden': 'true' }));
  };
  session.cloud.onStatus(paint);
  session.cloud.onAuth(paint);
  paint();
  return chip;
}

// Administrador: entrar con GitHub para reabrir/editar partidos finalizados y borrar.
function adminBox(session, close) {
  const { cloud } = session;
  const user = cloud.user();
  const err = h('p', { class: 'error', role: 'alert' });
  if (user) {
    const admin = isAdminUser(user);
    return h('div', { class: 'admin-box' },
      h('h3', {}, '👑 Administrador'),
      h('p', {}, `Entraste como ${user.email || user.user_metadata?.user_name || 'usuario de GitHub'}.`),
      h('p', { class: admin ? 'admin-note' : 'muted' }, admin
        ? 'Podés editar y reabrir partidos finalizados, y borrar partidos o jugadores.'
        : 'Esta cuenta no es la del administrador: no habilita opciones extra.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'ghost', onclick: async () => { await cloud.signOut(); close(); toast('Saliste de la cuenta de GitHub.'); } }, 'Salir')));
  }
  return h('div', { class: 'admin-box' },
    h('h3', {}, '👑 Administrador'),
    h('p', { class: 'muted' }, 'Para editar o reabrir partidos finalizados y borrar, entrá con tu cuenta de GitHub, como en la app original.'),
    err,
    h('div', { class: 'row wrap' },
      h('button', { onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await cloud.signInWithGitHub(); } catch (ex) { err.textContent = ex.message; e.currentTarget.disabled = false; }
      } }, 'Entrar con GitHub')));
}

export function cloudSection(session, close) {
  const { cloud } = session;
  const status = cloud.status();

  if (status !== 'off') {
    const [text] = LABEL[status] || LABEL.off;
    return h('section', { class: 'cloud-box' },
      h('h3', {}, '☁️ Nube (Supabase)'),
      h('p', {}, h('strong', {}, text), ` · ${cloud.host()}`),
      cloud.detail() ? h('p', { class: 'muted' }, cloud.detail()) : null,
      h('p', { class: 'muted' }, 'Los cambios se guardan en la nube y llegan al instante a los demás celulares.'),
      adminBox(session, close),
      h('div', { class: 'row wrap' },
        status === 'error' ? h('button', { onclick: () => { cloud.retry(); close(); } }, '↻ Reintentar') : null,
        h('button', { class: 'ghost', onclick: async () => {
          const ok = await confirmDialog('Se desconecta la nube en este navegador. Los datos quedan guardados acá, pero ya no se sincronizan.', { okLabel: 'Desconectar' });
          if (ok) { session.disconnect(); close(); toast('Nube desconectada.'); }
        } }, 'Desconectar')));
  }

  const prev = loadConfig() || DEFAULT_CONFIG;
  const url = h('input', { type: 'url', inputmode: 'url', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off', value: prev?.url ?? '', spellcheck: 'false' });
  const key = h('input', { type: 'text', placeholder: 'Clave pública (anon / publishable)', autocomplete: 'off', spellcheck: 'false', value: prev?.key ?? '' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit' }, 'Conectar');

  return h('section', { class: 'cloud-box' },
    h('h3', {}, '☁️ Nube (Supabase)'),
    h('p', { class: 'muted' }, 'Conectala para compartir los datos entre todos los celulares. Usa las mismas tablas que la app original (players y matches).'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = checkUrl(url.value) || checkKey(key.value) || '';
        if (err.textContent) return;
        btn.disabled = true; btn.textContent = 'Conectando…';
        try {
          url.value = normalizeUrl(url.value); // si pegaron ".../rest/v1/", se ve corregido
          key.value = cleanKey(key.value);
          const ok = await session.connect({ url: url.value, key: key.value });
          if (ok) { close(); toast('☁️ Conectado. Los datos ahora se sincronizan.'); }
        } catch (ex) {
          err.textContent = ex.message;
        } finally {
          btn.disabled = false; btn.textContent = 'Conectar';
        }
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Project URL'), url),
    h('label', { class: 'field' }, h('span', {}, 'Clave pública (anon / publishable)'), key),
    h('p', { class: 'muted small-note' }, 'Están en Supabase → Project Settings → API. Nunca pegues la clave secreta (service_role): la app la rechaza.'),
    err,
    h('div', { class: 'row end' }, btn)));
}
