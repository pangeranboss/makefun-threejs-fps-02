// Bot brains for FOUNDRY LINE. Each bot is a small state machine over the map's
// waypoint graph: push a site, hold an angle, rotate on the plant, defuse the
// charge, or hunt the last place an enemy was seen or heard. Perception is
// line-of-sight plus a field of view and a reaction time; aim error shrinks the
// longer a bot has a target in its sights, and fire comes in bursts so a bot
// that has just rounded a corner does not instantly laser its target.

import { MAP, nearestNode, findPath, hasLineOfSight, inSite } from './map.js';
import { WEAPONS } from './weapons.js';
import { moveAgent, fireWeapon, reloadWeapon, throwGrenade, eyeY } from './sim.js';

const EYE = 1.5;
const THINK_EVERY = 0.15; // seconds between perception updates per bot

export function updateBot(state, bot, dt, buyPhase) {
  const b = bot.bot;
  if (!bot.alive) return;
  b.thinkTimer -= dt;
  if (b.thinkTimer <= 0) {
    b.thinkTimer = THINK_EVERY;
    perceive(state, bot);
  }
  // Flash blindness: a flashed bot cannot see or shoot and wanders.
  if (bot.flashTimer > 0.4) {
    bot.yaw += dt * 0.8;
    moveAgent(state, bot, 0, 0, 0, dt);
    return;
  }
  if (b.visibleEnemy >= 0) {
    combat(state, bot, dt);
    return;
  }
  // No target: follow the current job.
  if (b.state === 'plant') { doPlant(state, bot, dt); return; }
  if (b.state === 'defuse') { doDefuse(state, bot, dt); return; }
  if (b.state === 'gotoBomb') { gotoBomb(state, bot, dt); return; }
  if (b.state === 'rotate' || b.state === 'move') { followPath(state, bot, dt, 4.3); return; }
  if (b.state === 'hold') {
    // Scan: slow yaw sweep, hold the angle.
    bot.yaw += Math.sin(state.tick * 0.008 + bot.id * 2.1) * dt * 0.35;
    b.holdTimer -= dt;
    if (b.holdTimer <= 0 && b.lastKnown) {
      b.state = 'hunt';
      const n = nearestNode(b.lastKnown.x, b.lastKnown.z);
      b.path = findPath(nearestNode(bot.x, bot.z), n);
      b.pathIdx = 0;
      b.lastKnown = null;
    }
    moveAgent(state, bot, 0, 0, 0, dt);
    return;
  }
  if (b.state === 'hunt') {
    followPath(state, bot, dt, 4.3);
    if (b.pathIdx >= b.path.length) { b.state = 'hold'; b.holdTimer = 2.5; }
    return;
  }
  if (b.state === 'defendSite') {
    moveAgent(state, bot, 0, 0, 0, dt);
    return;
  }
  moveAgent(state, bot, 0, 0, 0, dt);
}

// ---- perception ----------------------------------------------------------

