// Avatar pixel art de Piel Morena FC, portado de la app original (index.html, avatarSVG).
// Mismas paletas, mismas opciones y mismo dibujo: un jugador se ve igual en las dos apps.
// Diferencia: arma el SVG con nodos DOM (sin innerHTML) y agrupa píxeles contiguos del
// mismo color en un solo rectángulo (visualmente idéntico, menos nodos).

export const AV_SKIN = ['#f1c9a5', '#e8b98f', '#dda96f', '#c68642', '#a9713f', '#8d5524', '#7a4a22', '#6b3d1c', '#57301a', '#3d2110'];
export const AV_HAIR = ['#161616', '#2e2119', '#4a2f1b', '#8a5a2b', '#d9a441', '#e8c874', '#b5481f', '#7a2f18', '#cfcfcf', '#8f8f8f'];
export const AV_SHIRT = ['#7d2233', '#f2b705', '#6a2c91', '#8bc34a', '#f3ead6', '#b5703c', '#1f9bd1', '#e5484d', '#1b3a8c', '#6fc0e8', '#111111', '#ffffff'];
export const AV_STYLE = [['Corto', 0], ['Medio', 1], ['Largo', 2], ['Pelado', 3], ['Rulos', 4], ['Cresta', 5], ['Colita', 6]];
export const AV_EYES = [['Normal', 0], ['Guiño', 1], ['Sonrisa', 2], ['Enojado', 3], ['Sorpresa', 4]];
export const AV_EYESIZE = [['Chicos', 0], ['Medianos', 1], ['Grandes', 2], ['Redondos', 3], ['Achinados', 4], ['Altos', 5]];
export const AV_FACIAL = [['Nada', 0], ['Barba', 1], ['Bigote', 2], ['Candado', 3], ['Completa', 4]];
export const AV_HAT = [['Nada', 0], ['Gorra', 1], ['Vincha', 2], ['Gorro', 3]];
export const AV_GLASSES = [['Nada', 0], ['Redondos', 1], ['Cuadrados', 2], ['De sol', 3], ['Parche', 4]];
export const AV_JERSEY = [['Lisa', 0], ['Rayas', 1], ['Banda', 2], ['Franja', 3], ['Mitades', 4], ['Mangas', 5]];

// Cantidad de opciones por campo de la cara (para validar datos guardados o importados).
export const FACE_LIMITS = {
  skin: AV_SKIN.length, hair: AV_HAIR.length, shirt: AV_SHIRT.length, shirt2: AV_SHIRT.length,
  hatColor: AV_SHIRT.length, style: AV_STYLE.length, eyes: AV_EYES.length, eyeSize: AV_EYESIZE.length,
  facial: AV_FACIAL.length, hat: AV_HAT.length, glasses: AV_GLASSES.length, jersey: AV_JERSEY.length,
};

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// rnd opcional para obtener caras repetibles (datos de ejemplo, tests).
export function randomFace(rnd = Math.random) {
  const n = (len) => Math.floor(rnd() * len);
  return {
    skin: n(AV_SKIN.length), hair: n(AV_HAIR.length), shirt: n(AV_SHIRT.length), shirt2: n(AV_SHIRT.length),
    style: n(AV_STYLE.length), eyes: n(AV_EYES.length), eyeSize: 1 + n(AV_EYESIZE.length - 1),
    facial: rnd() < 0.4 ? 1 + n(4) : 0, hat: rnd() < 0.25 ? 1 + n(3) : 0, hatColor: n(AV_SHIRT.length),
    glasses: rnd() < 0.18 ? 1 + n(3) : 0, jersey: n(AV_JERSEY.length),
  };
}

// Cara completa tal como se dibuja: los campos que faltan salen del hash de la semilla,
// igual que en la app original. Sirve para abrir el editor con la cara que ya se ve.
export function resolveFace(seed, face) {
  const h = hashStr(seed);
  const f = face || {};
  const pick = (v, k, len) => (v != null ? v : (h >>> k)) % len;
  return {
    skin: pick(f.skin, 3, AV_SKIN.length),
    hair: pick(f.hair, 7, AV_HAIR.length),
    shirt: pick(f.shirt, 11, AV_SHIRT.length),
    shirt2: f.shirt2 != null ? f.shirt2 % AV_SHIRT.length
      : f.shirt != null ? (f.shirt + 5) % AV_SHIRT.length : (h >>> 13) % AV_SHIRT.length,
    hatColor: pick(f.hatColor, 19, AV_SHIRT.length),
    style: f.style != null ? f.style : (h >>> 15) % AV_STYLE.length,
    eyes: f.eyes != null ? f.eyes : 0,
    eyeSize: f.eyeSize != null ? f.eyeSize : 2,
    facial: f.facial != null ? f.facial : (f.beard ? 1 : 0),
    hat: f.hat != null ? f.hat : 0,
    glasses: f.glasses != null ? f.glasses : 0,
    jersey: f.jersey != null ? f.jersey : 0,
  };
}

