// Prueba de interfaz sin navegador: renderiza las vistas reales con jsdom y simula uso.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toasts"></div></body>', { url: 'http://localhost/' });
const { window } = dom;
Object.assign(globalThis, {
  window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
  localStorage: window.localStorage, Event: window.Event,
});
// Los avisos usan setTimeout: que no mantengan vivo el proceso de pruebas.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { const t = realSetTimeout(fn, ms); t.unref?.(); return t; };
// jsdom no implementa <dialog>.showModal/close.
window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function close(rv) {
  this.removeAttribute('open'); this.returnValue = rv ?? '';
  this.dispatchEvent(new window.Event('close'));
};

const { store } = await import('../src/store.js');
window.localStorage.setItem('pm2_theme', 'modern'); // preferencia guardada por la versión anterior
await import('../src/theme.js');
const { renderMatches } = await import('../src/views/matches.js');
const { renderMatch } = await import('../src/views/match.js');
const { renderRanking } = await import('../src/views/ranking.js');
const { renderPlayers } = await import('../src/views/players.js');
const { openPlayerSheet } = await import('../src/views/playerSheet.js');
const { scoreOf, inMatch, RANK_CATS, computeStats, rankBy } = await import('../src/domain/domain.js');
const { playerMatches } = await import('../src/search.js');

