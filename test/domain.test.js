import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats, rankBy, scoreOf, resultFor, groupOfPlayer, playerPositions, monthLabel, monthKey, todayStr, assistQty,
  escTotal, escabioSeries, escabioSummary, RANK_CATS, displayName,
} from '../src/domain/domain.js';
import { playerMatches, filterPlayers, norm } from '../src/search.js';

const players = [
  { id: 'p1', name: 'Juan Pérez', nickname: 'Tuti', number: '10', positions: ['MCO'] },
  { id: 'p2', name: 'Nacho Ruiz', nickname: 'Nacho', number: '1', positions: ['PO'] },
  { id: 'p3', name: 'Bruno Díaz', nickname: 'Bruno', number: '4', positions: ['DFC'] },
  { id: 'p4', name: 'Santi Vera', nickname: 'Santi', number: '9', positions: ['DC'] },
];

const m1 = {
  id: 'm1', date: '2026-09-01', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'],
  events: [
    { id: 'e1', side: 'A', scorerId: 'p1' }, { id: 'e2', side: 'A', scorerId: 'p1' },
    { id: 'e3', side: 'B', scorerId: 'p4' },
  ],
  assists: { p2: 1 }, mvpId: 'p1', gkId: 'p2', golazoId: 'p1', escabio: { p3: 2, p4: 1 },
};
const m2 = {
  id: 'm2', date: '2026-09-08', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'],
  events: [{ id: 'e4', side: 'B', scorerId: 'p4' }, { id: 'e5', side: 'B', scorerId: 'p4', assistId: 'p2' }],
  muroId: 'p3', hachazoId: 'p3', polemicaId: 'p4',
};
const m3 = { id: 'm3', date: '2026-09-15', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'], events: [] }; // 0-0

test('scoreOf, resultFor y assistQty (incluye asistencias del formato viejo)', () => {
  assert.equal(scoreOf(m1, 'A'), 2);
  assert.equal(scoreOf(m1, 'B'), 1);
  assert.equal(resultFor(m1, 'p1'), 'v');
  assert.equal(resultFor(m1, 'p3'), 'd');
  assert.equal(resultFor(m3, 'p1'), 'e');
  assert.equal(resultFor(m1, 'zz'), null);
  assert.equal(assistQty(m2, 'p2'), 1); // legado: ev.assistId
  assert.equal(assistQty(m1, 'p2'), 1);
});

test('computeStats: partidos, goles, asistencias, premios y escabio', () => {
  const st = computeStats(players, [m1, m2, m3]);
  assert.equal(st.p1.pj, 3);
  assert.deepEqual([st.p1.v, st.p1.e, st.p1.d], [1, 1, 1]); // m2: p1 en A pierde 0-2
  assert.equal(st.p1.goles, 2);
  assert.equal(st.p4.goles, 3);
  assert.equal(st.p2.asist, 2); // 1 del mapa + 1 legado
  assert.equal(st.p1.mvp, 1);
  assert.equal(st.p2.gk, 1);
  assert.equal(st.p1.golazos, 1);
  assert.equal(st.p3.muros, 1);
  assert.equal(st.p3.hachazos, 1);
  assert.equal(st.p4.polemicas, 1);
  assert.equal(st.p3.escabio, 2);
});

test('racha invicta: mejor histórica y actual', () => {
  const st = computeStats(players, [m1, m2, m3]);
  // p3: pierde m1, gana m2 (B... p3 está en A y pierde 0-2? no: m2 teamA tiene a p3) -> pierde; m3 empata.
  assert.equal(st.p3.racha, 1);
  assert.equal(st.p3.rachaAct, 1);
  // p4: pierde m1 (B 1-2), gana m2 (B 2-0), empata m3 -> racha actual y mejor = 2
  assert.equal(st.p4.racha, 2);
  assert.equal(st.p4.rachaAct, 2);
});

test('rankBy: ordena, comparte puesto en empates y excluye a quien tiene 0', () => {
  const st = computeStats(players, [m1, m2, m3]);
  const goles = rankBy(st, players, 'goles');
  assert.deepEqual(goles.map((r) => [r.player.id, r.value, r.pos]), [['p4', 3, 1], ['p1', 2, 2]]);
  const pj = rankBy(st, players, 'pj');
  assert.equal(pj.length, 4);
  assert.ok(pj.every((r) => r.pos === 1)); // todos jugaron 3
});

test('escabio: total del partido, compatibilidad con el formato viejo, serie y promedio', () => {
  assert.equal(escTotal({ escabioTotal: 9 }), 9);
  assert.equal(escTotal({ escabioTotal: 0, escabio: { a: 5 } }), 0); // el total manda aunque sea 0
  assert.equal(escTotal({ escabio: { a: 2, b: 3 } }), 5);           // viejo: por jugador, se suma
  assert.equal(escTotal({ escabio: ['a', 'b'] }), 2);               // más viejo: lista
  assert.equal(escTotal({}), 0);
  const ms = [
    { id: 'c', date: '2026-09-15', escabioTotal: 6 }, { id: 'a', date: '2026-09-01', escabioTotal: 2 },
    { id: 'b', date: '2026-09-08', escabio: { x: 4 } }, { id: 'sin-fecha', escabioTotal: 99 },
  ];
  const serie = escabioSeries(ms);
  assert.deepEqual(serie.map((p) => [p.id, p.value]), [['a', 2], ['b', 4], ['c', 6]]); // ordenada, sin partidos sin fecha
  assert.deepEqual(escabioSummary(serie), { total: 12, avg: 4 });
  assert.deepEqual(escabioSummary([]), { total: 0, avg: 0 });
});

test('el ranking ya no tiene categoría de escabio individual', () => {
  assert.equal('escabio' in RANK_CATS, false);
});

test('displayName: muestra el nombre, y el apodo solo si no hay nombre (como el original)', () => {
  assert.equal(displayName({ name: 'Juan Pérez', nickname: 'Tuti' }), 'Juan Pérez');
  assert.equal(displayName({ name: '', nickname: 'Tuti' }), 'Tuti');
  assert.equal(displayName({ nickname: 'Tuti' }), 'Tuti');
  assert.equal(displayName(null), '—');
});

test('fechas y grupos', () => {
  assert.equal(todayStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(monthKey('2026-09-15'), '2026-09');
  assert.equal(monthLabel('2026-09'), 'Septiembre 2026');
  assert.equal(monthLabel('sin-fecha'), 'Sin fecha');
  assert.equal(groupOfPlayer(players[1]), 'Arquero');
  assert.equal(groupOfPlayer(players[3]), 'Delantera');
  assert.equal(groupOfPlayer({ positions: [] }), 'Sin posición');
});

test('posiciones del formato viejo del original ("position" por nombre)', () => {
  assert.deepEqual(playerPositions({ position: 'Arquero' }), ['PO']);
  assert.deepEqual(playerPositions({ position: 'Delantero' }), ['DC']);
  assert.deepEqual(playerPositions({ positions: ['MC', '', null] }), ['MC']);
  assert.equal(groupOfPlayer({ position: 'Defensor' }), 'Defensa');
  assert.equal(playerMatches({ name: 'X', position: 'Arquero' }, 'portero'), true);
});

test('buscador: sin acentos ni mayúsculas, todas las palabras, por apodo, número o posición', () => {
  assert.equal(norm('  ÁÉÍ Ñandú '), 'aei nandu');
  assert.equal(playerMatches(players[0], 'tuti'), true);
  assert.equal(playerMatches(players[0], 'PEREZ'), true); // sin acento
  assert.equal(playerMatches(players[0], 'juan 10'), true);
  assert.equal(playerMatches(players[0], 'juan 99'), false);
  assert.equal(playerMatches(players[1], 'arq'), true);      // línea: Arquero
  assert.equal(playerMatches(players[1], 'portero'), true);  // nombre de la posición
  assert.equal(playerMatches(players[0], 'mediocentro ofensivo'), true);
  assert.equal(playerMatches(players[3], 'delantera'), true);
  assert.equal(playerMatches(players[2], ''), true);
  assert.deepEqual(filterPlayers(players, 'bruno').map((p) => p.id), ['p3']);
  assert.deepEqual(filterPlayers(players, 'zzz'), []);
});

import { isOwnGoal, opposite, ownGoalsBy, goalsBy, realGoals } from '../src/domain/domain.js';

test('gol en contra: suma al marcador del otro equipo y al jugador solo como "en contra"', () => {
  // p1 y p2 juegan en A; p3 y p4 en B. p1 se la mete en contra (suma para B). p3 hace un gol normal.
  const m = {
    id: 'oc', date: '2026-10-01', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'],
    events: [
      { id: 'e1', side: 'B', scorerId: 'p1', ownGoal: true },
      { id: 'e2', side: 'B', scorerId: 'p3' },
      { id: 'e3', side: 'A', scorerId: 'p2' },
    ],
  };
  assert.equal(isOwnGoal(m.events[0]), true);
  assert.equal(opposite('A'), 'B');
  assert.equal(scoreOf(m, 'A'), 1);
  assert.equal(scoreOf(m, 'B'), 2);                 // el gol en contra de p1 suma para B
  assert.equal(goalsBy(m, 'p1'), 0);                // no es gol de p1
  assert.equal(ownGoalsBy(m, 'p1'), 1);
  assert.equal(realGoals(m, 'B'), 1);               // solo el de p3 admite asistencia
  assert.equal(realGoals(m, 'A'), 1);
  const st = computeStats(players, [m]);
  assert.equal(st.p1.goles, 0);
  assert.equal(st.p1.golesContra, 1);
  assert.equal(st.p3.goles, 1);
  assert.equal(st.p3.golesContra, 0);
  // El resultado se calcula con el marcador completo: B 2 - A 1.
  assert.equal(resultFor(m, 'p3'), 'v');
  assert.equal(resultFor(m, 'p1'), 'd');
});

test('ranking de goles en contra y categoría de ayuda', () => {
  const m = {
    id: 'oc2', date: '2026-10-02', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'],
    events: [
      { id: 'a', side: 'B', scorerId: 'p1', ownGoal: true }, { id: 'b', side: 'B', scorerId: 'p1', ownGoal: true },
      { id: 'c', side: 'A', scorerId: 'p4', ownGoal: true },
    ],
  };
  const st = computeStats(players, [m]);
  const rows = rankBy(st, players, 'golesContra');
  assert.deepEqual(rows.map((r) => [r.player.id, r.value, r.pos]), [['p1', 2, 1], ['p4', 1, 2]]);
  assert.ok(RANK_CATS.golesContra);
  assert.deepEqual(rankBy(st, players, 'goles'), []); // ningún gol "normal"
});
