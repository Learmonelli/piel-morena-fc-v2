// Une la conexión con Supabase (cloud.js) con el estado de la app (store.js) y la interfaz.
import { createClient } from '@supabase/supabase-js';
import {
  createCloud, effectiveConfig, saveConfig, normalizeUrl, cleanKey, isAdminUser,
} from './cloud.js';
import { store } from './store.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/sheet.js';

export function makeSession({ cloud = createCloud({ createClient }), confirm = confirmDialog, notify = toast } = {}) {
  const handlers = {
    onRemote: (table, row, id) => store.applyRemote(table, row, id),
    onReject: (_table, _id, msg) => notify(msg, { ms: 8000 }),
  };
  // Al entrar o salir con GitHub se actualiza si se muestran las opciones de administrador.
  cloud.onAuth((user) => store.setAdmin(isAdminUser(user)));

  // Conecta y decide qué hacer con los datos de este navegador. Devuelve true si quedó conectada.
  async function connect(cfg, { silent = false } = {}) {
    const remote = await cloud.connect(cfg, handlers);
    const local = store.get();
    const remoteEmpty = !remote.players.length && !remote.matches.length;
    const localEmpty = !local.players.length && !local.matches.length;
    let uploadLocal = false;

    if (!silent) {
      if (remoteEmpty && !localEmpty) {
        uploadLocal = await confirm(
          `La nube está vacía. ¿Subir los datos de este navegador (${local.players.length} jugadores, ${local.matches.length} partidos)?`,
          { okLabel: 'Subir mis datos' });
      } else if (!remoteEmpty && !localEmpty) {
        const ok = await confirm(
          `En la nube hay ${remote.players.length} jugadores y ${remote.matches.length} partidos. `
          + 'Los datos de este navegador se reemplazan por los de la nube. Si querés conservarlos, exportá una copia antes.',
          { okLabel: 'Usar los de la nube', danger: true });
        if (!ok) { cloud.disconnect(); return false; }
      }
    }
    saveConfig({ url: normalizeUrl(cfg.url), key: cleanKey(cfg.key) });
    store.attachSync(cloud.adapter, remote, { uploadLocal });
    store.setAdmin(isAdminUser(cloud.user()));
    cloud.listen();
    return true;
  }

  return {
    cloud,
    connect,
    // Al abrir la app: si ya había una conexión guardada, se reconecta sola (la nube manda).
    // Si no hay nada guardado, usa la nube del equipo (DEFAULT_CONFIG).
    async autoConnect() {
      const cfg = effectiveConfig();
      if (!cfg) return false;
      try { return await connect(cfg, { silent: true }); } catch (e) {
        notify(`No se pudo conectar con la nube: ${e.message} Se usan los datos de este navegador.`, { ms: 8000 });
        return false;
      }
    },
    disconnect() {
      cloud.disconnect();
      store.detachSync();
      saveConfig(null);
    },
  };
}
