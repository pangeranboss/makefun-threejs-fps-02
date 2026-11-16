// Bootstrap and frame loop for FOUNDRY LINE. The simulation runs on a fixed
// 60 Hz step, decoupled from rendering: input is polled once per step, the
// step runs, its events are drained into sound / HUD / render effects, and the
// renderer draws the latest state. Deterministic screenshot modes
// (?shot=start|buy|play|end&seed=N) drive the same code path with a scripted
// setup and freeze the simulation after a fixed number of ticks so a render
// is reproducible.

import { createGame, startMatch, stepGame, DT, buyWeapon, buyEquipment, endRound, applyDamage } from './sim.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { ensureAudio, playShot, playHit, playDry, playReload, playExplosion, playBuy, playRoundEnd, playPlant, playBeep } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = params.get('seed') || '7';
const shotMode = !!shot;
if (shotMode) document.getElementById('fps').style.display = 'none';

const container = document.getElementById('game');
const renderer = createRenderer(container);
const input = createInput(renderer.renderer.domElement);
const state = createGame(`foundry-${seed}`);
state.shotMode = shotMode;

let paused = false;
let buyOpen = false;

const hud = createHud({
  buyWeapon: (id) => {
    const r = buyWeapon(state, id);
    if (r.ok) playBuy();
    else hudFlashBuy(r.why);
  },
  buyEquipment: (id) => {
    const r = buyEquipment(state, id);
    if (r.ok) playBuy();
    else hudFlashBuy(r.why);
  },
  get buyOpen() { return buyOpen; },
  get paused() { return paused; },
});

function hudFlashBuy(why) {
  const hint = document.getElementById('buy-hint');
  if (hint) hint.textContent = why;
}

function handleEvents() {
  const p = state.agents[0];
  for (const e of state.events) {
    switch (e.type) {
      case 'shot': {
        const shooter = state.agents[e.agentId];
        const dist = shooter ? Math.hypot(shooter.x - p.x, shooter.z - p.z) : 0;
        if (e.agentId === 0) renderer.fireMuzzle();
        playShot(e.weapon, e.agentId === 0 ? 0 : dist);
        break;
      }
      case 'tracer': renderer.addTracer(e.x1, e.y1, e.z1, e.x2, e.y2, e.z2, e.color); break;
      case 'impact': renderer.addImpact(e.x, e.y, e.z); break;
      case 'explosion': renderer.addExplosion(e.x, e.y, e.z, e.big); playExplosion(e.big); break;
      case 'hitmarker': hud.hitmarker(e.head, e.kill); if (e.kill) playHit(e.head); else playHit(e.head); break;
      case 'hurt': hud.damageFlash(); break;
      case 'dryfire': if (e.agentId === 0) playDry(); break;
      case 'reload': if (e.agentId === 0) playReload(); break;
      case 'buy': playBuy(); break;
      case 'planted': playPlant(); break;
      case 'roundStart': playBeep(); break;
      case 'roundEnd': playRoundEnd(e.winner === 'atk'); buyOpen = false; break;
      case 'playerDeath': break;
      default: break;
    }
  }
}

// ---- shot modes ----------------------------------------------------------

function setupShot() {
  if (!shotMode) return;
  if (shot === 'start') {
    // Menu over a living map: bots stand at spawn.
    return;
  }
  if (shot === 'buy') {
    startMatch(state);
    const p = state.agents[0];
    p.money = 4200;
    state.phaseTimer = 12;
    buyOpen = true;
    state.shotFreezeAt = state.tick + 150;
  }
  if (shot === 'play') {
    startMatch(state);
    const p = state.agents[0];
    p.money = 5000;
    buyWeapon(state, 'vk47');
    buyEquipment(state, 'kevlar');
    buyEquipment(state, 'he');
    p.hp = 100; p.armor = 100;
    p.mag = 24; p.reserve = 90;
    state.phase = 'live';
    state.phaseTimer = 96;
    // The player carries the charge in this shot, and the two staged
    // defenders are deliberately slow shots, so the scene stays a firefight
    // instead of a death cam.
    state.bomb.carrierId = 0;
    state.bomb.state = 'carried';
    state.message = 'Plant the charge at A or B';
    state.messageTimer = 0; // keep the staged scene clean for the shot
    // Stage a firefight up the west lane: the player rounding the crates,
    // two defenders holding the A approach, a teammate just ahead.
    p.x = -19; p.z = 4; p.yaw = 0.39; p.pitch = 0.0;
    const d1 = state.agents[5]; const d2 = state.agents[7]; const mate = state.agents[1];
    d1.x = -24; d1.z = -2.5; d1.yaw = Math.PI; d1.bot.skill = 0.3; d1.bot.state = 'hold'; d1.bot.path = []; d1.bot.pathIdx = 0;
    d2.x = -28.5; d2.z = -4.5; d2.yaw = Math.PI - 0.2; d2.bot.skill = 0.3; d2.bot.state = 'hold'; d2.bot.path = []; d2.bot.pathIdx = 0;
    mate.x = -16.5; mate.z = 0; mate.yaw = 0.35; mate.bot.state = 'hold'; mate.bot.path = []; mate.bot.pathIdx = 0;
    // Real kills behind the killfeed: Rook dropped Onyx, Sable headshot Hale.
    applyDamage(state, state.agents[6], 200, state.agents[1], false, 'vk47');
    applyDamage(state, state.agents[3], 200, state.agents[5], true, 'longbow');
    state.shotFreezeAt = state.tick + 150;
  }
  if (shot === 'end') {
    startMatch(state);
    state.round = 5;
    state.score = { atk: 4, def: 3 };
    const p = state.agents[0];
    p.kills = 6; p.money = 6100;
    endRound(state, 'atk', 'The charge detonated');
    state.phaseTimer = 4.2;
    // Stage the backdrop at site A, where the charge went off.
    p.x = -18; p.z = -6; p.yaw = 0.67; p.pitch = 0.02;
    const mate = state.agents[1];
    mate.x = -21; mate.z = -9; mate.yaw = 0.5;
    state.shotFreezeAt = state.tick + 30;
  }
  // Run the staged round synchronously to the freeze point now, so the shot
  // does not depend on how many frames the headless browser gets through
  // before it captures: the render after this is fully deterministic.
  if (shotMode && state.shotFreezeAt > 0) {
    while (state.tick < state.shotFreezeAt) {
      stepGame(state, { moveX: 0, moveY: 0, lookX: 0, lookY: 0, firing: false }, DT);
      handleEvents();
    }
  }
}
setupShot();

