// Fixed-step simulation for FOUNDRY LINE. Everything in here is deterministic
// game logic at 60 Hz and never touches three.js or the DOM: the renderer and
// the HUD only read the state this module owns. A match is a sequence of
// rounds; each round has a buy phase, a live phase and a short end phase.
//
// Teams: 'atk' (Vanguard, the player's team) plants the charge at site A or B;
// 'def' (Sentinels) stops them or defuses it. First to 8 round wins takes the
// match, or the higher score after 15 rounds.

import { MAP, collideCircle, rayMap, hasLineOfSight, inSite, nearestNode, findPath } from './map.js';
import { WEAPONS, EQUIPMENT } from './weapons.js';
import { makeRng, hashSeed } from './rng.js';
import { updateBot } from './bots.js';

export const DT = 1 / 60;
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const PLANT_TIME = 3.2;
export const FUSE_TIME = 40;
export const WIN_AT = 8;
export const MAX_ROUNDS = 15;

const BOT_NAMES_ATK = ['Rook', 'Vex', 'Hale', 'Mira'];
const BOT_NAMES_DEF = ['Sable', 'Onyx', 'Ferro', 'Kite', 'Bram'];

function eyeHeight(agent) { return agent.crouched ? 1.12 : 1.62; }
export function eyeY(agent) { return agent.y + eyeHeight(agent); }

export function createGame(seedText) {
  const seed = hashSeed(seedText || 'foundry');
  const state = {
    seedText: seedText || 'foundry',
    rng: makeRng(seed),
    tick: 0,
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTimer: 0,
    round: 1,
    score: { atk: 0, def: 0 },
    lossStreak: { atk: 0, def: 0 },
    agents: [],
    bomb: { state: 'carried', carrierId: 0, site: null, x: 0, z: 0, plantTimer: 0, fuseTimer: 0, defuseTimer: 0, defuserId: -1 },
    grenades: [],
    smokes: [],
    flashes: [],
    events: [],
    killfeed: [],
    message: '',
    messageTimer: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    shotMode: false,
    shotFreezeAt: -1,
  };
  spawnAgents(state);
  return state;
}

function makeAgent(state, id, team, isPlayer, name, spawn) {
  return {
    id, name, team, isPlayer,
    x: spawn.x, z: spawn.z, y: 0, vx: 0, vz: 0, vy: 0,
    yaw: team === 'atk' ? 0 : Math.PI, pitch: 0,
    hp: 100, armor: 0, helmet: false, alive: true,
    weapon: 'p2000', mag: WEAPONS.p2000.mag, reserve: WEAPONS.p2000.reserve,
    reloading: 0, fireCooldown: 0, switchTimer: 0,
    crouched: false, onGround: true,
    bloom: 0, recoil: 0, recoilYaw: 0,
    money: 800, kills: 0, deaths: 0,
    grenades: { he: 0, flash: 0, smoke: 0 },
    hasDefuseKit: false,
    planting: 0, defusing: 0,
    flashTimer: 0, flashStrength: 0,
    moveSpeed: 0, moving: false,
    bot: isPlayer ? null : {
      skill: 0.45 + state.rng.range(0, 0.35),
      state: 'move', path: [], pathIdx: 0, targetNode: 0,
      site: null, role: 'roam',
      visibleEnemy: -1, aimTime: 0, reactTimer: 0,
      burstLeft: 0, burstPause: 0, lastKnown: null,
      holdTimer: 0, strafeDir: 1, strafeTimer: 0,
      thinkTimer: state.rng.range(0, 0.15),
      plantTimer: 0, defuseTimer: 0,
    },
    lastHurtBy: -1, lastHurtAt: 0,
  };
}

function spawnAgents(state) {
  state.agents = [];
  const atkSpawns = MAP.spawns.atk;
  const defSpawns = MAP.spawns.def;
  state.agents.push(makeAgent(state, 0, 'atk', true, 'You', atkSpawns[2]));
  for (let i = 0; i < 4; i++) {
    state.agents.push(makeAgent(state, 1 + i, 'atk', false, BOT_NAMES_ATK[i], atkSpawns[i === 2 ? 1 : i]));
  }
  for (let i = 0; i < 5; i++) {
    state.agents.push(makeAgent(state, 5 + i, 'def', false, BOT_NAMES_DEF[i], defSpawns[i]));
  }
  // Face the map: attackers look north (towards -z), defenders look south.
  for (const a of state.agents) a.yaw = a.team === 'atk' ? 0 : Math.PI;
  state.bomb = { state: 'carried', carrierId: 0, site: null, x: 0, z: 0, plantTimer: 0, fuseTimer: 0, defuseTimer: 0, defuserId: -1 };
  state.grenades = [];
  state.smokes = [];
  state.flashes = [];
}

