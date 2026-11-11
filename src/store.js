// Estado y acciones. Persiste en localStorage con el mismo modelo que la app original,
// así la capa de datos se puede cambiar a Supabase tocando solo este archivo.
import {
  sideOf, inMatch, todayStr, AWARDS, POS_NAME, escTotal, realGoals, opposite,
} from './domain/domain.js';
import { buildDemo } from './domain/demo.js';
import { sanitizeFace, randomFace } from './pmAvatar.js';

// Solo códigos de posición conocidos, sin repetir, como mucho 6.
const cleanPositions = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && POS_NAME[x]))].slice(0, 6);

const KEY = 'pm2_v1';
const listeners = new Set();
let errorHandler = () => {};
const uid = () => crypto.randomUUID();
const clean = (s, n = 60) => String(s ?? '').trim().slice(0, n);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.players) && Array.isArray(raw.matches)) return raw;
  } catch { /* sin datos o corruptos: se parte de cero */ }
  return { players: [], matches: [] };
}

let state = load();

// ---- Sincronización con la nube (opcional) ----
// Si hay un adaptador conectado, en cada guardado se compara cada jugador y partido con la última
// versión sincronizada y se manda solo lo que cambió (o se borra lo que ya no está). Así todas las
// acciones se sincronizan sin tener que tocar cada una.
let sync = null; // { upsert(tabla, fila), remove(tabla, id) }
let synced = new Map(); // `${tabla}:${id}` -> JSON de la última versión enviada/recibida
const rowsOf = () => [
  ...state.players.map((p) => ['players', p]),
  ...state.matches.map((m) => ['matches', m]),
];
const keyOf = (table, id) => `${table}:${id}`;
const snapshot = () => { synced = new Map(rowsOf().map(([t, r]) => [keyOf(t, r.id), JSON.stringify(r)])); };

function pushDiff() {
  if (!sync) return;
  const seen = new Set();
  for (const [t, r] of rowsOf()) {
    const k = keyOf(t, r.id);
    seen.add(k);
    const json = JSON.stringify(r);
    if (synced.get(k) !== json) { synced.set(k, json); sync.upsert(t, JSON.parse(json)); }
  }
  for (const k of [...synced.keys()]) {
    if (seen.has(k)) continue;
    synced.delete(k);
    const i = k.indexOf(':');
    sync.remove(k.slice(0, i), k.slice(i + 1));
  }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    errorHandler('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).');
  }
}

function commit() {
  saveLocal();
  pushDiff();
  listeners.forEach((fn) => fn(state));
}

// Cambios que solo afectan a este navegador (cargar la nube, aplicar cambios de otro celular).
function commitLocal() {
  saveLocal();
  listeners.forEach((fn) => fn(state));
}

