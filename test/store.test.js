import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
};
const { store } = await import('../src/store.js');
const { scoreOf, computeStats, escTotal, sideOf, realGoals } = await import('../src/domain/domain.js');

const mk = (name) => store.addPlayer({ name });

test('goles, asistencias (nunca más que goles) y deshacer', () => {
  const [a, b, c] = [mk('Ana'), mk('Beto'), mk('Carlos')];
  const m = store.createMatch({ date: '2099-01-01' });
  store.setTeamSide(m.id, a.id, 'A');
  store.setTeamSide(m.id, b.id, 'A');
  store.setTeamSide(m.id, c.id, 'B');

  assert.equal(store.addGoal(m.id, 'A', c.id), null); // c es del otro equipo
  assert.equal(store.addAssist(m.id, b.id), false);   // todavía no hay goles
  const g1 = store.addGoal(m.id, 'A', a.id);
  assert.ok(g1);
  assert.equal(store.addAssist(m.id, b.id), true);
  assert.equal(store.addAssist(m.id, b.id), false);   // 1 gol => máximo 1 asistencia
  // Al deshacer el gol, la asistencia se recorta sola.
  assert.equal(store.removeGoal(m.id, g1.id), true);
  assert.equal(scoreOf(store.match(m.id), 'A'), 0);
  assert.equal(store.match(m.id).assists[b.id] ?? 0, 0);
});

test('partido finalizado: solo comentarios; reabrir lo habilita', () => {
  const p = mk('Dani');
  const m = store.createMatch({ date: '2099-01-02' });
  store.setTeamSide(m.id, p.id, 'A');
  assert.ok(store.addGoal(m.id, 'A', p.id));
  store.closeMatch(m.id);
  assert.equal(store.addGoal(m.id, 'A', p.id), null);
  assert.equal(store.setAward(m.id, 'mvp', p.id), false);
  assert.equal(store.setEscabioTotal(m.id, 5), false);
  assert.equal(store.adjustEscabioTotal(m.id, 1), false);
  assert.equal(store.addComment(m.id, 'Dani', 'Bien ahí'), true);
  store.reopenMatch(m.id);
  assert.ok(store.addGoal(m.id, 'A', p.id));
});

test('partido contra rival: los goles del rival no llevan jugador', () => {
  const m = store.createMatch({ date: '2099-01-03', mode: 'rival', rivalName: 'Los Tigres' });
  assert.equal(m.rivalName, 'Los Tigres');
  const ev = store.addGoal(m.id, 'B', 'cualquiera');
  assert.ok(ev);
  assert.equal(ev.scorerId, null);
});

test('premios solo para quienes jugaron, y se limpian al borrar un jugador', () => {
  const p = mk('Eli');
  const out = mk('Fran');
  const m = store.createMatch({ date: '2099-01-04' });
  store.setTeamSide(m.id, p.id, 'B');
  assert.equal(store.setAward(m.id, 'mvp', out.id), false);
  assert.equal(store.setAward(m.id, 'mvp', p.id), true);
  store.removePlayer(p.id);
  const after = store.match(m.id);
  assert.equal(after.mvpId, null);
  assert.deepEqual(after.teamB, []);
});

test('escabio: un total por partido, con límites, y bloqueado al finalizar', () => {
  const m = store.createMatch({ date: '2099-02-01' });
  assert.equal(escTotal(store.match(m.id)), 0);
  assert.equal(store.setEscabioTotal(m.id, 12), true);
  assert.equal(escTotal(store.match(m.id)), 12);
  assert.equal(store.adjustEscabioTotal(m.id, -5), true);
  assert.equal(escTotal(store.match(m.id)), 7);
  store.adjustEscabioTotal(m.id, -99);
  assert.equal(escTotal(store.match(m.id)), 0); // nunca negativo
  store.setEscabioTotal(m.id, 'abc');
  assert.equal(escTotal(store.match(m.id)), 0); // texto inválido => 0
  store.setEscabioTotal(m.id, 5000);
  assert.equal(escTotal(store.match(m.id)), 999); // tope
  store.setEscabioTotal(m.id, 8.9);
  assert.equal(escTotal(store.match(m.id)), 8); // entero
  store.closeMatch(m.id);
  assert.equal(store.setEscabioTotal(m.id, 1), false);
  assert.equal(escTotal(store.match(m.id)), 8);
});

