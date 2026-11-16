// Rendering for FOUNDRY LINE. This module owns three.js and nothing else: it
// reads the simulation state every frame and moves meshes to match it. No game
// logic lives here, and no mesh is allocated inside the frame loop — effects
// come from fixed pools.

import * as THREE from 'three';
import { MAP } from './map.js';
import { WEAPONS } from './weapons.js';

const TEAM_COLOR = { atk: 0xf0a830, def: 0x3fa7c4 };
const TEAM_DARK = { atk: 0x8a5a12, def: 0x1d5568 };

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function floorTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#2b2e33'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.strokeStyle = 'rgba(240,168,48,0.10)';
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  });
}

function wallTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#2e333a'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < s; y += 42) g.fillRect(0, y, s, 3);
    g.fillStyle = 'rgba(240,168,48,0.16)';
    g.fillRect(0, s - 14, s, 6);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  });
}

function crateTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#4a3a26'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
    g.fillStyle = 'rgba(240,168,48,0.25)';
    g.font = 'bold 20px sans-serif'; g.fillText('FL', 8, 26);
  });
}

function siteTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,10,12,0.55)';
  g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 108, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color;
  g.font = 'bold 150px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 134);
  return new THREE.CanvasTexture(c);
}

function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(1.7, 0.42, 1);
  return s;
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1116);
  scene.fog = new THREE.Fog(0x14161a, 34, 95);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 200);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0x8fa3b8, 0x2a2019, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.5);
  sun.position.set(18, 30, 12);
  scene.add(sun);
  const furnaceGlow = new THREE.PointLight(0xff6a1a, 60, 22, 1.6);
  furnaceGlow.position.set(0, 2.5, 0);
  scene.add(furnaceGlow);

  const floorTex = floorTexture();
  floorTex.repeat.set(16, 11);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 44),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallTex = wallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.25 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.7, metalness: 0.5 });
  const furnaceMat = new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.55, metalness: 0.7 });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const c of MAP.colliders) {
    const w = c.x1 - c.x0; const d = c.z1 - c.z0; const h = c.h;
    let mat = wallMat;
    if (h <= 2.4 && w <= 3.5 && d <= 3.5) mat = crateMat;
    if (c.x0 === -2.5 && c.z0 === -2.5) mat = furnaceMat;
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set((c.x0 + c.x1) / 2, h / 2, (c.z0 + c.z1) / 2);
    scene.add(mesh);
    // Amber cap line on tall walls so the map reads at a glance.
    if (h >= 4) {
      const cap = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xf0a830 }));
      cap.scale.set(w + 0.06, 0.08, d + 0.06);
      cap.position.set((c.x0 + c.x1) / 2, h - 0.04, (c.z0 + c.z1) / 2);
      scene.add(cap);
    }
  }
  // Molten slit on the furnace faces: a thin glowing band, not a glowing box.
  for (const z of [-2.53, 2.53]) {
    const slit = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    slit.scale.set(3.4, 0.28, 0.06);
    slit.position.set(0, 1.1, z);
    scene.add(slit);
  }

  // Site markers: floor rings plus floating letters.
  const siteRings = {};
  for (const [key, s] of Object.entries(MAP.sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 48),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xf0a830 : 0x3fa7c4, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    siteRings[key] = ring;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: siteTexture(key, key === 'A' ? '#f0a830' : '#3fa7c4'), transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(s.x, 4.6, s.z);
    scene.add(sign);
    const lamp = new THREE.PointLight(key === 'A' ? 0xf0a830 : 0x3fa7c4, 14, 12, 1.8);
    lamp.position.set(s.x, 3.4, s.z);
    scene.add(lamp);
  }

  // Barrels and pipes for silhouette.
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4d1f, roughness: 0.8, metalness: 0.3 });
  for (const [x, z] of [[-27, -6], [-26.2, -5.4], [27, -6], [26.2, -5.4], [-10, 17], [10, 17], [-5, 6.5], [5, -6.5]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 0.55, z);
    scene.add(b);
  }
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.7 });
  for (const x of [-8, 0, 8]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(x, 1.35, -19);
    scene.add(pipe);
  }

  // Bomb mesh (shown when dropped or planted).
  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.8 }));
  bombBody.scale.set(0.55, 0.28, 0.35);
  bombMesh.add(bombBody);
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  bombLight.position.set(0.2, 0.2, 0);
  bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  // ---- agent models ------------------------------------------------------
  const agentModels = new Map();
  function buildAgentModel(agent) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[agent.team], roughness: 0.75, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: TEAM_DARK[agent.team], roughness: 0.8, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.95, 10), bodyMat);
    body.position.y = 0.95;
    g.add(body);
    const chest = new THREE.Mesh(boxGeo, dark);
    chest.scale.set(0.5, 0.4, 0.3);
    chest.position.set(0, 1.15, 0.05);
    g.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.7 }));
    head.position.y = 1.58;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), new THREE.MeshStandardMaterial({ color: TEAM_DARK[agent.team], roughness: 0.6, metalness: 0.3 }));
    helmet.scale.set(1, 0.72, 1);
    helmet.position.y = 1.66;
    g.add(helmet);
    const visor = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.6 }));
    visor.scale.set(0.3, 0.08, 0.1);
    visor.position.set(0, 1.6, -0.18);
    g.add(visor);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.5, 10), dark);
    legs.position.y = 0.28;
    g.add(legs);
    const gun = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.4, metalness: 0.7 }));
    gun.scale.set(0.09, 0.12, 0.85);
    gun.position.set(0.22, 1.18, -0.35);
    g.add(gun);
    if (!agent.isPlayer) {
      const label = nameSprite(agent.name, agent.team === 'atk' ? '#f0a830' : '#7fd4ea');
      label.position.y = 2.05;
      g.add(label);
    }
    g.userData.body = body; g.userData.head = head; g.userData.gun = gun;
    scene.add(g);
    return g;
  }

  // ---- viewmodel ---------------------------------------------------------
  const viewmodel = new THREE.Group();
  const vmMat = new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.35, metalness: 0.75 });
  const vmAccent = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.6 });
  const vmBody = new THREE.Mesh(boxGeo, vmMat);
  vmBody.scale.set(0.09, 0.13, 0.62);
  viewmodel.add(vmBody);
  const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), vmMat);
  vmBarrel.rotation.x = Math.PI / 2;
  vmBarrel.position.set(0, 0.01, -0.44);
  viewmodel.add(vmBarrel);
  const vmSight = new THREE.Mesh(boxGeo, vmAccent);
  vmSight.scale.set(0.03, 0.05, 0.1);
  vmSight.position.set(0, 0.09, -0.12);
  viewmodel.add(vmSight);
  const vmGrip = new THREE.Mesh(boxGeo, vmMat);
  vmGrip.scale.set(0.07, 0.18, 0.09);
  vmGrip.position.set(0, -0.13, 0.12);
  vmGrip.rotation.x = 0.35;
  viewmodel.add(vmGrip);
  const muzzle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  muzzle.position.set(0, 0.01, -0.64);
  viewmodel.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffb347, 0, 7, 1.8);
  muzzleLight.position.set(0, 0, -0.5);
  viewmodel.add(muzzleLight);
  viewmodel.position.set(0.3, -0.27, -0.55);
  viewmodel.scale.setScalar(0.75);
  viewmodel.rotation.y = -0.05;
  camera.add(viewmodel);

  // ---- effect pools ------------------------------------------------------
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;
  const impacts = [];
  const impactTex = canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,220,120,1)');
    grad.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  });
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: impactTex, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(0.3, 0.3, 1);
    scene.add(sp);
    impacts.push({ sp, life: 0 });
  }
  let impactIdx = 0;
  const explosions = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0 }),
    );
    const light = new THREE.PointLight(0xff8a1a, 0, 18, 1.5);
    m.add(light);
    scene.add(m);
    explosions.push({ mesh: m, light, life: 0, big: false });
  }
  let explosionIdx = 0;
  const smokePuffs = [];
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55, roughness: 1 });
    for (let j = 0; j < 6; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), mat);
      s.position.set((Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4);
      group.add(s);
    }
    group.visible = false;
    scene.add(group);
    smokePuffs.push(group);
  }

  // Grenade meshes (flying).
  const grenadeMeshes = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2c5e2e, roughness: 0.5, metalness: 0.6 }));
    m.visible = false;
    scene.add(m);
    grenadeMeshes.push(m);
  }

  const tmpV = new THREE.Vector3();
  let vmKick = 0;
  let muzzleLife = 0;

  function syncAgents(state, eyeId) {
    for (const a of state.agents) {
      let model = agentModels.get(a.id);
      if (!model) { model = buildAgentModel(a); agentModels.set(a.id, model); }
      // Never draw the agent the camera is inside (the player, or the
      // teammate being spectated after death).
      if (a.id === eyeId) { model.visible = false; continue; }
      model.visible = true;
      model.position.set(a.x, a.y, a.z);
      model.rotation.y = a.yaw;
      if (!a.alive) {
        model.rotation.z = Math.PI / 2;
        model.position.y = 0.25;
      } else {
        model.rotation.z = 0;
        // Walk bob.
        const bob = a.moving ? Math.sin(state.tick * 0.35) * 0.04 : 0;
        model.position.y = a.y + Math.abs(bob);
        model.scale.y = a.crouched ? 0.72 : 1;
      }
      // Weapon swap changes the gun's length a little.
      const w = WEAPONS[a.weapon];
      model.userData.gun.scale.z = w.kind === 'sniper' ? 1.25 : w.kind === 'shotgun' ? 1.05 : 0.85;
    }
  }

  function render(state, dt, time) {
    // Camera.
    const p = state.agents[0];
    if (state.phase === 'menu') {
      const a = time * 0.05;
      camera.position.set(Math.sin(a) * 26, 15, Math.cos(a) * 20);
      camera.lookAt(0, 1, -6);
      camera.fov = 60;
    } else {
      let eye = p;
      if (!p.alive) {
        const mate = state.agents.find((a) => a.alive && a.team === 'atk' && !a.isPlayer);
        if (mate) eye = mate;
      }
      camera.position.set(eye.x, eye.y + (eye.crouched ? 1.12 : 1.62), eye.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = eye.yaw;
      camera.rotation.x = eye.pitch;
      camera.rotation.z = 0;
      camera.fov = 75;
      state._eyeId = eye.id;
    }
    camera.updateProjectionMatrix();
    // Viewmodel kick and muzzle flash decay.
    vmKick = Math.max(0, vmKick - dt * 6);
    muzzleLife = Math.max(0, muzzleLife - dt * 9);
    viewmodel.position.z = -0.55 + vmKick * 0.12;
    viewmodel.position.y = -0.27 + vmKick * 0.03;
    viewmodel.rotation.x = vmKick * 0.18;
    muzzle.material.opacity = muzzleLife > 0 ? 0.9 : 0;
    muzzleLight.intensity = muzzleLife > 0 ? 26 : 0;
    viewmodel.visible = p.alive && (state.phase === 'live' || state.phase === 'buy');

    syncAgents(state, state._eyeId ?? 0);

    // Bomb.
    const b = state.bomb;
    if (b.state === 'planted' || b.state === 'dropped') {
      bombMesh.visible = true;
      bombMesh.position.set(b.x, 0.16, b.z);
      bombLight.material.color.setHex(Math.floor(time * 4) % 2 === 0 ? 0xff2222 : 0x551111);
    } else {
      bombMesh.visible = false;
    }
    // Site rings pulse when the charge is planted there.
    for (const [key, ring] of Object.entries(siteRings)) {
      ring.material.opacity = b.state === 'planted' && b.site === key
        ? 0.5 + Math.sin(time * 6) * 0.3
        : 0.45;
    }
    // Grenades in flight.
    state.grenades.forEach((g, i) => {
      const m = grenadeMeshes[i];
      if (!m) return;
      m.visible = true;
      m.position.set(g.x, g.y, g.z);
    });
    for (let i = state.grenades.length; i < grenadeMeshes.length; i++) grenadeMeshes[i].visible = false;
    // Smoke clouds.
    state.smokes.forEach((s, i) => {
      const grp = smokePuffs[i];
      if (!grp) return;
      grp.visible = true;
      grp.position.set(s.x, 0, s.z);
      const grow = Math.min(1, (18 - s.timer) * 0.8);
      grp.scale.setScalar(0.6 + grow * 0.7);
    });
    for (let i = state.smokes.length; i < smokePuffs.length; i++) smokePuffs[i].visible = false;

    // Decay pooled effects.
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt * 7;
        t.line.material.opacity = Math.max(0, t.life);
      }
    }
    for (const im of impacts) {
      if (im.life > 0) {
        im.life -= dt * 4;
        im.sp.material.opacity = Math.max(0, im.life);
        im.sp.scale.setScalar(0.3 + (1 - im.life) * 0.5);
      }
    }
    for (const e of explosions) {
      if (e.life > 0) {
        e.life -= dt * (e.big ? 1.4 : 2.2);
        const k = 1 - Math.max(0, e.life);
        e.mesh.scale.setScalar(0.5 + k * (e.big ? 9 : 5));
        e.mesh.material.opacity = Math.max(0, e.life) * 0.75;
        e.light.intensity = Math.max(0, e.life) * (e.big ? 220 : 120);
      }
    }
    furnaceGlow.intensity = 55 + Math.sin(time * 3.1) * 8;
    renderer.render(scene, camera);
  }

  function addTracer(x1, y1, z1, x2, y2, z2, color) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1);
    pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color || 0xffe08a);
    t.life = 1;
    t.line.material.opacity = 0.9;
  }

  function addImpact(x, y, z) {
    const im = impacts[impactIdx];
    impactIdx = (impactIdx + 1) % impacts.length;
    im.sp.position.set(x, y, z);
    im.life = 1;
    im.sp.material.opacity = 1;
  }

  function addExplosion(x, y, z, big) {
    const e = explosions[explosionIdx];
    explosionIdx = (explosionIdx + 1) % explosions.length;
    e.mesh.position.set(x, y + 0.4, z);
    e.big = !!big;
    e.life = 1;
  }

  function fireMuzzle() {
    vmKick = 1;
    muzzleLife = 1;
    muzzle.rotation.z = Math.random() * Math.PI;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { renderer, camera, scene, render, addTracer, addImpact, addExplosion, fireMuzzle, resize };
}
