// FOUNDRY YARD — an original map. An abandoned steel foundry turned into a
// tactical arena: attacker spawn in the south loading yard, two charge sites in
// the north (A: furnace hall, B: storage yard), three lanes between them.
// Coordinates: x east, z south, y up. Units are metres. Colliders are axis-aligned
// boxes {x0,z0,x1,z1,h} rising from the floor (y = 0).

export const MAP = {
  name: 'Foundry Yard',
  bounds: { x0: -32, z0: -22, x1: 32, z1: 22 },
  // Solid boxes. Walls are tall; crates are low cover.
  colliders: [
    // Perimeter
    { x0: -32, z0: -22, x1: 32, z1: -21, h: 5 },
    { x0: -32, z0: 21, x1: 32, z1: 22, h: 5 },
    { x0: -32, z0: -22, x1: -31, z1: 22, h: 5 },
    { x0: 31, z0: -22, x1: 32, z1: 22, h: 5 },
    // Lane dividers, south half (gaps at z 2..4 let lanes cross)
    { x0: -13, z0: 4, x1: -12, z1: 20, h: 4 },
    { x0: 12, z0: 4, x1: 13, z1: 20, h: 4 },
    // Foundry hall (centre): north and south walls with a mid door each
    { x0: -12, z0: -6, x1: -2, z1: -5, h: 4 },
    { x0: 2, z0: -6, x1: 12, z1: -5, h: 4 },
    { x0: -12, z0: 5, x1: -2, z1: 6, h: 4 },
    { x0: 2, z0: 5, x1: 12, z1: 6, h: 4 },
    // Hall side walls with a side door each
    { x0: -12, z0: -6, x1: -11, z1: -1, h: 4 },
    { x0: -12, z0: 1, x1: -11, z1: 6, h: 4 },
    { x0: 11, z0: -6, x1: 12, z1: -1, h: 4 },
    { x0: 11, z0: 1, x1: 12, z1: 6, h: 4 },
    // Furnace block in the middle of the hall
    { x0: -2.5, z0: -2.5, x1: 2.5, z1: 2.5, h: 3.2 },
    // Site A (furnace hall, west): east wall with a door, south wall with a door
    { x0: -16, z0: -20, x1: -15, z1: -13, h: 4 },
    { x0: -16, z0: -11, x1: -15, z1: -4, h: 4 },
    { x0: -30, z0: -5, x1: -25, z1: -4, h: 4 },
    { x0: -23, z0: -5, x1: -16, z1: -4, h: 4 },
    // Site B (storage yard, east): mirrored
    { x0: 15, z0: -20, x1: 16, z1: -13, h: 4 },
    { x0: 15, z0: -11, x1: 16, z1: -4, h: 4 },
    { x0: 16, z0: -5, x1: 23, z1: -4, h: 4 },
    { x0: 25, z0: -5, x1: 30, z1: -4, h: 4 },
    // Crates: low cover on the lanes and sites
    { x0: -26, z0: -17, x1: -23, z1: -15, h: 1.4 },
    { x0: -21, z0: -19, x1: -18, z1: -17, h: 2.2 },
    { x0: -29, z0: -9, x1: -27, z1: -7, h: 1.2 },
    { x0: 23, z0: -17, x1: 26, z1: -15, h: 1.4 },
    { x0: 18, z0: -19, x1: 21, z1: -17, h: 2.2 },
    { x0: 27, z0: -9, x1: 29, z1: -7, h: 1.2 },
    { x0: -25.5, z0: 3, x1: -22.5, z1: 5, h: 1.4 },
    { x0: -21, z0: 13, x1: -19, z1: 15, h: 1.2 },
    { x0: 22.5, z0: 3, x1: 25.5, z1: 5, h: 1.4 },
    { x0: 19, z0: 13, x1: 21, z1: 15, h: 1.2 },
    { x0: 7, z0: 13, x1: 9, z1: 15, h: 1.2 },
    { x0: -9, z0: 13, x1: -7, z1: 15, h: 1.2 },
    { x0: -8, z0: -9, x1: -5, z1: -7, h: 1.2 },
    { x0: 5, z0: -9, x1: 8, z1: -7, h: 1.2 },
    { x0: -5, z0: -16, x1: -3, z1: -14, h: 2.4 },
    { x0: 3, z0: -16, x1: 5, z1: -14, h: 2.4 },
    // Pipes along the north yard
    { x0: -10, z0: -19.5, x1: 10, z1: -18.5, h: 1.1 },
  ],
  sites: {
    A: { x: -23.5, z: -13, r: 5.5, label: 'A' },
    B: { x: 23.5, z: -13, r: 5.5, label: 'B' },
  },
  spawns: {
    atk: [
      { x: -8, z: 19 }, { x: -4, z: 19.5 }, { x: 0, z: 18.5 },
      { x: 4, z: 19.5 }, { x: 8, z: 19 },
    ],
    def: [
      { x: -8, z: -15 }, { x: -4, z: -16 }, { x: 0, z: -14.5 },
      { x: 4, z: -16 }, { x: 8, z: -15 },
    ],
  },
  // Waypoint graph the bots walk. Nodes are open floor; edges are walkable links.
  nav: {
    nodes: [
      { x: 0, z: 19 },    // 0  atk spawn
      { x: -18, z: 18 },  // 1  west lane south
      { x: 18, z: 18 },   // 2  east lane south
      { x: -24, z: 9 },   // 3  west lane
      { x: 24, z: 9 },    // 4  east lane
      { x: 0, z: 9 },     // 5  mid south
      { x: -24, z: 0 },   // 6  west lane north
      { x: 24, z: 0 },    // 7  east lane north
      { x: -4, z: 3.5 },  // 8  hall south-west (furnace ring)
      { x: -8, z: 0 },    // 9  hall west door
      { x: 8, z: 0 },     // 10 hall east door
      { x: -24, z: -8 },  // 11 A approach
      { x: 24, z: -8 },   // 12 B approach
      { x: -23, z: -13 }, // 13 site A
      { x: 23, z: -13 },  // 14 site B
      { x: 0, z: -10 },   // 15 north yard
      { x: 0, z: -16 },   // 16 def spawn
      { x: -13.5, z: -12 }, // 17 A corridor
      { x: 13.5, z: -12 },  // 18 B corridor
      { x: -13.5, z: 0 },   // 19 west cross
      { x: 13.5, z: 0 },    // 20 east cross
      { x: -28, z: -16 },   // 21 A deep
      { x: 28, z: -16 },    // 22 B deep
      { x: -18, z: -2 },    // 23 A lane / hall west
      { x: 18, z: -2 },     // 24 B lane / hall east
      { x: 4, z: 3.5 },    // 25 hall south-east (furnace ring)
      { x: -4, z: -3.5 },  // 26 hall north-west (furnace ring)
      { x: 4, z: -3.5 },   // 27 hall north-east (furnace ring)
      { x: 0, z: -4 },     // 28 hall north door
      { x: 0, z: 4 },      // 29 hall south door
      { x: -24, z: -4.5 }, // 30 A south door
      { x: 24, z: -4.5 },  // 31 B south door
    ],
    edges: [
      [0, 5],
      [1, 3], [2, 4], [3, 6], [4, 7],
      [1, 19], [2, 20],
      [5, 29], [29, 8], [29, 25],
      [8, 9], [25, 10], [8, 26], [25, 27],
      [26, 28], [27, 28], [26, 27], [28, 15],
      [6, 11], [7, 12], [6, 19], [7, 20],
      [11, 13], [11, 17], [12, 14], [12, 18],
      [13, 21], [14, 22], [13, 17], [14, 18],
      [15, 16], [15, 17], [15, 18],
      [16, 17], [16, 18],
      [19, 23], [20, 24],
      [23, 30], [30, 11], [24, 31], [31, 12],
      [9, 23], [10, 24],
      [3, 19], [4, 20],
    ],
  },
};

