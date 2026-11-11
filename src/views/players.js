import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { collapsible } from '../collapsible.js';
import { computeStats, POSITION_GROUPS, groupOfPlayer, playerPositions, displayName } from '../domain/domain.js';
import { playerMatches } from '../search.js';
import { avatarEl } from '../avatar.js';
import { TEAM } from '../team.js';
import { searchBox } from '../ui/searchbox.js';
import { playerName } from '../ui/playerName.js';
import { openPlayerSheet, openAddPlayer } from './playerSheet.js';

const ui = { q: '' };

export function renderPlayers(root) {
  const s = store.get();
  const st = computeStats(s.players, s.matches);
  const list = h('div', { class: 'list-box' });

  const card = (p) => h('li', {},
    h('button', { class: 'pcard', onclick: () => openPlayerSheet(p), 'aria-label': `Ver ficha de ${p.name}` },
      avatarEl(p, TEAM, 56),
      h('span', { class: 'pc-main' },
        playerName(p),
        playerPositions(p).length ? h('span', { class: 'muted' }, playerPositions(p).join(', ')) : null),
      h('span', { class: 'pc-stats' }, `PJ ${st[p.id].pj} · ⚽ ${st[p.id].goles} · 🤝 ${st[p.id].asist}`)));

  const paint = () => {
    const q = ui.q.trim();
    const found = s.players.filter((p) => playerMatches(p, q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'es'));
    if (!found.length) {
      list.replaceChildren(h('div', { class: 'card empty' },
        h('p', {}, q ? `Nadie se llama "${q}".` : 'Todavía no hay jugadores.'),
        q ? null : h('div', { class: 'row center wrap' },
          h('button', { onclick: openAddPlayer }, '＋ Agregar jugador'),
          s.matches.length ? null : h('button', { class: 'ghost', onclick: () => store.loadDemo() }, 'Probar con datos de ejemplo'))));
      return;
    }
    const names = [...POSITION_GROUPS.map(([n]) => n), 'Sin posición'];
    fill(list, names.map((g, i) => {
      const items = found.filter((p) => groupOfPlayer(p) === g);
      if (!items.length) return null;
      return collapsible(`pg:${g}`,
        [h('strong', { class: 'fold-title' }, g), h('span', { class: 'muted' }, `${items.length}`)],
        h('ul', { class: 'pgrid' }, items.map(card)),
        { open: s.players.length <= 16 || i === 0, force: !!q, cls: 'sec' });
    }));
  };

  root.replaceChildren(
    h('h1', { class: 'page-title' }, 'Jugadores'),
    h('div', { class: 'row' },
      searchBox({ value: ui.q, placeholder: 'Buscar por nombre, apodo, número o posición', label: 'Buscar jugador', onInput: (v) => { ui.q = v; paint(); } }),
      h('button', { onclick: openAddPlayer, 'aria-label': 'Agregar jugador' }, '＋')),
    list);
  paint();
}
