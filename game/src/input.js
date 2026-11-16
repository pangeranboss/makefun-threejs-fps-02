// Keyboard and mouse input for FOUNDRY LINE. The main loop polls a fresh
// input frame each fixed step; mouse-look deltas accumulate between steps.
// Pointer lock is requested from the canvas click (or the Play button).

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    firing: false, reload: false, crouch: false, walk: false,
    jump: false, use: false, grenade: null, switchTo: null,
    buyPressed: false, pausePressed: false,
    locked: false,
    consumeLook() {
      const l = { x: this.lookX, y: this.lookY };
      this.lookX = 0; this.lookY = 0;
      return l;
    },
  };
  let queuedSwitch = null;
  let queuedGrenade = null;
  let queuedReload = false;
  let queuedJump = false;
  let queuedBuy = false;
  let queuedPause = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyR') queuedReload = true;
    if (e.code === 'Space') { queuedJump = true; e.preventDefault(); }
    if (e.code === 'KeyB') queuedBuy = true;
    if (e.code === 'Escape') queuedPause = true;
    if (e.code === 'Digit1') queuedSwitch = 'p2000';
    if (e.code === 'Digit2') queuedSwitch = 'mp5';
    if (e.code === 'Digit3') queuedSwitch = 'vk47';
    if (e.code === 'Digit4') queuedSwitch = 'breacher';
    if (e.code === 'Digit5') queuedSwitch = 'longbow';
    if (e.code === 'Digit6') queuedGrenade = 'he';
    if (e.code === 'Digit7') queuedGrenade = 'flash';
    if (e.code === 'Digit8') queuedGrenade = 'smoke';
    if (e.code === 'KeyG') queuedGrenade = 'he';
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookX += e.movementX;
    input.lookY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });

  input.lockPointer = () => {
    try { canvas.requestPointerLock(); } catch { /* headless or denied */ }
  };
  input.unlockPointer = () => {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
  };

  // Called once per fixed step: fold the live key state into a step input.
  input.poll = () => {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    input.moveY = fwd;
    input.moveX = strafe;
    input.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    input.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
    input.use = keys.has('KeyE');
    input.reload = queuedReload; queuedReload = false;
    input.jump = queuedJump; queuedJump = false;
    input.buyPressed = queuedBuy; queuedBuy = false;
    input.pausePressed = queuedPause; queuedPause = false;
    input.switchTo = queuedSwitch; queuedSwitch = null;
    input.grenade = queuedGrenade; queuedGrenade = null;
    const look = input.consumeLook();
    input.lookX = look.x;
    input.lookY = look.y;
    return input;
  };

  input.isDown = (code) => keys.has(code);
  return input;
}