export function playerAgent(state) { return state.agents[0]; }

export function startMatch(state) {
  state.round = 1;
  state.score = { atk: 0, def: 0 };
  state.lossStreak = { atk: 0, def: 0 };
  state._ownedWeapons = new Set(['p2000']);
  for (const a of state.agents) { a.money = 800; a.kills = 0; a.deaths = 0; }
  startRound(state);
}

export function startRound(state) {
  spawnAgents(state);
  // Keep the player's money and gear across rounds; bots re-buy.
  const player = state.agents[0];
  player.money = state._playerMoney ?? 800;
  player.weapon = state._playerWeapon ?? 'p2000';
  player.grenades = state._playerGrenades ?? { he: 0, flash: 0, smoke: 0 };
  player.armor = state._playerArmor ?? 0;
  player.helmet = state._playerHelmet ?? false;
  player.hasDefuseKit = state._playerDefuseKit ?? false;
  if (player.weapon !== 'p2000') {
    const w = WEAPONS[player.weapon];
    player.mag = w.mag; player.reserve = w.reserve;
  }
  for (const a of state.agents) {
    if (a.isPlayer) continue;
    botBuy(state, a);
  }
  assignBotPlans(state);
  // The charge goes to the player half the time and to a random attacker bot
  // the rest, so a round never stalls on a carrier that will not move.
  state.bomb.carrierId = state.rng.chance(0.5) ? 0 : 1 + state.rng.int(0, 3);
  state.phase = 'buy';
  state.phaseTimer = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.message = `ROUND ${state.round} — BUY PHASE`;
  state.messageTimer = 3;
  state.events.push({ type: 'roundStart', round: state.round });
}

function botBuy(state, bot) {
  const rng = state.rng;
  const money = 800 + (state.round - 1) * 600 + rng.int(0, 900);
  bot.money = money;
  let pick = 'p2000';
  if (money >= 4750 && rng.chance(0.25)) pick = 'longbow';
  else if (money >= 2500 && rng.chance(0.6)) pick = 'vk47';
  else if (money >= 1500 && rng.chance(0.5)) pick = 'mp5';
  else if (money >= 1200 && rng.chance(0.4)) pick = 'breacher';
  bot.weapon = pick;
  const w = WEAPONS[pick];
  bot.mag = w.mag; bot.reserve = w.reserve;
  bot.armor = money >= 3000 && rng.chance(0.6) ? 100 : 0;
  bot.helmet = bot.armor > 0 && rng.chance(0.5);
  bot.grenades = { he: rng.chance(0.5) ? 1 : 0, flash: rng.chance(0.4) ? 1 : 0, smoke: rng.chance(0.3) ? 1 : 0 };
  bot.hasDefuseKit = bot.team === 'def' && rng.chance(0.5);
}

// Assign each bot a site and a role for this round.
function assignBotPlans(state) {
  const rng = state.rng;
  const atkBots = state.agents.filter((a) => !a.isPlayer && a.team === 'atk');
  const defBots = state.agents.filter((a) => a.team === 'def');
  const atkSite = rng.chance(0.5) ? 'A' : 'B';
  const otherSite = atkSite === 'A' ? 'B' : 'A';
  atkBots.forEach((b, i) => {
    b.bot.site = i < 3 ? atkSite : otherSite;
    b.bot.role = 'push';
    b.bot.targetNode = MAP.sites[b.bot.site] === MAP.sites.A ? 13 : 14;
    b.bot.path = findPath(nearestNode(b.x, b.z), b.bot.targetNode);
    b.bot.pathIdx = 0;
    b.bot.state = 'move';
  });
  // Bomb carrier: a random attacker bot if the player is dead, else the player.
  defBots.forEach((b, i) => {
    b.bot.site = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
    b.bot.role = 'hold';
    b.bot.targetNode = b.bot.site === 'A' ? 13 : b.bot.site === 'B' ? 14 : 15;
    b.bot.path = findPath(nearestNode(b.x, b.z), b.bot.targetNode);
    b.bot.pathIdx = 0;
    b.bot.state = 'move';
  });
}

