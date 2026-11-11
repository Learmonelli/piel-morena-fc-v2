// Conexión con Supabase (Postgres + Realtime). Usa las MISMAS tablas que la app original:
// players(id, data jsonb) y matches(id, data jsonb), así las dos apps comparten los datos.
//
// - Nunca se conecta sola a una base: la URL y la clave las pega el usuario (💾 → Nube).
// - Solo acepta la clave pública (anon / publishable). La service_role / secret se rechaza.
// - Los cambios se mandan con una cola: si falla la red, se reintentan y no se pierden.
// - Si la base rechaza un cambio (por ejemplo, borrar sin ser admin), se avisa y se vuelve a leer
//   esa fila para que la pantalla muestre lo que de verdad quedó guardado.

const CFG_KEY = 'pm2_sbconfig';
const OFF_KEY = 'pm2_sbconfig_off'; // el usuario desconectó a propósito: no reconectar sola
export const TABLES = ['players', 'matches'];

// Nube del equipo, preconfigurada para que cualquier celular o compu vea los datos sin pegar nada
// (igual que DEFAULT_SB_CONFIG en la app original). La clave publishable es pública por diseño:
// la seguridad la dan las políticas RLS del schema.sql, no esconder esta clave.
export const DEFAULT_CONFIG = {
  url: 'https://sylhlksbxnjwswgjohbp.supabase.co',
  key: 'sb_publishable_BbY4PgfsKHP7K8J4Zz7UIA_Gjbm8VNw',
};

// Administrador: el mismo criterio que public.is_admin() en supabase/schema.sql. Esto solo decide
// qué botones se muestran; quien de verdad permite o rechaza es la base (RLS y trigger).
export const ADMIN_EMAIL = 'leandroarmonelli@gmail.com';
export const isAdminUser = (user) => !!user && (
  String(user.email || '').toLowerCase() === ADMIN_EMAIL || user.app_metadata?.is_admin === true);

// ---- Configuración ----
// La que guardó este navegador (pegada a mano), o null.
export function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    return c && typeof c.url === 'string' && typeof c.key === 'string' ? c : null;
  } catch { return null; }
}
// La que se usa: la guardada; si no hay, la del equipo; null si el usuario desconectó.
export function effectiveConfig() {
  const saved = loadConfig();
  if (saved) return saved;
  try { if (localStorage.getItem(OFF_KEY) === '1') return null; } catch { /* sin almacenamiento */ }
  return DEFAULT_CONFIG;
}
export function saveConfig(cfg) {
  try {
    if (cfg) {
      localStorage.setItem(CFG_KEY, JSON.stringify({ url: cfg.url, key: cfg.key }));
      localStorage.removeItem(OFF_KEY);
    } else {
      localStorage.removeItem(CFG_KEY);
      localStorage.setItem(OFF_KEY, '1');
    }
  } catch { /* sin almacenamiento */ }
}

// Deja solo la dirección del proyecto: si se pega la URL de la API (".../rest/v1/") u otra ruta,
// se quita, porque supabase-js necesita "https://xxxx.supabase.co".
export function normalizeUrl(url) {
  try { return new URL(String(url).trim()).origin; } catch { return String(url ?? '').trim(); }
}

// Devuelve un mensaje de error, o null si la URL sirve.
export function checkUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return 'La URL no es válida. Copiala de Project Settings → API (Project URL).'; }
  if (u.protocol !== 'https:') return 'La URL tiene que empezar con https://';
  return null;
}

function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json).role ?? null;
  } catch { return null; }
}

// Quita espacios e invisibles que suelen colarse al copiar (espacio duro, de ancho cero, saltos).
export const cleanKey = (key) => String(key ?? '').replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff]/g, '');

// Devuelve un mensaje de error, o null si la clave es pública.
export function checkKey(key) {
  const k = cleanKey(key);
  if (!k) return 'Pegá la clave pública (anon / publishable).';
  if (/^https?:\/\//i.test(k)) {
    return 'En "Clave pública" pegaste una URL. Ahí va la Publishable key (empieza con sb_publishable_…), de Project Settings → API Keys.';
  }
  // Las claves solo tienen letras, números y - _ . (un "…" o una comilla curva rompen la conexión).
  if (/[^A-Za-z0-9._-]/.test(k)) {
    const odd = [...k].find((ch) => !/[A-Za-z0-9._-]/.test(ch));
    return `La clave tiene un carácter que no va ("${odd}"). Copiala completa de nuevo desde Supabase → Project Settings → API Keys.`;
  }
  if (/^sb_secret_/i.test(k) || jwtRole(k) === 'service_role') {
    return 'Esa es la clave SECRETA (service_role). Nunca va en la app: usá la clave pública (anon / publishable).';
  }
  return null;
}

