// Sincronización con Supabase usando un cliente FALSO en memoria (no toca ninguna base real).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { store } = await import('../src/store.js');
const { createCloud, checkKey, checkUrl, loadConfig } = await import('../src/cloud.js');
const { makeSession } = await import('../src/cloudSession.js');
const { scoreOf } = await import('../src/domain/domain.js');

// ---- Supabase falso ----
const thenable = (fn) => ({ then: (ok, ko) => Promise.resolve().then(fn).then(ok, ko) });
function fakeSupabase(initial = { players: [], matches: [] }) {
  const tables = { players: new Map(), matches: new Map() };
  for (const t of Object.keys(tables)) for (const r of initial[t]) tables[t].set(r.id, { id: r.id, data: structuredClone(r) });
  const listeners = [];
  const rules = { denyDelete: false, failWrites: 0 };
  const log = [];
  const client = {
    from(t) {
      const tbl = tables[t];
      if (!tbl) return { select: () => thenable(() => ({ data: null, error: { message: `relation "public.${t}" does not exist` } })) };
      return {
        select: () => {
          const all = thenable(() => ({ data: [...tbl.values()].map((r) => structuredClone(r)), error: null }));
          return { ...all, eq: (_c, id) => thenable(() => ({ data: tbl.has(id) ? [structuredClone(tbl.get(id))] : [], error: null })) };
        },
        upsert: (row) => thenable(() => {
          if (rules.failWrites > 0) { rules.failWrites--; return { error: { message: 'Failed to fetch' } }; }
          tbl.set(row.id, structuredClone(row));
          log.push(['upsert', t, row.id]);
          return { error: null };
        }),
        delete: () => ({
          eq: (_c, id) => ({
            select: () => thenable(() => {
              if (rules.denyDelete) return { data: [], error: null }; // RLS: no borra y no da error
              const had = tbl.delete(id);
              log.push(['delete', t, id]);
              return { data: had ? [{ id }] : [], error: null };
            }),
          }),
        }),
      };
    },
    channel() {
      const ch = {
        on: (_e, filter, cb) => { listeners.push({ table: filter.table, cb }); return ch; },
        subscribe: (cb) => { cb?.('SUBSCRIBED'); return ch; },
      };
      return ch;
    },
    removeChannel() { listeners.length = 0; },
  };
  // Simula que otro celular cambió algo.
  const remote = {
    upsert(t, row) {
      tables[t].set(row.id, { id: row.id, data: structuredClone(row) });
      listeners.filter((l) => l.table === t).forEach((l) => l.cb({ eventType: 'UPDATE', new: { id: row.id, data: structuredClone(row) } }));
    },
    delete(t, id) {
      tables[t].delete(id);
      listeners.filter((l) => l.table === t).forEach((l) => l.cb({ eventType: 'DELETE', old: { id } }));
    },
  };
  return { client, tables, rules, log, remote, rows: (t) => [...tables[t].values()].map((r) => r.data) };
}

const CFG = { url: 'https://prueba.supabase.co', key: 'sb_publishable_test' };
const noTimers = { setTimeout: () => 0, clearTimeout: () => {} };
const notes = [];
function setup(db, { confirm = async () => true } = {}) {
  const cloud = createCloud({ createClient: () => db.client, timers: noTimers });
  const session = makeSession({ cloud, confirm, notify: (m) => notes.push(m) });
  return { cloud, session };
}
const player = (id, name) => ({ id, name, nickname: '', number: '', positions: [], guest: false });

beforeEach(() => {
  store.detachSync();
  store.clearAll();
  notes.length = 0;
  mem.delete('pm2_sbconfig');
});

test('claves: rechaza la secreta (service_role) y acepta la pública', async () => {
  const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;
  assert.match(checkKey('sb_secret_abc'), /SECRETA/);
  assert.match(checkKey(jwt('service_role')), /SECRETA/);
  assert.equal(checkKey('sb_publishable_abc'), null);
  assert.equal(checkKey(jwt('anon')), null);
  assert.match(checkKey(''), /Pegá/);
  // Clave copiada con "…" (abreviada) o comillas curvas: aviso claro en vez del error de Headers.
  assert.match(checkKey('sb_publishable_BbY4…'), /carácter que no va \("…"\)/);
  assert.match(checkKey('“sb_publishable_abc”'), /carácter que no va/);
  // Espacios e invisibles al copiar se limpian solos.
  const { cleanKey } = await import('../src/cloud.js');
  assert.equal(cleanKey(' sb_publishable_abc\u200b\u00a0\n'), 'sb_publishable_abc');
  assert.equal(checkKey(' sb_publishable_abc\u200b '), null);
  // Error común: pegar la URL en el campo de la clave.
  assert.match(checkKey('https://sylhlksbxnjwswgjohbp.supabase.co/rest/v1/'), /pegaste una URL/);
  assert.match(checkUrl('http://x.supabase.co'), /https/);
  assert.match(checkUrl('cualquier cosa'), /no es válida/);
  assert.equal(checkUrl('https://x.supabase.co'), null);
});