// Deja solo campos conocidos con enteros válidos. Devuelve null si no queda nada.
export function sanitizeFace(face) {
  if (!face || typeof face !== 'object') return null;
  const out = {};
  for (const [k, len] of Object.entries(FACE_LIMITS)) {
    const v = face[k];
    if (Number.isInteger(v) && v >= 0 && v < len) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Devuelve la grilla de 24x32 con códigos de color (lógica pura, sin DOM).
export function avatarGrid(seed, face, view) {
  const f = resolveFace(seed, face);
  const W = 24;
  const H = 32;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const { style, eyes, eyeSize, facial, hat, glasses, jersey } = f;
  const turn = view !== 'bust'; // cuerpo: leve diagonal; carnet: de frente
  const fx = turn ? 1 : 0; // corrimiento 3/4 de la cara

  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H && c !== undefined) g[y][x] = c; };
  const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };

  // ---------- cabeza ----------
  const HCX = 12; const HCY = 8.4; const HRX = 7.3; const HRY = 7.7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inEll(x, y, HCX, HCY, HRX, HRY)) put(x, y, x >= 16 ? 'd' : (x <= 8 ? 'L' : 'S'));
  }
  for (let x = 9; x <= 15; x++) if (inEll(x, 15, HCX, HCY, HRX, HRY)) put(x, 15, 'd');
  if (turn) { put(4, 11, 'd'); put(4, 12, 'S'); put(3, 12, 'd'); }

  // ---------- pelo ----------
  // (En el original, los cortes 0, 1 y 6 tenían además un bucle de patillas que nunca dibujaba nada;
  // se omite porque el resultado es idéntico.)
  const cap = (yLim, exp = 0.5) => {
    for (let y = 0; y <= yLim; y++) for (let x = 0; x < W; x++) if (inEll(x, y, HCX, HCY, HRX + exp, HRY + exp)) put(x, y, 'H');
  };
  if (style === 0) cap(4);
  else if (style === 1) cap(5.5);
  else if (style === 2) {
    cap(6.5);
    for (let y = 4; y <= 17; y++) { put(3, y, 'H'); put(20, y, 'H'); }
    for (let y = 6; y <= 11; y++) { put(2, y, 'H'); put(21, y, 'H'); }
  } else if (style === 4) {
    const curl = (cx, cy, r) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, 'H');
    };
    curl(6, 8, 3.0); curl(9, 4.5, 3.0); curl(13, 4.0, 3.0); curl(16, 4.5, 3.0); curl(19, 8, 3.0);
    curl(4, 12, 2.2); curl(21, 12, 2.2);
  } else if (style === 5) {
    cap(2.0);
    for (let y = 0; y <= 7; y++) { put(11, y, 'H'); put(12, y, 'H'); put(13, y, 'H'); }
  } else if (style === 6) {
    cap(4);
    for (let y = 7; y <= 13; y++) put(20, y, 'H'); // colita pegada al costado
    put(20, 6, 'H'); put(20, 14, 'l');
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] === 'H' && (y === 0 || g[y - 1][x] === '.')) g[y][x] = 'l';
  }

  // ---------- rasgos ----------
  const brow = 8; const eye = 10; const nose = 12; const mouth = 14;
  put(8 + fx, brow, 'B'); put(9 + fx, brow, 'B'); put(14 + fx, brow, 'B'); put(15 + fx, brow, 'B');
  if (eyes === 3) { put(8 + fx, brow, 'd'); put(9 + fx, brow, 'd'); put(14 + fx, brow, 'd'); put(15 + fx, brow, 'd'); }
  const Li = 10 + fx; const Ri = 14 + fx;
  const drawEye = (inner, dir) => {
    const q = (dx, dy, c) => put(inner + dir * dx, eye + dy, c);
    if (eyeSize === 0) q(0, 0, 'P');
    else if (eyeSize === 1) { q(0, 0, 'E'); q(1, 0, 'P'); }
    else if (eyeSize === 2) { q(0, 0, 'P'); q(1, 0, 'P'); q(0, 1, 'P'); q(1, 1, 'P'); }
    else if (eyeSize === 3) { q(0, 0, 'E'); q(1, 0, 'P'); q(0, 1, 'P'); q(1, 1, 'P'); }
    else if (eyeSize === 4) { q(0, 0, 'P'); q(1, 0, 'P'); }
    else { q(0, 0, 'E'); q(1, 0, 'E'); q(0, 1, 'P'); q(1, 1, 'P'); }
  };
  drawEye(Li, -1); drawEye(Ri, 1);
  if (eyes === 1) { // guiño: cierra el ojo derecho
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) put(Ri - dx, eye + dy, 'S');
    put(Ri, eye, 'M'); put(Ri - 1, eye, 'M');
  }
  put(11 + fx, nose, 'd'); put(12 + fx, nose, 'd'); put(12 + fx, nose + 1, 'd');
  if (eyes === 2) { put(10 + fx, mouth, 'M'); put(11 + fx, mouth, 'Z'); put(12 + fx, mouth, 'Z'); put(13 + fx, mouth, 'M'); }
  else if (eyes === 4) { put(11 + fx, mouth, 'Z'); put(12 + fx, mouth, 'Z'); }
  else { put(10 + fx, mouth, 'M'); put(11 + fx, mouth, 'M'); put(12 + fx, mouth, 'M'); put(13 + fx, mouth, 'M'); }

  // ---------- barba / bigote ----------
  if (facial === 1 || facial === 4) {
    for (let x = 8; x <= 15; x++) if (g[15][x] !== '.') g[15][x] = 'h';
    put(8 + fx, 14, 'h'); put(15 + fx, 14, 'h');
  }
  if (facial === 2 || facial === 4) { put(10 + fx, 13, 'h'); put(11 + fx, 13, 'h'); put(12 + fx, 13, 'h'); put(13 + fx, 13, 'h'); }
  if (facial === 3) { put(11 + fx, 15, 'h'); put(12 + fx, 15, 'h'); }

  // ---------- gorra / vincha / gorro ----------
  const capFill = (y0, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (inEll(x, y, HCX, HCY, HRX + 0.3, HRY + 0.3)) put(x, y, c);
  };
  if (hat === 1) {
    capFill(0, 4, 'W');
    for (let x = 4; x <= 19; x++) put(x, 5, 'w');
    put(3, 5, 'w'); put(20, 5, 'w'); put(11, 0, 'w'); put(12, 0, 'w');
  } else if (hat === 2) {
    for (let x = 0; x < W; x++) { if (g[6][x] !== '.') put(x, 6, 'W'); if (g[7][x] !== '.') put(x, 7, 'w'); }
  } else if (hat === 3) {
    capFill(0, 6, 'W');
    for (let x = 0; x < W; x++) { if (g[7][x] !== '.') put(x, 7, 'w'); if (g[8][x] !== '.') put(x, 8, 'w'); }
    put(11, 0, 'w'); put(12, 0, 'w');
  }

  // ---------- anteojos ----------
  const lens = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y++) { put(x0 + fx, y, 'g'); put(x1 + fx, y, 'g'); }
    for (let x = x0; x <= x1; x++) { put(x + fx, y0, 'g'); put(x + fx, y1, 'g'); }
  };
  if (glasses === 1) {
    lens(8, 11, 9, 12); lens(13, 16, 9, 12); put(12 + fx, 10, 'g');
    for (const x of [6, 7, 17, 18]) put(x + fx, 10, 'g');
  } else if (glasses === 2) {
    lens(7, 11, 9, 12); lens(13, 17, 9, 12); put(12 + fx, 10, 'g');
    for (const x of [5, 6, 18, 19]) put(x + fx, 10, 'g');
  } else if (glasses === 3) {
    lens(8, 11, 9, 12); lens(13, 16, 9, 12); put(12 + fx, 10, 'g');
    for (const x of [6, 7, 17, 18]) put(x + fx, 10, 'g');
    for (let x = 9; x <= 10; x++) for (let y = 10; y <= 11; y++) put(x + fx, y, 'Z');
    for (let x = 14; x <= 15; x++) for (let y = 10; y <= 11; y++) put(x + fx, y, 'Z');
  } else if (glasses === 4) {
    for (let x = 8; x <= 10; x++) for (let y = 9; y <= 11; y++) put(x + fx, y, 'g');
    for (let i = 0; i < 10; i++) put((10 + i) + fx, 11 - Math.floor(i * 0.6), 'g');
    put(7 + fx, 11, 'g'); put(6 + fx, 12, 'g');
  }

  // ---------- cuello, torso, mangas, brazos ----------
  rect(10, 16, 13, 17, 'd');
  const pc = (x, y) => {
    if (jersey === 1) return (x % 3 === 0) ? 'K' : 'C';
    if (jersey === 2) return (Math.abs((x - 12) - (y - 18) * 0.8) < 1.6) ? 'K' : 'C';
    if (jersey === 3) return (y === 20) ? 'K' : 'C';
    if (jersey === 4) return (x <= 11) ? 'C' : 'K';
    return 'C';
  };
  for (let y = 18; y <= 24; y++) {
    const x0 = 8 + (y >= 23 ? 1 : 0);
    const x1 = 16 - (y >= 23 ? 1 : 0);
    for (let x = x0; x <= x1; x++) put(x, y, pc(x, y));
  }
  rect(6, 18, 7, 20, jersey === 5 ? 'K' : 'c'); rect(17, 18, 18, 20, jersey === 5 ? 'K' : 'c');
  rect(6, 21, 7, 24, 'S'); rect(17, 21, 18, 24, 'S');
  put(6, 25, 'S'); put(7, 25, 'S'); put(17, 25, 'S'); put(18, 25, 'S');

  // ---------- shorts, piernas y pies ----------
  rect(7, 25, 17, 27, 'F');
  put(7, 25, 'f'); put(8, 25, 'f'); put(7, 26, 'f'); put(8, 26, 'f');
  rect(9, 28, 11, 30, 'S'); rect(13, 28, 15, 30, 'S');
  if (turn) { rect(8, 31, 11, 31, 'G'); rect(13, 31, 17, 31, 'G'); } else { rect(8, 31, 11, 31, 'G'); rect(13, 31, 16, 31, 'G'); }

  // ---------- contorno ----------
  const src = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (src[y][x] !== '.') continue;
    const nb = (src[y - 1]?.[x] ?? '.') + (src[y + 1]?.[x] ?? '.') + (src[y]?.[x - 1] ?? '.') + (src[y]?.[x + 1] ?? '.');
    if (nb.replace(/\./g, '') !== '') g[y][x] = 'o';
  }

  const SKIN = AV_SKIN[f.skin]; const HAIR = AV_HAIR[f.hair];
  const SHIRT = AV_SHIRT[f.shirt]; const SHIRT2 = AV_SHIRT[f.shirt2]; const HATCOL = AV_SHIRT[f.hatColor];
  const colors = {
    H: HAIR, h: shade(HAIR, 0.72), l: shade(HAIR, 1.45), B: '#141210',
    S: SKIN, d: shade(SKIN, 0.78), L: shade(SKIN, 1.13),
    E: '#f4fbff', P: '#1a1a1a', Z: '#431f1f', M: shade(SKIN, 0.5),
    W: HATCOL, w: shade(HATCOL, 0.7), g: '#20262b',
    C: SHIRT, c: shade(SHIRT, 0.78), K: SHIRT2, k: shade(SHIRT2, 0.78),
    F: '#ece7dd', f: '#c7c0b2', G: '#20242a', o: '#08160d',
  };
  return g.map((row) => row.map((v) => (v === '.' ? null : colors[v] ?? null)));
}

const NS = 'http://www.w3.org/2000/svg';

// SVG del avatar. size = alto en píxeles. view = 'bust' para el carnet (cabeza y hombros).
export function avatarSVGEl(seed, size = 40, face = null, view = 'body', label = '') {
  const grid = avatarGrid(seed, face, view);
  const bust = view === 'bust';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pixel-avatar avatar');
  svg.setAttribute('width', String(bust ? Math.round((size * 18) / 20) : Math.round((size * 24) / 32)));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', bust ? '3 0 18 20' : '0 0 24 32');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.style.background = '#0f2a19';
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === c) run++;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
      r.setAttribute('width', String(run)); r.setAttribute('height', '1');
      r.setAttribute('fill', c);
      svg.append(r);
      x += run;
    }
  });
  return svg;
}

export const playerAvatar = (p, size, view) => avatarSVGEl(p.id, size, p.face, view);