const friendly = (error) => {
  const msg = String(error?.message || error || 'Error desconocido');
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión con Supabase.';
  if (/relation .* does not exist|does not exist/i.test(msg)) return 'No están las tablas: corré el schema.sql en el SQL Editor de Supabase.';
  if (/Invalid API key|JWT|apikey/i.test(msg)) return 'La clave no es válida para ese proyecto.';
  if (/ISO-8859-1|Headers/i.test(msg)) return 'La clave tiene caracteres raros. Copiala completa de nuevo desde Supabase.';
  return msg;
};
const isRejection = (error) => ['42501', 'PGRST301', '401', '403'].includes(String(error?.code || error?.status || ''))
  || /row-level security|permission denied|finalizado|administrador/i.test(String(error?.message || ''));

// ---- Conexión ----
// deps.createClient permite inyectar un cliente falso en los tests.
export function createCloud({ createClient, timers = globalThis } = {}) {
  let client = null;
  let channel = null;
  let status = 'off';
  let detail = '';
  const statusListeners = new Set();
  const queue = new Map(); // `${tabla}:${id}` -> { table, op, row | id }
  let flushing = false;
  let running = null; // promesa del envío en curso
  let liveDown = false; // la conexión en vivo (Realtime) está caída
  let user = null; // usuario logueado con GitHub (solo para el admin)
  let current = null; // { url, key } de la conexión activa
  const authListeners = new Set();
  let authSub = null;
  let retryTimer = null;
  let retryDelay = 2000;
  let onRemote = () => {};
  let onReject = () => {};

  const setStatus = (s, d = '') => {
    status = s; detail = d;
    statusListeners.forEach((fn) => fn(status, detail));
  };

  async function fetchAll() {
    const out = {};
    for (const t of TABLES) {
      const { data, error } = await client.from(t).select('id,data');
      if (error) throw error;
      out[t] = (data || []).map((r) => ({ ...(r.data || {}), id: r.id }));
    }
    return { players: out.players, matches: out.matches };
  }

  async function refetchRow(table, id) {
    const { data, error } = await client.from(table).select('id,data').eq('id', id);
    if (error) return;
    const row = (data || [])[0];
    onRemote(table, row ? { ...(row.data || {}), id: row.id } : null, id);
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = timers.setTimeout(() => { retryTimer = null; flush(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  // Si ya hay un envío en curso, se devuelve ESE envío (antes devolvía una promesa ya resuelta, y
  // quien esperaba en bucle nunca le dejaba lugar a la red: se colgaba con un Supabase real).
  function flush() {
    if (!client) return Promise.resolve();
    if (running) return running;
    running = runQueue().finally(() => { running = null; });
    return running;
  }

  async function runQueue() {
    flushing = true;
    try {
      while (queue.size) {
        const [key, job] = queue.entries().next().value;
        // Se saca de la cola ANTES de enviar: si mientras tanto llega un cambio más nuevo de la misma
        // fila, queda en la cola y se manda después (antes se perdía al borrar la clave al terminar).
        queue.delete(key);
        setStatus('saving', `${queue.size + 1} cambio(s) por guardar`);
        let error = null;
        let rejected = false;
        if (job.op === 'upsert') {
          ({ error } = await client.from(job.table).upsert({ id: job.row.id, data: job.row }));
        } else {
          const res = await client.from(job.table).delete().eq('id', job.id).select('id');
          error = res.error;
          // Con RLS, un borrado no permitido no da error: simplemente no borra ninguna fila.
          if (!error && Array.isArray(res.data) && res.data.length === 0) rejected = true;
        }
        if (error && !isRejection(error)) {
          // Problema de red u otro: vuelve a la cola (salvo que ya haya una versión más nueva) y se
          // reintenta más tarde. Se reinserta adelante para respetar el orden.
          if (!queue.has(key)) {
            const rest = [...queue.entries()];
            queue.clear();
            queue.set(key, job);
            rest.forEach(([k, v]) => queue.set(k, v));
          }
          setStatus('error', friendly(error));
          scheduleRetry();
          return;
        }
        if (error || rejected) {
          const id = job.op === 'upsert' ? job.row.id : job.id;
          onReject(job.table, id, job.op === 'delete'
            ? 'Supabase no dejó borrar: hace falta ser administrador.'
            : `Supabase rechazó el cambio: ${friendly(error)}`);
          await refetchRow(job.table, id);
        }
      }
      retryDelay = 2000;
      if (liveDown) setStatus('error', 'Se cortó la actualización en vivo; se reconecta sola.');
      else setStatus('ok');
    } finally {
      flushing = false;
    }
  }

  const enqueue = (table, job) => {
    const id = job.op === 'upsert' ? job.row.id : job.id;
    queue.set(`${table}:${id}`, { table, ...job }); // el último cambio de una fila reemplaza al anterior
    flush();
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', () => { if (queue.size) flush(); });
  }

  return {
    status: () => status,
    detail: () => detail,
    pending: () => queue.size,
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    host: () => { try { return new URL(effectiveConfig()?.url).host; } catch { return ''; } },

    // Conecta y trae todos los datos. No toca el estado de la app: eso lo decide quien llama.
    async connect(cfg, handlers = {}) {
      const urlErr = checkUrl(cfg.url);
      const keyErr = checkKey(cfg.key);
      if (urlErr || keyErr) throw new Error(urlErr || keyErr);
      onRemote = handlers.onRemote || onRemote;
      onReject = handlers.onReject || onReject;
      current = { url: cfg.url, key: cfg.key };
      setStatus('connecting');
      try {
        // La sesión del admin se guarda en este navegador. detectSessionInUrl completa el regreso
        // desde GitHub (el ?code=... que agrega Supabase al volver).
        client = createClient(normalizeUrl(cfg.url), cleanKey(cfg.key), {
          auth: { persistSession: true, storageKey: 'pm2-auth', detectSessionInUrl: true, flowType: 'pkce' },
        });
        if (client.auth) {
          const { data: s } = await client.auth.getSession();
          user = s?.session?.user ?? null;
          authSub = client.auth.onAuthStateChange((_evt, session) => {
            user = session?.user ?? null;
            authListeners.forEach((fn) => fn(user));
          })?.data?.subscription ?? null;
          // Al volver de GitHub se limpia el ?code=... de la barra de direcciones.
          if (typeof location !== 'undefined' && /[?&]code=/.test(location.search) && typeof history !== 'undefined') {
            history.replaceState(null, '', location.pathname + location.hash);
          }
        }
        const data = await fetchAll();
        return data;
      } catch (e) {
        client = null;
        setStatus('error', friendly(e));
        throw new Error(friendly(e));
      }
    },

    // Se suscribe a los cambios de otros dispositivos (Realtime).
    listen() {
      if (!client) return;
      channel = client.channel('pm2');
      for (const t of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
          if (payload.eventType === 'DELETE') onRemote(t, null, payload.old?.id);
          else if (payload.new?.id) onRemote(t, { ...(payload.new.data || {}), id: payload.new.id }, payload.new.id);
        });
      }
      // Supabase reintenta solo la conexión en vivo. Si se corta se avisa, y cuando vuelve
      // (SUBSCRIBED) el indicador regresa a verde, en vez de quedar en rojo para siempre.
      channel.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          liveDown = false;
          if (status === 'error' && !queue.size) setStatus('ok');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          liveDown = true;
          if (status !== 'saving') setStatus('error', 'Se cortó la actualización en vivo; se reconecta sola.');
        }
      });
      if (status !== 'error') setStatus('ok');
    },

    // Adaptador que usa el store para mandar cambios.
    adapter: {
      upsert: (table, row) => enqueue(table, { op: 'upsert', row }),
      remove: (table, id) => enqueue(table, { op: 'delete', id }),
    },

    // ---- Administrador (GitHub) ----
    user: () => user,
    onAuth(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
    async signInWithGitHub() {
      if (!client?.auth) throw new Error('Primero conectá la nube.');
      // Antes de salir hacia GitHub se consulta si el proveedor está activado: si no, Supabase
      // deja al usuario en una página de error en JSON ("provider is not enabled").
      if (current && typeof fetch === 'function') {
        try {
          const res = await fetch(`${normalizeUrl(current.url)}/auth/v1/settings`, { headers: { apikey: cleanKey(current.key) } });
          const settings = res.ok ? await res.json() : null;
          if (settings && settings.external && settings.external.github === false) {
            throw new Error('El login con GitHub todavía no está activado en este proyecto de Supabase '
              + '(Authentication → Sign In / Providers → GitHub).');
          }
        } catch (e) {
          if (/todavía no está activado/.test(e.message)) throw e; // si falla la consulta, se intenta igual
        }
      }
      const redirectTo = typeof location !== 'undefined' ? location.origin + location.pathname : undefined;
      const { error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
      if (error) throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message)
        ? 'El login con GitHub no está activado en este proyecto de Supabase (Authentication → Providers → GitHub).'
        : error.message);
    },
    // Link mágico por email: no requiere ningún proveedor externo.
    async signInWithEmail(email) {
      if (!client?.auth) throw new Error('Primero conectá la nube.');
      const addr = String(email || '').trim();
      if (!addr) throw new Error('Escribí tu email.');
      const emailRedirectTo = typeof location !== 'undefined' ? location.origin + location.pathname : undefined;
      const { error } = await client.auth.signInWithOtp({ email: addr, options: { emailRedirectTo } });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      if (client?.auth) await client.auth.signOut();
      user = null;
      authListeners.forEach((fn) => fn(null));
    },

    retry: () => { retryDelay = 2000; return flush(); },
    // Espera a que se vacíe la cola (o a que quede en error esperando reintento).
    whenIdle: async () => {
      while (running || queue.size) {
        await (running || flush());
        if (status === 'error') return;
      }
    },

    disconnect() {
      if (channel && client) client.removeChannel(channel);
      authSub?.unsubscribe?.();
      authSub = null;
      if (user) { user = null; authListeners.forEach((fn) => fn(null)); }
      channel = null; client = null; queue.clear();
      if (retryTimer) { timers.clearTimeout(retryTimer); retryTimer = null; }
      setStatus('off');
    },
  };
}
