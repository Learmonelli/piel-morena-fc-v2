// Datos de ejemplo repetibles (misma semilla = mismos resultados).
import { todayStr } from './domain.js';
import { randomFace } from '../pmAvatar.js';

const PLAYERS = [
  ['Juan Pérez', 'Tuti', '10', ['MCO', 'MC']], ['Nacho Ruiz', 'Nacho', '1', ['PO']],
  ['Bruno Díaz', 'Bruno', '4', ['DFC']], ['Facundo Gómez', 'Facu', '3', ['LI', 'DFC']],
  ['Luciano Sosa', 'Lucho', '8', ['MC', 'MCD']], ['Santiago Vera', 'Santi', '9', ['DC']],
  ['Maximiliano Paz', 'Maxi', '7', ['ED']], ['Tomás Luna', 'Tomi', '5', ['MCD']],
  ['Gonzalo Ibarra', 'Gonza', '11', ['EI', 'DC']], ['Pablo Núñez', 'Pablo', '2', ['LD']],
  ['Damián Cruz', 'Dami', '6', ['DFC']], ['Matías Ortiz', 'Mati', '14', ['MC']],
];

export function buildDemo(uid) {
  let seed = 7;
  const rnd = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const players = PLAYERS.map(([name, nickname, number, positions]) => ({
    id: uid(), name, nickname, number, positions, guest: false,
    // Camiseta del club (vinotinto y dorado) con rasgos variados.
    face: { ...randomFace(rnd), shirt: 0, shirt2: 1 },
  }));
  const day = (back) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return todayStr(d);
  };

  const matches = [];
  // Seis partidos cerrados (uno por semana) y uno de hoy abierto para cargar en vivo.
  [42, 35, 28, 21, 14, 7, 0].forEach((back, i) => {
    const mix = [...players].sort(() => rnd() - 0.5);
    const teamA = mix.slice(0, 6).map((p) => p.id);
    const teamB = mix.slice(6).map((p) => p.id);
    const m = {
      id: uid(), date: day(back), mode: 'interno', teamAName: 'Vinotinto', teamBName: 'Blanco', rivalName: '',
      teamA, teamB, events: [], assists: {}, escabioTotal: 0, comments: [], closed: back > 0,
    };
    if (back > 0) {
      for (const [side, team] of [['A', teamA], ['B', teamB]]) {
        const goals = Math.floor(rnd() * 5);
        for (let g = 0; g < goals; g++) {
          m.events.push({ id: uid(), side, scorerId: pick(team) });
          if (rnd() > 0.45) {
            const a = pick(team);
            m.assists[a] = (m.assists[a] || 0) + 1;
          }
        }
      }
      // De vez en cuando, un gol en contra: lo hace uno del equipo contrario y suma para el otro.
      if (rnd() > 0.55) m.events.push({ id: uid(), side: 'A', scorerId: pick(teamB), ownGoal: true });
      if (rnd() > 0.7) m.events.push({ id: uid(), side: 'B', scorerId: pick(teamA), ownGoal: true });
      const all = [...teamA, ...teamB];
      m.mvpId = pick(all);
      m.gkId = pick(all);
      if (rnd() > 0.4) m.golazoId = pick(all);
      if (rnd() > 0.5) m.muroId = pick(all);
      if (rnd() > 0.7) m.hachazoId = pick(all);
      if (rnd() > 0.8) m.polemicaId = pick(all);
      m.escabioTotal = 2 + Math.floor(rnd() * 14); // birras del equipo en el partido
      if (i % 2 === 0) m.comments.push({ id: uid(), author: 'Tuti', text: '¡Gran partido, che!', ts: Date.now() - back * 86400000 });
    }
    matches.push(m);
  });
  // Dos partidos contra un rival: uno ya cerrado (con goles en contra) y uno de hoy abierto
  // para probar el botón "Gol del rival" en vivo.
  const vsRival = (back, closed, ours, theirs) => {
    const squad = [...players].sort(() => rnd() - 0.5).slice(0, 9).map((p) => p.id);
    const m = {
      id: uid(), date: day(back), mode: 'rival', teamAName: 'Piel Morena', teamBName: 'Los Guapos FC',
      rivalName: 'Los Guapos FC', teamA: squad, teamB: [], events: [], assists: {}, escabioTotal: 0, comments: [], closed,
    };
    for (let i = 0; i < ours; i++) {
      m.events.push({ id: uid(), side: 'A', scorerId: pick(squad) });
      if (i % 2 === 0) { const a = pick(squad); m.assists[a] = (m.assists[a] || 0) + 1; }
    }
    for (let i = 0; i < theirs; i++) m.events.push({ id: uid(), side: 'B', scorerId: null }); // gol en contra
    if (closed) {
      m.mvpId = pick(squad); m.gkId = pick(squad); m.escabioTotal = 4 + Math.floor(rnd() * 10);
      // Uno de los nuestros se la mete en contra: suma para el rival.
      m.events.push({ id: uid(), side: 'B', scorerId: pick(squad), ownGoal: true });
    }
    return m;
  };
  matches.push(vsRival(3, true, 3, 2));
  matches.push(vsRival(0, false, 1, 1));
  return { players, matches };
}