function perceive(state, bot) {
  const b = bot.bot;
  const myEyeY = bot.y + EYE;
  let best = -1; let bestScore = Infinity;
  for (const e of state.agents) {
    if (!e.alive || e.team === bot.team) continue;
    const dx = e.x - bot.x; const dz = e.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 48) continue;
    // Field of view: 105 degrees around the bot's facing.
    const facingX = -Math.sin(bot.yaw); const facingZ = -Math.cos(bot.yaw);
    const dot = (dx * facingX + dz * facingZ) / (dist + 1e-6);
    if (dot < 0.15 && dist > 4) continue; // behind, unless very close
    if (smokeBlocks(state, bot.x, myEyeY, bot.z, e.x, e.y + 1.2, e.z)) continue;
    if (!hasLineOfSight(bot.x, myEyeY, bot.z, e.x, e.y + 1.2, e.z)) continue;
    const score = dist * (1 + (e.crouched ? 0.4 : 0));
    if (score < bestScore) { bestScore = score; best = e.id; }
  }
  if (best >= 0) {
    if (b.visibleEnemy !== best) {
      b.visibleEnemy = best;
      b.aimTime = 0;
      // Reaction time: better bots react faster.
      b.reactTimer = 0.55 - b.skill * 0.35 + state.rng.range(0, 0.15);
      b.burstLeft = 0;
      b.burstPause = 0;
    }
  } else {
    b.visibleEnemy = -1;
    b.aimTime = 0;
  }
  // Defenders notice a planted charge and rotate.
  if (state.bomb.state === 'planted' && bot.team === 'def' && b.state !== 'rotate' && b.state !== 'defuse' && b.state !== 'gotoBomb') {
    b.state = 'rotate';
    b.targetNode = state.bomb.site === 'A' ? 13 : 14;
    b.path = findPath(nearestNode(bot.x, bot.z), b.targetNode);
    b.pathIdx = 0;
  }
  // Close to the planted charge: walk straight to it and defuse.
  if (state.bomb.state === 'planted' && bot.team === 'def' && b.state !== 'defuse') {
    const d = Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z);
    if (d < 8) { b.state = 'gotoBomb'; }
  }
  // A dropped charge: the nearest living attacker goes and picks it up.
  if (state.bomb.state === 'dropped' && bot.team === 'atk' && b.state !== 'plant') {
    let nearest = null; let nearestD = Infinity;
    for (const a of state.agents) {
      if (!a.alive || a.team !== 'atk' || a.isPlayer) continue;
      const d = Math.hypot(a.x - state.bomb.x, a.z - state.bomb.z);
      if (d < nearestD) { nearestD = d; nearest = a; }
    }
    if (nearest === bot) {
      const node = nearestNode(state.bomb.x, state.bomb.z);
      if (b.targetNode !== node || b.state !== 'move') {
        b.state = 'move';
        b.targetNode = node;
        b.path = findPath(nearestNode(bot.x, bot.z), node);
        b.pathIdx = 0;
      }
    }
  }
  // Attacker carrier reaches its site: start planting.
  if (state.bomb.state === 'carried' && state.bomb.carrierId === bot.id && b.state === 'move') {
    const site = bot.bot.site;
    if (site && inSite(site, bot.x, bot.z)) {
      b.state = 'plant';
      b.plantTimer = 0;
    }
  }
}

