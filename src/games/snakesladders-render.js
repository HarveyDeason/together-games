import { ROUTE_ENGLAND, ROUTE_INDIA, INDIA_OFFSET, LINKS } from './snakesladders-board.js';

// Isometric projection. Ported from the approved visual design; the constants
// are chosen so the two islands clear each other and the whole board fits one
// portrait viewBox.
const HW = 28, HH = 14, TZ = 20, OX = 300, OY = 880;
const VIEW_W = 1800, VIEW_H = 1400;
const NS = 'http://www.w3.org/2000/svg';

export const iso = (x, y, z) => [OX + (x - y) * HW, OY + (x + y) * HH - z * TZ];

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (i) => Math.min(255, Math.round(((n >> i) & 255) * f));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

/** Expand a list of [gx, gy, z] corners into one cell per square, walking in
 *  single steps and interpolating the climb across each run. */
export function walk(corners, offset = [0, 0]) {
  const out = [];
  const push = (gx, gy, z) => out.push({ gx: gx + offset[0], gy: gy + offset[1], z });
  push(corners[0][0], corners[0][1], corners[0][2]);
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay, az] = corners[i - 1];
    const [bx, by, bz] = corners[i];
    const dx = Math.abs(bx - ax);
    const steps = dx + Math.abs(by - ay);
    const sx = Math.sign(bx - ax);
    const sy = Math.sign(by - ay);
    for (let s = 1; s <= steps; s++) {
      const gx = ax + sx * Math.min(s, dx);
      const gy = ay + sy * Math.max(0, s - dx);
      push(gx, gy, az + (bz - az) * (s / steps));
    }
  }
  return out;
}

const BIOME = (n) => {
  if (n <= 12) return '#5C7A4E';
  if (n <= 26) return '#54714A';
  if (n <= 40) return '#5A6672';
  if (n <= 55) return '#C98A4A';
  if (n <= 75) return '#C57F38';
  if (n <= 90) return '#D48F32';
  return '#E8A63A';
};

/** Build the whole static scene once. Nothing in here changes during play —
 *  only the tokens and the die move, which is what keeps a hundred blocks of
 *  isometric scenery off a phone's render path mid-game. */