// ---- movement ------------------------------------------------------------

export function moveAgent(state, a, wishX, wishZ, speed, dt) {
  const accel = a.onGround ? 42 : 12;
  const targetVx = wishX * speed;
  const targetVz = wishZ * speed;
  a.vx += clamp(targetVx - a.vx, -accel * dt, accel * dt);
  a.vz += clamp(targetVz - a.vz, -accel * dt, accel * dt);
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  const p = collideCircle(a.x, a.z, 0.36, a.y, a.crouched ? 1.15 : 1.75);
  a.x = p.x; a.z = p.z;
  a.moveSpeed = Math.hypot(a.vx, a.vz);
  a.moving = a.moveSpeed > 0.6;
  // Gravity / jump.
  if (!a.onGround) a.vy -= 22 * dt;
  a.y += a.vy * dt;
  if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
}

// ---- shooting ------------------------------------------------------------

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox; const ly = cy - oy; const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}

// Does the segment pass through any active smoke cloud? Returns distance or null.
function raySmoke(state, ox, oy, oz, dx, dy, dz, maxDist) {
  for (const s of state.smokes) {
    const t = raySphere(ox, oy, oz, dx, dy, dz, s.x, 1.4, s.z, 2.6);
    if (t !== null && t < maxDist) return t;
  }
  return null;
}

export function shootRay(state, shooter, ox, oy, oz, dx, dy, dz, maxDist) {
  const wallT = rayMap(ox, oy, oz, dx, dy, dz, maxDist);
  const smokeT = raySmoke(state, ox, oy, oz, dx, dy, dz, maxDist);
  let best = { kind: 'none', dist: Math.min(wallT, smokeT ?? Infinity) };
  if (smokeT !== null && smokeT < wallT) best = { kind: 'smoke', dist: smokeT };
  else if (wallT < maxDist) best = { kind: 'wall', dist: wallT };
  for (const a of state.agents) {
    if (!a.alive || a.id === shooter.id || a.team === shooter.team) continue;
    const headT = raySphere(ox, oy, oz, dx, dy, dz, a.x, a.y + 1.52, a.z, 0.24);
    if (headT !== null && headT < best.dist) {
      best = { kind: 'agent', agent: a, head: true, dist: headT };
      continue;
    }
    const bodyT = raySphere(ox, oy, oz, dx, dy, dz, a.x, a.y + 0.95, a.z, 0.42);
    if (bodyT !== null && bodyT < best.dist) best = { kind: 'agent', agent: a, head: false, dist: bodyT };
    const legT = raySphere(ox, oy, oz, dx, dy, dz, a.x, a.y + 0.35, a.z, 0.34);
    if (legT !== null && legT < best.dist) best = { kind: 'agent', agent: a, head: false, dist: legT };
  }
  return best;
}

