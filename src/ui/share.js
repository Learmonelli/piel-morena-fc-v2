// Resumen del partido como imagen (1080x1350) para mandar por WhatsApp.
import { scoreOf, fmtDate, AWARDS, displayName } from '../domain/domain.js';
import { TEAM } from '../team.js';

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, y); line = w; y += lineHeight; } else line = test;
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

export function drawSummary(m, players) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const name = (id) => { const p = players.find((x) => x.id === id); return displayName(p); };

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, TEAM.color1);
  g.addColorStop(1, '#0c2814');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = TEAM.color2;
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText('PIEL MORENA FC', W / 2, 110);
  ctx.font = '500 36px system-ui, sans-serif';
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(fmtDate(m.date), W / 2, 170);

  const a = scoreOf(m, 'A');
  const b = scoreOf(m, 'B');
  const nameB = m.mode === 'rival' ? m.rivalName : m.teamBName;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(m.teamAName, W / 4, 330);
  ctx.fillText(nameB, (W * 3) / 4, 330);
  ctx.font = '900 200px system-ui, sans-serif';
  ctx.fillText(`${a} : ${b}`, W / 2, 560);

  // Goleadores
  const scorers = new Map();
  m.events.forEach((e) => { if (e.scorerId && !e.ownGoal) scorers.set(e.scorerId, (scorers.get(e.scorerId) || 0) + 1); });
  const owners = m.events.filter((e) => e.ownGoal && e.scorerId).map((e) => name(e.scorerId));
  let y = 700;
  ctx.fillStyle = TEAM.color2;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText('GOLES', W / 2, y); y += 60;
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 42px system-ui, sans-serif';
  if (scorers.size) {
    const text = [...scorers.entries()].map(([id, n]) => `${name(id)}${n > 1 ? ` x${n}` : ''}`).join(' · ');
    y = wrap(ctx, `⚽ ${text}`, W / 2, y, W - 160, 56);
  } else { ctx.fillText('Sin goles de jugadores', W / 2, y); y += 56; }
  if (owners.length) {
    ctx.fillStyle = '#ff9aa8';
    y = wrap(ctx, `🙈 En contra: ${owners.join(' · ')}`, W / 2, y + 6, W - 160, 56);
    ctx.fillStyle = '#ffffff';
  }

  // Premios
  const awards = Object.values(AWARDS).map((a) => [`${a.icon} ${a.short}`, m[a.field]]).filter(([, id]) => id);
  if (awards.length) {
    y += 40;
    ctx.fillStyle = TEAM.color2;
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('PREMIOS', W / 2, y); y += 60;
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 42px system-ui, sans-serif';
    for (const [label, id] of awards) { ctx.fillText(`${label}: ${name(id)}`, W / 2, y); y += 58; }
  }

  ctx.fillStyle = '#ffffff99';
  ctx.font = '500 30px system-ui, sans-serif';
  ctx.fillText('Estadísticas del equipo', W / 2, H - 60);
  return canvas;
}

// Comparte con el menú del sistema si se puede; si no, descarga la imagen.
export async function shareSummary(m, players) {
  const canvas = drawSummary(m, players);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return 'error';
  const file = new File([blob], `piel-morena-${m.date || 'partido'}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Piel Morena FC' }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
