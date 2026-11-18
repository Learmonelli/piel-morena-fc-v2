// Resumen del partido como imagen (1080 de ancho; 1350 de alto o más si hay muchos jugadores)
// para mandar por WhatsApp: resultado, formaciones, goles y premios.
import { scoreOf, fmtDate, AWARDS, displayName } from '../domain/domain.js';
import { TEAM } from '../team.js';

const TITLE = 'PIEL MORENA FC';
const SHARE_TITLE = 'Piel Morena FC';
const FILE_PREFIX = 'piel-morena';

const W = 1080;
const MIN_H = 1350;
const LINEUP_LINE = 46; // alto de cada renglón de las formaciones
const TEXT_LINE = 56;

// Corta un texto en renglones que entren en maxWidth (con la medida de ctx).
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Qué va en la imagen (sin dibujar): formaciones, goles y premios. Sirve también para los tests.
export function summaryContent(m, players) {
  const byId = (id) => players.find((x) => x.id === id);
  const label = (id) => { const p = byId(id); return p ? `${displayName(p)}${p.guest ? ' (inv.)' : ''}` : null; };
  const lineup = (ids) => (ids || []).map(label).filter(Boolean);
  const rival = m.mode === 'rival';
  const scorers = new Map();
  m.events.forEach((e) => { if (e.scorerId && !e.ownGoal) scorers.set(e.scorerId, (scorers.get(e.scorerId) || 0) + 1); });
  const unknown = m.events.filter((e) => !e.scorerId && !e.ownGoal && !(rival && e.side === 'B')).length;
  return {
    nameA: m.teamAName,
    nameB: rival ? m.rivalName : m.teamBName,
    lineupA: lineup(m.teamA),
    lineupB: rival ? [] : lineup(m.teamB),
    scorers: [...scorers.entries()].map(([id, n]) => `${displayName(byId(id))}${n > 1 ? ` x${n}` : ''}`),
    unknown,
    owners: m.events.filter((e) => e.ownGoal && e.scorerId).map((e) => displayName(byId(e.scorerId))),
    awards: Object.values(AWARDS).map((a) => [`${a.icon} ${a.short}`, m[a.field]]).filter(([, id]) => id).map(([l, id]) => `${l}: ${displayName(byId(id))}`),
  };
}

export function drawSummary(m, players) {
  const c = summaryContent(m, players);
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');

  // ---- Medir primero (el alto depende de cuántos jugadores y goles hay) ----
  ctx.font = '500 42px system-ui, sans-serif';
  const goalLines = c.scorers.length ? wrapLines(ctx, `⚽ ${c.scorers.join(' · ')}`, W - 160) : (c.unknown ? [] : ['Sin goles de jugadores']);
  if (c.unknown) goalLines.push(`❔ Sin autor${c.unknown > 1 ? ` x${c.unknown}` : ''}`);
  const ownLines = c.owners.length ? wrapLines(ctx, `🙈 En contra: ${c.owners.join(' · ')}`, W - 160) : [];
  const rows = Math.max(c.lineupA.length, c.lineupB.length);
  const lineupH = rows ? 70 + rows * LINEUP_LINE + 30 : 0;
  const golesH = 60 + (goalLines.length + ownLines.length) * TEXT_LINE + (ownLines.length ? 6 : 0);
  const premiosH = c.awards.length ? 40 + 60 + c.awards.length * 58 : 0;
  const H = Math.max(MIN_H, 640 + lineupH + 60 + golesH + premiosH + 140);
  canvas.width = W; canvas.height = H;
  ctx = canvas.getContext('2d'); // cambiar el tamaño reinicia el contexto

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, TEAM.color1);
  g.addColorStop(1, '#0c2814');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = TEAM.color2;
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(TITLE, W / 2, 110);
  ctx.font = '500 36px system-ui, sans-serif';
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(fmtDate(m.date), W / 2, 170);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(c.nameA, W / 4, 330);
  ctx.fillText(c.nameB, (W * 3) / 4, 330);
  ctx.font = '900 200px system-ui, sans-serif';
  ctx.fillText(`${scoreOf(m, 'A')} : ${scoreOf(m, 'B')}`, W / 2, 560);

  let y = 640;
  // ---- Formaciones: cada equipo en su columna, debajo de su nombre ----
  if (rows) {
    ctx.fillStyle = TEAM.color2;
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('FORMACIONES', W / 2, y + 30);
    ctx.font = '500 34px system-ui, sans-serif';
    ctx.fillStyle = '#ffffffdd';
    const colW = W / 2 - 60;
    const fit = (text) => { let t = text; while (t.length > 3 && ctx.measureText(t).width > colW) t = `${t.slice(0, -2)}…`; return t; };
    const startY = y + 70 + 34;
    c.lineupA.forEach((n, i) => ctx.fillText(fit(n), W / 4, startY + i * LINEUP_LINE));
    c.lineupB.forEach((n, i) => ctx.fillText(fit(n), (W * 3) / 4, startY + i * LINEUP_LINE));
    // línea que separa los dos equipos
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, y + 70); ctx.lineTo(W / 2, y + 70 + rows * LINEUP_LINE); ctx.stroke();
    y += lineupH;
  }

  // ---- Goles ----
  y += 60;
  ctx.fillStyle = TEAM.color2;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText('GOLES', W / 2, y); y += 60;
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 42px system-ui, sans-serif';
  for (const l of goalLines) { ctx.fillText(l, W / 2, y); y += TEXT_LINE; }
  if (ownLines.length) {
    ctx.fillStyle = '#ff9aa8';
    y += 6;
    for (const l of ownLines) { ctx.fillText(l, W / 2, y); y += TEXT_LINE; }
    ctx.fillStyle = '#ffffff';
  }

  // ---- Premios ----
  if (c.awards.length) {
    y += 40;
    ctx.fillStyle = TEAM.color2;
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('PREMIOS', W / 2, y); y += 60;
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 42px system-ui, sans-serif';
    for (const a of c.awards) { ctx.fillText(a, W / 2, y); y += 58; }
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
  const file = new File([blob], `${FILE_PREFIX}-${m.date || 'partido'}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: SHARE_TITLE }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
