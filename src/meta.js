// Meta-progression: clouds currency, tower themes, permanent upgrades,
// consumable power-ups, daily missions, day streak.
import { loadSave, persist } from './save.js';

export let save = null;

export function initMeta() {
  save = loadSave();
  ensureDaily();
  return save;
}

export function persistNow() { persist(save); }

// ---------- themes (tower + sky palettes) ----------
export const THEMES = [
  { id: 'classic', name: 'Classic', cost: 0,   hue: (lv) => (lv * 9) % 360, sat: 72,
    sky: [[90,160,230],[8,10,32],[160,210,250],[24,30,70]] },
  { id: 'sunset',  name: 'Sunset',  cost: 150, hue: (lv) => (10 + lv * 4) % 70, sat: 82,
    sky: [[240,120,60],[30,6,40],[255,190,120],[70,20,60]] },
  { id: 'ocean',   name: 'Ocean',   cost: 250, hue: (lv) => 165 + (lv * 5) % 75, sat: 70,
    sky: [[40,120,160],[4,16,40],[120,200,220],[10,40,80]] },
  { id: 'forest',  name: 'Forest',  cost: 200, hue: (lv) => 70 + (lv * 6) % 90, sat: 60,
    sky: [[110,170,120],[8,20,14],[190,230,170],[20,44,32]] },
  { id: 'neon',    name: 'Neon',    cost: 350, hue: (lv) => (280 + lv * 23) % 360, sat: 95,
    sky: [[30,10,50],[5,2,18],[60,16,90],[14,6,40]] },
  { id: 'mono',    name: 'Mono',    cost: 450, hue: () => 220, sat: 8,
    sky: [[70,74,86],[10,10,14],[130,134,148],[26,28,36]] },
];
export function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

// ---------- permanent upgrade: wider start block ----------
export const WIDE_COSTS = [120, 300, 600];   // levels 1..3, +18 px each
export function wideBonus() { return save.wideLvl * 18; }

// ---------- power-up shop ----------
export const POWERUPS = [
  { id: 'slowmo', name: 'SLOW-MO', cost: 40, max: 3, desc: '8s slow motion on demand' },
  { id: 'magnet', name: 'MAGNET',  cost: 55, max: 3, desc: '10s bigger perfect window' },
];

export function canBuy(cost) { return save.clouds >= cost; }

export function buyTheme(id) {
  const t = themeById(id);
  if (save.themesOwned.includes(id)) { save.theme = id; persistNow(); return true; }
  if (!canBuy(t.cost)) return false;
  save.clouds -= t.cost;
  save.themesOwned.push(id);
  save.theme = id;
  persistNow();
  return true;
}

export function buyWide() {
  if (save.wideLvl >= 3) return false;
  const cost = WIDE_COSTS[save.wideLvl];
  if (!canBuy(cost)) return false;
  save.clouds -= cost; save.wideLvl++;
  persistNow(); return true;
}

export function buyPowerup(id) {
  const p = POWERUPS.find(q => q.id === id);
  if (!p || save[id] >= p.max || !canBuy(p.cost)) return false;
  save.clouds -= p.cost; save[id]++;
  persistNow(); return true;
}

// ---------- daily missions ----------
const MISSION_POOL = [
  { id: 'streak4',  text: '4 PERFECTs in a row',      goal: 4,  reward: 60, type: 'streak' },
  { id: 'perfect8', text: '8 PERFECTs (any run)',     goal: 8,  reward: 50, type: 'perfects' },
  { id: 'floor30',  text: 'Reach floor 30 in a run',  goal: 30, reward: 70, type: 'floor' },
  { id: 'floor45',  text: 'Reach floor 45 in a run',  goal: 45, reward: 90, type: 'floor' },
  { id: 'blocks60', text: 'Stack 60 blocks today',    goal: 60, reward: 60, type: 'blocksToday' },
  { id: 'runs3',    text: 'Finish 3 runs today',      goal: 3,  reward: 40, type: 'runsToday' },
];

function today() { return new Date().toISOString().slice(0, 10); }

// deterministic pick of 3 missions per day
export function ensureDaily() {
  const d = today();
  if (save.daily.date === d && save.daily.missions.length) return;
  let seed = 0;
  for (const ch of d) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = MISSION_POOL.slice();
  const picked = [];
  for (let i = 0; i < 3; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  save.daily = {
    date: d,
    missions: picked.map(m => ({ id: m.id, text: m.text, goal: m.goal, reward: m.reward, type: m.type, prog: 0, done: false })),
    blocksToday: 0,
    runsToday: 0,
  };
  persistNow();
}

// Update mission progress. kind: streak|perfects|floor|blocksToday|runsToday. Returns completed missions.
export function missionProgress(kind, value) {
  ensureDaily();
  const completed = [];
  for (const m of save.daily.missions) {
    if (m.done || m.type !== kind) continue;
    m.prog = Math.max(m.prog, value);
    if (m.prog >= m.goal) {
      m.done = true;
      save.clouds += m.reward;
      completed.push(m);
    }
  }
  if (completed.length) persistNow();
  return completed;
}

// ---------- daily streak bonus ----------
// Returns {count, bonus} on the first boot of a new day, else null.
export function checkStreak() {
  const d = today();
  if (save.streak.last === d) return null;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  save.streak.count = (save.streak.last === yest) ? save.streak.count + 1 : 1;
  save.streak.last = d;
  const bonus = Math.min(10 + (save.streak.count - 1) * 10, 50);
  save.clouds += bonus;
  persistNow();
  return { count: save.streak.count, bonus };
}

// ---------- dynamic difficulty ----------
// Speed ramps in more gently for the first ~2 minutes of lifetime play.
export function difficultyFactor() {
  const t = Math.min(1, save.totalPlay / 120);
  return 0.72 + 0.28 * t;
}
