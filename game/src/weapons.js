// Weapon and equipment catalogue for FOUNDRY LINE. All names, stats and prices
// are original. Damage is per body hit; headshots multiply it. Spread is in
// radians; recoil is the pitch kick per shot in radians.

export const WEAPONS = {
  p2000: {
    id: 'p2000', name: 'P2000', kind: 'pistol', price: 0, auto: false,
    damage: 34, headMult: 4.0, fireRate: 6.5, mag: 13, reserve: 52,
    reloadTime: 2.0, spread: 0.011, moveSpread: 0.035, recoil: 0.011,
    range: 60, tracer: 0xffe08a,
  },
  mp5: {
    id: 'mp5', name: 'MP5 “Hornet”', kind: 'smg', price: 1500, auto: true,
    damage: 26, headMult: 4.0, fireRate: 12, mag: 30, reserve: 120,
    reloadTime: 2.4, spread: 0.016, moveSpread: 0.045, recoil: 0.008,
    range: 55, tracer: 0xffe08a,
  },
  vk47: {
    id: 'vk47', name: 'VK-47', kind: 'rifle', price: 2500, auto: true,
    damage: 36, headMult: 4.0, fireRate: 10, mag: 30, reserve: 90,
    reloadTime: 2.5, spread: 0.009, moveSpread: 0.040, recoil: 0.016,
    range: 80, tracer: 0xffd27a,
  },
  longbow: {
    id: 'longbow', name: 'Longbow .50', kind: 'sniper', price: 4750, auto: false,
    damage: 115, headMult: 2.0, fireRate: 0.8, mag: 5, reserve: 20,
    reloadTime: 3.6, spread: 0.001, moveSpread: 0.12, recoil: 0.075,
    range: 120, tracer: 0x9fd8ff, scoped: true,
  },
  breacher: {
    id: 'breacher', name: 'Breacher 12', kind: 'shotgun', price: 1200, auto: false,
    damage: 11, headMult: 2.0, fireRate: 1.4, mag: 6, reserve: 24,
    reloadTime: 3.0, spread: 0.055, moveSpread: 0.075, recoil: 0.045,
    range: 30, pellets: 8, tracer: 0xffc46b,
  },
};

export const EQUIPMENT = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650, desc: 'Halves bullet damage to the body.' },
  helmet: { id: 'helmet', name: 'Kevlar Helmet', price: 350, desc: 'Halves bullet damage to the head. Needs a vest.' },
  he: { id: 'he', name: 'HE Grenade', price: 300, desc: 'Explodes for up to 110 damage in a 6 m radius.' },
  flash: { id: 'flash', name: 'Flashbang', price: 200, desc: 'Blinds anyone looking at it. Bots lose their aim.' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, desc: 'A thick grey cloud that blocks sight for 18 s.' },
  defuse: { id: 'defuse', name: 'Defuse Kit', price: 400, desc: 'Defuse the charge in 5 s instead of 10 s.' },
};

export const BUY_ORDER = ['vk47', 'longbow', 'mp5', 'breacher', 'p2000'];
export const BUY_EQUIP_ORDER = ['kevlar', 'helmet', 'he', 'flash', 'smoke', 'defuse'];

export function weaponPrice(id) { return WEAPONS[id]?.price ?? 0; }