export function buildWorld(doc) {
  const el = (tag, attrs = {}) => {
    const node = doc.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  const svg = el('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    class: 'sl-world',
    role: 'img',
    'aria-label': 'Two floating islands. A rainy green England holds squares one to forty; India rises to Nagpur for forty-one to one hundred.'
  });

  // --- route and positions ---
  const route = [...walk(ROUTE_ENGLAND), ...walk(ROUTE_INDIA, INDIA_OFFSET)].slice(0, 100);
  const squareCell = {};
  const squarePos = {};
  route.forEach((c, i) => {
    const n = i + 1;
    squareCell[n] = c;
    const [x, y] = iso(c.gx, c.gy, c.z);
    squarePos[n] = { x, y };
  });

  // --- sky ---
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'sl-sky', x1: 0.1, y1: 1, x2: 0.8, y2: 0 });
  for (const [o, col] of [[0, '#243040'], [0.3, '#2B3550'], [0.56, '#4B3A66'], [0.78, '#A3542A'], [1, '#F0B14A']]) {
    grad.appendChild(el('stop', { offset: `${o * 100}%`, 'stop-color': col }));
  }
  defs.appendChild(grad);
  const sun = el('radialGradient', { id: 'sl-sun' });
  sun.appendChild(el('stop', { offset: '0%', 'stop-color': '#FFF4C9' }));
  sun.appendChild(el('stop', { offset: '100%', 'stop-color': '#F0B14A', 'stop-opacity': 0 }));
  defs.appendChild(sun);
  svg.appendChild(defs);
  svg.appendChild(el('rect', { width: VIEW_W, height: VIEW_H, fill: 'url(#sl-sky)' }));
  svg.appendChild(el('circle', { cx: 1420, cy: 160, r: 340, fill: 'url(#sl-sun)' }));

  // rain, over England only
  const weather = el('g');
  for (let i = 0; i < 40; i++) {
    const rx = 90 + ((i * 97) % 400);
    const ry = 930 + ((i * 53) % 300);
    weather.appendChild(el('line', { x1: rx, y1: ry, x2: rx - 5, y2: ry + 15, stroke: '#9FB4D8', 'stroke-width': 1.3, opacity: 0.32 }));
  }
  svg.appendChild(weather);

  // --- terrain grown outward from the route, so each island has a ragged edge ---
  const land = new Map();
  const key = (x, y) => `${x},${y}`;
  for (let n = 1; n <= 100; n++) {
    const c = squareCell[n];
    land.set(key(c.gx, c.gy), { ...c, n, top: BIOME(n), path: true });
  }
  for (let n = 1; n <= 100; n++) {
    const c = squareCell[n];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const k = key(c.gx + dx, c.gy + dy);
        if (land.has(k)) continue;
        const far = Math.max(Math.abs(dx), Math.abs(dy));
        const wobble = ((c.gx * 7 + c.gy * 13 + dx * 3 + dy * 5) % 5) * 0.12;
        land.set(k, {
          gx: c.gx + dx, gy: c.gy + dy,
          z: Math.max(0.3, c.z - 0.45 - far * 0.35 + wobble),
          top: shade(BIOME(n), far === 2 ? 0.74 : 0.88),
          edge: far === 2
        });
      }
    }
  }

  function block(gx, gy, z, top, depth) {
    const [sx, sy] = iso(gx, gy, z);
    const d = depth ?? (z * TZ + 30);
    const g = el('g');
    g.appendChild(el('path', { d: `M${sx - HW},${sy} L${sx},${sy + HH} L${sx},${sy + HH + d} L${sx - HW},${sy + d} Z`, fill: shade(top, 0.5) }));
    g.appendChild(el('path', { d: `M${sx + HW},${sy} L${sx},${sy + HH} L${sx},${sy + HH + d} L${sx + HW},${sy + d} Z`, fill: shade(top, 0.7) }));
    g.appendChild(el('path', { d: `M${sx},${sy - HH} L${sx + HW},${sy} L${sx},${sy + HH} L${sx - HW},${sy} Z`, fill: top, stroke: shade(top, 0.85), 'stroke-width': 0.6 }));
    return { g, sx, sy };
  }

  // --- props ---
  const props = [];
  const prop = (gx, gy, z, draw) => props.push({ gx, gy, z, draw });
  const pine = (sx, sy, s = 1) => {
    const g = el('g', { transform: `translate(${sx},${sy}) scale(${s})` });
    g.appendChild(el('rect', { x: -2, y: -8, width: 4, height: 10, fill: '#5A3F2A' }));
    g.appendChild(el('path', { d: 'M0,-34 L10,-8 L-10,-8 Z', fill: '#3C6140' }));
    g.appendChild(el('path', { d: 'M0,-44 L8,-21 L-8,-21 Z', fill: '#46744C' }));
    return g;
  };
  const house = (sx, sy, wall, roof, s = 1) => {
    const g = el('g', { transform: `translate(${sx},${sy}) scale(${s})` });
    g.appendChild(el('path', { d: 'M-17,0 L0,8 L0,-15 L-17,-23 Z', fill: shade(wall, 0.62) }));
    g.appendChild(el('path', { d: 'M17,0 L0,8 L0,-15 L17,-23 Z', fill: shade(wall, 0.86) }));
    g.appendChild(el('path', { d: 'M0,-30 L17,-23 L0,-15 L-17,-23 Z', fill: roof }));
    return g;
  };
  const orangeTree = (sx, sy, s = 1) => {
    const g = el('g', { transform: `translate(${sx},${sy}) scale(${s})` });
    g.appendChild(el('rect', { x: -2.5, y: -15, width: 5, height: 17, fill: '#6B4A2E' }));
    g.appendChild(el('circle', { cx: 0, cy: -25, r: 14, fill: '#3F7A4A' }));
    for (const [cx, cy] of [[-6, -29], [6, -23], [0, -33]]) {
      g.appendChild(el('circle', { cx, cy, r: 3.4, fill: '#E2711D' }));
    }
    return g;
  };
  const palm = (sx, sy, s = 1) => {
    const g = el('g', { transform: `translate(${sx},${sy}) scale(${s})` });
    g.appendChild(el('path', { d: 'M0,2 q-4,-16 2,-28', fill: 'none', stroke: '#6B4A2E', 'stroke-width': 4 }));
    for (const a of [-70, -25, 25, 70, 120, 160]) {
      g.appendChild(el('path', { d: 'M2,-28 q13,-6 21,2', fill: 'none', stroke: '#3F7A4A', 'stroke-width': 4.5, 'stroke-linecap': 'round', transform: `rotate(${a} 2 -28)` }));
    }
    return g;
  };

  prop(-2, 8, 0.5, (x, y) => house(x, y, '#CBBBA0', '#7A3E30'));
  prop(7, 8, 0.5, (x, y) => house(x, y, '#BFAF95', '#6B372B', 0.85));
  prop(-2, 5, 0.9, (x, y) => pine(x, y));
  prop(7, 3, 1.5, (x, y) => pine(x, y, 0.85));
  prop(-2, 2, 1.6, (x, y) => pine(x, y, 0.9));
  prop(9, -1, 2.4, (x, y) => pine(x, y, 0.7));
  // Heathrow, at the edge where the land runs out
  prop(9, -5, 3.0, (x, y) => {
    const g = el('g', { transform: `translate(${x},${y})` });
    g.appendChild(el('path', { d: 'M-26,0 L0,12 L0,-8 L-26,-20 Z', fill: '#3C4A5C' }));
    g.appendChild(el('path', { d: 'M26,0 L0,12 L0,-8 L26,-20 Z', fill: '#51617A' }));
    g.appendChild(el('path', { d: 'M0,-22 L26,-20 L0,-8 L-26,-20 Z', fill: '#6B7B92' }));
    g.appendChild(el('rect', { x: 27, y: -56, width: 6, height: 50, fill: '#3C4A5C' }));
    g.appendChild(el('path', { d: 'M24,-56 L38,-56 L35,-67 L27,-67 Z', fill: '#9FB4D8' }));
    return g;
  });
  for (const [gx, gy, z, s] of [[-2, 0, 1.3, 1], [8, -1, 1.4, 0.9], [-2, -5, 2.3, 0.95], [9, -6, 2.4, 0.85]]) {
    prop(gx + INDIA_OFFSET[0], gy + INDIA_OFFSET[1], z, (x, y) => palm(x, y, s));
  }
  for (const [gx, gy, z, s] of [[-2, -3, 3.4, 1], [9, -3, 3.5, 0.9], [-1, -9, 4.8, 0.95], [9, -10, 5.9, 0.9], [0, -13, 7.0, 0.85], [8, -13, 7.1, 0.8]]) {
    prop(gx + INDIA_OFFSET[0], gy + INDIA_OFFSET[1], z, (x, y) => orangeTree(x, y, s));
  }
  // Zero Mile Stone on the summit ridge
  prop(3 + INDIA_OFFSET[0], -13 + INDIA_OFFSET[1], 7.6, (x, y) => {
    const g = el('g', { transform: `translate(${x},${y})` });
    g.appendChild(el('path', { d: 'M-6,0 L0,3 L0,-28 L-6,-32 Z', fill: '#C9BBA0' }));
    g.appendChild(el('path', { d: 'M6,0 L0,3 L0,-28 L6,-32 Z', fill: '#EFE3C8' }));
    g.appendChild(el('circle', { cx: 0, cy: -38, r: 4.5, fill: '#C9A227' }));
    return g;
  });

  // --- assemble back to front ---
  const stage = el('g');
  const items = [];
  for (const c of land.values()) {
    items.push({
      d: c.gx + c.gy, z: c.z, make: () => {
        const b = block(c.gx, c.gy, c.z, c.top, c.edge ? c.z * TZ + 150 : undefined);
        if (c.path) {
          const big = c.n === 1 || c.n === 100;
          b.g.appendChild(el('path', {
            d: `M${b.sx},${b.sy - HH} L${b.sx + HW},${b.sy} L${b.sx},${b.sy + HH} L${b.sx - HW},${b.sy} Z`,
            fill: big ? '#FFE9A8' : '#EFE3C8',
            opacity: big ? 0.95 : 0.2,
            stroke: '#C9A227', 'stroke-width': big ? 2 : 0.7
          }));
          const t = el('text', {
            x: b.sx, y: b.sy + 4.5, 'text-anchor': 'middle',
            'font-family': 'Karma, Georgia, serif', 'font-size': 13, 'font-weight': 600, fill: '#241A12'
          });
          t.textContent = c.n;
          b.g.appendChild(t);
        }
        return b.g;
      }
    });
  }
  for (const p of props) {
    items.push({ d: p.gx + p.gy + 0.4, z: p.z, make: () => p.draw(...iso(p.gx, p.gy, p.z)) });
  }
  items.sort((a, b) => (a.d - b.d) || (a.z - b.z));
  for (const i of items) stage.appendChild(i.make());
  svg.appendChild(stage);

  // --- the thirteen links ---
  const links = el('g');
  const C = (n) => [squarePos[n].x, squarePos[n].y];
  for (const [fromStr, to] of Object.entries(LINKS)) {
    const from = Number(fromStr);
    const [x1, y1] = C(from);
    const [x2, y2] = C(to);
    if (to > from) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * 6, ny = dx / L * 6;
      links.appendChild(el('line', { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny, stroke: '#A8742E', 'stroke-width': 4.5, 'stroke-linecap': 'round' }));
      links.appendChild(el('line', { x1: x1 - nx, y1: y1 - ny, x2: x2 - nx, y2: y2 - ny, stroke: '#D9A050', 'stroke-width': 4.5, 'stroke-linecap': 'round' }));
      const rungs = Math.max(3, Math.round(L / 28));
      for (let i = 1; i < rungs; i++) {
        const u = i / rungs;
        links.appendChild(el('line', {
          x1: x1 + dx * u + nx, y1: y1 + dy * u + ny,
          x2: x1 + dx * u - nx, y2: y1 + dy * u - ny,
          stroke: '#F3D08A', 'stroke-width': 2.8, 'stroke-linecap': 'round'
        }));
      }
    } else {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const cable = from >= 71;
      const d = cable
        ? `M${x1},${y1} C${mx + 55},${my + 80} ${mx - 55},${my + 105} ${x2},${y2}`
        : `M${x1},${y1} C${mx + 70},${my - 70} ${mx - 70},${my + 40} ${x2},${y2}`;
      links.appendChild(el('path', { d, fill: 'none', stroke: cable ? '#1A120C' : '#101C33', 'stroke-width': cable ? 10 : 9, 'stroke-linecap': 'round' }));
      links.appendChild(el('path', {
        d, fill: 'none', stroke: cable ? '#C4463E' : '#A8BCDE',
        'stroke-width': cable ? 5 : 3.2, 'stroke-linecap': 'round',
        ...(cable ? {} : { 'stroke-dasharray': '2 14' })
      }));
      if (cable) {
        const plug = el('g', { transform: `translate(${x1},${y1})` });
        plug.appendChild(el('rect', { x: -8, y: -6, width: 16, height: 12, rx: 2, fill: '#C9A227' }));
        plug.appendChild(el('rect', { x: -3.5, y: -11, width: 7, height: 5, fill: '#C9A227' }));
        links.appendChild(plug);
      } else {
        for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
          links.appendChild(el('circle', { cx, cy, r: 6.5, fill: '#101C33', stroke: '#C9A227', 'stroke-width': 1.8 }));
        }
      }
    }
  }
  svg.appendChild(links);

  // --- the flight: the only link between the islands ---
  const flight = el('g');
  {
    const [x1, y1] = C(40), [x2, y2] = C(41);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 230;
    const d = `M${x1},${y1 - 14} Q${mx},${my} ${x2},${y2 - 14}`;
    flight.appendChild(el('path', { d, fill: 'none', stroke: '#241A12', 'stroke-width': 7, opacity: 0.35, 'stroke-linecap': 'round' }));
    flight.appendChild(el('path', { d, fill: 'none', stroke: '#FFE9A8', 'stroke-width': 3.4, 'stroke-dasharray': '16 13', opacity: 0.9, 'stroke-linecap': 'round' }));
    const label = el('text', {
      x: mx, y: my + 54, 'text-anchor': 'middle', 'font-family': "'Rozha One', Georgia, serif",
      'font-size': 21, fill: '#FFE9A8', opacity: 0.85, 'letter-spacing': 2
    });
    label.textContent = 'NINE HOURS';
    flight.appendChild(label);
    const plane = el('g', { transform: `translate(${mx},${my + 6}) rotate(10) scale(1.25)` });
    plane.appendChild(el('path', { d: 'M-40,0 L22,-7 L46,0 L22,7 Z', fill: '#EFE3C8' }));
    plane.appendChild(el('path', { d: 'M4,-4 L-13,-32 L-1,-32 L19,-5 Z', fill: '#DCD1B9' }));
    plane.appendChild(el('path', { d: 'M4,4 L-13,32 L-1,32 L19,5 Z', fill: '#EFE3C8' }));
    plane.appendChild(el('path', { d: 'M-34,-2 L-46,-16 L-38,-16 L-28,-3 Z', fill: '#DCD1B9' }));
    flight.appendChild(plane);
  }
  svg.appendChild(flight);

  // place names
  const name = (gx, gy, z, text, size) => {
    const [sx, sy] = iso(gx, gy, z);
    const t = el('text', {
      x: sx, y: sy, 'text-anchor': 'middle', 'font-family': "'Rozha One', Georgia, serif",
      'font-size': size, fill: '#FFF0BC', opacity: 0.85, 'letter-spacing': 2
    });
    t.textContent = text;
    svg.appendChild(t);
  };
  name(4.5, 11, 0.2, 'KEYNSHAM', 26);
  name(3 + INDIA_OFFSET[0], -15 + INDIA_OFFSET[1], 9.2, 'NAGPUR', 32);

  // Tokens live above everything, so this group goes on last.
  const tokenLayer = el('g', { class: 'sl-tokens' });
  svg.appendChild(tokenLayer);

  return { svg, squarePos, tokenLayer };
}