test('la URL de la API (.../rest/v1/) se corrige a la del proyecto', async () => {
  const { normalizeUrl } = await import('../src/cloud.js');
  assert.equal(normalizeUrl('https://sylhlksbxnjwswgjohbp.supabase.co/rest/v1/'), 'https://sylhlksbxnjwswgjohbp.supabase.co');
  assert.equal(normalizeUrl('  https://abc.supabase.co/  '), 'https://abc.supabase.co');
  assert.equal(normalizeUrl('https://abc.supabase.co'), 'https://abc.supabase.co');
  let usedUrl = '';
  const cloud = createCloud({ createClient: (u) => { usedUrl = u; return fakeSupabase().client; }, timers: noTimers });
  await cloud.connect({ url: 'https://abc.supabase.co/rest/v1/', key: 'sb_publishable_x' });
  assert.equal(usedUrl, 'https://abc.supabase.co');
});

test('una clave secreta no llega ni a crear el cliente', async () => {
  let created = false;
  const cloud = createCloud({ createClient: () => { created = true; return {}; }, timers: noTimers });
  await assert.rejects(cloud.connect({ url: CFG.url, key: 'sb_secret_x' }), /SECRETA/);
  assert.equal(created, false);
});

test('nube vacía + datos locales: pregunta y los sube', async () => {
  const p = store.addPlayer({ name: 'Ana' });
  const m = store.createMatch({ date: '2099-01-01' });
  const db = fakeSupabase();
  let asked = '';
  const { cloud, session } = setup(db, { confirm: async (msg) => { asked = msg; return true; } });
  assert.equal(await session.connect(CFG), true);
  await cloud.whenIdle();
  assert.match(asked, /La nube está vacía/);
  assert.deepEqual(db.rows('players').map((x) => x.id), [p.id]);
  assert.deepEqual(db.rows('matches').map((x) => x.id), [m.id]);
  assert.equal(cloud.status(), 'ok');
  assert.deepEqual(loadConfig(), CFG); // queda guardada para la próxima vez
});

test('nube con datos: reemplaza los locales solo si confirmás', async () => {
  store.addPlayer({ name: 'Local' });
  const db = fakeSupabase({ players: [player('r1', 'Remoto')], matches: [] });
  // Si no confirmás, no se conecta y no se toca nada.
  const no = setup(db, { confirm: async () => false });
  assert.equal(await no.session.connect(CFG), false);
  assert.equal(store.isSynced(), false);
  assert.deepEqual(store.get().players.map((x) => x.name), ['Local']);
  assert.equal(loadConfig(), null);
  // Si confirmás, la nube manda.
  const yes = setup(db);
  assert.equal(await yes.session.connect(CFG), true);
  assert.deepEqual(store.get().players.map((x) => x.name), ['Remoto']);
  assert.deepEqual(db.rows('players').map((x) => x.name), ['Remoto']); // no se subió "Local"
});

test('cada cambio manda solo la fila que cambió', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana'), player('b', 'Beto')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  await cloud.whenIdle();
  db.log.length = 0;
  const m = store.createMatch({ date: '2099-02-01' });
  store.setTeamSide(m.id, 'a', 'A');
  store.setTeamSide(m.id, 'b', 'B');
  store.addGoal(m.id, 'A', 'a');
  await cloud.whenIdle();
  assert.ok(db.log.every(([op, t, id]) => op === 'upsert' && t === 'matches' && id === m.id), JSON.stringify(db.log));
  const saved = db.rows('matches').find((x) => x.id === m.id);
  assert.equal(scoreOf(saved, 'A'), 1);
  // Un jugador nuevo sube a players; editar otro partido no reenvía este.
  db.log.length = 0;
  const g = store.addGuest(m.id, 'Primo', 'A');
  await cloud.whenIdle();
  assert.deepEqual(db.log.map(([op, t, id]) => [op, t, id]).sort(),
    [['upsert', 'matches', m.id], ['upsert', 'players', g.id]].sort());
});

