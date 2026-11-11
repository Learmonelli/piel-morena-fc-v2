import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { collapsible } from '../collapsible.js';
import {
  scoreOf, goalsBy, ownGoalsBy, assistQty, sideOf, inMatch, fmtDate, AWARDS, escTotal, displayName,
} from '../domain/domain.js';
import { playerMatches } from '../search.js';
import { avatarEl } from '../avatar.js';
import { TEAM } from '../team.js';
import { searchBox } from '../ui/searchbox.js';
import { playerName } from '../ui/playerName.js';
import { toast } from '../ui/toast.js';
import { confirmDialog, openSheet } from '../ui/sheet.js';
import { sfx, buzz } from '../ui/sfx.js';
import { shareSummary } from '../ui/share.js';

const ui = { q: '', drafts: {} };
const getAuthor = () => { try { return localStorage.getItem('pm2_author') || ''; } catch { return ''; } };
const setAuthor = (a) => { try { localStorage.setItem('pm2_author', a); } catch { /* ignorar */ } };

export function renderMatch(root, id) {
  const m = store.match(id);
  if (!m) {
    root.replaceChildren(h('div', { class: 'card empty' },
      h('p', {}, 'No encontramos ese partido.'),
      h('a', { class: 'btn', href: '#/partidos' }, 'Volver a partidos')));
    return;
  }
  const s = store.get();
  const locked = m.closed;
  const rivalMode = m.mode === 'rival';
  const nameB = rivalMode ? m.rivalName : m.teamBName;
  const byId = (pid) => s.players.find((p) => p.id === pid);
  const label = displayName;

  // ---- Acciones con deshacer ----
  const goal = (p, side) => {
    const ev = store.addGoal(m.id, side, p.id);
    if (!ev) return;
    sfx('goal'); buzz();
    toast(`⚽ Gol de ${label(p)}`, {
      actionLabel: 'Deshacer', onAction: () => { store.removeGoal(m.id, ev.id); sfx('undo'); },
    });
  };
  const assist = (p) => {
    if (!store.addAssist(m.id, p.id)) {
      toast('Primero cargá el gol: no puede haber más asistencias que goles.');
      return;
    }
    sfx('assist'); buzz(15);
    toast(`🤝 Asistencia de ${label(p)}`, {
      actionLabel: 'Deshacer', onAction: () => { store.removeAssist(m.id, p.id); sfx('undo'); },
    });
  };
  // Gol en contra: un solo botón junto al marcador. Elegís quién se la metió en su arco y el gol
  // suma para el otro equipo.
  const ownGoal = (p) => {
    const ev = store.addOwnGoal(m.id, p.id);
    if (!ev) return;
    const beneficiary = ev.side === 'A' ? m.teamAName : nameB;
    sfx('undo'); buzz();
    toast(`🙈 Gol de ${beneficiary} · en contra de ${label(p)}`, {
      actionLabel: 'Deshacer', onAction: () => { store.removeGoal(m.id, ev.id); sfx('undo'); },
    });
  };

  function openOwnGoal() {
    openSheet('🙈 Gol en contra', (close) => {
      const q = { text: '' };
      const list = h('div', { class: 'pick-list' });
      const sides = [['A', m.teamAName, m.teamA], ...(rivalMode ? [] : [['B', nameB, m.teamB]])];
      const paint = () => {
        const groups = sides.map(([side, name, ids]) => {
          const ps = ids.map(byId).filter(Boolean).filter((p) => playerMatches(p, q.text));
          if (!ps.length) return null;
          const beneficiary = side === 'A' ? nameB : m.teamAName;
          return h('section', {},
            h('h3', { class: 'pick-head' }, name),
            ps.map((p) => h('button', {
              type: 'button', class: 'ghost pick-row',
              onclick: () => { ownGoal(p); close(); },
            }, avatarEl(p, TEAM, 40), h('span', { class: 'pick-name' }, playerName(p)),
            h('span', { class: 'muted pick-note' }, `suma para ${beneficiary}`))));
        });
        fill(list, groups.some(Boolean) ? groups
          : h('p', { class: 'muted' }, inMatch(m).length ? 'Nadie coincide con la búsqueda.' : 'Primero armá los equipos para elegir quién fue.'));
      };
      paint();
      return h('div', {},
        h('p', { class: 'muted' }, '¿Quién se la metió en su propio arco? El gol suma para el otro equipo y no es gol del jugador.'),
        searchBox({ value: '', placeholder: 'Buscar jugador', label: 'Buscar jugador', onInput: (v) => { q.text = v; paint(); } }),
        list);
    });
  }
  const rivalGoal = () => {
    const ev = store.addGoal(m.id, 'B', null);
    if (!ev) return;
    sfx('undo'); buzz();
    toast(`⚽ Gol de ${m.rivalName}`, { actionLabel: 'Deshacer', onAction: () => store.removeGoal(m.id, ev.id) });
  };
  const undoLast = () => {
    const last = m.events[m.events.length - 1];
    if (last && store.removeGoal(m.id, last.id)) { sfx('undo'); toast('Se deshizo el último gol.'); }
  };

  // ---- Marcador ----
  const board = h('section', { class: 'card board', 'aria-label': 'Marcador' },
    h('div', { class: 'board-row' },
      h('span', { class: 'bteam' }, m.teamAName),
      h('b', { class: 'bscore', 'aria-live': 'polite' }, `${scoreOf(m, 'A')} : ${scoreOf(m, 'B')}`),
      h('span', { class: 'bteam' }, nameB)),
    h('p', { class: 'muted center' },
      `${fmtDate(m.date)} · ${rivalMode ? 'Contra rival' : 'Interno'} · ${locked ? '🔒 Finalizado' : '● Abierto'}`),
    locked ? h('p', { class: 'muted center' }, 'Los datos están bloqueados. Podés seguir agregando comentarios.')
      : h('div', { class: 'row center wrap' },
        rivalMode ? h('button', { class: 'rival-goal', onclick: rivalGoal }, `⚽ Gol de ${m.rivalName}`) : null,
        m.events.length ? h('button', { class: 'ghost', onclick: undoLast }, '↩ Deshacer último') : null));

  // ---- Buscador de jugadores del partido ----
  const rosterBox = h('div', { class: 'roster-box' });
  const teamsBox = h('div', { class: 'card teams-box' });

  const row = (p, side) => h('li', { class: 'prow' },
    avatarEl(p, TEAM, 40),
    // Contadores debajo del nombre: así el nombre usa todo el ancho y no se corta.
    h('div', { class: 'pinfo' }, playerName(p),
      h('span', {
        class: 'counts',
        'aria-label': `${goalsBy(m, p.id)} goles, ${assistQty(m, p.id)} asistencias, ${ownGoalsBy(m, p.id)} goles en contra`,
      }, `⚽ ${goalsBy(m, p.id)}  🤝 ${assistQty(m, p.id)}`,
      ownGoalsBy(m, p.id) ? h('span', { class: 'own-count' }, `  🙈 ${ownGoalsBy(m, p.id)}`) : null)),
    locked ? null : h('div', { class: 'acts' },
      h('button', { class: 'act', 'aria-label': `Gol de ${p.name}`, onclick: () => goal(p, side) }, '⚽'),
      h('button', { class: 'act ghost', 'aria-label': `Asistencia de ${p.name}`, onclick: () => assist(p) }, '🤝')));

  const paintLists = () => {
    const q = ui.q.trim();
    const sideCard = (side) => {
      const ids = side === 'A' ? m.teamA : m.teamB;
      const ps = ids.map(byId).filter(Boolean).filter((p) => playerMatches(p, q));
      return h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, side === 'A' ? m.teamAName : nameB, h('span', { class: 'muted' }, ` (${ids.length})`)),
        locked ? null : h('p', { class: 'muted legend' }, '⚽ gol · 🤝 asistencia'),
        ps.length ? h('ul', { class: 'plist' }, ps.map((p) => row(p, side)))
          : h('p', { class: 'muted' }, ids.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay jugadores. Armalos abajo en "Armar equipos".'));
    };
    fill(rosterBox, sideCard('A'), rivalMode ? null : sideCard('B'));

    // Armar equipos: A | ninguno | B
    const choices = rivalMode ? [['A', 'Juega'], ['', 'No']] : [['A', 'A'], ['', '—'], ['B', 'B']];
    const all = s.players.filter((p) => playerMatches(p, q));
    // Invitado (como en la app original): nombre + "＋ A" / "＋ B". Queda anotado en ese equipo.
    const guestIn = h('input', {
      type: 'text', maxlength: 60, placeholder: 'Invitado (sin perfil)…', autocomplete: 'off',
      'aria-label': 'Nombre del invitado', class: 'grow',
    });
    const guestErr = h('p', { class: 'error', role: 'alert' });
    const addGuest = (side) => {
      if (!guestIn.value.trim()) { guestErr.textContent = 'Escribí el nombre del invitado.'; guestIn.focus(); return; }
      const g = store.addGuest(m.id, guestIn.value, side);
      if (g) toast(`Invitado ${g.name} sumado a ${side === 'A' ? m.teamAName : nameB}.`);
    };
    const guestForm = locked ? null : h('form', {
      class: 'guest-add', onsubmit: (e) => { e.preventDefault(); addGuest('A'); },
    },
    guestIn,
    h('button', { type: 'submit', class: 'ghost', 'aria-label': `Sumar invitado a ${m.teamAName}` }, rivalMode ? '＋ Juega' : '＋ A'),
    rivalMode ? null : h('button', { type: 'button', class: 'ghost', 'aria-label': `Sumar invitado a ${nameB}`, onclick: () => addGuest('B') }, '＋ B'));

    fill(teamsBox,
      locked ? null : h('div', { class: 'row wrap' },
        h('button', { class: 'ghost', onclick: () => { store.shuffleTeams(m.id); toast('Equipos sorteados.'); } }, '🎲 Sortear equipos')),
      guestForm, locked ? null : guestErr,
      all.length ? h('ul', { class: 'plist' }, all.map((p) => {
        const cur = sideOf(m, p.id) || '';
        return h('li', { class: 'prow' },
          avatarEl(p, TEAM, 32),
          h('div', { class: 'pinfo' }, playerName(p)),
          h('div', { class: 'seg-btns', role: 'group', 'aria-label': `Equipo de ${p.name}` },
            choices.map(([val, text]) => h('button', {
              class: `seg-btn ${val ? `side-${val}` : 'side-none'} ${cur === val ? 'on' : ''}`,
              'aria-pressed': String(cur === val), disabled: locked,
              'aria-label': val ? `${p.name} en ${val === 'A' ? m.teamAName : nameB}` : `${p.name} no juega`,
              onclick: () => store.setTeamSide(m.id, p.id, val),
            }, text))));
      })) : h('p', { class: 'muted' }, 'Nadie coincide con la búsqueda.'));
  };

  // ---- Premios ----
  const inM = inMatch(m).map(byId).filter(Boolean);
  const awardRows = Object.entries(AWARDS).map(([cat, def]) => {
    const sel = h('select', {
      'aria-label': def.label, disabled: locked,
      onchange: (e) => { store.setAward(m.id, cat, e.target.value); if (cat === 'mvp' && e.target.value) sfx('mvp'); },
    },
    h('option', { value: '' }, '— Sin elegir —'),
    inM.map((p) => h('option', { value: p.id, selected: m[def.field] === p.id }, label(p))));
    return h('label', { class: 'award-row' }, h('span', {}, `${def.icon} ${def.label}`), sel);
  });

  // ---- Escabio: un total del equipo por partido (como en la app original) ----
  const escInput = h('input', {
    type: 'number', inputmode: 'numeric', min: 0, max: 999, value: String(escTotal(m)), disabled: locked,
    class: 'esc-total-input', 'aria-label': 'Total de escabio del equipo',
    onchange: (e) => store.setEscabioTotal(m.id, e.target.value),
  });
  const escabioBox = h('div', { class: 'card esc-total' },
    h('p', { class: 'muted' }, 'Total de birras del equipo en este partido.'),
    h('div', { class: 'stepper big' },
      h('button', { class: 'ghost', 'aria-label': 'Una birra menos', disabled: locked, onclick: () => store.adjustEscabioTotal(m.id, -1) }, '−'),
      escInput,
      h('button', { class: 'ghost', 'aria-label': 'Una birra más', disabled: locked, onclick: () => store.adjustEscabioTotal(m.id, 1) }, '+')),
    locked ? h('p', { class: 'muted center' }, '🔒 Partido finalizado.') : null);

  // ---- Goles cargados ----
  const evRows = m.events.map((ev, i) => {
    const p = byId(ev.scorerId);
    const team = ev.side === 'A' ? m.teamAName : nameB; // equipo al que suma el gol
    // Se lee como se dice en la cancha: "Gol de Blanco, en contra de Tuti".
    const who = ev.ownGoal ? `🙈 Gol de ${team}` : `⚽ ${p ? label(p) : `Gol de ${team}`}`;
    return h('li', { class: 'ev' },
      h('span', {}, `${i + 1}. ${who}`),
      ev.ownGoal ? h('span', { class: 'pill loss' }, p ? `en contra de ${label(p)}` : 'en contra') : null,
      ev.ownGoal ? null : h('span', { class: 'muted' }, ` · ${team}`),
      locked ? null : h('span', { class: 'ev-actions' },
        h('button', { class: 'ghost small', 'aria-label': `Editar el gol ${i + 1}`, onclick: () => openEditGoal(ev) }, '✎'),
        h('button', { class: 'ghost small', 'aria-label': `Quitar el gol ${i + 1}`, onclick: () => { store.removeGoal(m.id, ev.id); sfx('undo'); } }, '✕')));
  });

  // Editar un gol ya cargado: quién lo hizo y si fue en contra.
  function openEditGoal(ev) {
    openSheet('Editar gol', (close) => {
      const rivalSide = m.mode === 'rival' && ev.side === 'B';
      const beneficiary = ev.side === 'A' ? m.teamAName : nameB;
      const oppSide = ev.side === 'A' ? 'B' : 'A';
      const rosterOf = (side) => (side === 'A' ? m.teamA : m.teamB).map(byId).filter(Boolean);
      const state = { own: !!ev.ownGoal };
      const sel = h('select', { 'aria-label': 'Jugador' });
      const note = h('p', { class: 'muted' });
      const err = h('p', { class: 'error', role: 'alert' });
      const modeBtns = [[false, '⚽ Gol'], [true, '🙈 En contra']].map(([own, text]) => h('button', {
        type: 'button', class: 'seg-btn', onclick: () => { state.own = own; paint(); },
      }, text));
      const paint = () => {
        const list = rosterOf(state.own ? oppSide : ev.side);
        const keep = (!!ev.ownGoal === state.own) ? ev.scorerId : '';
        fill(sel,
          !state.own && rivalSide ? h('option', { value: '' }, 'Gol del rival (sin jugador)') : null,
          state.own ? h('option', { value: '' }, '— Elegí el jugador —') : null,
          list.map((p) => h('option', { value: p.id, selected: p.id === keep }, label(p))));
        note.textContent = state.own
          ? `Lo hizo un jugador de ${oppSide === 'A' ? m.teamAName : nameB} en su propio arco. El gol suma para ${beneficiary} y no es gol del jugador.`
          : `El gol suma para ${beneficiary} y es del jugador elegido.`;
        modeBtns.forEach((b, i) => {
          const on = (i === 1) === state.own;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        err.textContent = '';
      };
      paint();
      return h('div', {},
        h('div', { class: 'seg-btns', role: 'group', 'aria-label': 'Tipo de gol' }, modeBtns),
        h('label', { class: 'field' }, h('span', {}, 'Jugador'), sel), note, err,
        h('div', { class: 'row end' },
          h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
          h('button', { type: 'button', onclick: () => {
            const r = store.updateGoal(m.id, ev.id, { ownGoal: state.own, scorerId: sel.value });
            if (r === 'ok') { close(); toast('Gol actualizado.'); }
            else if (r === 'assists') err.textContent = 'No se puede: quedarían más asistencias que goles. Quitá una asistencia primero.';
            else err.textContent = state.own ? 'Elegí quién hizo el gol en contra.' : 'Elegí el goleador.';
          } }, 'Guardar')));
    });
  }

  // ---- Comentarios ----
  const authorIn = h('input', { type: 'text', maxlength: 30, value: getAuthor(), placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' });
  const textIn = h('textarea', {
    maxlength: 400, rows: 3, placeholder: 'Escribí un comentario…', 'aria-label': 'Comentario',
    oninput: (e) => { ui.drafts[m.id] = e.target.value; },
  });
  textIn.value = ui.drafts[m.id] || '';
  const comments = h('div', {},
    m.comments.length ? h('ul', { class: 'comments' }, m.comments.map((c) => h('li', {},
      h('strong', {}, c.author), h('span', { class: 'muted' }, ` · ${new Date(c.ts).toLocaleDateString('es-AR')}`),
      h('p', {}, c.text),
      h('button', { class: 'ghost small', onclick: async () => {
        if (await confirmDialog('¿Borrar este comentario?', { okLabel: 'Borrar', danger: true })) store.removeComment(m.id, c.id);
      } }, 'Borrar'))))
      : h('p', { class: 'muted' }, 'Todavía no hay comentarios.'),
    h('form', { class: 'comment-form', onsubmit: (e) => {
      e.preventDefault();
      if (!textIn.value.trim()) return;
      setAuthor(authorIn.value);
      ui.drafts[m.id] = '';
      store.addComment(m.id, authorIn.value, textIn.value);
      toast('Comentario enviado.');
    } }, authorIn, textIn, h('button', { type: 'submit' }, 'Comentar')));

  // ---- Acciones del partido ----
  const actions = h('div', { class: 'row wrap center' },
    h('button', { class: 'ghost', onclick: async () => {
      const r = await shareSummary(m, s.players);
      if (r === 'downloaded') toast('Imagen descargada. Ya podés mandarla por WhatsApp.');
    } }, '📤 Compartir resumen'),
    locked
      ? h('button', { class: 'ghost', onclick: async () => {
        if (await confirmDialog('¿Reabrir el partido para editarlo?', { okLabel: 'Reabrir' })) { store.reopenMatch(m.id); toast('Partido reabierto.'); }
      } }, '🔓 Reabrir')
      : h('button', { onclick: async () => {
        if (await confirmDialog('Al finalizar, los datos quedan bloqueados (solo se podrán agregar comentarios).', { okLabel: 'Finalizar' })) {
          store.closeMatch(m.id); toast('Partido finalizado.');
        }
      } }, '🏁 Finalizar partido'),
    h('button', { class: 'danger', onclick: async () => {
      if (await confirmDialog('¿Eliminar este partido? No se puede deshacer.', { okLabel: 'Eliminar', danger: true })) {
        store.deleteMatch(m.id);
        location.hash = '#/partidos';
      }
    } }, 'Eliminar'));

  root.replaceChildren(
    h('a', { class: 'back', href: '#/partidos' }, '← Partidos'),
    board,
    searchBox({
      value: ui.q, placeholder: 'Buscar jugador en este partido', label: 'Buscar jugador',
      onInput: (v) => { ui.q = v; paintLists(); },
    }),
    rosterBox,
    collapsible(`teams:${m.id}`, h('h2', { class: 'fold-h2' }, 'Armar equipos'), teamsBox,
      { open: inMatch(m).length === 0, force: !!ui.q.trim(), cls: 'sec' }),
    collapsible(`aw:${m.id}`, h('h2', { class: 'fold-h2' }, 'Premios'),
      inM.length ? h('div', { class: 'card awards' }, awardRows) : h('p', { class: 'card muted' }, 'Primero armá los equipos para elegir premios.'),
      { open: true, cls: 'sec' }),
    collapsible(`ev:${m.id}`, h('h2', { class: 'fold-h2' }, `Goles (${m.events.length})`),
      h('div', { class: 'card' },
        evRows.length ? h('ol', { class: 'events' }, evRows) : h('p', { class: 'muted' }, 'Sin goles todavía.'),
        // El gol en contra se anota desde acá, junto a la lista de goles (no en el marcador).
        locked ? null : h('div', { class: 'row' },
          h('button', { class: 'ghost own-btn', onclick: openOwnGoal }, '🙈 Agregar gol en contra'))),
      { open: true, cls: 'sec' }),
    collapsible(`esc:${m.id}`, h('h2', { class: 'fold-h2' }, `🍾 Escabio (${escTotal(m)})`), escabioBox, { cls: 'sec' }),
    collapsible(`cm:${m.id}`, h('h2', { class: 'fold-h2' }, `Comentarios (${m.comments.length})`),
      h('div', { class: 'card' }, comments), { open: true, cls: 'sec' }),
    actions);
  paintLists();
}