test('cierre automático al día siguiente de la fecha', () => {
  const m = store.createMatch({ date: '2026-03-10' });
  assert.equal(store.match(m.id).closed, false);
  store.autoCloseOld('2026-03-10');
  assert.equal(store.match(m.id).closed, false); // el mismo día sigue abierto
  store.autoCloseOld('2026-03-11');
  assert.equal(store.match(m.id).closed, true);
});

test('importar rechaza datos inválidos y no pisa lo existente', () => {
  const before = store.exportJson();
  assert.equal(store.importJson('no es json'), false);
  assert.equal(store.importJson('{"players":1,"matches":[]}'), false);
  assert.equal(store.importJson('{"players":[{"id":1}],"matches":[]}'), false);
  assert.equal(store.exportJson(), before);
  assert.equal(store.importJson(before), true);
});

test('datos de ejemplo: solo con la app vacía y estadísticas coherentes', () => {
  assert.equal(store.loadDemo(), false); // ya hay datos de los tests anteriores
  assert.equal(store.importJson('{"players":[],"matches":[]}'), true);
  assert.equal(store.loadDemo(), true);
  const s = store.get();
  assert.equal(s.players.length, 12);
  assert.equal(s.matches.length, 9);
  assert.equal(s.matches.filter((m) => !m.closed).length, 2); // los de hoy quedan abiertos
  const st = computeStats(s.players, s.matches);
  const totalGoals = Object.values(st).reduce((n, x) => n + x.goles, 0);
  const eventGoals = s.matches.reduce((n, m) => n + m.events.filter((e) => e.scorerId && !e.ownGoal).length, 0);
  assert.equal(totalGoals, eventGoals); // los goles con jugador suman a sus goleadores
  // Los goles en contra no son goles del jugador, pero sí cuentan en su estadística propia.
  const totalContra = Object.values(st).reduce((n, x) => n + x.golesContra, 0);
  assert.equal(totalContra, s.matches.reduce((n, m) => n + m.events.filter((e) => e.ownGoal).length, 0));
  assert.ok(totalContra > 0, 'el demo incluye goles en contra');
  // Cada gol en contra lo hizo alguien del equipo contrario al que suma.
  for (const m of s.matches) {
    for (const e of m.events.filter((x) => x.ownGoal)) {
      assert.equal(sideOf(m, e.scorerId), e.side === 'A' ? 'B' : 'A');
    }
  }
  // Los goles del rival no suman a nadie, pero cuentan en el marcador.
  const rival = s.matches.filter((m) => m.mode === 'rival');
  assert.equal(rival.length, 2);
  assert.ok(rival.every((m) => m.events.some((e) => e.side === 'B' && !e.scorerId)));
  assert.ok(rival.some((m) => !m.closed)); // uno abierto para cargar en vivo
});

test('cara del jugador: se guarda validada y se puede editar', () => {
  const p = store.addPlayer({ name: 'Con cara', face: { skin: 3, hair: 2, style: 4, hat: 99, evil: '<x>', eyes: 1.5 } });
  assert.deepEqual(p.face, { skin: 3, hair: 2, style: 4 }); // descarta fuera de rango, decimales y claves raras
  store.updatePlayer(p.id, { face: { skin: 0, jersey: 5 } });
  assert.deepEqual(store.get().players.find((x) => x.id === p.id).face, { skin: 0, jersey: 5 });
  store.updatePlayer(p.id, { face: { nada: 1 } }); // cara inválida: no se pisa la existente
  assert.deepEqual(store.get().players.find((x) => x.id === p.id).face, { skin: 0, jersey: 5 });
  const q = store.addPlayer({ name: 'Sin cara' });
  assert.equal(q.face, undefined);
});

test('posiciones: solo códigos del original, sin repetir', () => {
  const p = store.addPlayer({ name: 'Pos', positions: ['MC', 'MC', 'XX', 3, 'PO'] });
  assert.deepEqual(p.positions, ['MC', 'PO']);
  const old = store.addPlayer({ name: 'Viejo' });
  store.get().players.find((x) => x.id === old.id).position = 'Arquero';
  store.updatePlayer(old.id, { positions: ['DC'] });
  const after = store.get().players.find((x) => x.id === old.id);
  assert.deepEqual(after.positions, ['DC']);
  assert.equal(after.position, undefined); // se reemplaza el campo viejo
});