/** Where a seat's token sits relative to the centre of its square, so two
 *  tokens on the same square stay both visible. */
export function tokenOffset(seat) {
  return seat === 0 ? { dx: -9, dy: -4 } : { dx: 9, dy: -4 };
}

const TOKEN_COLOUR = { 0: '#C4463E', 1: '#2F8F7E' };

export function makeToken(doc, seat) {
  const g = doc.createElementNS(NS, 'g');
  const add = (tag, attrs) => {
    const n = doc.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    g.appendChild(n);
    return n;
  };
  add('ellipse', { cx: 0, cy: 2, rx: 10, ry: 4.5, fill: '#000', opacity: 0.3 });
  add('path', { d: 'M-6.5,0 q0,-15 6.5,-17 q6.5,2 6.5,17 Z', fill: TOKEN_COLOUR[seat] });
  add('circle', { cx: 0, cy: -20, r: 6, fill: '#F0C878' });
  return g;
}

/** Move a token to a square, honouring the two-token offset. */
export function placeToken(token, squarePos, square, seat) {
  const at = squarePos[Math.max(1, square)];
  const { dx, dy } = tokenOffset(seat);
  // Square 0 means "not yet on the board": park it just below square 1.
  const parked = square === 0 ? 26 : 0;
  token.setAttribute('transform', `translate(${at.x + dx},${at.y + dy + parked})`);
}
