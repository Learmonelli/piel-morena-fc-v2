// Lógica de dominio de Piel Morena FC. Mismo modelo de datos que la app original
// (players / matches con events, assists, premios, escabio, comments), sin DOM.

export const qtyOf = (map, id) => {
  if (!map) return 0;
  if (Array.isArray(map)) return map.includes(id) ? 1 : 0;
  return Number(map[id]) || 0;
};
export const totalOf = (map) => {
  if (!map) return 0;
  if (Array.isArray(map)) return map.length;
  return Object.values(map).reduce((sum, v) => sum + (Number(v) || 0), 0);
};
export const migMap = (map) => {
  const o = {};
  if (Array.isArray(map)) map.forEach((id) => { o[id] = 1; });
  else if (map && typeof map === 'object') Object.assign(o, map);
  return o;
};

// Escabio: un total por partido (como en la app original). Los partidos viejos que lo
// guardaban por jugador se siguen leyendo: el total es la suma.
export const escTotal = (m) => (m && m.escabioTotal != null ? Number(m.escabioTotal) || 0 : totalOf(m?.escabio));

// Serie para el gráfico: un punto por partido con fecha, de más viejo a más nuevo.
export function escabioSeries(matches) {
  return matches
    .filter((m) => m.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ id: m.id, date: m.date, value: escTotal(m) }));
}
export function escabioSummary(series) {
  const total = series.reduce((n, p) => n + p.value, 0);
  return { total, avg: series.length ? total / series.length : 0 };
}

// Nombre a mostrar, igual que la app original: el nombre; el apodo solo si no hay nombre.
export const displayName = (p) => (p ? (p.name || p.nickname || '—') : '—');

export const scoreOf = (m, side) => (m.events || []).filter((e) => e.side === side).length;
export const assistQty = (m, id) => {
  let n = qtyOf(m.assists, id);
  (m.events || []).forEach((ev) => { if (ev.assistId === id) n++; });
  return n;
};
// Gol en contra: evento con ownGoal. `side` es el equipo al que SUMA el gol y `scorerId` el
// jugador (del equipo contrario) que lo hizo. No cuenta como gol suyo, ni da asistencias.
export const isOwnGoal = (ev) => !!(ev && ev.ownGoal);
export const opposite = (side) => (side === 'A' ? 'B' : 'A');
export const goalsBy = (m, id) => (m.events || []).filter((e) => e.scorerId === id && !e.ownGoal).length;
export const ownGoalsBy = (m, id) => (m.events || []).filter((e) => e.scorerId === id && e.ownGoal).length;
// Goles "de verdad" de un equipo (con goleador propio, sin goles en contra): tope de asistencias.
export const realGoals = (m, side) => (m.events || []).filter((e) => e.side === side && e.scorerId && !e.ownGoal).length;
export const sideOf = (m, pid) => ((m.teamA || []).includes(pid) ? 'A' : (m.teamB || []).includes(pid) ? 'B' : null);
export const inMatch = (m) => [...(m.teamA || []), ...(m.teamB || [])];
// Resultado del partido visto desde un jugador: 'v' | 'e' | 'd' | null (no jugó).
export function resultFor(m, pid) {
  const side = sideOf(m, pid);
  if (!side) return null;
  const mine = scoreOf(m, side);
  const theirs = scoreOf(m, side === 'A' ? 'B' : 'A');
  return mine > theirs ? 'v' : mine < theirs ? 'd' : 'e';
}

// short = nombre corto para las etiquetas de la lista de partidos.
export const AWARDS = {
  mvp: { field: 'mvpId', label: 'Figura', short: 'Figura', icon: '👑', stat: 'mvp' },
  gk: { field: 'gkId', label: 'Mejor arquero', short: 'Arquero', icon: '🧤', stat: 'gk' },
  golazo: { field: 'golazoId', label: 'Golazo Piel Morena', short: 'Golazo', icon: '🔥', stat: 'golazos' },
  muro: { field: 'muroId', label: 'Muro', short: 'Muro', icon: '🧱', stat: 'muros' },
  hachazo: { field: 'hachazoId', label: 'Hachazo', short: 'Hachazo', icon: '🪓', stat: 'hachazos' },
  polemica: { field: 'polemicaId', label: 'Polémica', short: 'Polémica', icon: '📣', stat: 'polemicas' },
};

export function computeStats(players, matches) {
  const st = {};
  players.forEach((p) => {
    st[p.id] = {
      pj: 0, goles: 0, golesContra: 0, asist: 0, mvp: 0, gk: 0, v: 0, d: 0, e: 0, escabio: 0,
      hachazos: 0, polemicas: 0, golazos: 0, muros: 0, racha: 0, rachaAct: 0,
    };
  });
  matches.forEach((m) => {
    const a = scoreOf(m, 'A');
    const b = scoreOf(m, 'B');
    const resA = a > b ? 'v' : a < b ? 'd' : 'e';
    const resB = b > a ? 'v' : b < a ? 'd' : 'e';
    (m.teamA || []).forEach((id) => { if (st[id]) { st[id].pj++; st[id][resA]++; } });
    (m.teamB || []).forEach((id) => { if (st[id]) { st[id].pj++; st[id][resB]++; } });
    (m.events || []).forEach((ev) => {
      if (!ev.scorerId || !st[ev.scorerId]) return;
      if (ev.ownGoal) st[ev.scorerId].golesContra++; else st[ev.scorerId].goles++;
    });
    const as = migMap(m.assists);
    (m.events || []).forEach((ev) => { if (ev.assistId) as[ev.assistId] = (Number(as[ev.assistId]) || 0) + 1; });
    Object.keys(as).forEach((id) => { if (st[id]) st[id].asist += Number(as[id]) || 0; });
    Object.values(AWARDS).forEach(({ field, stat }) => { const id = m[field]; if (id && st[id]) st[id][stat]++; });
    players.forEach((p) => { st[p.id].escabio += qtyOf(m.escabio, p.id); });
  });
  // Racha invicta (actual y mejor histórica): partidos seguidos sin perder.
  players.forEach((p) => {
    const played = matches
      .filter((m) => sideOf(m, p.id))
      .sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    let best = 0;
    let cur = 0;
    played.forEach((m) => {
      if (resultFor(m, p.id) !== 'd') { cur++; if (cur > best) best = cur; } else cur = 0;
    });
    st[p.id].rachaAct = cur;
    st[p.id].racha = best;
  });
  return st;
}