test('empezar de cero permite volver a cargar los datos de ejemplo', () => {
  assert.equal(store.loadDemo(), false); // hay datos
  store.clearAll();
  assert.equal(store.get().players.length + store.get().matches.length, 0);
  assert.equal(store.loadDemo(), true);
  assert.equal(store.get().matches.length, 9);
});

test('gol en contra: suma para el otro equipo, sin asistencias y con deshacer', () => {
  const [a, b, c] = [mk('Ana'), mk('Beto'), mk('Carla')];
  const m = store.createMatch({ date: '2099-03-01' });
  store.setTeamSide(m.id, a.id, 'A');
  store.setTeamSide(m.id, b.id, 'A');
  store.setTeamSide(m.id, c.id, 'B');

  const own = store.addOwnGoal(m.id, a.id);        // Ana (A) se la mete en contra
  assert.deepEqual([own.side, own.scorerId, own.ownGoal], ['B', a.id, true]);
  assert.equal(scoreOf(store.match(m.id), 'B'), 1);
  assert.equal(scoreOf(store.match(m.id), 'A'), 0);
  assert.equal(computeStats(store.get().players, [store.match(m.id)])[a.id].golesContra, 1);
  assert.equal(computeStats(store.get().players, [store.match(m.id)])[a.id].goles, 0);

  // Un gol en contra no admite asistencia: Carla (B) no puede "asistirlo".
  assert.equal(store.addAssist(m.id, c.id), false);
  assert.equal(realGoals(store.match(m.id), 'B'), 0);
  // Quien no está en el partido no puede hacer un gol en contra.
  assert.equal(store.addOwnGoal(m.id, mk('Afuera').id), null);
  // Deshacer.
  assert.equal(store.removeGoal(m.id, own.id), true);
  assert.equal(scoreOf(store.match(m.id), 'B'), 0);
  // Partido finalizado: bloqueado.
  store.closeMatch(m.id);
  assert.equal(store.addOwnGoal(m.id, a.id), null);
});

test('gol en contra en partido contra rival: suma para el rival', () => {
  const p = mk('Delfi');
  const m = store.createMatch({ date: '2099-03-02', mode: 'rival', rivalName: 'Los Tigres' });
  store.setTeamSide(m.id, p.id, 'A');
  const own = store.addOwnGoal(m.id, p.id);
  assert.equal(own.side, 'B');                       // suma para Los Tigres
  assert.equal(scoreOf(store.match(m.id), 'B'), 1);
  assert.equal(scoreOf(store.match(m.id), 'A'), 0);
});

test('editar un gol: cambiar de goleador, pasarlo a en contra y respetar las asistencias', () => {
  const [a, b, c, d] = [mk('Uno'), mk('Dos'), mk('Tres'), mk('Cuatro')];
  const m = store.createMatch({ date: '2099-03-03' });
  [[a, 'A'], [b, 'A'], [c, 'B'], [d, 'B']].forEach(([p, s]) => store.setTeamSide(m.id, p.id, s));
  const g = store.addGoal(m.id, 'A', a.id);

  assert.equal(store.updateGoal(m.id, g.id, { scorerId: b.id }), 'ok');          // lo hizo Dos
  assert.equal(store.match(m.id).events[0].scorerId, b.id);
  assert.equal(store.updateGoal(m.id, g.id, { scorerId: c.id }), 'invalid');     // Tres es del otro equipo
  assert.equal(store.updateGoal(m.id, g.id, { scorerId: '' }), 'invalid');       // un gol normal necesita jugador

  // Pasarlo a "en contra": ahora lo hizo alguien de B (suma para A) y deja de ser gol de Dos.
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: true, scorerId: c.id }), 'ok');
  const ev = store.match(m.id).events[0];
  assert.deepEqual([ev.side, ev.scorerId, ev.ownGoal], ['A', c.id, true]);
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: true, scorerId: a.id }), 'invalid'); // en contra: del otro equipo

  // Volver a gol normal borra la marca.
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: false, scorerId: a.id }), 'ok');
  assert.equal(store.match(m.id).events[0].ownGoal, undefined);

  // Con una asistencia apoyada en ese gol, no se puede convertir en gol en contra.
  assert.equal(store.addAssist(m.id, b.id), true);
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: true, scorerId: c.id }), 'assists');
  const kept = store.match(m.id).events[0];
  assert.deepEqual([kept.side, kept.scorerId, kept.ownGoal], ['A', a.id, undefined]); // quedó como estaba
});

