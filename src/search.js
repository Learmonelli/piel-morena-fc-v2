// Búsqueda de jugadores: sin distinguir mayúsculas ni acentos, y cada palabra tiene que aparecer.
// "tuti 10" encuentra al jugador apodado Tuti con camiseta 10. También busca por posición:
// el código (MCO), el nombre (mediocentro ofensivo) o la línea (mediocampo).
import { playerPositions, POS_NAME, positionGroup } from './domain/domain.js';

export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function playerText(p) {
  const pos = playerPositions(p);
  return norm([
    p.name, p.nickname, p.number, ...pos, ...pos.map((c) => POS_NAME[c]), ...pos.map(positionGroup),
    p.guest ? 'invitado' : '',
  ].filter(Boolean).join(' '));
}

export function playerMatches(p, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = playerText(p);
  return tokens.every((t) => text.includes(t));
}

export const filterPlayers = (players, query) => players.filter((p) => playerMatches(p, query));