test('dos goles seguidos mientras se guarda el primero: llegan los dos a la nube', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  const m = store.createMatch({ date: '2099-02-02' });
  store.setTeamSide(m.id, 'a', 'A');
  for (let i = 0; i < 5; i++) store.addGoal(m.id, 'A', 'a'); // toques rápidos, sin esperar
  await cloud.whenIdle();
  assert.equal(scoreOf(db.rows('matches').find((x) => x.id === m.id), 'A'), 5);
  assert.equal(cloud.pending(), 0);
});

test('si falla la red con cambios en fila, al reintentar llega la última versión', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  const m = store.createMatch({ date: '2099-02-03' });
  store.setTeamSide(m.id, 'a', 'A');
  await cloud.whenIdle();
  db.rules.failWrites = 1;
  store.addGoal(m.id, 'A', 'a');
  store.addGoal(m.id, 'A', 'a');
  await new Promise((r) => setTimeout(r, 10));
  await cloud.retry();
  assert.equal(scoreOf(db.rows('matches').find((x) => x.id === m.id), 'A'), 2);
});

test('con una red lenta de verdad (respuestas por timer), whenIdle espera sin colgarse', async () => {
  // El Supabase falso responde por microtareas; este responde con setTimeout, como la red real.
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const slow = {
    ...db.client,
    from(t) {
      const real = db.client.from(t);
      return { ...real, upsert: (row) => ({ then: (ok, ko) => new Promise((r) => setTimeout(r, 15)).then(() => real.upsert(row)).then(ok, ko) }) };
    },
  };
  const cloud = createCloud({ createClient: () => slow, timers: noTimers });
  const session = makeSession({ cloud, confirm: async () => true, notify: () => {} });
  await session.connect(CFG);
  const m = store.createMatch({ date: '2099-02-04' });
  store.setTeamSide(m.id, 'a', 'A');
  store.addGoal(m.id, 'A', 'a');
  const done = cloud.whenIdle();
  const winner = await Promise.race([done.then(() => 'listo'), new Promise((r) => setTimeout(() => r('colgado'), 2000))]);
  assert.equal(winner, 'listo');
  assert.equal(scoreOf(db.rows('matches').find((x) => x.id === m.id), 'A'), 1);
});

test('cambios de otro celular llegan en vivo y no se reenvían (sin eco)', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  await cloud.whenIdle();
  db.log.length = 0;
  let renders = 0;
  const off = store.subscribe(() => { renders++; });
  db.remote.upsert('players', { ...player('a', 'Ana María') });
  assert.equal(store.get().players[0].name, 'Ana María');
  db.remote.upsert('players', player('z', 'Zoe'));
  assert.equal(store.get().players.length, 2);
  db.remote.delete('players', 'z');
  assert.equal(store.get().players.length, 1);
  // El mismo dato otra vez (eco de nuestro propio guardado) no redibuja.
  const before = renders;
  db.remote.upsert('players', { ...player('a', 'Ana María') });
  assert.equal(renders, before);
  await cloud.whenIdle();
  assert.deepEqual(db.log, []); // nada de lo que llegó se devolvió a la nube
  off();
});

test('borrar sin ser admin: Supabase lo rechaza, se avisa y el partido vuelve', async () => {
  const db = fakeSupabase({ players: [], matches: [{ id: 'm1', date: '2099-03-01', teamA: [], teamB: [], events: [], comments: [], closed: false }] });
  db.rules.denyDelete = true;
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  store.deleteMatch('m1');
  assert.equal(store.get().matches.length, 0); // se ve borrado al instante...
  await cloud.whenIdle();
  assert.equal(store.get().matches.length, 1); // ...pero vuelve porque la base no lo borró
  assert.match(notes.join(' '), /hace falta ser administrador/);
  assert.equal(db.rows('matches').length, 1);
});

test('sin conexión: el cambio queda en cola y se manda al reintentar', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  await cloud.whenIdle();
  db.rules.failWrites = 1;
  store.updatePlayer('a', { name: 'Ana Sin Red' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cloud.status(), 'error');
  assert.match(cloud.detail(), /Sin conexión/);
  assert.equal(cloud.pending(), 1);
  assert.equal(db.rows('players')[0].name, 'Ana'); // todavía no llegó
  await cloud.retry();
  assert.equal(cloud.status(), 'ok');
  assert.equal(cloud.pending(), 0);
  assert.equal(db.rows('players')[0].name, 'Ana Sin Red');
});

test('con la nube conectada no se puede importar, cargar ejemplos ni borrar todo', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { session } = setup(db);
  await session.connect(CFG);
  assert.equal(store.loadDemo(), false);
  assert.equal(store.clearAll(), false);
  assert.equal(store.importJson('{"players":[],"matches":[]}'), false);
  assert.equal(store.get().players.length, 1);
  assert.equal(db.rows('players').length, 1);
});