export function fireWeapon(state, shooter) {
  const w = WEAPONS[shooter.weapon];
  if (shooter.reloading > 0 || shooter.fireCooldown > 0 || shooter.mag <= 0) return false;
  shooter.mag -= 1;
  shooter.fireCooldown = 1 / w.fireRate;
  const pellets = w.pellets ?? 1;
  const ox = shooter.x; const oy = eyeY(shooter); const oz = shooter.z;
  // Spread grows with movement, bloom and airtime; crouching steadies the aim.
  let spread = w.spread + shooter.bloom * 0.02;
  if (shooter.moving) spread += w.moveSpread * Math.min(1, shooter.moveSpeed / 5);
  if (!shooter.onGround) spread += 0.05;
  if (shooter.crouched) spread *= 0.6;
  if (shooter.weapon === 'longbow' && shooter.moving) spread = w.moveSpread;
  shooter.bloom = Math.min(1, shooter.bloom + (w.kind === 'rifle' ? 0.14 : 0.09));
  shooter.recoil = Math.min(0.09, shooter.recoil + w.recoil);
  if (shooter.isPlayer) {
    shooter.pitch = clamp(shooter.pitch + w.recoil * 0.9, -1.45, 1.45);
    shooter.yaw += (state.rng.next() - 0.5) * w.recoil * 0.4;
  }
  let hitAny = false;
  for (let p = 0; p < pellets; p++) {
    const yaw = shooter.yaw + (state.rng.next() - 0.5) * 2 * spread + (state.rng.next() - 0.5) * shooter.recoilYaw;
    const pitch = shooter.pitch + (state.rng.next() - 0.5) * 2 * spread;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    const hit = shootRay(state, shooter, ox, oy, oz, dx, dy, dz, w.range);
    const ex = ox + dx * hit.dist; const ey = oy + dy * hit.dist; const ez = oz + dz * hit.dist;
    state.events.push({ type: 'tracer', x1: ox, y1: oy - 0.08, z1: oz, x2: ex, y2: ey, z2: ez, color: w.tracer });
    if (hit.kind === 'agent') {
      hitAny = true;
      let dmg = w.damage * (hit.head ? w.headMult : 1);
      if (hit.dist > w.range * 0.6) dmg *= 0.8;
      applyDamage(state, hit.agent, dmg, shooter, hit.head, shooter.weapon);
      state.events.push({ type: 'impact', x: ex, y: ey, z: ez, blood: true });
      if (shooter.isPlayer) state.events.push({ type: 'hitmarker', head: hit.head, kill: !hit.agent.alive });
    } else if (hit.kind === 'wall') {
      state.events.push({ type: 'impact', x: ex, y: ey, z: ez, blood: false });
    }
  }
  state.events.push({ type: 'shot', agentId: shooter.id, weapon: shooter.weapon, x: ox, y: oy, z: oz });
  // Gunfire is loud: nearby bots turn towards it.
  for (const b of state.agents) {
    if (b.isPlayer || !b.alive || b.id === shooter.id || !b.bot) continue;
    const d = Math.hypot(b.x - shooter.x, b.z - shooter.z);
    if (d < 26 && b.bot.visibleEnemy === -1) {
      b.bot.lastKnown = { x: shooter.x, z: shooter.z, t: state.tick };
    }
  }
  if (shooter.mag === 0) state.events.push({ type: 'dryfire', agentId: shooter.id });
  return hitAny;
}

export function applyDamage(state, victim, dmg, attacker, head, weaponId) {
  if (!victim.alive) return;
  let remaining = dmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, remaining * 0.5);
    victim.armor -= absorbed;
    remaining -= absorbed;
  }
  victim.hp -= remaining;
  victim.lastHurtBy = attacker ? attacker.id : -1;
  victim.lastHurtAt = state.tick;
  if (victim.isPlayer) state.events.push({ type: 'hurt' });
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    victim.planting = 0; victim.defusing = 0;
    if (attacker) {
      attacker.kills += 1;
      if (attacker.isPlayer) {
        attacker.money += 300;
        state.events.push({ type: 'money', amount: 300, reason: 'elimination' });
      }
    }
    state.killfeed.unshift({
      killer: attacker ? attacker.name : '—',
      killerTeam: attacker ? attacker.team : 'atk',
      victim: victim.name,
      victimTeam: victim.team,
      head, weapon: weaponId, t: state.tick,
    });
    if (state.killfeed.length > 5) state.killfeed.pop();
    state.events.push({ type: 'death', agentId: victim.id, killerId: attacker ? attacker.id : -1 });
    if (state.bomb.carrierId === victim.id && state.bomb.state === 'carried') {
      state.bomb.state = 'dropped';
      state.bomb.x = victim.x; state.bomb.z = victim.z;
      state.message = victim.isPlayer ? 'You dropped the charge — a teammate must pick it up' : `${victim.name} dropped the charge`;
      state.messageTimer = 3;
    }
    if (victim.isPlayer) state.events.push({ type: 'playerDeath' });
  }
}

