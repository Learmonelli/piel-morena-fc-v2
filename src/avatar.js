// Avatares de jugadores: el pixel art de la app original (pmAvatar.js), igual en ambos modos.
// view = 'body' (cuerpo entero, en listas) o 'bust' (carnet de frente, en rankings).
import { playerAvatar } from './pmAvatar.js';

export function avatarEl(player, _team, size = 40, view = 'body') {
  return playerAvatar(player, size, view);
}
