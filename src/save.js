// Persistent save blob: CrazyGames SDK data module (cross-device) + localStorage fallback.
// Same dual-write strategy as the original best-score persistence.
let sdkRef = null;
const KEY = 'skystack.save';

export function bindSDK(sdk) { sdkRef = sdk; }

function defaults() {
  return {
    v: 1,
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
    try { s = Object.assign(defaults(), JSON.parse(raw)); } catch (e) {}
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

export function persist(s) {
  const raw = JSON.stringify(s);
  try { if (sdkRef) sdkRef.data.setItem(KEY, raw); } catch (e) {}
  try { localStorage.setItem(KEY, raw); } catch (e) {}
  // keep legacy keys in sync (older builds / leaderboard reads)
  try { if (sdkRef) sdkRef.data.setItem('bestScore', String(s.best)); } catch (e) {}
  try { localStorage.setItem('skystack.best', String(s.best)); } catch (e) {}
}