const match = (id) => state.matches.find((m) => m.id === id);
// Administrador logueado (con la nube). Como en el original: puede editar partidos finalizados.
let admin = false;
// Un partido finalizado solo admite comentarios, salvo para el admin.
const editable = (m) => !!m && (!m.closed || admin);

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deja las asistencias de cada equipo dentro de sus goles propios, recortando las últimas.
function trimAssists(m) {
  for (const side of ['A', 'B']) {
    let extra = store.assistsOnSide(m, side) - realGoals(m, side);
    for (const pid of inMatch(m).filter((id) => sideOf(m, id) === side)) {
      while (extra > 0 && (m.assists?.[pid] || 0) > 0) {
        m.assists[pid]--;
        if (!m.assists[pid]) delete m.assists[pid];
        extra--;
      }
    }
  }
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  onError(fn) { errorHandler = fn; },
  match,

  // ---- Jugadores ----
  addPlayer({ name, nickname = '', number = '', positions = [], guest = false, face = null }) {
    const n = clean(name);
    if (!n) return null;
    const p = {
      id: uid(), name: n, nickname: clean(nickname, 30), number: clean(number, 3),
      positions: cleanPositions(positions), guest: !!guest,
    };
    const f = sanitizeFace(face);
    if (f) p.face = f;
    state.players.push(p);
    commit();
    return p;
  },
  updatePlayer(id, patch) {
    const p = state.players.find((x) => x.id === id);
    if (!p) return false;
    if (patch.name !== undefined && clean(patch.name)) p.name = clean(patch.name);
    if (patch.nickname !== undefined) p.nickname = clean(patch.nickname, 30);
    if (patch.number !== undefined) p.number = clean(patch.number, 3);
    if (Array.isArray(patch.positions)) { p.positions = cleanPositions(patch.positions); delete p.position; }
    if (patch.face !== undefined) {
      const f = sanitizeFace(patch.face);
      if (f) p.face = f;
    }
    commit();
    return true;
  },
  removePlayer(id) {
    state.players = state.players.filter((p) => p.id !== id);
    for (const m of state.matches) {
      m.teamA = (m.teamA || []).filter((x) => x !== id);
      m.teamB = (m.teamB || []).filter((x) => x !== id);
      // El gol queda en el marcador (si era en contra, sigue siendo en contra, sin nombre).
      m.events = (m.events || []).map((e) => (e.scorerId === id ? { ...e, scorerId: null } : e));
      delete m.assists?.[id];
      delete m.escabio?.[id];
      Object.values(AWARDS).forEach(({ field }) => { if (m[field] === id) m[field] = null; });
      trimAssists(m);
    }
    commit();
  },

  // ---- Partidos ----
  createMatch({ date, mode = 'interno', teamAName = 'Equipo A', teamBName = 'Equipo B', rivalName = '' }) {
    const rival = mode === 'rival';
    const m = {
      id: uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr(), mode: rival ? 'rival' : 'interno',
      teamAName: clean(teamAName) || (rival ? 'Piel Morena' : 'Equipo A'),
      teamBName: clean(teamBName) || 'Equipo B',
      rivalName: rival ? clean(rivalName) || 'Rival' : '',
      teamA: [], teamB: [], events: [], assists: {}, escabioTotal: 0, comments: [], closed: false,
    };
    state.matches.push(m);
    commit();
    return m;
  },
  setTeamSide(matchId, pid, side) {
    const m = match(matchId);
    if (!editable(m) || !state.players.some((p) => p.id === pid)) return false;
    m.teamA = (m.teamA || []).filter((x) => x !== pid);
    m.teamB = (m.teamB || []).filter((x) => x !== pid);
    if (side === 'A') m.teamA.push(pid);
    else if (side === 'B') m.teamB.push(pid);
    commit();
    return true;
  },
  // Invitado: alguien sin perfil que juega este partido. Como en la app original, se crea como
  // jugador con guest = true y cara al azar, y queda anotado directamente en el equipo elegido.
  addGuest(matchId, name, side) {
    const m = match(matchId);
    const n = clean(name);
    if (!editable(m) || !n || !['A', 'B'].includes(side)) return null;
    if (side === 'B' && m.mode === 'rival') return null; // el rival no tiene plantel
    const p = { id: uid(), name: n, nickname: '', number: '', positions: [], guest: true, face: randomFace() };
    state.players.push(p);
    (side === 'A' ? m.teamA : m.teamB).push(p.id);
    commit();
    return p;
  },
  // Sortea a los jugadores ya anotados (o, si no hay ninguno, a todos los no invitados).
  shuffleTeams(matchId) {
    const m = match(matchId);
    if (!editable(m)) return false;
    let pool = inMatch(m);
    if (!pool.length) pool = state.players.filter((p) => !p.guest).map((p) => p.id);
    const mix = shuffled(pool);
    const half = Math.ceil(mix.length / 2);
    m.teamA = mix.slice(0, half);
    m.teamB = mix.slice(half);
    commit();
    return true;
  },
  addGoal(matchId, side, scorerId = null) {
    const m = match(matchId);
    if (!editable(m) || !['A', 'B'].includes(side)) return null;
    const rivalGoal = m.mode === 'rival' && side === 'B';
    if (rivalGoal) scorerId = null;
    else if (!scorerId || sideOf(m, scorerId) !== side) return null;
    const ev = { id: uid(), side, scorerId };
    m.events.push(ev);
    commit();
    return ev;
  },
  // Gol en contra: lo hizo `pid` en su propio arco, así que suma para el equipo contrario.
  addOwnGoal(matchId, pid) {
    const m = match(matchId);
    const side = m && sideOf(m, pid);
    if (!editable(m) || !side) return null;
    const ev = { id: uid(), side: opposite(side), scorerId: pid, ownGoal: true };
    m.events.push(ev);
    commit();
    return ev;
  },
  // Cambia quién hizo un gol y si fue en contra. Devuelve 'ok' | 'invalid' | 'assists'
  // ('assists' = quedarían más asistencias que goles; hay que quitar una asistencia primero).
  updateGoal(matchId, eventId, { ownGoal = false, scorerId = null } = {}) {
    const m = match(matchId);
    const ev = m?.events.find((e) => e.id === eventId);
    if (!editable(m) || !ev) return 'invalid';
    const own = !!ownGoal;
    const rivalSide = m.mode === 'rival' && ev.side === 'B';
    // Un gol normal lo hace alguien del equipo que suma; uno en contra, alguien del otro.
    const scorerSide = own ? opposite(ev.side) : ev.side;
    let who = scorerId || null;
    if (own || !rivalSide) {
      if (!who || sideOf(m, who) !== scorerSide) return 'invalid';
    } else who = null; // gol del rival: sin jugador
    const prev = { ...ev };
    ev.scorerId = who;
    if (own) ev.ownGoal = true; else delete ev.ownGoal;
    if (['A', 'B'].some((s) => store.assistsOnSide(m, s) > realGoals(m, s))) {
      Object.keys(ev).forEach((k) => delete ev[k]);
      Object.assign(ev, prev);
      return 'assists';
    }
    commit();
    return 'ok';
  },
  removeGoal(matchId, eventId) {
    const m = match(matchId);
    if (!editable(m) || !m.events.some((e) => e.id === eventId)) return false;
    m.events = m.events.filter((e) => e.id !== eventId);
    trimAssists(m); // si ya no alcanzan los goles para tantas asistencias, se recortan
    commit();
    return true;
  },
  assistsOnSide(m, side) {
    return inMatch(m).filter((id) => sideOf(m, id) === side)
      .reduce((n, id) => n + (Number(m.assists?.[id]) || 0), 0);
  },
  // Regla de la app original: no puede haber más asistencias que goles propios de su equipo
  // (los goles en contra no tienen asistencia).
  addAssist(matchId, pid) {
    const m = match(matchId);
    const side = m && sideOf(m, pid);
    if (!editable(m) || !side) return false;
    if (store.assistsOnSide(m, side) >= realGoals(m, side)) return false;
    m.assists[pid] = (Number(m.assists[pid]) || 0) + 1;
    commit();
    return true;
  },
  removeAssist(matchId, pid) {
    const m = match(matchId);
    if (!editable(m) || !(m.assists?.[pid] > 0)) return false;
    m.assists[pid]--;
    if (!m.assists[pid]) delete m.assists[pid];
    commit();
    return true;
  },
  setAward(matchId, cat, pid) {
    const m = match(matchId);
    const def = AWARDS[cat];
    if (!editable(m) || !def) return false;
    if (pid && !inMatch(m).includes(pid)) return false;
    m[def.field] = pid || null;
    commit();
    return true;
  },
  // Total de escabio (birras) del partido, del equipo completo.
  setEscabioTotal(matchId, value) {
    const m = match(matchId);
    if (!editable(m)) return false;
    m.escabioTotal = Math.max(0, Math.min(999, Math.trunc(Number(value)) || 0));
    commit();
    return true;
  },
  adjustEscabioTotal(matchId, delta) {
    const m = match(matchId);
    if (!editable(m)) return false;
    return store.setEscabioTotal(matchId, escTotal(m) + delta);
  },
  // Los comentarios se pueden agregar aunque el partido esté finalizado.
  addComment(matchId, author, text) {
    const m = match(matchId);
    const t = clean(text, 400);
    if (!m || !t) return false;
    m.comments.push({ id: uid(), author: clean(author, 30) || 'Anónimo', text: t, ts: Date.now() });
    commit();
    return true;
  },
  removeComment(matchId, cid) {
    const m = match(matchId);
    if (!m) return false;
    m.comments = m.comments.filter((c) => c.id !== cid);
    commit();
    return true;
  },
  closeMatch(id) { const m = match(id); if (!m) return false; m.closed = true; commit(); return true; },
  reopenMatch(id) { const m = match(id); if (!m) return false; m.closed = false; commit(); return true; },
  deleteMatch(id) { state.matches = state.matches.filter((m) => m.id !== id); commit(); },

  // Los partidos se finalizan solos al día siguiente de su fecha.
  autoCloseOld(today = todayStr()) {
    let changed = false;
    for (const m of state.matches) {
      if (!m.closed && m.date && m.date < today) { m.closed = true; changed = true; }
    }
    if (changed) commit();
    return changed;
  },

  // ---- Nube ----
  isSynced: () => !!sync,
  isAdmin: () => admin,
  // Reabrir, eliminar partidos o jugadores: con la nube, solo el admin (la base lo exige);
  // sin nube (solo este navegador) no hay a quién pedirle permiso.
  canAdmin: () => !sync || admin,
  setAdmin(value) {
    if (admin === !!value) return;
    admin = !!value;
    listeners.forEach((fn) => fn(state));
  },
  // Conecta el adaptador. `data` es lo que hay en la nube (pasa a ser la fuente de verdad).
  // Con uploadLocal: true, la nube está vacía y se suben los datos que ya tenía este navegador.
  attachSync(adapter, data, { uploadLocal = false } = {}) {
    if (!uploadLocal) state = { players: data.players, matches: data.matches };
    synced = new Map();
    if (!uploadLocal) snapshot();
    sync = adapter;
    if (uploadLocal) pushDiff();
    commitLocal();
    store.autoCloseOld(); // los partidos viejos que sigan abiertos se cierran (y se sincronizan)
  },
  detachSync() { sync = null; synced = new Map(); store.setAdmin(false); },
  // Aplica un cambio que vino de la nube (de otro dispositivo, o la versión real tras un rechazo).
  // row = null significa que la fila ya no existe.
  applyRemote(table, row, id) {
    const list = table === 'players' ? state.players : table === 'matches' ? state.matches : null;
    if (!list) return false;
    const rid = row?.id ?? id;
    const i = list.findIndex((x) => x.id === rid);
    const k = keyOf(table, rid);
    if (!row) {
      if (i < 0) return false;
      list.splice(i, 1);
      synced.delete(k);
    } else {
      const json = JSON.stringify(row);
      if (i >= 0 && JSON.stringify(list[i]) === json) { synced.set(k, json); return false; } // eco de un cambio propio
      if (i >= 0) list[i] = row; else list.push(row);
      synced.set(k, json);
    }
    commitLocal();
    return true;
  },

  // Datos de ejemplo: solo si la app está vacía, así nunca pisan datos reales.
  // Con la nube conectada no se permite: no hay que mandar datos inventados a la base del equipo.
  loadDemo() {
    if (sync) return false;
    if (state.players.length || state.matches.length) return false;
    state = buildDemo(uid);
    commit();
    return true;
  },

  // Empezar de cero (la interfaz pide confirmación y ofrece exportar antes).
  // Con la nube conectada no se permite (borraría todo en la base del equipo).
  clearAll() {
    if (sync) return false;
    state = { players: [], matches: [] };
    commit();
    return true;
  },

  // ---- Copias de seguridad ----
  exportJson: () => JSON.stringify({ players: state.players, matches: state.matches }, null, 2),
  // Con la nube conectada no se permite: reemplazar toda la base es tarea del admin
  // (la app original lo hace con la función restore_team_data).
  importJson(text) {
    if (sync) return false;
    let data;
    try { data = JSON.parse(text); } catch { return false; }
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) return false;
    const okPlayers = data.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
    const okMatches = data.matches.every((m) => m && typeof m.id === 'string' && Array.isArray(m.events || []));
    if (!okPlayers || !okMatches) return false;
    state = { players: data.players, matches: data.matches };
    commit();
    return true;
  },
};

store.autoCloseOld();
