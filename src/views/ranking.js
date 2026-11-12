import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { collapsible } from '../collapsible.js';
import { computeStats, rankBy, RANK_CATS, RANK_HELP, displayName } from '../domain/domain.js';
import { playerMatches } from '../search.js';
import { avatarEl } from '../avatar.js';
import { TEAM } from '../team.js';
import { searchBox } from '../ui/searchbox.js';
import { openPlayerSheet } from './playerSheet.js';
import { escabioChart } from '../ui/escabioChart.js';
import { podium } from '../ui/podium.js';
import { playerName } from '../ui/playerName.js';

const ui = { cat: 'goles', q: '' };
const AVG_CATS = ['goles', 'asist', 'ga'];
// Sin botón propio (para que la botonera sea corta); igual se ven en la Tabla completa.
const CHIP_HIDDEN = ['e', 'pj', 'golesContra'];
const avgText = (v) => v.toFixed(2).replace('.', ',');
const PCT_CATS = ['v', 'd'];
export const pctText = (n, pj) => (pj ? `${Math.round((n / pj) * 100)}%` : '—');

export function renderRanking(root) {
  const s = store.get();
  const st = computeStats(s.players, s.matches);
  const out = h('div', { class: 'rank-out' });
  const tableBox = h('div');

  const open = (p) => openPlayerSheet(p);
  const nameOf = displayName;

  const paint = () => {
    const q = ui.q.trim();
    const all = rankBy(st, s.players, ui.cat);
    const rows = q ? all.filter((r) => playerMatches(r.player, q)) : all;
    const [label] = RANK_CATS[ui.cat];
    // Promedio por partido jugado (en las mismas categorías que la app original). Igual en podio y lista.
    // En Victorias y Derrotas: el porcentaje sobre los partidos jugados.
    const avgOf = (r) => {
      const pj = st[r.player.id].pj;
      if (!pj) return null;
      if (PCT_CATS.includes(ui.cat)) return pctText(r.value, pj);
      return AVG_CATS.includes(ui.cat) ? `${avgText(r.value / pj)}/pj` : null;
    };
    const avg = (r) => (avgOf(r) ? h('span', { class: 'muted avg' }, ` (${avgOf(r)})`) : null);

    const podiumEl = !q ? podium(all, { cat: ui.cat, label, onOpen: open, avg: avgOf }) : null;

    const rest = q ? rows : all.slice(3);
    const list = rest.length
      ? h('ul', { class: 'card rank-list' }, rest.map((r) => h('li', {},
        h('span', { class: 'rpos' }, `${r.pos}°`),
        h('button', { class: 'linklike inline', onclick: () => open(r.player) }, avatarEl(r.player, TEAM, 36, 'bust'), playerName(r.player)),
        h('span', { class: 'rval' }, String(r.value), avg(r)))))
      : null;

    fill(out,
      h('p', { class: 'muted help' }, RANK_HELP[ui.cat] || ''),
      !all.length ? h('div', { class: 'card empty' }, h('p', {}, `Todavía nadie tiene ${label.replace(/^\S+\s/, '').toLowerCase()}.`))
        : q && !rows.length ? h('div', { class: 'card empty' }, h('p', {}, `"${q}" no está en este ranking.`))
          : [podiumEl, list]);

    // Tabla completa (filtrada por el buscador)
    const ps = s.players.filter((p) => playerMatches(p, q)).sort((a, b) => st[b.id].goles - st[a.id].goles || a.name.localeCompare(b.name, 'es'));
    const cols = [['PJ', 'Partidos', 'pj'], ['G', 'Goles', 'goles'], ['EC', 'Goles en contra', 'golesContra'], ['A', 'Asistencias', 'asist'], ['V', 'Victorias', 'v'],
      ['E', 'Empates', 'e'], ['D', 'Derrotas', 'd'], ['%V', 'Porcentaje de victorias', '%v'], ['%D', 'Porcentaje de derrotas', '%d'], ['Racha', 'Racha invicta', 'rachaAct'], ['🔥', 'Golazos', 'golazos'],
      ['🧱', 'Muros', 'muros'], ['🪓', 'Hachazos', 'hachazos'], ['📣', 'Polémicas', 'polemicas'], ['👑', 'Figuras', 'mvp'], ['🧤', 'Arquero', 'gk']];
    tableBox.replaceChildren(collapsible('rk:table', h('h2', { class: 'fold-h2' }, 'Tabla completa'),
      ps.length ? h('div', { class: 'card table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Jugador'),
          cols.map(([short, long]) => h('th', { scope: 'col' }, h('abbr', { title: long }, short))))),
        h('tbody', {}, ps.map((p) => h('tr', {},
          h('th', { scope: 'row' }, h('button', { class: 'linklike inline', onclick: () => open(p) }, nameOf(p),
            p.guest ? h('span', { class: 'pill guest-pill' }, 'invitado') : null)),
          cols.map(([, , k]) => h('td', {}, k.startsWith('%')
            ? pctText(st[p.id][k.slice(1)], st[p.id].pj) : String(st[p.id][k]))))))))
        : h('p', { class: 'muted' }, 'Nadie coincide con la búsqueda.'),
      { cls: 'sec', force: !!q }));
  };

  root.replaceChildren(
    h('h1', { class: 'page-title' }, 'Ranking'),
    // Botones siempre visibles: bajan de renglón, sin desplegable ni scroll lateral.
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Categoría' },
      Object.entries(RANK_CATS).filter(([k]) => !CHIP_HIDDEN.includes(k)).map(([k, [label]]) => h('button', {
        class: `chip-btn ${k === ui.cat ? 'on' : ''}`, 'data-cat': k, 'aria-pressed': String(k === ui.cat),
        onclick: () => { ui.cat = k; renderRanking(root); },
      }, label))),
    searchBox({ value: ui.q, placeholder: 'Buscar jugador en el ranking', label: 'Buscar en el ranking', onInput: (v) => { ui.q = v; paint(); } }),
    out, tableBox,
    collapsible('rk:esc', h('h2', { class: 'fold-h2' }, '🍾 Escabio por partido'),
      h('div', { class: 'card' }, escabioChart(s.matches)), { open: true, cls: 'sec' }));
  paint();
}