export const RANK_CATS = {
  goles: ['Goles', (s) => s.goles],
  asist: ['Asistencias', (s) => s.asist],
  ga: ['Goles + Asist.', (s) => s.goles + s.asist],
  mvp: ['👑 Figuras', (s) => s.mvp],
  gk: ['🧤 Mejor arquero', (s) => s.gk],
  pj: ['Partidos jugados', (s) => s.pj],
  v: ['Victorias', (s) => s.v],
  d: ['Derrotas', (s) => s.d],
  invicto: ['Invictos', (s) => s.racha],
  racha: ['Racha invicta', (s) => s.rachaAct],
  golazos: ['🔥 Golazo Piel Morena', (s) => s.golazos],
  muros: ['🧱 Muro', (s) => s.muros],
  hachazos: ['🪓 Hachazos', (s) => s.hachazos],
  polemicas: ['📣 Polémica', (s) => s.polemicas],
  golesContra: ['🙈 Goles en contra', (s) => s.golesContra],
};

export const RANK_HELP = {
  mvp: 'Figura: el mejor jugador del partido.',
  gk: 'Mejor arquero: el arquero más destacado del partido.',
  golazos: 'Golazo Piel Morena: el mejor gol del partido (premio estilo Puskas).',
  muros: 'Muro: el mejor defensor del partido.',
  invicto: 'Invictos: máxima cantidad de partidos seguidos sin perder (mejor racha histórica).',
  racha: 'Racha invicta: partidos sin perder que lleva el jugador en la actualidad.',
  hachazos: 'Hachazo: el jugador más pegador del partido.',
  polemicas: 'Polémica: el jugador que generó más polémica en el partido.',
  golesContra: 'Goles en contra: goles que el jugador marcó en su propio arco (cuanto más alto, más desastre).',
};

// Ranking de una categoría: orden por valor, desempate alfabético. Solo quienes tienen algo.
// La posición (1°, 2°...) respeta empates: dos jugadores con el mismo valor comparten puesto.
export function rankBy(stats, players, key) {
  const pick = RANK_CATS[key][1];
  const rows = players
    .map((p) => ({ player: p, value: pick(stats[p.id]) }))
    .filter((r) => r.value > 0)
    .sort((x, y) => y.value - x.value || String(x.player.name).localeCompare(String(y.player.name), 'es'));
  let pos = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (r.value !== prev) { pos = i + 1; prev = r.value; }
    r.pos = pos;
  });
  return rows;
}

export const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const fmtDate = (d) => {
  if (!d) return 'Sin fecha';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthKey = (d) => (d ? d.slice(0, 7) : 'sin-fecha');
export const monthLabel = (key) => {
  if (key === 'sin-fecha') return 'Sin fecha';
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1][0].toUpperCase()}${MONTHS[Number(m) - 1].slice(1)} ${y}`;
};

// Posiciones: mismos códigos y grupos que la app original (los datos son compatibles).
export const POSITION_GROUPS = [
  ['Arquero', [['PO', 'Portero']]],
  ['Defensa', [['DFC', 'Defensor central'], ['LT', 'Lateral'], ['LD', 'Lateral derecho'], ['LI', 'Lateral izquierdo'],
    ['CAD', 'Carrilero derecho'], ['CAI', 'Carrilero izquierdo']]],
  ['Mediocampo', [['MCD', 'Mediocentro defensivo'], ['MC', 'Mediocentro'], ['MCO', 'Mediocentro ofensivo'],
    ['MD', 'Mediocampista derecho'], ['MI', 'Mediocampista izquierdo'], ['MP', 'Mediapunta']]],
  ['Delantera', [['ED', 'Extremo derecho'], ['EI', 'Extremo izquierdo'], ['SD', 'Segundo delantero'],
    ['DC', 'Delantero centro'], ['PT', 'Punta']]],
];
export const POS_NAME = Object.fromEntries(POSITION_GROUPS.flatMap(([, arr]) => arr));
const POS_GROUP = Object.fromEntries(POSITION_GROUPS.flatMap(([g, arr]) => arr.map(([c]) => [c, g])));
// La app original guardaba antes una sola posición por nombre.
const POS_LEGACY = { Arquero: 'PO', Defensor: 'DFC', Mediocampista: 'MC', Delantero: 'DC' };

export function playerPositions(p) {
  if (Array.isArray(p.positions)) return p.positions.filter(Boolean);
  if (p.position) return [POS_LEGACY[p.position] || p.position];
  return [];
}
export const positionGroup = (code) => POS_GROUP[code] || null;
export function groupOfPlayer(p) {
  return positionGroup(playerPositions(p)[0]) || 'Sin posición';
}