test('desconectar: deja de sincronizar y olvida la configuración', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  session.disconnect();
  assert.equal(cloud.status(), 'off');
  assert.equal(loadConfig(), null);
  db.log.length = 0;
  store.updatePlayer('a', { name: 'Solo local' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(db.log, []);
  assert.equal(store.get().players[0].name, 'Solo local'); // los datos quedan en el navegador
});

test('al abrir la app se reconecta sola si había configuración (sin preguntar)', async () => {
  store.addPlayer({ name: 'Local viejo' });
  const db = fakeSupabase({ players: [player('r', 'Remoto')], matches: [] });
  localStorage.setItem('pm2_sbconfig', JSON.stringify(CFG));
  let asked = false;
  const { session } = setup(db, { confirm: async () => { asked = true; return false; } });
  assert.equal(await session.autoConnect(), true);
  assert.equal(asked, false);
  assert.deepEqual(store.get().players.map((x) => x.name), ['Remoto']);
});

test('sin nada configurado, la app usa la nube del equipo y se conecta sola', async () => {
  const { effectiveConfig, DEFAULT_CONFIG } = await import('../src/cloud.js');
  mem.delete('pm2_sbconfig_off');
  assert.deepEqual(effectiveConfig(), DEFAULT_CONFIG);
  assert.equal(checkKey(DEFAULT_CONFIG.key), null); // la preconfigurada es una clave pública
  assert.equal(checkUrl(DEFAULT_CONFIG.url), null);
  let usedUrl = '';
  const db = fakeSupabase({ players: [player('r', 'Gonzalo')], matches: [] });
  const cloud = createCloud({ createClient: (u) => { usedUrl = u; return db.client; }, timers: noTimers });
  const session = makeSession({ cloud, confirm: async () => true, notify: () => {} });
  assert.equal(await session.autoConnect(), true);
  assert.equal(usedUrl, DEFAULT_CONFIG.url);
  assert.deepEqual(store.get().players.map((x) => x.name), ['Gonzalo']);
  session.disconnect();
});

test('si el usuario desconecta, no se reconecta sola; si pega otra nube, manda esa', async () => {
  const { effectiveConfig, DEFAULT_CONFIG, saveConfig } = await import('../src/cloud.js');
  mem.delete('pm2_sbconfig_off');
  const db = fakeSupabase({ players: [player('r', 'Gonzalo')], matches: [] });
  const { session } = setup(db);
  await session.autoConnect();
  session.disconnect();
  assert.equal(effectiveConfig(), null);
  assert.equal(await setup(db).session.autoConnect(), false);
  // Pegar otra nube (por ejemplo la real) la guarda y le gana a la preconfigurada.
  const other = { url: 'https://otra.supabase.co', key: 'sb_publishable_otra' };
  saveConfig(other);
  assert.deepEqual(effectiveConfig(), other);
  saveConfig(null);
  mem.delete('pm2_sbconfig_off');
  assert.deepEqual(effectiveConfig(), DEFAULT_CONFIG);
});

test('si se corta la conexión en vivo y vuelve sola, el indicador regresa a verde', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [] });
  let report = () => {};
  const client = { ...db.client, channel() { const ch = { on: () => ch, subscribe: (cb) => { report = cb; return ch; } }; return ch; } };
  const cloud = createCloud({ createClient: () => client, timers: noTimers });
  const session = makeSession({ cloud, confirm: async () => true, notify: () => {} });
  await session.connect(CFG);
  report('TIMED_OUT');
  assert.equal(cloud.status(), 'error');
  assert.match(cloud.detail(), /se reconecta sola/);
  report('SUBSCRIBED');
  assert.equal(cloud.status(), 'ok');
  // Mientras está caída, guardar igual funciona y avisa que lo en vivo sigue caído.
  report('CHANNEL_ERROR');
  store.updatePlayer('a', { name: 'Ana 2' });
  await cloud.whenIdle();
  assert.equal(db.rows('players')[0].name, 'Ana 2');
  assert.equal(cloud.status(), 'error');
  report('SUBSCRIBED');
  assert.equal(cloud.status(), 'ok');
  session.disconnect();
});

