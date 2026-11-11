import { h } from '../dom.js';
import { store } from '../store.js';
import { collapsible } from '../collapsible.js';
import {
  computeStats, POSITION_GROUPS, POS_NAME, playerPositions, resultFor, goalsBy, ownGoalsBy, assistQty, scoreOf, fmtDate, sideOf,
  displayName,
} from '../domain/domain.js';
import { avatarEl } from '../avatar.js';
import { TEAM } from '../team.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { faceEditor } from '../ui/faceEditor.js';
import { playerName } from '../ui/playerName.js';

// Selector de posiciones como en la app original: una fila por línea, con pastillas.
function positionPicker(initial) {
  const chosen = new Set(initial);
  const buttons = [];
  const paint = () => buttons.forEach(([code, b]) => {
    b.classList.toggle('on', chosen.has(code));
    b.setAttribute('aria-pressed', String(chosen.has(code)));
  });
  const el = h('div', { class: 'face-controls pos-picker' },
    POSITION_GROUPS.map(([group, arr]) => h('div', { class: 'face-row', role: 'group', 'aria-label': group },
      h('span', { class: 'face-lbl' }, group),
      arr.map(([code, label]) => {
        const b = h('button', {
          type: 'button', class: 'face-pill', title: label, 'aria-label': `${code}, ${label}`,
          onclick: () => { if (chosen.has(code)) chosen.delete(code); else chosen.add(code); paint(); },
        }, code);
        buttons.push([code, b]);
        return b;
      }))));
  paint();
  return { el, get: () => [...chosen] };
}

// Formulario compartido para agregar y editar jugadores.
function playerForm(p, close) {
  const seed = p?.id ?? `nuevo-${Date.now()}`;
  const name = h('input', { type: 'text', maxlength: 60, required: true, value: p?.name ?? '', autocomplete: 'off' });
  const nick = h('input', { type: 'text', maxlength: 30, value: p?.nickname ?? '', autocomplete: 'off' });
  const num = h('input', { type: 'text', inputmode: 'numeric', maxlength: 3, value: p?.number ?? '', autocomplete: 'off' });
  const guest = h('input', { type: 'checkbox', checked: !!p?.guest, disabled: !!p });
  const pos = positionPicker(p ? playerPositions(p) : []);
  const face = faceEditor(seed, p ? p.face : null);

  return h('form', {
    class: 'player-form',
    onsubmit: (e) => {
      e.preventDefault();
      const data = { name: name.value, nickname: nick.value, number: num.value, positions: pos.get(), face: face.get() };
      if (p) { store.updatePlayer(p.id, data); toast('Jugador actualizado.'); }
      else { store.addPlayer({ ...data, guest: guest.checked }); toast('Jugador agregado.'); }
      close();
    },
  },
  face.el,
  h('label', { class: 'field' }, h('span', {}, 'Nombre'), name),
  h('div', { class: 'row' },
    h('label', { class: 'field grow' }, h('span', {}, 'Apodo'), nick),
    h('label', { class: 'field num-field' }, h('span', {}, 'N°'), num)),
  h('fieldset', { class: 'seg' }, h('legend', {}, 'Posiciones'), pos.el),
  p ? null : h('label', { class: 'chip' }, guest, ' Es invitado'),
  h('div', { class: 'row end sticky-actions' },
    h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
    h('button', { type: 'submit' }, p ? 'Guardar' : 'Agregar jugador')));
}

export function openAddPlayer() { openSheet('Nuevo jugador', (close) => playerForm(null, close)); }

export function openEditPlayer(player) {
  openSheet(`Editar a ${displayName(player)}`, (close) => playerForm(player, close));
}

export function openPlayerSheet(player) {
  openSheet(displayName(player), (close) => {
    const s = store.get();
    const st = computeStats(s.players, s.matches)[player.id];
    const stat = (label, value) => h('div', { class: 'stat' }, h('b', {}, String(value)), h('span', {}, label));
    const played = s.matches
      .filter((m) => sideOf(m, player.id))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const RES = { v: ['V', 'win', 'Victoria'], e: ['E', 'draw', 'Empate'], d: ['D', 'loss', 'Derrota'] };
    const positions = playerPositions(player);

    return h('div', {},
      h('div', { class: 'player-head' },
        avatarEl(player, TEAM, 120),
        h('div', {},
          h('div', { class: 'player-name' }, playerName(player)),
          player.guest ? h('p', { class: 'muted' }, 'invitado') : null,
          positions.length ? h('div', { class: 'pos-tags' }, positions.map((c) => h('span', { class: 'pill', title: POS_NAME[c] }, c))) : null,
          h('button', { class: 'ghost small', onclick: () => { close(); openEditPlayer(player); } }, '✏️ Editar jugador'))),
      h('div', { class: 'stats-grid' },
        stat('Partidos', st.pj), stat('Goles', st.goles), stat('En contra', st.golesContra), stat('Asist.', st.asist),
        stat('Victorias', st.v), stat('Empates', st.e), stat('Derrotas', st.d),
        stat('Figuras', st.mvp), stat('Golazos', st.golazos), stat('Racha', st.rachaAct)),
      collapsible(`ph:${player.id}`, h('strong', { class: 'fold-title' }, `Historial (${played.length})`),
        played.length ? h('ul', { class: 'history' }, played.map((m) => {
          const [t, cls, label] = RES[resultFor(m, player.id)];
          return h('li', {},
            h('span', { class: `res ${cls}`, 'aria-label': label }, t),
            h('a', { href: `#/partido/${m.id}`, onclick: close }, `${fmtDate(m.date)} · ${scoreOf(m, 'A')}:${scoreOf(m, 'B')}`),
            h('span', { class: 'muted' }, `⚽${goalsBy(m, player.id)} 🤝${assistQty(m, player.id)}${ownGoalsBy(m, player.id) ? ` 🙈${ownGoalsBy(m, player.id)}` : ''}`));
        })) : h('p', { class: 'muted' }, 'Todavía no jugó ningún partido.'), { open: true }),
      h('div', { class: 'row end' },
        h('button', { class: 'danger', onclick: async () => {
          if (await confirmDialog(`¿Eliminar a ${player.name}? Se quita de todos los partidos.`, { okLabel: 'Eliminar', danger: true })) {
            store.removePlayer(player.id); close(); toast('Jugador eliminado.');
          }
        } }, 'Eliminar jugador')));
  });
}
