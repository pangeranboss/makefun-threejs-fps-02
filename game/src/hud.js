// HUD and menus for FOUNDRY LINE. The DOM lives in index.html; this module
// owns every write to it. Updates are cached so unchanged values never touch
// the DOM twice, and the buy menu is built once from the weapon catalogue.

import { WEAPONS, EQUIPMENT, BUY_ORDER, BUY_EQUIP_ORDER } from './weapons.js';
import { MAP } from './map.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    dmg: $('dmg-vignette'), flash: $('flash-overlay'),
    healthBar: $('health-bar'), healthNum: $('health-num'),
    armorBar: $('armor-bar'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), grenades: $('grenade-slots'),
    money: $('money'), scoreAtk: $('score-atk'), scoreDef: $('score-def'),
    roundNum: $('round-num'), timer: $('timer'), timerBar: $('timer-bar'),
    aliveAtk: $('alive-atk'), aliveDef: $('alive-def'),
    killfeed: $('killfeed'), message: $('message'), objective: $('objective'),
    bombStatus: $('bomb-status'), fps: $('fps'),
    overlays: {
      start: $('overlay-start'), buy: $('overlay-buy'), pause: $('overlay-pause'),
      round: $('overlay-round'), match: $('overlay-match'),
    },
    roundTitle: $('round-title'), roundReason: $('round-reason'),
    matchTitle: $('match-title'), matchScore: $('match-score'),
    buyMoney: $('buy-money'), buyList: $('buy-list'), buyEquip: $('buy-equip'),
    buyHint: $('buy-hint'),
  };
  const last = {};
  let hitTimer = 0;
  let dmgTimer = 0;

  function setText(el, key, value) {
    if (last[key] !== value) { last[key] = value; el.textContent = value; }
  }
  function setWidth(el, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
    if (last[key] !== v) { last[key] = v; el.style.width = v; }
  }

  // Build the buy menu once.
  const buyButtons = new Map();
  for (const id of BUY_ORDER) {
    const w = WEAPONS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'buy-item';
    b.innerHTML = `<span class="buy-name">${w.name}</span><span class="buy-stat">${w.kind} · ${w.damage} dmg · ${w.mag} rounds</span><span class="buy-price">$${w.price}</span>`;
    b.addEventListener('click', () => callbacks.buyWeapon(id));
    els.buyList.appendChild(b);
    buyButtons.set(id, b);
  }
  for (const id of BUY_EQUIP_ORDER) {
    const e = EQUIPMENT[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'buy-item';
    b.innerHTML = `<span class="buy-name">${e.name}</span><span class="buy-stat">${e.desc}</span><span class="buy-price">$${e.price}</span>`;
    b.addEventListener('click', () => callbacks.buyEquipment(id));
    els.buyEquip.appendChild(b);
    buyButtons.set(id, b);
  }

  function showOverlay(name) {
    for (const [key, el] of Object.entries(els.overlays)) {
      el.hidden = key !== name;
    }
    if (!name) for (const el of Object.values(els.overlays)) el.hidden = true;
  }

  function refreshBuy(state) {
    const p = state.agents[0];
    setText(els.buyMoney, 'buyMoney', `$${p.money}`);
    for (const [id, b] of buyButtons) {
      const owned = p.weapon === id || p.grenades[id] >= 1 || (id === 'kevlar' && p.armor > 0) || (id === 'helmet' && p.helmet) || (id === 'defuse' && p.hasDefuseKit);
      const price = WEAPONS[id] ? WEAPONS[id].price : EQUIPMENT[id].price;
      const afford = p.money >= price;
      b.classList.toggle('owned', owned);
      b.classList.toggle('cant', !owned && !afford);
      b.disabled = state.phase !== 'buy';
    }
    setText(els.buyHint, 'buyHint', state.phase === 'buy'
      ? `Buy phase ends in ${Math.max(0, Math.ceil(state.phaseTimer))} s — click an item or press B to close`
      : 'Buy phase is over');
  }

  function update(state, dt) {
    const p = state.agents[0];
    // Health / armour.
    setWidth(els.healthBar, 'hp', p.hp);
    setText(els.healthNum, 'hpNum', `${Math.ceil(p.hp)}`);
    setWidth(els.armorBar, 'ar', p.armor);
    setText(els.armorNum, 'arNum', `${Math.ceil(p.armor)}`);
    // Ammo.
    const w = WEAPONS[p.weapon];
    setText(els.ammoMag, 'mag', `${p.mag}`);
    setText(els.ammoReserve, 'res', `/ ${p.reserve}`);
    setText(els.weaponName, 'wname', w.name);
    const g = p.grenades;
    setText(els.grenades, 'gren', `HE ${g.he} · Flash ${g.flash} · Smoke ${g.smoke}`);
    // Money / score / round / timer.
    setText(els.money, 'money', `$${p.money}`);
    setText(els.scoreAtk, 'sA', `${state.score.atk}`);
    setText(els.scoreDef, 'sD', `${state.score.def}`);
    setText(els.roundNum, 'rnd', `ROUND ${Math.min(state.round, 15)}`);
    const t = Math.max(0, Math.ceil(state.phaseTimer));
    const mm = Math.floor(t / 60); const ss = `${t % 60}`.padStart(2, '0');
    setText(els.timer, 'timer', `${mm}:${ss}`);
    const total = state.phase === 'buy' ? 15 : state.phase === 'live' ? 100 : 5;
    setWidth(els.timerBar, 'tbar', (state.phaseTimer / total) * 100);
    // Alive pips.
    const atkAlive = state.agents.filter((a) => a.alive && a.team === 'atk').length;
    const defAlive = state.agents.filter((a) => a.alive && a.team === 'def').length;
    setText(els.aliveAtk, 'alA', '●'.repeat(atkAlive) + '○'.repeat(5 - atkAlive));
    setText(els.aliveDef, 'alD', '●'.repeat(defAlive) + '○'.repeat(5 - defAlive));
    // Crosshair gap grows with movement and bloom.
    const gap = 3 + Math.min(14, p.moveSpeed * 1.6 + p.bloom * 10);
    els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    // Objective line.
    let obj = '';
    if (state.phase === 'buy') obj = 'Buy phase — spend your money, then the round starts';
    else if (state.phase === 'live' && state.bomb.state === 'planted') obj = `Charge planted at ${state.bomb.site} — ${Math.ceil(state.bomb.fuseTimer)} s to detonation`;
    else if (state.phase === 'live' && state.bomb.state === 'carried') obj = state.bomb.carrierId === 0 ? 'You carry the charge — plant it at A or B (hold E in the zone)' : 'Escort the carrier — plant the charge at A or B';
    else if (state.phase === 'live' && state.bomb.state === 'dropped') obj = 'The charge is on the ground — pick it up';
    setText(els.objective, 'obj', obj);
    // Bomb status chip.
    let bomb = '';
    if (state.bomb.state === 'planted') bomb = `◉ CHARGE ${state.bomb.site} · ${Math.ceil(state.bomb.fuseTimer)}s`;
    else if (state.bomb.state === 'carried' && state.bomb.carrierId === 0) bomb = '◉ YOU CARRY THE CHARGE';
    setText(els.bombStatus, 'bomb', bomb);
    els.bombStatus.hidden = bomb === '';
    // Centre message (only during play; round-end has its own overlay).
    if ((state.phase === 'live' || state.phase === 'buy') && state.messageTimer > 0 && state.message) {
      setText(els.message, 'msg', state.message);
      els.message.hidden = false;
    } else {
      els.message.hidden = true;
    }
    // Plant / defuse progress is drawn by main.js via setProgress.
    // Hitmarker and damage fade.
    if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) els.hitmarker.classList.remove('on'); }
    if (dmgTimer > 0) {
      dmgTimer -= dt;
      els.dmg.style.opacity = `${Math.max(0, dmgTimer * 1.4)}`;
    }
    // Flash blindness.
    const fl = p.flashTimer > 0 ? Math.min(1, p.flashTimer / 1.2) : 0;
    els.flash.style.opacity = `${(fl * 0.92).toFixed(2)}`;
    // Killfeed.
    const feed = state.killfeed.map((k) => {
      const head = k.head ? ' ◎' : '';
      return `<div class="kf-row"><span class="kf-${k.killerTeam}">${k.killer}</span><span class="kf-w">${k.weapon}${head}</span><span class="kf-${k.victimTeam}">${k.victim}</span></div>`;
    }).join('');
    if (last.feed !== feed) { last.feed = feed; els.killfeed.innerHTML = feed; }
    // Overlays by phase.
    if (state.phase === 'menu') showOverlay('start');
    else if (state.phase === 'buy' && callbacks.buyOpen) showOverlay('buy');
    else if (state.phase === 'roundEnd') {
      showOverlay('round');
      const won = state.roundWinner === 'atk';
      setText(els.roundTitle, 'rt', won ? 'ROUND WON' : 'ROUND LOST');
      els.roundTitle.className = won ? 'won' : 'lost';
      setText(els.roundReason, 'rr', state.roundReason);
    } else if (state.phase === 'matchEnd') {
      showOverlay('match');
      const won = state.matchWinner === 'atk';
      setText(els.matchTitle, 'mt', state.matchWinner === 'draw' ? 'DRAW' : won ? 'MATCH WON' : 'MATCH LOST');
      els.matchTitle.className = state.matchWinner === 'draw' ? '' : won ? 'won' : 'lost';
      setText(els.matchScore, 'ms', `Vanguard ${state.score.atk} — ${state.score.def} Sentinels`);
    } else if (callbacks.paused) {
      showOverlay('pause');
    } else {
      showOverlay(null);
    }
    if (state.phase === 'buy' || callbacks.buyOpen) refreshBuy(state);
  }

  function hitmarker(head, kill) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('kill', kill);
    els.hitmarker.classList.toggle('head', head);
    hitTimer = kill ? 0.4 : 0.16;
  }

  function damageFlash() {
    dmgTimer = 0.7;
    els.dmg.style.opacity = '0.9';
  }

  function setFps(v) {
    setText(els.fps, 'fps', `${v} fps`);
  }

  function setProgress(frac, label) {
    const bar = document.getElementById('progress');
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('progress-label');
    if (frac == null) { bar.hidden = true; return; }
    bar.hidden = false;
    fill.style.width = `${Math.round(frac * 100)}%`;
    text.textContent = label;
  }

  return { update, hitmarker, damageFlash, setFps, setProgress, showOverlay, refreshBuy };
}