export function reloadWeapon(state, a) {
  const w = WEAPONS[a.weapon];
  if (a.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return;
  a.reloading = w.reloadTime;
  state.events.push({ type: 'reload', agentId: a.id });
}

// ---- grenades ------------------------------------------------------------

export function throwGrenade(state, a, kind) {
  if (a.grenades[kind] <= 0) return false;
  a.grenades[kind] -= 1;
  const speed = kind === 'smoke' ? 13 : 15;
  const dx = -Math.sin(a.yaw) * Math.cos(a.pitch);
  const dy = Math.sin(a.pitch) + 0.35;
  const dz = -Math.cos(a.yaw) * Math.cos(a.pitch);
  state.grenades.push({
    type: kind, ownerId: a.id, team: a.team,
    x: a.x + dx * 0.5, y: eyeY(a) - 0.1, z: a.z + dz * 0.5,
    vx: dx * speed, vy: dy * speed, vz: dz * speed,
    timer: kind === 'he' ? 1.7 : kind === 'flash' ? 1.25 : 1.4,
    bounced: 0,
  });
  state.events.push({ type: 'throw', agentId: a.id, kind });
  return true;
}

function updateGrenades(state, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vy -= 18 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y <= 0.12) {
      g.y = 0.12;
      if (Math.abs(g.vy) > 2) { g.vy = -g.vy * 0.45; g.vx *= 0.7; g.vz *= 0.7; }
      else { g.vy = 0; g.vx *= 0.86; g.vz *= 0.86; }
    }
    const p = collideCircle(g.x, g.z, 0.12, g.y, 0.24);
    if (p.x !== g.x || p.z !== g.z) {
      // Rough bounce: reverse the component that hit.
      if (Math.abs(p.x - g.x) > 0.001) g.vx = -g.vx * 0.5;
      if (Math.abs(p.z - g.z) > 0.001) g.vz = -g.vz * 0.5;
      g.x = p.x; g.z = p.z;
    }
    g.timer -= dt;
    if (g.timer <= 0) {
      state.grenades.splice(i, 1);
      detonateGrenade(state, g);
    }
  }
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    state.smokes[i].timer -= dt;
    if (state.smokes[i].timer <= 0) state.smokes.splice(i, 1);
  }
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    state.flashes[i].timer -= dt;
    if (state.flashes[i].timer <= 0) state.flashes.splice(i, 1);
  }
}

function detonateGrenade(state, g) {
  if (g.type === 'he') {
    state.events.push({ type: 'explosion', x: g.x, y: g.y, z: g.z });
    for (const a of state.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - g.x, a.z - g.z, (a.y + 0.9) - g.y);
      if (d > 6.5) continue;
      if (!hasLineOfSight(g.x, g.y + 0.2, g.z, a.x, a.y + 0.9, a.z)) continue;
      const dmg = Math.max(12, 110 * (1 - d / 6.5));
      const owner = state.agents[g.ownerId];
      applyDamage(state, a, dmg, owner && owner.team !== a.team ? owner : null, false, 'he');
    }
  } else if (g.type === 'flash') {
    state.events.push({ type: 'flash', x: g.x, y: g.y, z: g.z });
    for (const a of state.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - g.x, a.z - g.z, (a.y + 1.5) - g.y);
      if (d > 22) continue;
      if (!hasLineOfSight(g.x, g.y, g.z, a.x, a.y + 1.5, a.z)) continue;
      // Facing the flash matters: looking away halves the effect.
      const toFlashX = g.x - a.x; const toFlashZ = g.z - a.z;
      const facing = (-Math.sin(a.yaw) * toFlashX + -Math.cos(a.yaw) * toFlashZ) / (Math.hypot(toFlashX, toFlashZ) + 1e-6);
      const strength = facing > 0 ? 1 : 0.45;
      a.flashTimer = Math.max(a.flashTimer, 2.4 * strength * (1 - d / 26));
      a.flashStrength = strength;
      if (a.isPlayer) state.events.push({ type: 'playerFlash', strength: a.flashTimer });
    }
  } else if (g.type === 'smoke') {
    state.smokes.push({ x: g.x, z: g.z, timer: 18 });
    state.events.push({ type: 'smoke', x: g.x, y: g.y, z: g.z });
  }
}

// ---- buy -----------------------------------------------------------------

