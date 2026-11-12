// Sección "Nube" de la hoja de datos e indicador de estado del encabezado.
import { h } from '../dom.js';
import {
  checkKey, checkUrl, loadConfig, normalizeUrl, cleanKey, DEFAULT_CONFIG, isAdminUser, ADMIN_EMAIL,
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

// Administrador: reabrir/editar partidos finalizados y borrar.
// Se entra con email + contraseña: funciona en cualquier navegador (también el del celular o la app
// instalada) y la sesión queda guardada ahí. El link por email queda como alternativa.
function adminBox(session, close) {
  const { cloud } = session;
  const user = cloud.user();
  const err = h('p', { class: 'error', role: 'alert' });
  if (user) {
    const admin = isAdminUser(user);
    const pass1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva', 'aria-label': 'Contraseña nueva' });
    const pass2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repetila', 'aria-label': 'Repetir contraseña' });
    const ok = h('p', { class: 'admin-note', role: 'status' });
    return h('div', { class: 'admin-box' },
      h('h3', {}, '👑 Administrador'),
      h('p', {}, `Entraste como ${user.email || user.user_metadata?.user_name || 'usuario'}.`),
      h('p', { class: admin ? 'admin-note' : 'muted' }, admin
        ? 'Podés editar y reabrir partidos finalizados, y borrar partidos o jugadores.'
        : 'Esta cuenta no es la del administrador: no habilita opciones extra.'),
      admin ? h('details', { class: 'admin-pass' },
        h('summary', {}, '🔑 Contraseña para entrar desde otro dispositivo'),
        h('p', { class: 'muted' }, 'Con tu email y esta contraseña entrás desde el celular sin esperar mails.'),
        pass1, pass2, err, ok,
        h('button', { onclick: async (e) => {
          const btn = e.currentTarget;
          err.textContent = ''; ok.textContent = '';
          if (pass1.value !== pass2.value) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
          btn.disabled = true;
          try { await cloud.setPassword(pass1.value); pass1.value = ''; pass2.value = ''; ok.textContent = 'Listo: ya podés entrar con email y contraseña.'; }
          catch (ex) { err.textContent = ex.message; }
          btn.disabled = false;
        } }, 'Guardar contraseña')) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'ghost', onclick: async () => { await cloud.signOut(); close(); toast('Saliste de la cuenta de administrador.'); } }, 'Salir')));
  }
  const emailInput = h('input', { type: 'email', value: ADMIN_EMAIL, autocomplete: 'username', 'aria-label': 'Email del administrador' });
  const passInput = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
  const enter = async (e) => {
    e?.preventDefault?.();
    err.textContent = '';
    try { await cloud.signInWithPassword(emailInput.value, passInput.value); close(); toast('👑 Entraste como administrador.'); }
    catch (ex) { err.textContent = ex.message; }
  };
  return h('div', { class: 'admin-box' },
    h('h3', {}, '👑 Administrador'),
    h('p', { class: 'muted' }, 'Para editar o reabrir partidos finalizados y borrar, entrá con tu email y contraseña.'),
    h('form', { class: 'admin-login', onsubmit: enter },
      emailInput, passInput, err,
      h('div', { class: 'row wrap' }, h('button', { type: 'submit' }, 'Entrar'))),
    h('details', { class: 'admin-alt' },
      h('summary', {}, '¿Todavía no tenés contraseña?'),
      h('p', { class: 'muted' }, 'Pedí un link al mail y abrilo en este mismo navegador. Ya adentro, creá la contraseña en 🔑.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'ghost', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true; err.textContent = '';
          try { await cloud.signInWithEmail(emailInput.value); toast('Listo: revisá tu email y tocá el link.'); }
          catch (ex) { err.textContent = ex.message; }
          btn.disabled = false;
        } }, 'Enviar link a mi email'))));
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