// ---- UI wiring -----------------------------------------------------------

document.getElementById('play').addEventListener('click', () => {
  ensureAudio();
  startMatch(state);
  input.lockPointer();
});
document.getElementById('play-again').addEventListener('click', () => {
  ensureAudio();
  startMatch(state);
  input.lockPointer();
});
document.getElementById('resume').addEventListener('click', () => {
  paused = false;
  input.lockPointer();
});
document.getElementById('restart-match').addEventListener('click', () => {
  paused = false;
  startMatch(state);
  input.lockPointer();
});
document.getElementById('close-buy').addEventListener('click', () => {
  buyOpen = false;
  input.lockPointer();
});
document.getElementById('quit-to-menu').addEventListener('click', () => {
  paused = false;
  buyOpen = false;
  state.phase = 'menu';
});
renderer.renderer.domElement.addEventListener('click', () => {
  ensureAudio();
  if ((state.phase === 'live' || state.phase === 'buy') && !paused && !buyOpen) input.lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (state.phase === 'live' || state.phase === 'buy') && !shotMode) {
    paused = true;
  }
});

// ---- frame loop ----------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;
let fpsFrames = 0;
let fpsTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - lastTime);
  lastTime = now;
  const dt = dtMs / 1000;
  fpsFrames += 1; fpsTime += dt;
  if (fpsTime >= 1) { hud.setFps(Math.round(fpsFrames / fpsTime)); fpsFrames = 0; fpsTime = 0; }

  const frozen = shotMode && state.shotFreezeAt > 0 && state.tick >= state.shotFreezeAt;
  if (!paused && !frozen && state.phase !== 'menu') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= DT && steps < 5) {
      accumulator -= DT;
      steps += 1;
      const inp = input.poll();
      if (inp.buyPressed && state.phase === 'buy') {
        buyOpen = !buyOpen;
        if (buyOpen) input.unlockPointer(); else input.lockPointer();
      }
      if (inp.pausePressed && (state.phase === 'live' || state.phase === 'buy')) {
        paused = true;
        input.unlockPointer();
      }
      const stepInput = buyOpen || paused ? { moveX: 0, moveY: 0, lookX: 0, lookY: 0, firing: false } : inp;
      stepGame(state, stepInput, DT);
      handleEvents();
      // Plant / defuse progress bar.
      const p = state.agents[0];
      if (p.planting > 0) hud.setProgress(p.planting / 3.2, 'PLANTING THE CHARGE…');
      else if (p.defusing > 0) hud.setProgress(p.defusing / (p.hasDefuseKit ? 5 : 10), 'DEFUSING…');
      else hud.setProgress(null);
    }
    if (steps === 5) accumulator = 0;
  } else if (state.phase === 'menu') {
    // Keep the menu backdrop alive: bots idle at spawn.
  }

  // In shot=play, keep a live firefight visible while frozen: re-add the two
  // tracers every frame (they decay in the renderer, so a one-off add would
  // be gone by the time the capture happens).
  if (frozen && shot === 'play') {
    const p = state.agents[0];
    const target = [state.agents[5], state.agents[7]].find((a) => a.alive);
    if (p.alive && target) {
      renderer.addTracer(p.x, p.y + 1.5, p.z, target.x, target.y + 1.2, target.z, 0xffd27a);
      renderer.addTracer(target.x, target.y + 1.2, target.z, p.x + 0.4, p.y + 1.4, p.z, 0x9fd8ff);
    }
  }

  renderer.render(state, dt, now / 1000);
  hud.update(state, dt);
  document.body.classList.toggle('in-menu', state.phase === 'menu');
  // Keep the HUD's buy overlay in sync with the buyOpen flag.
  if (buyOpen && state.phase === 'buy') hud.refreshBuy(state);
}

requestAnimationFrame(frame);