// Breadth-first shortest path over the nav graph. Returns node indices,
// starting with the bot's nearest node so it walks to the graph first instead
// of steering straight at a far node through a wall.
export function findPath(from, to) {
  const { nodes, edges } = MAP.nav;
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const prev = new Array(nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of adj[cur]) {
      if (prev[n] === -1) { prev[n] = cur; queue.push(n); }
    }
  }
  if (prev[to] === -1) return [from];
  const path = [from];
  const tail = [];
  let cur = to;
  while (cur !== from) { tail.unshift(cur); cur = prev[cur]; }
  return path.concat(tail);
}

export function nearestNode(x, z) {
  let best = 0; let bestD = Infinity;
  MAP.nav.nodes.forEach((n, i) => {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Ray vs the map's AABB colliders (slab test). Returns the nearest hit distance
// or Infinity. Used by shooting, bot sight and grenade bounces.
export function rayMap(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const c of MAP.colliders) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, c.x0, 0, c.z0, c.x1, c.h, c.z1);
    if (t !== null && t < best) best = t;
  }
  return best;
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0; let tmax = Infinity;
  const o = [ox, oy, oz]; const d = [dx, dy, dz];
  const lo = [x0, y0, z0]; const hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? 0 : null);
}

// True when a straight line between two points is not blocked by the map.
export function hasLineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  return rayMap(ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.01) >= dist - 0.01;
}

// Circle (agent) vs AABB collision: push the agent out of solid boxes.
export function collideCircle(x, z, radius, y, height) {
  for (const c of MAP.colliders) {
    if (y + height <= 0 || y >= c.h) continue;
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx; const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 < 1e-9) {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = x - c.x0; const pr = c.x1 - x;
      const pt = z - c.z0; const pb = c.z1 - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.x0 - radius;
      else if (m === pr) x = c.x1 + radius;
      else if (m === pt) z = c.z0 - radius;
      else z = c.z1 + radius;
    } else {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      z = cz + (dz / d) * radius;
    }
  }
  const b = MAP.bounds;
  x = Math.max(b.x0 + radius, Math.min(b.x1 - radius, x));
  z = Math.max(b.z0 + radius, Math.min(b.z1 - radius, z));
  return { x, z };
}

export function inSite(site, x, z) {
  const s = MAP.sites[site];
  return Math.hypot(x - s.x, z - s.z) <= s.r;
}