function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  for (const s of state.smokes) {
    // Segment vs sphere test, centre at smoke height.
    const dx = bx - ax; const dy = by - ay; const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((s.x - ax) * dx + (1.4 - ay) * dy + (s.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t; const py = ay + dy * t; const pz = az + dz * t;
    const d2 = (px - s.x) ** 2 + (py - 1.4) ** 2 + (pz - s.z) ** 2;
    if (d2 < 2.6 * 2.6) return true;
  }
  return false;
}

// ---- combat --------------------------------------------------------------

function combat(state, bot, dt) {
  const b = bot.bot;
  const enemy = state.agents[b.visibleEnemy];
  if (!enemy || !enemy.alive) { b.visibleEnemy = -1; return; }
  const dx = enemy.x - bot.x; const dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dz);
  // Turn to face the target, with an aim error that shrinks over aim time.
  const wantYaw = Math.atan2(-dx, -dz);
  let err = (0.22 - b.skill * 0.14) * Math.max(0.25, 1 - b.aimTime * 1.4);
  if (bot.moving) err *= 1.6;
  const aimYaw = wantYaw + Math.sin(state.tick * 0.11 + bot.id * 3.7) * err;
  bot.yaw = turnToward(bot.yaw, aimYaw, dt * 7);
  const wantPitch = Math.atan2((enemy.y + 1.2) - (bot.y + EYE), dist);
  bot.pitch = clamp(turnToward(bot.pitch, wantPitch, dt * 7), -1.45, 1.45);
  b.aimTime += dt;
  // Strafe while fighting, and close distance if too far for the weapon.
  b.strafeTimer -= dt;
  if (b.strafeTimer <= 0) {
    b.strafeTimer = state.rng.range(0.5, 1.4);
    b.strafeDir = state.rng.chance(0.5) ? 1 : -1;
  }
  let wishX = 0; let wishZ = 0;
  if (dist > 26 && bot.weapon !== 'longbow') { wishX = -Math.sin(bot.yaw); wishZ = -Math.cos(bot.yaw); }
  else if (dist < 4) { wishX = Math.sin(bot.yaw); wishZ = Math.cos(bot.yaw); }
  else {
    // Strafe perpendicular.
    wishX = Math.cos(bot.yaw) * b.strafeDir * 0.7;
    wishZ = -Math.sin(bot.yaw) * b.strafeDir * 0.7;
  }
  const speed = b.aimTime > 0.4 ? 1.6 : 3.4;
  moveAgent(state, bot, wishX, wishZ, speed, dt);
  // Fire in bursts after the reaction time.
  if (b.reactTimer > 0) { b.reactTimer -= dt; return; }
  if (bot.reloading > 0) return;
  if (bot.mag === 0) { reloadWeapon(state, bot); return; }
  if (b.burstPause > 0) { b.burstPause -= dt; return; }
  if (b.burstLeft <= 0) {
    const w = WEAPONS[bot.weapon];
    b.burstLeft = w.auto ? Math.round(2 + state.rng.range(0, 3) + b.skill * 2) : 1;
    b.burstPause = 0;
  }
  // Only fire when the aim has settled a little and the shot is plausible.
  if (b.aimTime > 0.12 && Math.abs(angleDiff(bot.yaw, wantYaw)) < 0.14 + err) {
    // Aim error is injected through the bot's pitch/yaw jitter at fire time:
    // fireWeapon uses the bot's yaw/pitch plus bloom, so wobble the aim.
    const savedYaw = bot.yaw; const savedPitch = bot.pitch;
    bot.yaw = aimYaw + (state.rng.next() - 0.5) * err * 1.4;
    bot.pitch = wantPitch + (state.rng.next() - 0.5) * err * 1.4;
    fireWeapon(state, bot);
    bot.yaw = savedYaw; bot.pitch = savedPitch;
    b.burstLeft -= 1;
    if (b.burstLeft <= 0) b.burstPause = state.rng.range(0.35, 0.8) - b.skill * 0.25;
  }
}

// ---- jobs ----------------------------------------------------------------

function followPath(state, bot, dt, speed) {
  const b = bot.bot;
  // Stuck detection: if the bot barely moved for 2 s, repath from where it is.
  if (b.lastX === undefined) { b.lastX = bot.x; b.lastZ = bot.z; b.stuckTimer = 0; }
  const moved = Math.hypot(bot.x - b.lastX, bot.z - b.lastZ);
  if (moved > 0.5) { b.lastX = bot.x; b.lastZ = bot.z; b.stuckTimer = 0; }
  else {
    b.stuckTimer += dt;
    if (b.stuckTimer > 2 && b.pathIdx < b.path.length) {
      b.path = findPath(nearestNode(bot.x, bot.z), b.targetNode);
      b.pathIdx = 0;
      b.stuckTimer = 0;
      b.lastX = bot.x; b.lastZ = bot.z;
    }
  }
  if (b.pathIdx >= b.path.length) {
    // Arrived: plant if this bot carries the charge, defuse if the charge is
    // planted here, otherwise hold this spot and watch.
    if (state.bomb.state === 'carried' && state.bomb.carrierId === bot.id && b.site && inSite(b.site, bot.x, bot.z)) {
      b.state = 'plant'; b.plantTimer = 0;
    } else if (bot.team === 'def' && state.bomb.state === 'planted' && Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z) < 2.5) {
      b.state = 'defuse'; b.defuseTimer = 0;
    } else {
      b.state = 'hold';
      b.holdTimer = 4 + state.rng.range(0, 4);
    }
    moveAgent(state, bot, 0, 0, 0, dt);
    return;
  }
  const node = MAP.nav.nodes[b.path[b.pathIdx]];
  const dx = node.x - bot.x; const dz = node.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.9) { b.pathIdx += 1; return; }
  const wantYaw = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, wantYaw, dt * 6);
  const moving = Math.abs(angleDiff(bot.yaw, wantYaw)) < 1.2;
  moveAgent(state, bot, moving ? dx / dist : 0, moving ? dz / dist : 0, speed, dt);
  // Occasionally toss a smoke at a site entrance when pushing.
  if (bot.team === 'atk' && bot.grenades.smoke > 0 && b.pathIdx >= b.path.length - 1 && state.rng.chance(0.002)) {
    throwGrenade(state, bot, 'smoke');
  }
}