export function buyWeapon(state, id) {
  const p = playerAgent(state);
  if (state.phase !== 'buy') return { ok: false, why: 'Buy phase is over' };
  const w = WEAPONS[id];
  if (!w) return { ok: false, why: 'No such weapon' };
  if (p.weapon === id) return { ok: false, why: 'Already carrying it' };
  if (p.money < w.price) return { ok: false, why: 'Not enough money' };
  p.money -= w.price;
  p.weapon = id; p.mag = w.mag; p.reserve = w.reserve; p.reloading = 0;
  state._playerWeapon = id;
  state._ownedWeapons = state._ownedWeapons || new Set(['p2000']);
  state._ownedWeapons.add(id);
  p.ammoCache = p.ammoCache || {};
  p.ammoCache[id] = { mag: w.mag, reserve: w.reserve };
  state.events.push({ type: 'buy', what: w.name, price: w.price });
  return { ok: true };
}

export function buyEquipment(state, id) {
  const p = playerAgent(state);
  if (state.phase !== 'buy') return { ok: false, why: 'Buy phase is over' };
  const e = EQUIPMENT[id];
  if (!e) return { ok: false, why: 'No such equipment' };
  if (id === 'helmet' && p.armor <= 0) return { ok: false, why: 'Buy a vest first' };
  if (id === 'kevlar' && p.armor >= 100) return { ok: false, why: 'Already armoured' };
  if (id === 'helmet' && p.helmet) return { ok: false, why: 'Already have a helmet' };
  if (id === 'defuse' && p.hasDefuseKit) return { ok: false, why: 'Already have a kit' };
  if ((id === 'he' || id === 'flash' || id === 'smoke') && p.grenades[id] >= 1) {
    return { ok: false, why: 'Already carrying one' };
  }
  if (p.money < e.price) return { ok: false, why: 'Not enough money' };
  p.money -= e.price;
  if (id === 'kevlar') { p.armor = 100; state._playerArmor = 100; }
  if (id === 'helmet') { p.helmet = true; state._playerHelmet = true; }
  if (id === 'defuse') { p.hasDefuseKit = true; state._playerDefuseKit = true; }
  if (id === 'he' || id === 'flash' || id === 'smoke') p.grenades[id] += 1;
  state._playerGrenades = { ...p.grenades };
  state.events.push({ type: 'buy', what: e.name, price: e.price });
  return { ok: true };
}

function persistPlayer(state) {
  const p = playerAgent(state);
  state._playerMoney = p.money;
  state._playerWeapon = p.weapon;
  state._playerGrenades = { ...p.grenades };
  state._playerArmor = p.armor;
  state._playerHelmet = p.helmet;
  state._playerDefuseKit = p.hasDefuseKit;
}

// ---- bomb ----------------------------------------------------------------

function updateBomb(state, dt) {
  const b = state.bomb;
  if (b.state === 'defused') {
    endRound(state, 'def', 'The charge was defused');
    return;
  }
  if (b.state === 'carried') {
    const carrier = state.agents[b.carrierId];
    if (!carrier || !carrier.alive) {
      b.state = 'dropped';
      if (carrier) { b.x = carrier.x; b.z = carrier.z; }
    }
  } else if (b.state === 'dropped') {
    // Any living attacker can pick it up by walking over it.
    for (const a of state.agents) {
      if (a.alive && a.team === 'atk' && Math.hypot(a.x - b.x, a.z - b.z) < 1.1) {
        b.state = 'carried'; b.carrierId = a.id;
        state.message = a.isPlayer ? 'You picked up the charge' : `${a.name} picked up the charge`;
        state.messageTimer = 2.5;
        break;
      }
    }
  } else if (b.state === 'planted') {
    b.fuseTimer -= dt;
    // Beep faster as the fuse runs down.
    if (b.fuseTimer <= 0) {
      b.state = 'exploded';
      state.events.push({ type: 'explosion', x: b.x, y: 0.5, z: b.z, big: true });
      endRound(state, 'atk', 'The charge detonated');
      return;
    }
    // A defender channeling the defuse: the defusing bot counts its own
    // channel up (see bots.js doDefuse); here we only check it is still valid.
    if (b.defuserId >= 0) {
      const d = state.agents[b.defuserId];
      if (!d || !d.alive || Math.hypot(d.x - b.x, d.z - b.z) > 1.6 || (d.bot && d.bot.state !== 'defuse')) {
        b.defuserId = -1;
      }
    }
  }
}

