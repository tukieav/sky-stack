// Persistent save blob: CrazyGames SDK data module (cross-device) + localStorage fallback.
// Same dual-write strategy as the original best-score persistence.
let sdkRef = null;
const KEY = 'skystack.save';

export function bindSDK(sdk) { sdkRef = sdk; }

function defaults() {
  return {
    v: 2,
    best: 0,
    clouds: 0,
    totalPlay: 0,          // total seconds of active gameplay (dynamic difficulty ramp)
    blocksTotal: 0,
    hintDone: false,
    themesOwned: ['classic'],
    theme: 'classic',
    wideLvl: 0,            // permanent wider-start-block upgrade level (0..3)
    slowmo: 0,             // consumable power-up counts
    magnet: 0,
    musicOn: true,
    streak: { last: '', count: 0 },
    daily: { date: '', missions: [], blocksToday: 0 },
  };
}

export function loadSave() {
  let raw = null;
  try { if (sdkRef) raw = sdkRef.data.getItem(KEY); } catch (e) {}
  if (raw == null) {
    try { raw = localStorage.getItem(KEY); } catch (e) {}
  }
  let s = defaults();
  if (raw) {
    try { s = migrateSave(JSON.parse(raw)); } catch (e) {}
  }
  // migrate legacy best score
  try {
    const legacy = parseInt(localStorage.getItem('skystack.best') || '0', 10) || 0;
    if (legacy > s.best) s.best = legacy;
  } catch (e) {}
  try {
    if (sdkRef) {
      const lb = parseInt(sdkRef.data.getItem('bestScore') || '0', 10) || 0;
      if (lb > s.best) s.best = lb;
    }
  } catch (e) {}
  return s;
}

function finite(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

// Accept old blobs but never trust their nested values: localStorage is user
// controlled and a partial old save should be a fresh run, not a boot crash.
function migrateSave(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const themeIds = ['classic', 'sunset', 'ocean', 'forest', 'neon', 'mono'];
  const owned = Array.isArray(raw.themesOwned) ? raw.themesOwned.filter(id => themeIds.includes(id)) : [];
  d.themesOwned = [...new Set(['classic', ...owned])];
  d.theme = themeIds.includes(raw.theme) && d.themesOwned.includes(raw.theme) ? raw.theme : 'classic';
  d.v = 2;
  d.best = finite(raw.best, d.best);
  d.clouds = finite(raw.clouds, d.clouds);
  d.totalPlay = finite(raw.totalPlay, d.totalPlay, 0, 8640000);
  d.blocksTotal = finite(raw.blocksTotal, d.blocksTotal);
  d.hintDone = !!raw.hintDone;
  d.wideLvl = Math.floor(finite(raw.wideLvl, d.wideLvl, 0, 3));
  d.slowmo = Math.floor(finite(raw.slowmo, d.slowmo, 0, 3));
  d.magnet = Math.floor(finite(raw.magnet, d.magnet, 0, 3));
  d.musicOn = raw.musicOn !== false;
  if (raw.streak && typeof raw.streak === 'object') d.streak = { last: typeof raw.streak.last === 'string' ? raw.streak.last.slice(0, 10) : '', count: Math.floor(finite(raw.streak.count, 0, 0, 9999)) };
  if (raw.daily && typeof raw.daily === 'object' && Array.isArray(raw.daily.missions)) {
    d.daily = {
      date: typeof raw.daily.date === 'string' ? raw.daily.date.slice(0, 10) : '',
      blocksToday: Math.floor(finite(raw.daily.blocksToday, 0)),
      runsToday: Math.floor(finite(raw.daily.runsToday, 0)),
      missions: raw.daily.missions.filter(m => m && typeof m === 'object' && typeof m.id === 'string' && typeof m.text === 'string').slice(0, 3).map(m => ({ id: m.id, text: m.text.slice(0, 80), goal: Math.max(1, Math.floor(finite(m.goal, 1))), reward: Math.floor(finite(m.reward, 0)), type: typeof m.type === 'string' ? m.type : 'floor', prog: Math.floor(finite(m.prog, 0)), done: !!m.done })),
    };
  }
  return d;
}

export function persist(s) {
  const raw = JSON.stringify(s);
  try { if (sdkRef) sdkRef.data.setItem(KEY, raw); } catch (e) {}
  try { localStorage.setItem(KEY, raw); } catch (e) {}
  // keep legacy keys in sync (older builds / leaderboard reads)
  try { if (sdkRef) sdkRef.data.setItem('bestScore', String(s.best)); } catch (e) {}
  try { localStorage.setItem('skystack.best', String(s.best)); } catch (e) {}
}