function doPlant(state, bot, dt) {
  const b = bot.bot;
  const site = b.site;
  if (!site || !inSite(site, bot.x, bot.z)) {
    b.state = 'move';
    b.targetNode = site === 'A' ? 13 : 14;
    b.path = findPath(nearestNode(bot.x, bot.z), b.targetNode);
    b.pathIdx = 0;
    return;
  }
  moveAgent(state, bot, 0, 0, 0, dt);
  b.plantTimer += dt;
  bot.planting = b.plantTimer;
  if (b.plantTimer >= 3.2) {
    const bomb = state.bomb;
    bomb.state = 'planted'; bomb.site = site; bomb.x = bot.x; bomb.z = bot.z;
    bomb.fuseTimer = 40; bomb.defuseTimer = 0; bomb.defuserId = -1;
    bot.planting = 0;
    b.state = 'defendSite';
    b.holdTimer = 40;
    state.message = `Charge planted at ${site} — defend it`;
    state.messageTimer = 4;
    state.events.push({ type: 'planted', site, x: bomb.x, z: bomb.z });
    for (const a of state.agents) {
      if (a.team === 'def' && a.alive && a.bot) {
        a.bot.state = 'rotate';
        a.bot.targetNode = site === 'A' ? 13 : 14;
        a.bot.path = findPath(nearestNode(a.x, a.z), a.bot.targetNode);
        a.bot.pathIdx = 0;
      }
    }
  }
}

function gotoBomb(state, bot, dt) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted') { bot.bot.state = 'hold'; return; }
  const dx = bomb.x - bot.x; const dz = bomb.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.4) {
    bot.bot.state = 'defuse';
    bot.bot.defuseTimer = 0;
    moveAgent(state, bot, 0, 0, 0, dt);
    return;
  }
  const wantYaw = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, wantYaw, dt * 6);
  moveAgent(state, bot, dx / dist, dz / dist, 4.3, dt);
}

function doDefuse(state, bot, dt) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted') { bot.bot.state = 'hold'; return; }
  const d = Math.hypot(bot.x - bomb.x, bot.z - bomb.z);
  if (d > 1.6) {
    bot.bot.state = 'rotate';
    bot.bot.targetNode = bomb.site === 'A' ? 13 : 14;
    bot.bot.path = findPath(nearestNode(bot.x, bot.z), bot.bot.targetNode);
    bot.bot.pathIdx = 0;
    return;
  }
  moveAgent(state, bot, 0, 0, 0, dt);
  const need = bot.hasDefuseKit ? 5 : 10;
  bomb.defuserId = bot.id;
  bot.bot.defuseTimer += dt;
  bot.defusing = bot.bot.defuseTimer;
  if (bot.bot.defuseTimer >= need) {
    bomb.state = 'defused';
    bot.defusing = 0;
  }
}

// A defender that reaches the planted site starts defusing.
export function maybeStartDefuse(state, bot) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted' || bot.team !== 'def') return false;
  if (Math.hypot(bot.x - bomb.x, bot.z - bomb.z) > 1.6) return false;
  if (bomb.defuserId >= 0 && bomb.defuserId !== bot.id) return false;
  bot.bot.state = 'defuse';
  bot.bot.defuseTimer = 0;
  return true;
}

// ---- helpers -------------------------------------------------------------

function turnToward(angle, target, maxStep) {
  const diff = angleDiff(angle, target);
  if (Math.abs(diff) <= maxStep) return target;
  return angle + Math.sign(diff) * maxStep;
}

function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v, min, max) { return v < min ? min : v > max ? v : v; }