// ---- rounds --------------------------------------------------------------

function aliveCount(state, team) {
  return state.agents.filter((a) => a.alive && a.team === team).length;
}

export function endRound(state, winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const loser = winner === 'atk' ? 'def' : 'atk';
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] += 1;
  const p = playerAgent(state);
  const playerWon = p.team === winner;
  const winBonus = 3250;
  const lossBonus = Math.min(3400, 1400 + state.lossStreak[loser] * 500);
  p.money += playerWon ? winBonus : lossBonus;
  if (playerWon && state._playerPlanted) { p.money += 300; state._playerPlanted = false; }
  persistPlayer(state);
  state.phase = 'roundEnd';
  state.phaseTimer = 5;
  state.message = playerWon ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`;
  state.messageTimer = 5;
  state.events.push({ type: 'roundEnd', winner, reason, score: { ...state.score } });
}

function checkRoundEnd(state) {
  if (state.phase !== 'live') return;
  const atkAlive = aliveCount(state, 'atk');
  const defAlive = aliveCount(state, 'def');
  if (atkAlive === 0) { endRound(state, 'def', 'Vanguard eliminated'); return; }
  if (defAlive === 0) {
    if (state.bomb.state === 'planted') return; // fuse still decides it
    endRound(state, 'atk', 'Sentinels eliminated');
    return;
  }
  if (state.phaseTimer <= 0 && state.bomb.state !== 'planted') {
    endRound(state, 'def', 'Time expired — the charge was never planted');
  }
}

function nextRoundOrMatch(state) {
  if (state.score.atk >= WIN_AT || state.score.def >= WIN_AT || state.round >= MAX_ROUNDS) {
    state.matchWinner = state.score.atk === state.score.def ? 'draw' : state.score.atk > state.score.def ? 'atk' : 'def';
    state.phase = 'matchEnd';
    state.phaseTimer = 0;
    state.events.push({ type: 'matchEnd', winner: state.matchWinner, score: { ...state.score } });
    return;
  }
  state.round += 1;
  startRound(state);
}

// ---- the fixed step ------------------------------------------------------

export function stepGame(state, input, dt) {
  state.tick += 1;
  state.events.length = 0;
  if (state.messageTimer > 0) state.messageTimer -= dt;

  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    // Idle scene: bots stand at spawn so the menu has a living backdrop.
    return;
  }

  if (state.phase === 'buy') {
    state.phaseTimer -= dt;
    // Bots shuffle into position during the buy phase.
    for (const a of state.agents) {
      if (!a.isPlayer && a.alive && a.bot) updateBot(state, a, dt, true);
    }
    if (state.phaseTimer <= 0) {
      state.phase = 'live';
      state.phaseTimer = ROUND_TIME;
      state.message = state.bomb.carrierId === 0 ? 'Plant the charge at A or B' : 'Escort the carrier — plant at A or B';
      state.messageTimer = 3;
    }
    return;
  }

  if (state.phase === 'roundEnd') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) nextRoundOrMatch(state);
    return;
  }

  // Live phase.
  state.phaseTimer -= dt;
  const p = playerAgent(state);
  updatePlayer(state, p, input, dt);
  for (const a of state.agents) {
    if (!a.isPlayer && a.alive && a.bot) updateBot(state, a, dt, false);
  }
  // Dead player: spectate a living teammate (camera handled by renderer).
  updateGrenades(state, dt);
  updateBomb(state, dt);
  // Cooldowns, bloom decay, reload completion.
  for (const a of state.agents) {
    if (a.fireCooldown > 0) a.fireCooldown -= dt;
    if (a.reloading > 0) {
      a.reloading -= dt;
      if (a.reloading <= 0) {
        const w = WEAPONS[a.weapon];
        const need = w.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take;
      }
    }
    a.bloom = Math.max(0, a.bloom - dt * 1.6);
    a.recoil = Math.max(0, a.recoil - dt * 0.35);
    if (a.flashTimer > 0) a.flashTimer -= dt;
    if (a.switchTimer > 0) a.switchTimer -= dt;
  }
  checkRoundEnd(state);
}

function updatePlayer(state, p, input, dt) {
  if (!p.alive) return;
  // Look.
  p.yaw -= (input.lookX || 0) * 0.0022;
  p.pitch = clamp(p.pitch - (input.lookY || 0) * 0.0022, -1.45, 1.45);
  // Recoil recovery pulls the crosshair back down.
  if (p.recoil > 0.001 && !input.firing) p.pitch -= p.recoil * dt * 1.2;
  p.crouched = !!input.crouch;
  const speed = p.crouched ? 2.2 : input.walk ? 2.8 : 5.6;
  const sin = Math.sin(p.yaw); const cos = Math.cos(p.yaw);
  // Forward is -z rotated by yaw; right is +x rotated by yaw.
  const fwdX = -sin; const fwdZ = -cos;
  const rightX = cos; const rightZ = -sin;
  let wx = fwdX * (input.moveY || 0) + rightX * (input.moveX || 0);
  let wz = fwdZ * (input.moveY || 0) + rightZ * (input.moveX || 0);
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  if (input.jump && p.onGround) { p.vy = 7.2; p.onGround = false; }
  moveAgent(state, p, wx, wz, speed, dt);
  // Weapon switching (1-5). Ammo is kept per weapon so switching back does
  // not magically refill a magazine.
  if (input.switchTo && input.switchTo !== p.weapon && WEAPONS[input.switchTo] && p.switchTimer <= 0) {
    if (input.switchTo === 'p2000' || (state._ownedWeapons && state._ownedWeapons.has(input.switchTo))) {
      p.ammoCache = p.ammoCache || {};
      p.ammoCache[p.weapon] = { mag: p.mag, reserve: p.reserve };
      p.weapon = input.switchTo;
      const w = WEAPONS[input.switchTo];
      const saved = p.ammoCache[input.switchTo];
      p.mag = saved ? saved.mag : w.mag;
      p.reserve = saved ? saved.reserve : w.reserve;
      p.reloading = 0;
      p.switchTimer = 0.4;
      state.events.push({ type: 'switch', weapon: input.switchTo });
    }
  }
  if (input.reload) reloadWeapon(state, p);
  // Semi-automatic weapons fire once per trigger pull; automatics fire while held.
  const triggerEdge = input.firing && !p._prevFiring;
  p._prevFiring = !!input.firing;
  const w = WEAPONS[p.weapon];
  if (input.firing && (w.auto || triggerEdge) && p.fireCooldown <= 0 && p.reloading <= 0) {
    if (p.mag > 0) fireWeapon(state, p);
    else if (!p._dryPlayed) { p._dryPlayed = true; state.events.push({ type: 'dryfire', agentId: p.id }); }
  }
  if (!input.firing) p._dryPlayed = false;
  // Grenade keys.
  if (input.grenade) throwGrenade(state, p, input.grenade);
  // Plant / defuse channel (hold E).
  updatePlayerObjective(state, p, input, dt);
}

function updatePlayerObjective(state, p, input, dt) {
  const b = state.bomb;
  if (b.state === 'carried' && b.carrierId === p.id) {
    const site = inSite('A', p.x, p.z) ? 'A' : inSite('B', p.x, p.z) ? 'B' : null;
    if (site && input.use && !p.moving) {
      p.planting += dt;
      if (p.planting >= PLANT_TIME) {
        b.state = 'planted'; b.site = site; b.x = p.x; b.z = p.z;
        b.fuseTimer = FUSE_TIME; b.defuseTimer = 0; b.defuserId = -1;
        p.planting = 0;
        state._playerPlanted = true;
        state.message = `Charge planted at ${site} — defend it`;
        state.messageTimer = 4;
        state.events.push({ type: 'planted', site, x: b.x, z: b.z });
        // Defenders rotate to the site.
        for (const a of state.agents) {
          if (a.team === 'def' && a.alive && a.bot) {
            a.bot.state = 'rotate';
            a.bot.targetNode = site === 'A' ? 13 : 14;
            a.bot.path = findPath(nearestNode(a.x, a.z), a.bot.targetNode);
            a.bot.pathIdx = 0;
          }
        }
      }
    } else {
      p.planting = 0;
    }
  } else {
    p.planting = 0;
  }
}

function clamp(v, min, max) { return v < min ? min : v > max ? v : v; }
