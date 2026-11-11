import { h } from '../dom.js';
import { store } from '../store.js';
import { collapsible } from '../collapsible.js';
import {
  scoreOf, goalsBy, ownGoalsBy, assistQty, monthKey, monthLabel, fmtDate, inMatch, todayStr, AWARDS, displayName,
} from '../domain/domain.js';
import { playerMatches } from '../search.js';
import { searchBox } from '../ui/searchbox.js';
import { openSheet } from '../ui/sheet.js';

const ui = { q: '' };

export function openNewMatch() {
  openSheet('Nuevo partido', (close) => {
    const date = h('input', { type: 'date', value: todayStr(), required: true, 'aria-label': 'Fecha' });
    const rival = h('input', { type: 'text', maxlength: 40, placeholder: 'Nombre del rival', 'aria-label': 'Rival' });
    const nameA = h('input', { type: 'text', maxlength: 30, value: 'Vinotinto', 'aria-label': 'Equipo A' });
    const nameB = h('input', { type: 'text', maxlength: 30, value: 'Blanco', 'aria-label': 'Equipo B' });
    const modeIn = h('input', { type: 'radio', name: 'mode', value: 'interno', checked: true });
    const modeRival = h('input', { type: 'radio', name: 'mode', value: 'rival' });
    const internal = h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', {}, 'Equipo A'), nameA),
      h('label', { class: 'field grow' }, h('span', {}, 'Equipo B'), nameB));
    const vs = h('label', { class: 'field', hidden: true }, h('span', {}, 'Rival'), rival);
    const sync = () => { internal.hidden = modeRival.checked; vs.hidden = !modeRival.checked; };
    modeIn.addEventListener('change', sync);
    modeRival.addEventListener('change', sync);

    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const m = store.createMatch({
          date: date.value, mode: modeRival.checked ? 'rival' : 'interno',
          teamAName: nameA.value, teamBName: nameB.value, rivalName: rival.value,
        });
        close();
        location.hash = `#/partido/${m.id}`;
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Fecha'), date),
    h('fieldset', { class: 'seg' }, h('legend', {}, 'Tipo'),
      h('label', { class: 'chip' }, modeIn, ' Interno (7 vs 7)'),
      h('label', { class: 'chip' }, modeRival, ' Contra un rival')),
    internal, vs,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
      h('button', { type: 'submit' }, 'Crear y cargar')));
  });
}

function matchCard(s, m, found) {
  const a = scoreOf(m, 'A');
  const b = scoreOf(m, 'B');
  const nameB = m.mode === 'rival' ? m.rivalName : m.teamBName;
  // Todos los premios del partido como etiquetas de color, igual que en la app original.
  const awardTags = Object.entries(AWARDS).map(([cat, def]) => {
    const p = s.players.find((x) => x.id === m[def.field]);
    return p ? h('span', { class: `tag aw-${cat}` }, `${def.icon} ${def.short}: ${displayName(p)}`) : null;
  });
  return h('a', { class: 'card match-card', href: `#/partido/${m.id}` },
    h('div', { class: 'mc-top' },
      h('span', { class: 'muted' }, fmtDate(m.date)),
      h('span', { class: 'tags' },
        m.closed ? h('span', { class: 'tag' }, '🔒 Finalizado') : h('span', { class: 'tag live' }, '● Abierto'),
        awardTags)),
    h('div', { class: 'mc-score' },
      h('span', { class: 'mc-team' }, m.teamAName),
      h('b', { class: 'mc-result' }, `${a} : ${b}`),
      h('span', { class: 'mc-team' }, nameB)),
    found.length
      ? h('div', { class: 'mc-found' }, found.map((p) => h('span', { class: 'pill' },
          `${displayName(p)} ⚽${goalsBy(m, p.id)} 🤝${assistQty(m, p.id)}${ownGoalsBy(m, p.id) ? ` 🙈${ownGoalsBy(m, p.id)}` : ''}`)))
      : null);
}

export function renderMatches(root) {
  const s = store.get();
  const list = h('div', { class: 'list-box' });

  const paint = () => {
    const q = ui.q.trim();
    const hits = q ? s.players.filter((p) => playerMatches(p, q)) : [];
    const ids = new Set(hits.map((p) => p.id));
    let ms = [...s.matches].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    if (q) ms = ms.filter((m) => inMatch(m).some((id) => ids.has(id)));

    if (!ms.length) {
      list.replaceChildren(h('div', { class: 'card empty' },
        h('p', {}, q ? `Ningún partido con "${q}".` : 'Todavía no hay partidos.'),
        q ? null : h('div', { class: 'row center wrap' },
          h('button', { onclick: openNewMatch }, '＋ Cargar el primer partido'),
          s.players.length ? null : h('button', { class: 'ghost', onclick: () => store.loadDemo() }, 'Probar con datos de ejemplo'))));
      return;
    }

    const groups = new Map();
    ms.forEach((m) => {
      const k = monthKey(m.date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    });
    list.replaceChildren(...[...groups.entries()].map(([k, items], i) => collapsible(
      `mm:${k}`,
      [h('strong', { class: 'fold-title' }, monthLabel(k)),
        h('span', { class: 'muted' }, `${items.length} partido${items.length === 1 ? '' : 's'}`)],
      h('div', { class: 'cards' }, items.map((m) => matchCard(s, m, hits.filter((p) => inMatch(m).includes(p.id))))),
      { open: i === 0, force: !!q, cls: 'sec' })));
  };

  root.replaceChildren(
    h('h1', { class: 'page-title' }, 'Partidos'),
    searchBox({
      value: ui.q, placeholder: 'Buscar jugador: ver sus partidos', label: 'Buscar partidos por jugador',
      onInput: (v) => { ui.q = v; paint(); },
    }),
    list,
    h('button', { class: 'fab', onclick: openNewMatch, 'aria-label': 'Nuevo partido' }, '＋ Nuevo partido'));
  paint();
}