test('gol del rival en partido contra rival se puede editar a gol en contra de uno nuestro', () => {
  const p = mk('Emi');
  const m = store.createMatch({ date: '2099-03-04', mode: 'rival', rivalName: 'Rivales' });
  store.setTeamSide(m.id, p.id, 'A');
  const g = store.addGoal(m.id, 'B', null);          // gol del rival
  assert.equal(store.updateGoal(m.id, g.id, { scorerId: null }), 'ok'); // sigue sin jugador
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: true, scorerId: p.id }), 'ok');
  assert.equal(store.match(m.id).events[0].ownGoal, true);
  assert.equal(store.updateGoal(m.id, g.id, { ownGoal: false, scorerId: null }), 'ok');
  assert.equal(store.match(m.id).events[0].ownGoal, undefined);
});

test('borrar un jugador deja su gol en contra en el marcador, sin nombre', () => {
  const [a, b] = [mk('Fer'), mk('Gabi')];
  const m = store.createMatch({ date: '2099-03-05' });
  store.setTeamSide(m.id, a.id, 'A');
  store.setTeamSide(m.id, b.id, 'B');
  store.addOwnGoal(m.id, a.id);
  store.removePlayer(a.id);
  const after = store.match(m.id);
  assert.equal(scoreOf(after, 'B'), 1);                        // el marcador no cambia
  assert.deepEqual([after.events[0].scorerId, after.events[0].ownGoal], [null, true]);
});

test('recortar asistencias al borrar un gol: los goles en contra no cuentan como goles propios', () => {
  const [a, b, c] = [mk('H1'), mk('H2'), mk('H3')];
  const m = store.createMatch({ date: '2099-03-06' });
  store.setTeamSide(m.id, a.id, 'A');
  store.setTeamSide(m.id, b.id, 'A');
  store.setTeamSide(m.id, c.id, 'B');
  const real = store.addGoal(m.id, 'A', a.id);
  store.addOwnGoal(m.id, c.id);                      // otro gol para A, pero en contra
  assert.equal(store.addAssist(m.id, b.id), true);   // 1 gol real => 1 asistencia
  assert.equal(store.addAssist(m.id, b.id), false);  // el gol en contra no habilita otra
  store.removeGoal(m.id, real.id);                   // sin gol real, la asistencia se recorta sola
  assert.equal(store.match(m.id).assists[b.id] ?? 0, 0);
});

test('invitado: se crea como jugador invitado con cara y queda en el equipo elegido', () => {
  const m = store.createMatch({ date: '2099-04-01' });
  const before = store.get().players.length;
  const g = store.addGuest(m.id, '  Primo de Tuti  ', 'B');
  assert.ok(g);
  assert.equal(g.name, 'Primo de Tuti');
  assert.equal(g.guest, true);
  assert.ok(g.face && Number.isInteger(g.face.skin)); // cara al azar, como el original
  assert.equal(store.get().players.length, before + 1);
  assert.deepEqual(store.match(m.id).teamB, [g.id]);
  assert.ok(store.addGoal(m.id, 'B', g.id)); // ya puede hacer goles
  // Validaciones
  assert.equal(store.addGuest(m.id, '   ', 'A'), null);       // sin nombre
  assert.equal(store.addGuest(m.id, 'X', 'C'), null);         // equipo inválido
  const r = store.createMatch({ date: '2099-04-02', mode: 'rival', rivalName: 'Otros' });
  assert.equal(store.addGuest(r.id, 'X', 'B'), null);         // el rival no tiene plantel
  assert.ok(store.addGuest(r.id, 'Amigo', 'A'));
  store.closeMatch(m.id);
  assert.equal(store.addGuest(m.id, 'Tarde', 'A'), null);     // partido finalizado
});
