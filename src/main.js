import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import './style-pixel.css';
import { h } from './dom.js';
import { store } from './store.js';
import './theme.js';
import { crestPM, pitchBackground } from './brand.js';
import { toast } from './ui/toast.js';
import { openSheet, confirmDialog } from './ui/sheet.js';
import { isMuted, setMuted } from './ui/sfx.js';
import { renderMatches } from './views/matches.js';
import { renderMatch } from './views/match.js';
import { renderRanking } from './views/ranking.js';
import { renderPlayers } from './views/players.js';
import { makeSession } from './cloudSession.js';
import { cloudSection, statusChip } from './ui/cloudPanel.js';

const session = makeSession();

const TABS = [
  { id: 'partidos', ico: '⚽', label: 'Partidos', title: 'Partidos', render: renderMatches },
  { id: 'ranking', ico: '🏆', label: 'Ranking', title: 'Ranking', render: renderRanking },
  { id: 'jugadores', ico: '👥', label: 'Jugadores', title: 'Jugadores', render: renderPlayers },
];

const app = document.getElementById('app');
const main = h('main', { id: 'main', tabindex: '-1' });

// #/partidos | #/ranking | #/jugadores | #/partido/<id>
function route() {
  const [, seg, arg] = location.hash.split('/');
  if (seg === 'partido' && arg) return { tab: 'partidos', render: (r) => renderMatch(r, arg), title: 'Partido' };
  const t = TABS.find((x) => x.id === seg) ?? TABS[0];
  return { tab: t.id, render: t.render, title: t.title };
}

// ---- Encabezado ----
const sfxBtn = h('button', { class: 'ghost small icon-btn', onclick: () => { setMuted(!isMuted()); paintHeader(); } });
const dataBtn = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Datos y copias de seguridad', onclick: openData }, '💾');
const crestSlot = h('span', { class: 'brand-crest' }, crestPM(46));

function paintHeader() {
  sfxBtn.textContent = isMuted() ? '🔇' : '🔊';
  sfxBtn.setAttribute('aria-pressed', String(!isMuted()));
  sfxBtn.setAttribute('aria-label', isMuted() ? 'Activar sonidos' : 'Silenciar sonidos');
}

const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Secciones' }, TABS.map((t) =>
  h('a', { href: `#/${t.id}`, 'data-tab': t.id }, h('span', { class: 'ico', 'aria-hidden': 'true' }, t.ico), t.label)));

// ---- Datos: copia de seguridad ----
function openData() {
  openSheet('Datos y copias', (close) => {
    const s = store.get();
    const file = h('input', {
      type: 'file', accept: 'application/json,.json', class: 'sr-only',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast('El archivo es demasiado grande.'); return; }
        const ok = await confirmDialog('Esto reemplaza todos los datos actuales. ¿Seguir?', { okLabel: 'Reemplazar', danger: true });
        if (!ok) return;
        if (store.importJson(await f.text())) { toast('Copia importada.'); close(); } else toast('El archivo no es una copia válida.');
      },
    });
    const synced = store.isSynced();
    return h('div', {},
      cloudSection(session, close),
      h('h3', { class: 'data-title' }, '💾 Copias'),
      h('p', { class: 'muted' }, synced
        ? 'Con la nube conectada podés descargar una copia. Importar, cargar ejemplos o borrar todo quedan desactivados para no pisar los datos del equipo.'
        : 'Los datos se guardan solo en este navegador. Descargá una copia de vez en cuando.'),
      h('div', { class: 'stack' },
        h('button', { onclick: () => {
          const url = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
          const a = h('a', { href: url, download: `piel-morena-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('Copia descargada.');
        } }, '⬇ Exportar copia'),
        synced ? null : h('label', { class: 'btn ghost' }, '⬆ Importar copia', file),
        synced ? null : !s.players.length && !s.matches.length
          ? h('button', { class: 'ghost', onclick: () => { store.loadDemo(); close(); toast('Datos de ejemplo cargados.'); } }, '🧪 Cargar datos de ejemplo')
          : h('button', { class: 'danger', onclick: async () => {
            const ok = await confirmDialog('Se borran todos los jugadores y partidos de este navegador. Antes exportá una copia si querés conservarlos.', { okLabel: 'Borrar todo', danger: true });
            if (ok) { store.clearAll(); close(); toast('Datos borrados. Podés cargar los de ejemplo desde 💾.'); }
          } }, '🗑 Borrar todos los datos')));
  });
}

// ---- Render ----
let lastKey = null;
function paint() {
  const r = route();
  const key = location.hash || '#/partidos';
  const y = key === lastKey ? window.scrollY : 0; // misma pantalla: conserva el scroll
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  r.render(main);
  document.title = `${r.title} · Piel Morena FC`;
  window.scrollTo(0, y);
  if (key !== lastKey && lastKey !== null) main.focus({ preventScroll: true }); // anuncia el cambio de pantalla
  lastKey = key;
}

window.addEventListener('hashchange', paint);
store.subscribe(paint);
store.onError((msg) => toast(msg, { ms: 8000 }));

document.body.prepend(pitchBackground());
app.append(
  h('header', { class: 'app-header' },
    h('div', { class: 'brand' }, crestSlot,
      h('div', {}, h('p', { class: 'brand-name' }, 'Piel Morena FC'), h('p', { class: 'brand-sub muted' }, 'Estadísticas del equipo · 7 vs 7'))),
    h('div', { class: 'header-tools' },
      statusChip(session, openData), sfxBtn, dataBtn)),
  main, nav);
paintHeader();
paint();
session.autoConnect(); // si ya había una nube configurada, se reconecta sola