const root = document.getElementById('app');
const toasts = document.getElementById('toasts');
const type = (input, value) => { input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
const text = () => root.textContent;

before(() => { assert.equal(store.loadDemo(), true); });

test('lista de partidos: meses plegables y 9 tarjetas', () => {
  renderMatches(root);
  assert.equal(root.querySelectorAll('.match-card').length, 9);
  const folds = root.querySelectorAll('details.fold');
  assert.ok(folds.length >= 1);
  assert.equal(folds[0].open, true); // el mes más reciente arranca abierto
  assert.ok(root.querySelector('.fab'));
});

test('lista de partidos: cada tarjeta muestra todos sus premios como etiquetas de color', async () => {
  const { AWARDS } = await import('../src/domain/domain.js');
  renderMatches(root);
  const s = store.get();
  const cards = [...root.querySelectorAll('.match-card')];
  assert.equal(cards.length, s.matches.length);
  const nameOf = (id) => s.players.find((x) => x.id === id).name; // se muestra el nombre, no el apodo
  for (const m of s.matches) {
    const card = cards.find((c) => c.getAttribute('href') === `#/partido/${m.id}`);
    const tags = [...card.querySelectorAll('.tags .tag[class*="aw-"]')].map((t) => t.textContent);
    // Una etiqueta por cada premio cargado, con el nombre corto y el jugador.
    const expected = Object.values(AWARDS).filter((a) => m[a.field]).map((a) => `${a.icon} ${a.short}: ${nameOf(m[a.field])}`);
    assert.deepEqual(tags, expected, `partido ${m.date}`);
  }
  // Los seis premios tienen su color propio.
  const classes = new Set(Object.keys(AWARDS).map((c) => `aw-${c}`));
  assert.equal(classes.size, 6);
  // El estado del partido sigue a la vista junto a los premios.
  assert.ok(cards.every((c) => c.querySelector('.tags .tag:not([class*="aw-"])')));
  // Ya no se repite la figura aparte debajo del marcador.
  assert.equal(root.querySelector('.mc-mvp'), null);
});

test('lista de partidos: un partido con los seis premios los muestra en orden', () => {
  const s = store.get();
  const m = s.matches.find((x) => x.mode === 'interno' && x.closed);
  const ids = [...m.teamA, ...m.teamB];
  const prev = { mvpId: m.mvpId, gkId: m.gkId, golazoId: m.golazoId, muroId: m.muroId, hachazoId: m.hachazoId, polemicaId: m.polemicaId };
  Object.assign(m, { mvpId: ids[0], gkId: ids[1], golazoId: ids[2], muroId: ids[3], hachazoId: ids[4], polemicaId: ids[5] });
  renderMatches(root);
  const card = [...root.querySelectorAll('.match-card')].find((c) => c.getAttribute('href') === `#/partido/${m.id}`);
  const tags = [...card.querySelectorAll('.tags .tag[class*="aw-"]')];
  assert.deepEqual(tags.map((t) => t.className.match(/aw-\w+/)[0]),
    ['aw-mvp', 'aw-gk', 'aw-golazo', 'aw-muro', 'aw-hachazo', 'aw-polemica']);
  Object.assign(m, prev);
});

test('buscador de partidos: filtra por jugador y abre todas las secciones', () => {
  renderMatches(root);
  const s = store.get();
  const tuti = s.players.find((p) => p.nickname === 'Tuti');
  const expected = s.matches.filter((m) => inMatch(m).includes(tuti.id)).length;
  type(root.querySelector('.search input'), 'tuti');
  assert.equal(root.querySelectorAll('.match-card').length, expected);
  assert.ok([...root.querySelectorAll('details.fold')].every((d) => d.open));
  assert.ok(root.querySelector('.mc-found')); // muestra sus goles y asistencias
  type(root.querySelector('.search input'), 'zzzz');
  assert.equal(root.querySelectorAll('.match-card').length, 0);
  assert.match(text(), /Ningún partido/);
  type(root.querySelector('.search input'), '');
  assert.equal(root.querySelectorAll('.match-card').length, 9);
});

test('goles en contra: el partido contra un rival tiene "Gol del rival" y suma al marcador', () => {
  const m = store.get().matches.find((x) => x.mode === 'rival' && !x.closed);
  const rerender = () => renderMatch(root, m.id);
  const unsub = store.subscribe(rerender);
  rerender();
  const rivalBtn = [...root.querySelectorAll('.board button')].find((b) => b.textContent.includes('Gol de Los Guapos FC'));
  assert.ok(rivalBtn, 'el botón del gol en contra está a la vista');
  assert.ok(rivalBtn.classList.contains('rival-goal'));
  const before = scoreOf(store.match(m.id), 'B');
  rivalBtn.click();
  assert.equal(scoreOf(store.match(m.id), 'B'), before + 1);
  assert.match(root.querySelector('.bscore').textContent, new RegExp(`: ${before + 1}$`));
  const added = store.match(m.id).events.at(-1);
  assert.equal(added.scorerId, null); // no se le suma a ningún jugador
  // Se puede quitar desde la lista de goles.
  assert.match(root.textContent, /Gol de Los Guapos FC/);
  const undo = [...toasts.querySelectorAll('button')].filter((b) => b.textContent === 'Deshacer').at(-1);
  undo.click();
  assert.equal(scoreOf(store.match(m.id), 'B'), before);
  unsub();
});

test('partido interno: no hay "gol del rival" (los dos equipos son propios)', () => {
  const m = store.get().matches.find((x) => x.mode === 'interno' && !x.closed);
  renderMatch(root, m.id);
  assert.equal(root.querySelector('.rival-goal'), null);
});

test('partido en vivo: gol, deshacer y regla de asistencias', () => {
  const open = store.get().matches.find((m) => !m.closed);
  const rerender = () => renderMatch(root, open.id);
  const unsub = store.subscribe(rerender);
  rerender();

  const score = () => scoreOf(store.match(open.id), 'A') + scoreOf(store.match(open.id), 'B');
  const before0 = score();
  assert.equal(before0, 0);
  const goalBtn = root.querySelector('.act[aria-label^="Gol de"]');
  assert.ok(goalBtn, 'hay botones de gol');
  goalBtn.click();
  assert.equal(score(), 1);
  assert.match(root.querySelector('.bscore').textContent, /\d : \d/);
  const undo = [...toasts.querySelectorAll('button')].find((b) => b.textContent === 'Deshacer');
  assert.ok(undo, 'el aviso ofrece deshacer');
  undo.click();
  assert.equal(score(), 0);

  // Asistencia sin gol previo: se rechaza con un aviso.
  const assistBtn = root.querySelector('.act[aria-label^="Asistencia de"]');
  assistBtn.click();
  assert.match(toasts.textContent, /Primero cargá el gol/);

  // Con gol del equipo, entra una asistencia y no una segunda.
  root.querySelector('.act[aria-label^="Gol de"]').click();
  root.querySelector('.act[aria-label^="Asistencia de"]').click();
  const m = store.match(open.id);
  assert.equal(Object.values(m.assists).reduce((a, b) => a + b, 0), 1);
  root.querySelector('.act[aria-label^="Asistencia de"]').click();
  assert.equal(Object.values(store.match(open.id).assists).reduce((a, b) => a + b, 0), 1);
  unsub();
});

test('partido en vivo: el buscador filtra jugadores sin perder el campo', () => {
  const open = store.get().matches.find((m) => !m.closed);
  renderMatch(root, open.id);
  const input = root.querySelector('.search input');
  const total = root.querySelectorAll('.roster-box .prow').length;
  assert.ok(total > 1);
  type(input, 'qqqq');
  assert.equal(root.querySelectorAll('.roster-box .prow').length, 0);
  assert.equal(root.querySelector('.search input'), input); // el mismo campo: no se redibujó
  type(input, '');
  assert.equal(root.querySelectorAll('.roster-box .prow').length, total);
});

test('escabio en el partido: un solo total del equipo, sin controles por jugador', () => {
  const open = store.get().matches.find((m) => !m.closed);
  const rerender = () => renderMatch(root, open.id);
  const unsub = store.subscribe(rerender);
  rerender();
  assert.equal(root.querySelectorAll('.stepper').length, 1); // antes había uno por jugador
  const input = () => root.querySelector('.esc-total-input');
  assert.equal(input().value, '0');
  root.querySelector('[aria-label="Una birra más"]').click();
  root.querySelector('[aria-label="Una birra más"]').click();
  assert.equal(input().value, '2');
  assert.equal(store.match(open.id).escabioTotal, 2);
  root.querySelector('[aria-label="Una birra menos"]').click();
  assert.equal(input().value, '1');
  input().value = '11';
  input().dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(store.match(open.id).escabioTotal, 11);
  assert.match(root.textContent, /Escabio \(11\)/);
  unsub();
});

test('escabio en un partido finalizado: controles deshabilitados', () => {
  const closed = store.get().matches.find((m) => m.closed);
  renderMatch(root, closed.id);
  assert.equal(root.querySelector('.esc-total-input').disabled, true);
  assert.equal(root.querySelector('[aria-label="Una birra más"]').disabled, true);
});

test('estadísticas: gráfico de líneas de escabio con total y promedio', () => {
  renderRanking(root);
  const svg = root.querySelector('svg.esc-chart');
  assert.ok(svg, 'hay gráfico');
  assert.ok(svg.querySelector('path[stroke="#f2b705"]'), 'tiene la línea');
  const dots = svg.querySelectorAll('circle');
  const dated = store.get().matches.filter((m) => m.date).length;
  assert.equal(dots.length, dated); // un punto por partido
  assert.match(svg.getAttribute('aria-label'), /Promedio: \d+,\d por partido/);
  const stats = [...root.querySelectorAll('.esc-stats .stat span')].map((e) => e.textContent);
  assert.deepEqual(stats, ['Total', 'Promedio por partido', 'Último partido']);
  // Ya no hay categoría "Escabio" en el selector de ranking.
  const options = [...root.querySelectorAll('.cat-select option')].map((o) => o.textContent);
  assert.equal(options.some((t) => /escabio/i.test(t)), false);
});

const ownBtn = () => [...root.querySelectorAll('button')].find((b) => b.textContent.includes('Agregar gol en contra'));

test('gol en contra: un solo botón, en la sección Goles y no en el marcador (ni uno por jugador)', () => {
  const open = store.get().matches.find((m) => m.mode === 'interno' && !m.closed);
  renderMatch(root, open.id);
  assert.ok(ownBtn(), 'hay un botón "Agregar gol en contra"');
  // No está arriba, junto al marcador...
  assert.equal([...root.querySelectorAll('.board button')].some((b) => /en contra/i.test(b.textContent)), false);
  // ...sino debajo de la lista de goles, dentro de una sección abierta.
  const section = ownBtn().closest('details.fold');
  assert.ok(section.open, 'la sección Goles está abierta');
  assert.match(section.querySelector('summary').textContent, /^Goles \(\d+\)/);
  assert.equal(root.querySelectorAll('.board button').length >= 1, true);
  // Las filas de los jugadores ya no tienen botón 🙈: solo gol y asistencia.
  assert.equal(root.querySelectorAll('.prow .acts .act.own').length, 0);
  const firstRow = root.querySelector('.roster-box .prow .acts');
  assert.equal(firstRow.querySelectorAll('button').length, 2);
  assert.doesNotMatch(root.querySelector('.legend').textContent, /🙈/);
});

test('gol en contra: se elige quién fue en una hoja con buscador, suma al otro equipo y se deshace', () => {
  const open = store.get().matches.find((m) => m.mode === 'interno' && !m.closed);
  const rerender = () => renderMatch(root, open.id);
  const unsub = store.subscribe(rerender);
  rerender();
  const m0 = store.match(open.id);
  const a0 = scoreOf(m0, 'A');
  const b0 = scoreOf(m0, 'B');

  ownBtn().click();
  const dlg = document.querySelector('dialog.sheet');
  assert.ok(dlg && dlg.hasAttribute('open'));
  // Muestra a los jugadores de los dos equipos, agrupados.
  assert.equal(dlg.querySelectorAll('.pick-head').length, 2);
  const total = m0.teamA.length + m0.teamB.length;
  assert.equal(dlg.querySelectorAll('.pick-row').length, total);
  // El buscador filtra sin perder el campo.
  const search = dlg.querySelector('.search input');
  const target = store.get().players.find((p) => p.id === m0.teamA[0]);
  type(search, target.nickname.toLowerCase());
  assert.ok(dlg.querySelectorAll('.pick-row').length >= 1 && dlg.querySelectorAll('.pick-row').length < total);
  assert.equal(dlg.querySelector('.search input'), search);
  type(search, 'qqqq');
  assert.match(dlg.querySelector('.pick-list').textContent, /Nadie coincide/);
  type(search, target.nickname.toLowerCase());

  // Elegir a un jugador del equipo A: el gol suma para B y la hoja se cierra.
  // Se busca por apodo, pero en pantalla aparece el nombre.
  const row = [...dlg.querySelectorAll('.pick-row')].find((r) => r.textContent.includes(target.name));
  assert.match(row.textContent, /suma para/);
  row.click();
  assert.equal(document.querySelector('dialog.sheet'), null);
  const m1 = store.match(open.id);
  assert.equal(scoreOf(m1, 'A'), a0);       // no suma para su propio equipo
  assert.equal(scoreOf(m1, 'B'), b0 + 1);   // suma para el otro
  const ev = m1.events.at(-1);
  assert.deepEqual([ev.ownGoal, ev.side, ev.scorerId], [true, 'B', target.id]);
  assert.match(toasts.textContent, new RegExp(`Gol de .* · en contra de ${target.name}`));
  // Se lee como en la cancha: "Gol de Blanco" + "en contra de Tuti".
  const item = [...root.querySelectorAll('.ev')].find((li) => li.querySelector('.pill.loss'));
  assert.match(item.textContent, /Gol de Blanco/);
  assert.equal(item.querySelector('.pill.loss').textContent, `en contra de ${target.name}`);
  assert.ok(root.querySelector('.own-count'));
  // Deshacer desde el aviso.
  [...toasts.querySelectorAll('button')].filter((b) => b.textContent === 'Deshacer').at(-1).click();
  assert.equal(scoreOf(store.match(open.id), 'B'), b0);
  unsub();
});

test('gol en contra en partido contra rival: solo se listan los nuestros y suma para el rival', () => {
  const m = store.get().matches.find((x) => x.mode === 'rival' && !x.closed);
  const rerender = () => renderMatch(root, m.id);
  const unsub = store.subscribe(rerender);
  rerender();
  const before = scoreOf(store.match(m.id), 'B');
  ownBtn().click();
  const dlg = document.querySelector('dialog.sheet');
  assert.equal(dlg.querySelectorAll('.pick-head').length, 1); // el rival no tiene plantel
  assert.equal(dlg.querySelectorAll('.pick-row').length, store.match(m.id).teamA.length);
  dlg.querySelector('.pick-row').click();
  assert.equal(scoreOf(store.match(m.id), 'B'), before + 1);
  assert.match(root.textContent, /Gol de Los Guapos FC/);
  [...toasts.querySelectorAll('button')].filter((b) => b.textContent === 'Deshacer').at(-1).click();
  assert.equal(scoreOf(store.match(m.id), 'B'), before);
  unsub();
});

test('armar equipos: sumar un invitado con nombre y "＋ A" / "＋ B", como en la app original', () => {
  const m = store.get().matches.find((x) => x.mode === 'interno' && !x.closed);
  const rerender = () => renderMatch(root, m.id);
  const unsub = store.subscribe(rerender);
  rerender();
  const form = () => root.querySelector('.teams-box .guest-add');
  assert.ok(form(), 'hay campo para sumar invitado');
  assert.equal(form().querySelector('input').getAttribute('placeholder'), 'Invitado (sin perfil)…');
  // Sin nombre: avisa y no crea nada.
  const before = store.get().players.length;
  form().querySelector('[aria-label^="Sumar invitado a Blanco"]').click();
  assert.match(root.querySelector('.teams-box .error').textContent, /Escribí el nombre del invitado/);
  assert.equal(store.get().players.length, before);
  // Con nombre, al equipo B.
  form().querySelector('input').value = 'Primo';
  form().querySelector('[aria-label^="Sumar invitado a Blanco"]').click();
  const g = store.get().players.at(-1);
  assert.deepEqual([g.name, g.guest], ['Primo', true]);
  assert.ok(store.match(m.id).teamB.includes(g.id));
  assert.match(toasts.textContent, /Invitado Primo sumado a Blanco/);
  // Aparece en el plantel de B con la marca "invitado", y en su fila ya marcado en B.
  const row = [...root.querySelectorAll('.teams-box .prow')].find((r) => r.textContent.includes('Primo'));
  assert.ok(row.querySelector('.pill'));
  assert.equal(row.querySelector('.seg-btn.side-B').getAttribute('aria-pressed'), 'true');
  // Enter en el campo lo suma al equipo A.
  form().querySelector('input').value = 'Vecino';
  form().dispatchEvent(new window.Event('submit', { cancelable: true }));
  const v = store.get().players.at(-1);
  assert.ok(store.match(m.id).teamA.includes(v.id));
  store.removePlayer(g.id);
  store.removePlayer(v.id);
  unsub();
});

test('jugador en listas: número de camiseta, nombre y apodo', async () => {
  const { playerName } = await import('../src/ui/playerName.js');
  const full = playerName({ name: 'Juan Pérez', nickname: 'Tuti', number: '10' });
  assert.equal(full.querySelector('.num').textContent, 'Camiseta 10'); // "Camiseta" solo para lector de pantalla
  assert.ok(full.querySelector('.num .sr-only'));
  assert.equal(full.querySelector('strong').textContent, 'Juan Pérez');
  assert.equal(full.querySelector('.nick').textContent, '«Tuti»');
  // Sin número ni apodo: solo el nombre. Apodo igual al nombre: no se repite.
  const plain = playerName({ name: 'Primo', nickname: '', number: '' });
  assert.equal(plain.querySelector('.num'), null);
  assert.equal(plain.querySelector('.nick'), null);
  assert.equal(playerName({ name: 'Tuti', nickname: 'Tuti' }).querySelector('.nick'), null);
  // Solo apodo: se muestra como nombre, sin repetirlo.
  const nick = playerName({ name: '', nickname: 'Tuti', number: '7' });
  assert.equal(nick.querySelector('strong').textContent, 'Tuti');
  assert.equal(nick.querySelector('.nick'), null);
});

test('número, nombre y apodo aparecen en partido, jugadores, ranking y podio', () => {
  const s = store.get();
  const tuti = s.players.find((p) => p.nickname === 'Tuti'); // Juan Pérez, camiseta 10
  const has = (scope) => [...scope.querySelectorAll('.pname')].some((e) => e.querySelector('.num')?.textContent.endsWith('10')
    && e.querySelector('strong').textContent === 'Juan Pérez' && e.querySelector('.nick')?.textContent === '«Tuti»');
  const m = s.matches.find((x) => x.mode === 'interno' && !x.closed && inMatch(x).includes(tuti.id));
  renderMatch(root, m.id);
  assert.ok(has(root.querySelector('.roster-box')), 'en el plantel del partido');
  assert.ok(has(root.querySelector('.teams-box')), 'en Armar equipos');
  renderPlayers(root);
  assert.ok(has(root), 'en Jugadores');
  renderRanking(root);
  const sel = root.querySelector('.cat-select select');
  sel.value = 'pj'; // todos jugaron: Tuti seguro aparece
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(has(root.querySelector('.rank-out')), 'en el ranking (podio o lista)');
  sel.value = 'goles';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
});

test('armar equipos: contra un rival el invitado solo puede ir a "Juega"', () => {
  const m = store.get().matches.find((x) => x.mode === 'rival' && !x.closed);
  renderMatch(root, m.id);
  const btns = [...root.querySelectorAll('.teams-box .guest-add button')].map((b) => b.textContent);
  assert.deepEqual(btns, ['＋ Juega']);
});

test('armar equipos: sin campo de invitado en un partido finalizado', () => {
  const closed = store.get().matches.find((x) => x.closed);
  renderMatch(root, closed.id);
  assert.equal(root.querySelector('.guest-add'), null);
});

test('gol en contra: sin botón en un partido finalizado', () => {
  const closed = store.get().matches.find((m) => m.closed);
  renderMatch(root, closed.id);
  assert.equal(ownBtn(), undefined);
});

test('gol en contra: sin jugadores en el partido, la hoja lo explica', () => {
  const empty = store.createMatch({ date: '2099-12-31' });
  renderMatch(root, empty.id);
  ownBtn().click();
  const dlg = document.querySelector('dialog.sheet');
  assert.match(dlg.textContent, /Primero armá los equipos/);
  dlg.querySelector('[aria-label="Cerrar"]').click();
  store.deleteMatch(empty.id);
});

test('editar un gol desde la lista: pasar de gol normal a gol en contra', () => {
  const open = store.get().matches.find((m) => m.mode === 'interno' && !m.closed);
  const rerender = () => renderMatch(root, open.id);
  const unsub = store.subscribe(rerender);
  rerender();
  const scorer = store.match(open.id).teamA[0];
  const ev = store.addGoal(open.id, 'A', scorer);
  assert.ok(ev);
  const idx = store.match(open.id).events.findIndex((e) => e.id === ev.id) + 1; // posición en la lista
  const editBtn = root.querySelector(`.ev-actions [aria-label="Editar el gol ${idx}"]`);
  assert.ok(editBtn, 'cada gol tiene su botón de editar');
  editBtn.click();
  const dlg = document.querySelector('dialog.sheet');
  assert.ok(dlg && dlg.hasAttribute('open'));
  const mode = [...dlg.querySelectorAll('.seg-btn')];
  assert.equal(mode[0].getAttribute('aria-pressed'), 'true');
  mode[1].click(); // "En contra": la lista pasa a los jugadores del otro equipo
  assert.equal(mode[1].getAttribute('aria-pressed'), 'true');
  const options = [...dlg.querySelectorAll('select option')].filter((o) => o.value);
  const teamB = store.match(open.id).teamB;
  assert.deepEqual(options.map((o) => o.value).sort(), [...teamB].sort());
  assert.match(dlg.textContent, /suma para/);
  // Guardar sin elegir jugador: avisa.
  [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Guardar').click();
  assert.match(dlg.querySelector('.error').textContent, /Elegí quién hizo el gol en contra/);
  // Elegir y guardar.
  dlg.querySelector('select').value = teamB[0];
  [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Guardar').click();
  const saved = store.match(open.id).events.find((e) => e.id === ev.id);
  assert.deepEqual([saved.ownGoal, saved.scorerId, saved.side], [true, teamB[0], 'A']);
  assert.equal(document.querySelector('dialog.sheet'), null);
  store.removeGoal(open.id, ev.id);
  unsub();
});

test('ficha, tabla y ranking incluyen los goles en contra', () => {
  const s = store.get();
  const withOwn = s.players.find((p) => s.matches.some((m) => m.events.some((e) => e.ownGoal && e.scorerId === p.id)));
  assert.ok(withOwn, 'el demo tiene al menos un jugador con gol en contra');
  openPlayerSheet(withOwn);
  const dlg = document.querySelector('dialog.sheet');
  const tile = [...dlg.querySelectorAll('.stat')].find((t) => t.querySelector('span').textContent === 'En contra');
  assert.ok(tile);
  assert.ok(Number(tile.querySelector('b').textContent) >= 1);
  dlg.querySelector('[aria-label="Cerrar"]').click();
  renderRanking(root);
  const headers = [...root.querySelectorAll('.table thead abbr')].map((a) => a.textContent);
  assert.ok(headers.includes('EC'));
  const options = [...root.querySelectorAll('.cat-select option')].map((o) => o.textContent);
  assert.ok(options.some((t) => /Goles en contra/.test(t)));
});

test('partido finalizado: sin botones de carga y con comentarios', () => {
  const closed = store.get().matches.find((m) => m.closed);
  renderMatch(root, closed.id);
  assert.equal(root.querySelectorAll('.act').length, 0);
  assert.match(text(), /bloqueados/);
  assert.ok(root.querySelector('.comment-form'));
});

test('ranking: podio, categorías y buscador', () => {
  renderRanking(root);
  assert.ok(root.querySelectorAll('.podium .step').length >= 1);
  // Celular: desplegable con todas las categorías (sin scroll horizontal).
  const sel = root.querySelector('.cat-select select');
  assert.ok(sel && sel.options.length >= 10);
  // Escritorio: los mismos valores como botones.
  const chips = [...root.querySelectorAll('.chip-btn')];
  assert.equal(chips.length, sel.options.length);
  assert.equal(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length, 1);
  sel.value = 'asist';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(root.querySelector('.cat-select select').value, 'asist');
  assert.equal([...root.querySelectorAll('.chip-btn')].find((c) => c.getAttribute('aria-pressed') === 'true').textContent, 'Asistencias');
  type(root.querySelector('.search input'), 'zzzz');
  assert.match(text(), /no está en este ranking/);
  assert.equal(root.querySelectorAll('.podium').length, 0);
  type(root.querySelector('.search input'), '');
  assert.ok(root.querySelector('.podium'));
});

const row = (id, name, value, pos) => ({ player: { id, name, nickname: name }, value, pos });
const arches = (ol) => [...ol.querySelectorAll('.step')].map((s) => s.querySelector('.arch'));

test('podio: 2.º a la izquierda, 1.º al centro y más alto, 3.º a la derecha, con su número', async () => {
  const { podium } = await import('../src/ui/podium.js');
  const ol = podium([row('a', 'Ana', 9, 1), row('b', 'Beto', 7, 2), row('c', 'Cami', 5, 3), row('d', 'Dani', 1, 4)],
    { cat: 'goles', label: 'Goles', onOpen() {} });
  const steps = [...ol.querySelectorAll('.step')];
  assert.equal(steps.length, 3); // el 4.º va a la lista, no al podio
  assert.deepEqual(steps.map((s) => s.querySelector('strong').textContent), ['Beto', 'Ana', 'Cami']);
  assert.deepEqual(steps.map((s) => s.querySelector('.pod-num b').textContent), ['2°', '1°', '3°']);
  assert.ok(steps[1].classList.contains('place-center'));          // la del medio es la grande
  assert.ok(steps[0].classList.contains('place-side') && steps[2].classList.contains('place-side'));
  assert.deepEqual(steps.map((s) => ['pos1', 'pos2', 'pos3'].find((c) => s.classList.contains(c))), ['pos2', 'pos1', 'pos3']);
  assert.equal(ol.querySelector('.pod-num small'), null); // sin empates no hay aviso
  assert.match(ol.getAttribute('aria-label'), /Podio de Goles/);
});

test('podio: con empates repite el número y lo avisa, sin medallas repetidas', async () => {
  const { podium } = await import('../src/ui/podium.js');
  // Como en tu captura: Nacho 4 (1.º) y tres con 3 (empatados en el 2.º puesto).
  const ol = podium([row('n', 'Nacho', 4, 1), row('g', 'Gonza', 3, 2), row('m', 'Maxi', 3, 2), row('t', 'Tomi', 3, 2)],
    { cat: 'goles', label: 'Goles', onOpen() {} });
  const steps = [...ol.querySelectorAll('.step')];
  assert.deepEqual(steps.map((s) => s.querySelector('strong').textContent), ['Gonza', 'Nacho', 'Maxi']);
  assert.deepEqual(steps.map((s) => s.querySelector('.pod-num b').textContent), ['2°', '1°', '2°']);
  assert.deepEqual(steps.map((s) => !!s.querySelector('.pod-num small')), [true, false, true]); // "empate" solo en los empatados
  assert.equal(ol.querySelector('.pod-num small').textContent, 'empate');
  assert.ok(steps[1].classList.contains('place-center')); // el 1.º sigue siendo el grande
  assert.doesNotMatch(ol.textContent, /[🥇🥈🥉]/u);
});

test('podio: dos empatados en el 1.º tienen el mismo tamaño (tu captura de Pablo y Gonza)', async () => {
  const { podium } = await import('../src/ui/podium.js');
  const ol = podium([row('g', 'Gonza', 1, 1), row('p', 'Pablo', 1, 1)], { cat: 'hachazos', label: 'Hachazos', onOpen() {} });
  const steps = [...ol.querySelectorAll('.step')];
  assert.deepEqual(steps.map((s) => s.querySelector('strong').textContent), ['Gonza', 'Pablo']);
  assert.ok(steps.every((s) => s.classList.contains('place-center')), 'las dos grandes');
  assert.deepEqual(steps.map((s) => s.querySelector('.pod-num b').textContent), ['1°', '1°']);
  assert.ok(steps.every((s) => s.querySelector('.pod-num small')?.textContent === 'empate'));
  // Con tres y dos empatados arriba: los dos 1.º grandes, el 3.º chico.
  const tres = podium([row('a', 'A', 5, 1), row('b', 'B', 5, 1), row('c', 'C', 2, 3)], { cat: 'goles', label: 'Goles', onOpen() {} });
  assert.deepEqual([...tres.querySelectorAll('.step')].map((s) => s.classList.contains('place-center')), [true, true, false]);
});

test('podio: muestra el promedio por partido, igual que la lista', () => {
  renderRanking(root);
  const sel = root.querySelector('.cat-select select');
  const pick = (v) => { sel.value = v; sel.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const avgs = () => [...root.querySelectorAll('.podium .pod-avg')].map((e) => e.textContent);
  for (const cat of ['goles', 'asist', 'ga']) {
    pick(cat);
    const steps = root.querySelectorAll('.podium .step').length;
    assert.ok(steps > 0);
    assert.equal(avgs().length, steps, `${cat}: un promedio por tarjeta`);
    assert.ok(avgs().every((t) => /^\(\d+,\d{2}\/pj\)$/.test(t)), `${cat}: ${avgs()}`);
  }
  // Cuadra con el cálculo: valor / partidos jugados.
  pick('goles');
  const s = store.get();
  const st = computeStats(s.players, s.matches);
  const first = rankBy(st, s.players, 'goles')[0];
  const center = root.querySelector('.podium .place-center .pod-avg').textContent;
  assert.equal(center, `(${(first.value / st[first.player.id].pj).toFixed(2).replace('.', ',')}/pj)`);
  // En categorías sin promedio (figuras, muro...) no aparece, como en la lista.
  pick('mvp');
  assert.equal(avgs().length, 0);
  pick('goles');
});

test('podio: con menos de 3 jugadores no deja huecos raros', async () => {
  const { podium } = await import('../src/ui/podium.js');
  // Con dos: el 1.º a la izquierda (y más grande), el 2.º a la derecha.
  const dos = podium([row('a', 'Ana', 3, 1), row('b', 'Beto', 2, 2)], { cat: 'goles', label: 'Goles', onOpen() {} });
  assert.deepEqual([...dos.querySelectorAll('.step strong')].map((e) => e.textContent), ['Ana', 'Beto']);
  assert.deepEqual([...dos.querySelectorAll('.step')].map((s) => s.classList.contains('place-center')), [true, false]);
  const uno = podium([row('a', 'Ana', 3, 1)], { cat: 'goles', label: 'Goles', onOpen() {} });
  assert.equal(uno.querySelectorAll('.step').length, 1);
  assert.equal(podium([], { cat: 'goles', label: 'Goles', onOpen() {} }), null);
});

test('podio: emblema del premio (un solo ícono) y corona de laurel en cada tarjeta, sin arco de íconos', async () => {
  const { podium, AWARD_ICONS, LEAVES_PER_BRANCH } = await import('../src/ui/podium.js');
  const items = [row('a', 'Ana', 9, 1), row('b', 'Beto', 7, 2), row('c', 'Cami', 5, 3)];
  const esperado = { goles: '⚽', asist: '🤝', mvp: '👑', gk: '🧤', golazos: '🔥', muros: '🧱', hachazos: '🪓', polemicas: '📣', golesContra: '🙈', v: '🏆', d: '🌩️' };
  for (const [cat, icon] of Object.entries(esperado)) {
    const ol = podium(items, { cat, label: cat, onOpen() {} });
    assert.equal(ol.querySelector('.arch'), null, 'ya no hay arco de íconos');
    const steps = [...ol.querySelectorAll('.step')];
    assert.equal(steps.length, 3);
    for (const s of steps) {
      assert.equal(s.querySelectorAll('.emblem').length, 1, `${cat}: un solo emblema por tarjeta`);
      assert.equal(s.querySelector('.emblem').textContent, icon, `${cat} usa ${icon}`);
      assert.equal(s.querySelector('.emblem').getAttribute('aria-hidden'), 'true'); // decorativo
      const w = s.querySelector('.pod-avatar .wreath');
      assert.ok(w, `${cat}: tiene corona de laurel alrededor del avatar`);
      assert.equal(w.getAttribute('aria-hidden'), 'true');
      assert.equal(w.querySelectorAll('.leaf').length, LEAVES_PER_BRANCH * 2);
    }
  }
  // Goles + asistencias muestra los dos íconos en el mismo emblema.
  const ga = podium(items, { cat: 'ga', label: 'G+A', onOpen() {} });
  assert.equal(ga.querySelector('.emblem').textContent, '⚽🤝');
  // Todas las categorías del ranking tienen su emblema.
  for (const cat of Object.keys(RANK_CATS)) assert.ok(AWARD_ICONS[cat], `falta emblema para ${cat}`);
});

test('podio: el laurel es simétrico, abierto arriba y las hojas quedan dentro del dibujo', async () => {
  const { wreath } = await import('../src/ui/podium.js');
  const leaves = [...wreath().querySelectorAll('.leaf')];
  const left = leaves.filter((l) => Number(l.getAttribute('cx')) < 50);
  const right = leaves.filter((l) => Number(l.getAttribute('cx')) > 50);
  assert.equal(left.length, right.length); // una rama a cada lado
  // Espejo: por cada hoja de la izquierda hay una a la derecha a la misma altura.
  const ys = (arr) => arr.map((l) => l.getAttribute('cy')).sort();
  assert.deepEqual(ys(left), ys(right));
  // Abierto arriba: ninguna hoja cerca de la parte superior central.
  assert.ok(leaves.every((l) => !(Number(l.getAttribute('cy')) < 22 && Math.abs(Number(l.getAttribute('cx')) - 50) < 12)));
  // Todas dentro del lienzo de 100x100.
  assert.ok(leaves.every((l) => Number(l.getAttribute('cx')) > 0 && Number(l.getAttribute('cx')) < 100
    && Number(l.getAttribute('cy')) > 0 && Number(l.getAttribute('cy')) < 100));
});

test('ranking: el podio de la pantalla usa el componente nuevo y la lista usa números', () => {
  renderRanking(root);
  const sel = root.querySelector('.cat-select select');
  sel.value = 'goles';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(root.querySelector('.podium .wreath'));
  assert.equal(root.querySelector('.podium .arch'), null);
  assert.ok(root.querySelector('.podium .place-center'));
  const nums = [...root.querySelectorAll('.rank-list .rpos')].map((e) => e.textContent);
  assert.ok(nums.every((t) => /^\d+°$/.test(t)), `posiciones con número: ${nums}`); // sin medallas mezcladas
  // Cambia el arco según la categoría elegida.
  sel.value = 'mvp';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok([...root.querySelectorAll('.podium .emblem')].every((t) => t.textContent === '👑'));
  sel.value = 'goles';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
});

test('jugadores: el plantel por un lado y los invitados aparte, como el original', () => {
  const m = store.get().matches.find((x) => x.mode === 'interno' && !x.closed);
  const g1 = store.addGuest(m.id, 'Primo Invitado', 'A');
  const g2 = store.addGuest(m.id, 'Vecino Invitado', 'B');
  renderPlayers(root);
  const heading = root.querySelector('.list-heading');
  const roster = store.get().players.filter((p) => !p.guest).length;
  assert.equal(heading.textContent, `Plantel (${roster})`);
  const guestsFold = root.querySelector('details.fold.guests');
  assert.ok(guestsFold, 'hay sección de invitados');
  assert.match(guestsFold.querySelector('summary').textContent, /Invitados\s*2/);
  assert.equal(guestsFold.open, false); // plegada por defecto
  const inGuests = [...guestsFold.querySelectorAll('.pcard strong')].map((e) => e.textContent).sort();
  assert.deepEqual(inGuests, ['Primo Invitado', 'Vecino Invitado']);
  // Fuera de la sección de invitados no aparece ninguno (ni en "Sin posición").
  const outside = [...root.querySelectorAll('details.fold:not(.guests) .pcard strong')].map((e) => e.textContent);
  assert.ok(!outside.includes('Primo Invitado') && !outside.includes('Vecino Invitado'));
  assert.ok([...guestsFold.querySelectorAll('.pcard')].every((c) => c.querySelector('.guest-pill')?.textContent === 'invitado'));
  // Al buscar un invitado, la sección se abre sola.
  type(root.querySelector('.search input'), 'primo');
  assert.equal(root.querySelector('details.fold.guests').open, true);
  type(root.querySelector('.search input'), '');
  // La marca "invitado" también aparece en Armar equipos y en la tabla del ranking.
  renderMatch(root, m.id);
  assert.ok([...root.querySelectorAll('.teams-box .prow')].some((r) => r.textContent.includes('Primo Invitado') && r.querySelector('.guest-pill')));
  renderRanking(root);
  const table = root.querySelector('.table');
  assert.ok([...table.querySelectorAll('tbody th')].some((th) => th.textContent.includes('Primo Invitado') && th.querySelector('.guest-pill')));
  store.removePlayer(g1.id);
  store.removePlayer(g2.id);
});

test('jugadores: grupos por posición y búsqueda', () => {
  renderPlayers(root);
  assert.equal(root.querySelectorAll('.pcard').length, 12);
  type(root.querySelector('.search input'), 'arq');
  const names = [...root.querySelectorAll('.pcard strong')].map((e) => e.textContent);
  type(root.querySelector('.search input'), 'DIAZ'); // sin acento ni mayúsculas
  const names2 = [...root.querySelectorAll('.pcard strong')].map((e) => e.textContent);
  type(root.querySelector('.search input'), 'tuti'); // el apodo sigue sirviendo para buscar
  const names3 = [...root.querySelectorAll('.pcard strong')].map((e) => e.textContent);
  type(root.querySelector('.search input'), ''); // limpiar antes de comprobar, para no afectar otros tests
  assert.deepEqual(names, ['Nacho Ruiz']); // se muestra el nombre, no el apodo
  assert.deepEqual(names2, ['Bruno Díaz']);
  assert.deepEqual(names3, ['Juan Pérez']);
});

test('ficha del jugador abre una hoja con estadísticas e historial', () => {
  const p = store.get().players[0];
  openPlayerSheet(p);
  const dlg = document.querySelector('dialog.sheet');
  assert.ok(dlg && dlg.hasAttribute('open'));
  assert.ok(dlg.querySelectorAll('.stat').length >= 9);
  assert.ok(dlg.querySelector('.history'));
  dlg.querySelector('[aria-label="Cerrar"]').click();
  assert.equal(document.querySelector('dialog.sheet'), null);
});

test('seguridad: un nombre con HTML se muestra como texto, no se ejecuta', () => {
  const evil = store.addPlayer({ name: '<img src=x onerror=alert(1)>', nickname: '<b>x</b>' });
  renderPlayers(root);
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('.pcard b'), null);
  assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>')); // el nombre, como texto
  // Un invitado con HTML en el nombre tampoco se ejecuta (en Armar equipos).
  const m = store.get().matches.find((x) => !x.closed);
  const g = store.addGuest(m.id, '<b>invitado</b>', 'A');
  renderMatch(root, m.id);
  assert.equal(root.querySelector('.teams-box b'), null);
  assert.ok(root.textContent.includes('<b>invitado</b>'));
  store.removePlayer(g.id);
  store.removePlayer(evil.id);
});

test('editor de cara: abre con la cara actual, cambia la vista previa y guarda', async () => {
  const { openEditPlayer } = await import('../src/views/playerSheet.js');
  const { resolveFace } = await import('../src/pmAvatar.js');
  const p = store.get().players[1];
  openEditPlayer(p);
  const dlg = document.querySelector('dialog.sheet');
  const pressed = (label) => dlg.querySelector(`[role="group"][aria-label="${label}"] [aria-pressed="true"]`);
  assert.ok(dlg.querySelector('.face-preview svg.pixel-avatar'));
  assert.equal(dlg.querySelectorAll('.face-preview svg').length, 2); // cuerpo + carnet
  assert.equal(dlg.querySelectorAll('details.face-group').length, 4); // Rostro, Pelo y piel, Cabeza, Camiseta
  // Arranca marcando la cara que el jugador ya tiene.
  const cur = resolveFace(p.id, p.face);
  assert.equal(pressed('Corte').textContent, ['Corto', 'Medio', 'Largo', 'Pelado', 'Rulos', 'Cresta', 'Colita'][cur.style]);
  // Elegir "Gorra" y "Barba completa" cambia la vista previa.
  const before = dlg.querySelector('.face-preview').innerHTML;
  [...dlg.querySelectorAll('[aria-label="Cabeza"] .face-pill')].find((b) => b.textContent === 'Gorra').click();
  [...dlg.querySelectorAll('[aria-label="Barba"] .face-pill')].find((b) => b.textContent === 'Completa').click();
  assert.notEqual(dlg.querySelector('.face-preview').innerHTML, before);
  assert.equal(pressed('Cabeza').textContent, 'Gorra');
  // Posición: tocar DC la agrega.
  dlg.querySelector('.pos-picker [aria-label^="DC,"]').click();
  dlg.querySelector('form.player-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  const saved = store.get().players.find((x) => x.id === p.id);
  assert.equal(saved.face.hat, 1);
  assert.equal(saved.face.facial, 4);
  assert.ok(saved.positions.includes('DC'));
  assert.equal(document.querySelector('dialog.sheet'), null);
});

test('alta de jugador con cara elegida', async () => {
  const { openAddPlayer } = await import('../src/views/playerSheet.js');
  openAddPlayer();
  const dlg = document.querySelector('dialog.sheet');
  dlg.querySelector('form input[type="text"]').value = 'Nuevo Crack';
  [...dlg.querySelectorAll('[aria-label="Corte"] .face-pill')].find((b) => b.textContent === 'Cresta').click();
  dlg.querySelector('[aria-label="Piel"] [aria-label="Morena"]').click();
  dlg.querySelector('form.player-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  const p = store.get().players.find((x) => x.name === 'Nuevo Crack');
  assert.ok(p);
  assert.equal(p.face.style, 5);
  assert.equal(p.face.skin, 5);
  store.removePlayer(p.id);
});

test('escudo y canchita del original', async () => {
  const { crestPM, pitchBackground } = await import('../src/brand.js');
  const c = crestPM(40);
  assert.equal(c.getAttribute('aria-label'), 'Escudo Piel Morena FC');
  assert.ok(c.querySelector('clipPath'));
  const bg = pitchBackground();
  assert.equal(bg.id, 'pitch-bg');
  assert.equal(bg.getAttribute('aria-hidden'), 'true');
});

test('un solo aspecto: siempre Cancha arcade (pixel), sin selector de modo', () => {
  assert.equal(document.documentElement.dataset.theme, 'pixel');
  assert.equal(localStorage.getItem('pm2_theme'), null); // se borra la preferencia vieja
  renderPlayers(root);
  assert.equal(root.querySelectorAll('svg.avatar').length, 12);
});

test('el buscador coincide con la lógica de dominio para cada jugador', () => {
  const s = store.get();
  renderPlayers(root);
  for (const q of ['10', 'del', 'luna', 'mc']) {
    type(root.querySelector('.search input'), q);
    assert.equal(root.querySelectorAll('.pcard').length, s.players.filter((p) => playerMatches(p, q)).length, q);
  }
});