// Cliente falso con Supabase Auth (login con GitHub).
function withAuth(db, initialUser = null) {
  let current = initialUser;
  const subs = new Set();
  const calls = [];
  const auth = {
    getSession: async () => ({ data: { session: current ? { user: current } : null } }),
    onAuthStateChange: (fn) => { subs.add(fn); return { data: { subscription: { unsubscribe: () => subs.delete(fn) } } }; },
    signInWithOAuth: async (opts) => { calls.push(opts); return { error: null }; },
    signOut: async () => { current = null; subs.forEach((fn) => fn('SIGNED_OUT', null)); return { error: null }; },
  };
  const login = (u) => { current = u; subs.forEach((fn) => fn('SIGNED_IN', { user: u })); };
  return { client: { ...db.client, auth }, calls, login };
}

test('isAdminUser: el email del admin o la marca app_metadata (que el usuario no puede editarse)', async () => {
  const { isAdminUser } = await import('../src/cloud.js');
  assert.equal(isAdminUser({ email: 'LeandroArmonelli@gmail.com' }), true);
  assert.equal(isAdminUser({ email: 'otro@gmail.com', app_metadata: { is_admin: true } }), true);
  assert.equal(isAdminUser({ email: 'otro@gmail.com', user_metadata: { user_name: 'learmonelli', is_admin: true } }), false); // user_metadata no cuenta
  assert.equal(isAdminUser(null), false);
});

test('admin logueado: puede editar partidos finalizados; al salir vuelve a quedar bloqueado', async () => {
  const db = fakeSupabase({ players: [player('a', 'Ana')], matches: [{ id: 'c1', date: '2026-01-01', teamA: ['a'], teamB: [], events: [], assists: {}, comments: [], closed: true }] });
  const a = withAuth(db, { email: 'leandroarmonelli@gmail.com' });
  const cloud = createCloud({ createClient: () => a.client, timers: noTimers });
  const session = makeSession({ cloud, confirm: async () => true, notify: () => {} });
  await session.connect(CFG);
  assert.equal(store.isAdmin(), true);
  assert.equal(store.canAdmin(), true);
  assert.ok(store.addGoal('c1', 'A', 'a'), 'el admin carga un gol en un partido finalizado');
  assert.equal(store.reopenMatch('c1'), true);
  store.closeMatch('c1');
  await cloud.signOut();
  assert.equal(store.isAdmin(), false);
  assert.equal(store.canAdmin(), false); // con nube y sin admin: no reabre ni borra
  assert.equal(store.addGoal('c1', 'A', 'a'), null); // vuelve a estar bloqueado
  session.disconnect();
});

test('entrar con GitHub: vuelve a la misma página y, al volver, habilita el admin', async () => {
  const db = fakeSupabase({ players: [], matches: [] });
  const a = withAuth(db);
  const cloud = createCloud({ createClient: () => a.client, timers: noTimers });
  const session = makeSession({ cloud, confirm: async () => true, notify: () => {} });
  await session.connect(CFG);
  assert.equal(store.isAdmin(), false);
  await cloud.signInWithGitHub();
  assert.equal(a.calls[0].provider, 'github');
  a.login({ email: 'otro@gmail.com' });
  assert.equal(store.isAdmin(), false); // otra cuenta de GitHub no es admin
  a.login({ email: 'leandroarmonelli@gmail.com' });
  assert.equal(store.isAdmin(), true);
  session.disconnect();
  assert.equal(store.isAdmin(), false); // desconectar también saca el admin
});

test('si el proveedor GitHub no está activado en Supabase, lo explica', async () => {
  const db = fakeSupabase();
  const a = withAuth(db);
  a.client.auth.signInWithOAuth = async () => ({ error: { message: 'Unsupported provider: provider is not enabled' } });
  const cloud = createCloud({ createClient: () => a.client, timers: noTimers });
  await cloud.connect(CFG);
  await assert.rejects(cloud.signInWithGitHub(), /Authentication → Providers → GitHub/);
});

test('si faltan las tablas, avisa que hay que correr el schema.sql', async () => {
  const db = fakeSupabase();
  const broken = { ...db.client, from: () => ({ select: () => thenable(() => ({ data: null, error: { message: 'relation "public.players" does not exist' } })) }) };
  const cloud = createCloud({ createClient: () => broken, timers: noTimers });
  await assert.rejects(cloud.connect(CFG), /schema\.sql/);
  assert.equal(cloud.status(), 'error');
});

test('los partidos viejos que siguen abiertos se cierran al conectar (como el original)', async () => {
  const db = fakeSupabase({ players: [], matches: [{ id: 'old', date: '2020-01-01', teamA: [], teamB: [], events: [], comments: [], closed: false }] });
  const { cloud, session } = setup(db);
  await session.connect(CFG);
  await cloud.whenIdle();
  assert.equal(store.match('old').closed, true);
  assert.equal(db.rows('matches')[0].closed, true);
});
