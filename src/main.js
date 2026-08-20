// Sky Stack — tap-timing tower builder for CrazyGames
import { initSDK, getSDK, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, requestAd, getMuteSetting, onSettingsChange } from './sdk.js';
import { setMuted, unlockAudio, cutSound, perfectSound, growSound, gameOverSound, clickSound, coinSound, milestoneSound, setMusicOn, getMusicOn } from './audio.js';
import { bindSDK } from './save.js';
import { initMeta, persistNow, save, THEMES, themeById, buyTheme, WIDE_COSTS, wideBonus, buyWide, POWERUPS, buyPowerup, ensureDaily, missionProgress, checkStreak, difficultyFactor } from './meta.js';

const GAME_W = 540, GAME_H = 960;
const BASE_W = 260, BH = 36;          // base block width, block height
const MIN_W = 8;                       // narrower than this = game over
const PERFECT_FRAC = 0.98;             // overlap >= 98% of moving block = perfect
const MAGNET_FRAC = 0.90;              // perfect window while magnet is active
const BASE_Y = 880;                    // world y of top of base block

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = GAME_W; canvas.height = GAME_H;

function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const s = Math.min(ww / GAME_W, wh / GAME_H);
  canvas.style.width = (GAME_W * s) + 'px';
  canvas.style.height = (GAME_H * s) + 'px';
}
window.addEventListener('resize', resize); resize();

// ---------- state ----------
let state = 'boot';        // boot | menu | shop | playing | dropping | gameover | ad
let blocks = [];           // {cx, w, level, hue}
let moving = null;         // {cx, w, dir, speed, level, hue, y}
let debris = [];           // cut pieces {x, y, w, h, vx, vy, rot, vr, hue, life}
let particles = [];
let floaters = [];         // {x, y, text, life, color, size}
let toasts = [];           // screen-space announcements {text, sub, life, t}
let score = 0, best = 0, level = 0;
let perfectCombo = 0;
let perfectsRun = 0;       // perfects this run (missions)
let cloudsRun = 0;         // clouds earned this run
let camY = 0, targetCamY = 0;
let shake = 0;
let hitStop = 0;           // brief freeze on perfect
let usedContinue = false;
let doubledClouds = false;
let stars = [];
let buttons = [];          // hit rects {x,y,w,h,id}
let tPrev = 0;
let lastAdT = 0;           // throttle midgame ads
let slowmoT = 0, magnetT = 0;
let shopMsgT = 0, shopMsg = '';
let runBaseW = BASE_W;
let flashT = 0;            // soft white flash on perfect
let windT = 0;             // global animation clock (sway, drift)
let flyers = [];           // birds / planes / satellites {kind,x,y,vx,t,flap}
let flyerTimer = 4;
let ropePulse = 0;         // crane cable recoil after release
let lastDropX = GAME_W / 2;
let lastBodyBg = '';

for (let i = 0; i < 120; i++) {
  stars.push({ x: Math.random() * GAME_W, y: Math.random() * 4000, r: Math.random() * 1.6 + 0.4, a: 0.3 + Math.random() * 0.6 });
}

function theme() { return themeById(save ? save.theme : 'classic'); }
function hueFor(lv) { return theme().hue(lv); }
function levelY(lv) { return BASE_Y - lv * BH; }   // world y of block top

function blockSpeed(lv) {
  return Math.min(150 + lv * 5, 460) * difficultyFactor();
}

function toast(text, sub) {
  toasts.push({ text, sub: sub || '', life: 2.4, t: 0 });
}

function earnClouds(n, x, y) {
  save.clouds += n;
  cloudsRun += n;
  coinSound();
  if (x != null) floatText(x, y, '+' + n + ' ☁', '#bfe3ff', 22);
}

function resetGame() {
  runBaseW = Math.min(GAME_W - 80, BASE_W + wideBonus());
  blocks = [{ cx: GAME_W / 2, w: runBaseW, level: 0, hue: hueFor(0) }];
  debris = []; particles = []; floaters = [];
  score = 0; level = 0; perfectCombo = 0; perfectsRun = 0; cloudsRun = 0;
  usedContinue = false; doubledClouds = false;
  slowmoT = 0; magnetT = 0;
  camY = 0; targetCamY = 0; shake = 0; hitStop = 0;
  spawnMoving();
}

function spawnMoving(widthOverride) {
  const prev = blocks[blocks.length - 1];
  const lv = blocks.length;
  const w = widthOverride != null ? widthOverride : prev.w;
  const fromLeft = lv % 2 === 0;
  moving = {
    cx: fromLeft ? -w / 2 : GAME_W + w / 2,
    w,
    dir: fromLeft ? 1 : -1,
    speed: blockSpeed(lv),
    level: lv,
    hue: hueFor(lv),
    y: levelY(lv),
  };
  targetCamY = Math.max(0, lv * BH - 340);
}

// ---------- particles / feel ----------
function burst(x, y, hue, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.7) * spd;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.7 + Math.random() * 0.4, t: 0, hue });
  }
}
function floatText(x, y, text, color, size = 26) {
  floaters.push({ x, y, text, life: 1.1, t: 0, color, size });
}

// ---------- gameplay ----------
function startGame() {
  resetGame();
  state = 'playing';
  gameplayStart();
}

function checkMissions(x, y) {
  const done = [];
  done.push(...missionProgress('streak', perfectCombo));
  done.push(...missionProgress('perfects', perfectsRun));
  done.push(...missionProgress('floor', level));
  done.push(...missionProgress('blocksToday', save.daily.blocksToday));
  done.push(...missionProgress('runsToday', save.daily.runsToday || 0));
  for (const m of done) {
    milestoneSound();
    happytime();
    toast('MISSION COMPLETE', m.text + '  +' + m.reward + ' ☁');
    cloudsRun += m.reward;
  }
}

function doDrop() {
  if (!moving) return;
  const prev = blocks[blocks.length - 1];
  const curL = moving.cx - moving.w / 2, curR = moving.cx + moving.w / 2;
  const prevL = prev.cx - prev.w / 2, prevR = prev.cx + prev.w / 2;
  const oL = Math.max(curL, prevL), oR = Math.min(curR, prevR);
  const overlap = oR - oL;
  const y = moving.y;
  ropePulse = 0.35;
  lastDropX = moving.cx;

  if (overlap < MIN_W) { // complete miss or sliver → whole block falls, game over
    debris.push({ x: moving.cx, y, w: moving.w, h: BH, vx: moving.dir * 60, vy: -40, rot: 0, vr: (Math.random() - 0.5) * 4, hue: moving.hue, life: 2 });
    moving = null;
    triggerGameOver();
    return;
  }

  const frac = magnetT > 0 ? MAGNET_FRAC : PERFECT_FRAC;
  const isPerfect = overlap >= frac * moving.w;
  let placed;
  if (isPerfect) {
    perfectCombo++;
    perfectsRun++;
    let w = moving.w;
    let grew = false;
    if (perfectCombo >= 3 && w < runBaseW) { w = Math.min(runBaseW, w + 10); grew = true; }
    placed = { cx: prev.cx, w, level: moving.level, hue: moving.hue, perfectT: 0.9 };
    const bonus = 5 * perfectCombo;
    score += 1 + bonus;
    hitStop = 0.06;
    flashT = 0.18;
    perfectSound(perfectCombo);
    burst(prev.cx, y + BH / 2, moving.hue, 26, 220);
    burst(prev.cx, y + BH / 2, 48, 14, 300);   // gold sparks
    floatText(prev.cx, y - 10, 'PERFECT!', '#ffe86b', 34);
    floatText(prev.cx, y + 24, '+' + bonus, '#fff6c9', 22);
    earnClouds(1 + Math.floor(perfectCombo / 3), prev.cx, y - 70);
    if (grew) { growSound(); floatText(prev.cx, y - 44, 'GROW!', '#7bffb0', 24); }
  } else {
    perfectCombo = 0;
    const newW = overlap, newCx = (oL + oR) / 2;
    // cut piece(s)
    if (curL < prevL) {
      const cw = prevL - curL;
      debris.push({ x: curL + cw / 2, y, w: cw, h: BH, vx: -60 - Math.random() * 60, vy: -30, rot: 0, vr: -2 - Math.random() * 2, hue: moving.hue, life: 2 });
    }
    if (curR > prevR) {
      const cw = curR - prevR;
      debris.push({ x: prevR + cw / 2, y, w: cw, h: BH, vx: 60 + Math.random() * 60, vy: -30, rot: 0, vr: 2 + Math.random() * 2, hue: moving.hue, life: 2 });
    }
    placed = { cx: newCx, w: newW, level: moving.level, hue: moving.hue };
    score += 1;
    cutSound(moving.level);
    burst(newCx, y + BH / 2, moving.hue, 10, 130);
    floatText(newCx, y - 10, '+1', '#ffffff', 22);
  }

  blocks.push(placed);
  level = blocks.length - 1;
  moving = null;
  save.blocksTotal++;
  save.daily.blocksToday = (save.daily.blocksToday || 0) + 1;
  if (!save.hintDone && level >= 3) { save.hintDone = true; persistNow(); }

  // height milestones every 25 floors: clouds reward + fanfare
  if (level % 25 === 0 && level > 0) {
    const reward = level; // 25, 50, 75...
    earnClouds(reward, placed.cx, y - 100);
    milestoneSound();
    happytime();
    toast('FLOOR ' + level + '!', '+' + reward + ' ☁ milestone');
    shake = Math.max(shake, 6);
  }

  checkMissions(placed.cx, y);

  if (placed.w < MIN_W) { triggerGameOver(); return; }
  spawnMoving(placed.w);
}

function triggerGameOver() {
  state = 'gameover';
  shake = 18;
  gameOverSound();
  gameplayStop();
  save.daily.runsToday = (save.daily.runsToday || 0) + 1;
  // clouds for height reached
  const heightClouds = Math.floor(level / 2);
  if (heightClouds > 0) { save.clouds += heightClouds; cloudsRun += heightClouds; }
  checkMissions();
  if (score > best) { best = score; save.best = best; }
  persistNow();
}

async function playAgain() {
  // instant restart; midgame ad only at most once per 90s of natural breaks
  const now = performance.now();
  if (now - lastAdT > 90000) {
    lastAdT = now;
    state = 'ad';
    await requestAd('midgame', {
      onStart: () => setMuted(true),
      onFinish: () => setMuted(getMuteSetting()),
    });
  }
  startGame();
}

async function doContinue() {
  state = 'ad';
  const ok = await requestAd('rewarded', {
    onStart: () => setMuted(true),
    onFinish: () => setMuted(getMuteSetting()),
  });
  if (ok) {
    usedContinue = true;
    perfectCombo = 0;
    spawnMoving(Math.max(MIN_W + 20, Math.round(runBaseW * 0.7)));
    state = 'playing';
    gameplayStart();
  } else {
    state = 'gameover';
  }
}

async function doDoubleClouds() {
  state = 'ad';
  const ok = await requestAd('rewarded', {
    onStart: () => setMuted(true),
    onFinish: () => setMuted(getMuteSetting()),
  });
  if (ok && cloudsRun > 0) {
    save.clouds += cloudsRun;
    cloudsRun *= 2;
    doubledClouds = true;
    coinSound();
    persistNow();
    toast('CLOUDS DOUBLED!', '☁ ' + cloudsRun + ' this run');
  }
  state = 'gameover';
}

function usePowerup(id) {
  if (save[id] <= 0) return;
  if (id === 'slowmo' && slowmoT <= 0) {
    save.slowmo--; slowmoT = 8;
    floatText(GAME_W / 2, levelY(level) - 60, 'SLOW-MO 8s', '#9fd4ff', 26);
    clickSound(); persistNow();
  } else if (id === 'magnet' && magnetT <= 0) {
    save.magnet--; magnetT = 10;
    floatText(GAME_W / 2, levelY(level) - 60, 'MAGNET 10s', '#ffd29f', 26);
    clickSound(); persistNow();
  }
}

// ---------- input ----------
function gameCoords(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (GAME_W / r.width), y: (e.clientY - r.top) * (GAME_H / r.height) };
}

function handleButton(id) {
  clickSound();
  if (id === 'play') startGame();
  else if (id === 'again') playAgain();
  else if (id === 'continue') doContinue();
  else if (id === 'double') doDoubleClouds();
  else if (id === 'shop') { state = 'shop'; shopMsg = ''; }
  else if (id === 'back') { state = 'menu'; persistNow(); }
  else if (id === 'music') { save.musicOn = !save.musicOn; setMusicOn(save.musicOn); persistNow(); }
  else if (id === 'pu-slowmo') usePowerup('slowmo');
  else if (id === 'pu-magnet') usePowerup('magnet');
  else if (id.startsWith('theme-')) {
    const tid = id.slice(6);
    const owned = save.themesOwned.includes(tid);
    if (buyTheme(tid)) { shopMsg = owned ? 'Equipped!' : 'Unlocked & equipped!'; coinSound(); }
    else shopMsg = 'Not enough clouds';
    shopMsgT = 1.6;
  }
  else if (id === 'buy-wide') {
    if (buyWide()) { shopMsg = 'Wider base: Lv ' + save.wideLvl; coinSound(); }
    else shopMsg = save.wideLvl >= 3 ? 'Maxed out' : 'Not enough clouds';
    shopMsgT = 1.6;
  }
  else if (id.startsWith('buy-')) {
    const pid = id.slice(4);
    if (buyPowerup(pid)) { shopMsg = 'Purchased!'; coinSound(); }
    else shopMsg = save[pid] >= 3 ? 'Max 3 held' : 'Not enough clouds';
    shopMsgT = 1.6;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (save && save.musicOn && !getMusicOn()) setMusicOn(true);
  const p = gameCoords(e);
  for (const b of buttons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      handleButton(b.id);
      return;
    }
  }
  if (state === 'playing') doDrop();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    unlockAudio();
    if (save && save.musicOn && !getMusicOn()) setMusicOn(true);
    if (state === 'playing') doDrop();
    else if (state === 'menu') startGame();
    else if (state === 'gameover') playAgain();
    e.preventDefault();
  }
  if (state === 'playing') {
    if (e.code === 'Digit1') usePowerup('slowmo');
    if (e.code === 'Digit2') usePowerup('magnet');
  }
  if (e.code === 'Escape' && state === 'shop') { state = 'menu'; persistNow(); }
});

// ---------- update ----------
let persistAcc = 0;
function update(dt) {
  windT += dt;
  camY += (targetCamY - camY) * Math.min(1, dt * 5);
  if (shake > 0) shake = Math.max(0, shake - dt * 30);
  if (flashT > 0) flashT = Math.max(0, flashT - dt);
  if (ropePulse > 0) ropePulse = Math.max(0, ropePulse - dt);
  // fade perfect glow on recent blocks
  for (let i = Math.max(0, blocks.length - 5); i < blocks.length; i++) {
    if (blocks[i].perfectT > 0) blocks[i].perfectT -= dt;
  }
  // ambient flyers: birds low, planes mid, satellites high
  flyerTimer -= dt;
  if (flyerTimer <= 0 && (state === 'playing' || state === 'menu')) {
    flyerTimer = 5 + Math.random() * 6;
    const kind = level < 14 ? 'bird' : level < 42 ? 'plane' : 'sat';
    const dir = Math.random() < 0.5 ? 1 : -1;
    flyers.push({
      kind, t: 0, flap: Math.random() * 6,
      x: dir > 0 ? -60 : GAME_W + 60,
      y: 80 + Math.random() * 320,
      vx: dir * (kind === 'bird' ? 40 + Math.random() * 25 : kind === 'plane' ? 90 + Math.random() * 40 : 26 + Math.random() * 14),
    });
  }
  for (const f of flyers) { f.t += dt; f.flap += dt * 9; f.x += f.vx * dt; }
  flyers = flyers.filter(f => f.x > -120 && f.x < GAME_W + 120 && f.t < 40);
  if (hitStop > 0) { hitStop -= dt; return; }
  if (slowmoT > 0) slowmoT = Math.max(0, slowmoT - dt);
  if (magnetT > 0) magnetT = Math.max(0, magnetT - dt);
  if (shopMsgT > 0) shopMsgT -= dt;

  if (state === 'playing') {
    save.totalPlay += dt;
    persistAcc += dt;
    if (persistAcc > 15) { persistAcc = 0; persistNow(); }
  }

  if (state === 'playing' && moving) {
    const spd = moving.speed * (slowmoT > 0 ? 0.45 : 1);
    moving.cx += moving.dir * spd * dt;
    const half = moving.w / 2, margin = 40;
    if (moving.cx - half < -margin) { moving.cx = -margin + half; moving.dir = 1; }
    if (moving.cx + half > GAME_W + margin) { moving.cx = GAME_W + margin - half; moving.dir = -1; }
  }

  for (const d of debris) {
    d.vy += 900 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
    d.life -= dt;
  }
  debris = debris.filter(d => d.life > 0);

  for (const p of particles) {
    p.t += dt; p.vy += 500 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  particles = particles.filter(p => p.t < p.life);

  for (const f of floaters) { f.t += dt; f.y -= 40 * dt; }
  floaters = floaters.filter(f => f.t < f.life);

  for (const t of toasts) t.t += dt;
  toasts = toasts.filter(t => t.t < t.life);
}

// ---------- draw ----------
// Altitude bands: ground -> cloud layer -> stratosphere -> space.
function skyColors(lv) {
  const [dTop, nTop, dBot, nBot] = theme().sky;
  const t = Math.min(1, lv / 90);
  // ease so space arrives late and dramatically
  const e = t * t * (3 - 2 * t);
  const lerp = (a, b) => Math.round(a + (b - a) * e);
  const top = [lerp(dTop[0], nTop[0]), lerp(dTop[1], nTop[1]), lerp(dTop[2], nTop[2])];
  const bot = [lerp(dBot[0], nBot[0]), lerp(dBot[1], nBot[1]), lerp(dBot[2], nBot[2])];
  return [top, bot, e];
}

function drawSky() {
  const [top, bot, e] = skyColors(level);
  const bg = ctx.createLinearGradient(0, 0, 0, GAME_H);
  bg.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
  bg.addColorStop(0.55, `rgb(${Math.round((top[0] + bot[0]) / 2)},${Math.round((top[1] + bot[1]) / 2)},${Math.round((top[2] + bot[2]) / 2)})`);
  bg.addColorStop(1, `rgb(${bot[0]},${bot[1]},${bot[2]})`);
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, GAME_W + 40, GAME_H + 40);
  // keep page letterbox in sync with sky so fullscreen has no dead zones
  const bgCss = `rgb(${bot[0]},${bot[1]},${bot[2]})`;
  if (bgCss !== lastBodyBg) { lastBodyBg = bgCss; document.body.style.background = bgCss; }

  // sun (day) fading into moon (space) — position by theme
  const sunX = GAME_W - 105, sunY = 138 + camY * 0.06;
  if (e < 0.75) {
    const a = (1 - e / 0.75);
    const g = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    g.addColorStop(0, `rgba(255,244,200,${(0.95 * a).toFixed(3)})`);
    g.addColorStop(0.25, `rgba(255,230,150,${(0.55 * a).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,250,225,${(0.9 * a).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2); ctx.fill();
  }
  if (e > 0.45) {
    const a = Math.min(1, (e - 0.45) / 0.4);
    const mx = 96, my = 150 + camY * 0.04;
    ctx.fillStyle = `rgba(226,232,245,${(0.92 * a).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(200,208,226,${(0.35 * a).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(mx - 9, my - 4, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 7, my + 9, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 11, my - 10, 3, 0, Math.PI * 2); ctx.fill();
  }

  // stars grow in from level ~35 upward
  if (level > 32) {
    const alpha = Math.min(1, (level - 32) / 32);
    for (const s of stars) {
      const sy = ((s.y + camY * 0.35) % (GAME_H + 40)) - 20;
      const tw = 0.75 + 0.25 * Math.sin(windT * 2.2 + s.x);
      ctx.fillStyle = `rgba(255,255,255,${(s.a * alpha * tw).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, sy, s.r, 0, Math.PI * 2); ctx.fill();
    }
    // a few bigger cross-glint stars in deep space
    if (alpha > 0.6) {
      ctx.strokeStyle = `rgba(255,255,255,${(0.5 * alpha).toFixed(3)})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const gx2 = (i * 137 + 60) % GAME_W, gy2 = ((i * 271 + camY * 0.35) % GAME_H);
        ctx.beginPath();
        ctx.moveTo(gx2 - 7, gy2); ctx.lineTo(gx2 + 7, gy2);
        ctx.moveTo(gx2, gy2 - 7); ctx.lineTo(gx2, gy2 + 7);
        ctx.stroke();
      }
    }
  }

  // distant city skyline near the ground (parallax, fades with height)
  const groundA = Math.max(0, 1 - level / 18);
  if (groundA > 0) {
    const baseY = GAME_H - 40 + camY * 0.85;
    ctx.fillStyle = `rgba(30,40,70,${(0.5 * groundA).toFixed(3)})`;
    for (let i = 0; i < 12; i++) {
      const bw = 34 + (i * 53) % 40;
      const bh2 = 60 + (i * 97) % 130;
      const bx = (i * 61) % (GAME_W + 60) - 30;
      ctx.fillRect(bx, baseY - bh2, bw, bh2 + 60);
      // lit windows in the silhouette
      ctx.fillStyle = `rgba(255,230,140,${(0.35 * groundA).toFixed(3)})`;
      for (let wy2 = baseY - bh2 + 10; wy2 < baseY - 8; wy2 += 20) {
        for (let wx2 = bx + 6; wx2 < bx + bw - 8; wx2 += 14) {
          if (((wx2 * 7 + wy2 * 13) | 0) % 3 === 0) ctx.fillRect(wx2, wy2, 5, 7);
        }
      }
      ctx.fillStyle = `rgba(30,40,70,${(0.5 * groundA).toFixed(3)})`;
    }
  }

  // volumetric cloud layers (3 parallax depths), fade above the cloud band
  const cloudA = Math.max(0, 1 - Math.max(0, level - 8) / 46);
  if (cloudA > 0) {
    for (let layer = 0; layer < 3; layer++) {
      const depth = 0.3 + layer * 0.28;
      const drift = windT * (6 + layer * 5);
      ctx.fillStyle = `rgba(255,255,255,${(0.14 + layer * 0.11) * cloudA})`;
      for (let i = 0; i < 4; i++) {
        const seed = i * 191 + layer * 631;
        const cy2 = ((seed % 900) + camY * depth) % (GAME_H + 260) - 130;
        const cx2 = ((seed * 7 % (GAME_W + 300)) + drift) % (GAME_W + 300) - 150;
        const sc = 0.7 + layer * 0.35;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, 78 * sc, 24 * sc, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 + 52 * sc, cy2 + 9 * sc, 55 * sc, 19 * sc, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 - 48 * sc, cy2 + 11 * sc, 44 * sc, 15 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // flyers: birds / planes / satellites
  for (const f of flyers) {
    const dir = f.vx > 0 ? 1 : -1;
    if (f.kind === 'bird') {
      ctx.strokeStyle = 'rgba(40,45,60,0.8)';
      ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      const wingY = Math.sin(f.flap) * 6;
      ctx.beginPath();
      ctx.moveTo(f.x - 10, f.y - wingY); ctx.quadraticCurveTo(f.x, f.y + 3, f.x + 10, f.y - wingY);
      ctx.stroke();
    } else if (f.kind === 'plane') {
      ctx.save();
      ctx.translate(f.x, f.y); ctx.scale(dir, 1);
      ctx.fillStyle = 'rgba(235,240,250,0.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-14, -10); ctx.lineTo(-8, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-6, 9); ctx.lineTo(-2, 0); ctx.fill();
      // contrail
      const tr = ctx.createLinearGradient(-90, 0, -18, 0);
      tr.addColorStop(0, 'rgba(255,255,255,0)'); tr.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = tr; ctx.fillRect(-90, -2, 72, 4);
      ctx.restore();
    } else {
      // satellite: body + panels, subtle blink
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(0.35 * dir);
      ctx.fillStyle = 'rgba(200,210,230,0.9)';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.fillStyle = 'rgba(90,130,220,0.85)';
      ctx.fillRect(-24, -3, 15, 6); ctx.fillRect(9, -3, 15, 6);
      if (Math.sin(f.flap * 1.5) > 0.7) {
        ctx.fillStyle = 'rgba(255,90,90,0.9)';
        ctx.beginPath(); ctx.arc(0, -8, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}

// 2.5D architectural block: side face, roof edge, windows with warm light,
// cornice, drop shadow onto the block below, golden edge while perfectT > 0.
const SIDE = 12;                       // 2.5D side depth (px)
function swayFor(lv) {
  // tower sways in the wind more with altitude; whole column shares phase
  const amp = Math.min(6, Math.max(0, level - 12) * 0.12);
  return Math.sin(windT * 1.4 + lv * 0.22) * amp * Math.min(1, lv / Math.max(1, level || 1));
}

function drawBlock(cx, y, w, hue, glow, lv, perfectT) {
  const x = cx - w / 2;
  const sat = theme().sat;
  const spaceT = Math.min(1, Math.max(0, level - 40) / 40); // dim lighting in space
  const lightMain = 60 - spaceT * 8, lightDark = 42 - spaceT * 8;

  // drop shadow cast onto the block below
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(x + 3, y + BH); ctx.lineTo(x + w + SIDE - 2, y + BH);
  ctx.lineTo(x + w + SIDE - 6, y + BH + 7); ctx.lineTo(x + 6, y + BH + 7);
  ctx.closePath(); ctx.fill();

  // side face (right) — darker for 2.5D depth
  ctx.fillStyle = `hsl(${hue},${sat}%,${lightDark - 14}%)`;
  ctx.beginPath();
  ctx.moveTo(x + w, y); ctx.lineTo(x + w + SIDE, y - SIDE * 0.5);
  ctx.lineTo(x + w + SIDE, y + BH - SIDE * 0.5); ctx.lineTo(x + w, y + BH);
  ctx.closePath(); ctx.fill();

  // top face (roof) — lighter slab
  ctx.fillStyle = `hsl(${hue},${Math.max(20, sat - 10)}%,${lightMain + 14}%)`;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + SIDE, y - SIDE * 0.5);
  ctx.lineTo(x + w + SIDE, y - SIDE * 0.5); ctx.lineTo(x + w, y);
  ctx.closePath(); ctx.fill();

  // front face gradient
  const grad = ctx.createLinearGradient(x, y, x, y + BH);
  grad.addColorStop(0, `hsl(${hue},${sat}%,${lightMain}%)`);
  grad.addColorStop(1, `hsl(${hue},${sat}%,${lightDark}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, BH);

  // cornice band at the top of the front face
  ctx.fillStyle = `hsla(${hue},${sat}%,${lightMain + 20}%,0.9)`;
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x, y + 4, w, 2);

  // windows with warm interior light — deterministic per level
  const winW = 9, winH = 13, gapX = 17, startX = x + 9, winY = y + 12;
  const spaceGlow = 0.55 + spaceT * 0.4;   // windows glow brighter in the dark
  for (let wx2 = startX; wx2 <= x + w - winW - 6; wx2 += gapX) {
    const litSeed = ((wx2 * 13 + (lv || 0) * 29) | 0) % 5;
    if (litSeed < 3) {
      ctx.fillStyle = `rgba(255,224,130,${spaceGlow.toFixed(2)})`;
      ctx.fillRect(wx2, winY, winW, winH);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(wx2 + 1, winY + 1, winW - 2, 3);
    } else {
      ctx.fillStyle = 'rgba(20,26,46,0.55)';
      ctx.fillRect(wx2, winY, winW, winH);
      ctx.fillStyle = 'rgba(160,200,255,0.25)';
      ctx.fillRect(wx2 + 1, winY + 1, winW - 2, 4);
    }
    // window frame
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx2 + 0.5, winY + 0.5, winW - 1, winH - 1);
  }

  // base ledge
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + BH - 4, w, 4);

  // golden flash on perfect placement
  if (perfectT > 0) {
    const a = Math.min(1, perfectT / 0.6);
    ctx.strokeStyle = `rgba(255,215,90,${a.toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 1, y - 1, w + 2, BH + 2);
    ctx.fillStyle = `rgba(255,232,140,${(a * 0.25).toFixed(3)})`;
    ctx.fillRect(x, y, w, BH);
  }

  if (glow) {
    ctx.strokeStyle = magnetT > 0 ? 'rgba(255,210,120,0.9)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, BH - 2);
  }
}

// crane cable + hook above the moving block
function drawCrane(mx, my, w) {
  const topY = -20;
  const recoil = ropePulse > 0 ? Math.sin(ropePulse * 40) * 4 * ropePulse : 0;
  ctx.strokeStyle = 'rgba(40,44,60,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mx + recoil, topY);
  ctx.lineTo(mx, my - 10);
  ctx.stroke();
  // hook plate
  ctx.fillStyle = 'rgba(50,55,75,0.9)';
  ctx.fillRect(mx - 14, my - 10, 28, 6);
  ctx.beginPath(); ctx.arc(mx, my - 12, 4, 0, Math.PI * 2); ctx.fill();
  // side cables to block edges
  ctx.strokeStyle = 'rgba(40,44,60,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx - 12, my - 7); ctx.lineTo(mx - w / 2 + 6, my + 2);
  ctx.moveTo(mx + 12, my - 7); ctx.lineTo(mx + w / 2 - 6, my + 2);
  ctx.stroke();
}

function drawBtn(cx, cy, w, h, label, id, color, fontSize = 26) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.fillStyle = '#0b0e1a';
  ctx.font = `800 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);
  buttons.push({ x, y, w, h, id });
}

// soft cloud-style rounded panel
function cloudPanel(x, y, w, h, alpha = 0.32) {
  ctx.fillStyle = `rgba(16,22,44,${alpha})`;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 17); ctx.stroke();
  // soft top sheen
  const sheen = ctx.createLinearGradient(0, y, 0, y + Math.min(26, h));
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.roundRect(x, y, w, Math.min(26, h), 18); ctx.fill();
}

function cloudsHud(x, y) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  cloudPanel(x - 8, y - 4, 116, 36, 0.38);
  ctx.fillStyle = '#bfe3ff';
  ctx.font = '800 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('☁ ' + save.clouds, x + 4, y + 2);
}

// altimeter-style floor gauge on the right edge
function drawAltimeter() {
  const ax = GAME_W - 52, ay = 190, ah = 300;
  ctx.save();
  cloudPanel(ax - 26, ay - 14, 62, ah + 48, 0.22);
  // tick marks scrolling with height
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const pxPerFloor = 14;
  for (let f2 = Math.max(0, level - 9); f2 <= level + 12; f2++) {
    const yy = ay + ah / 2 - (f2 - level) * pxPerFloor - (targetCamY - camY) * 0.04;
    if (yy < ay - 4 || yy > ay + ah + 4) continue;
    const major = f2 % 5 === 0;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(ax + 20, yy); ctx.lineTo(ax + (major ? 4 : 12), yy);
    ctx.stroke();
    if (major && f2 >= 0) ctx.fillText(String(f2), ax + 1, yy);
  }
  // needle at current floor
  ctx.fillStyle = '#ffe86b';
  ctx.beginPath();
  ctx.moveTo(ax + 24, ay + ah / 2);
  ctx.lineTo(ax + 14, ay + ah / 2 - 6);
  ctx.lineTo(ax + 14, ay + ah / 2 + 6);
  ctx.closePath(); ctx.fill();
  ctx.font = '900 17px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FL', ax - 2, ay - 2);
  ctx.restore();
}

function worldToScreen(wy) { return wy + camY; }

function draw() {
  buttons = [];
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawSky();

  // solid ground strip under the base block (anchors the tower)
  {
    const gy2 = worldToScreen(BASE_Y + BH);
    if (gy2 < GAME_H + 20) {
      const gg = ctx.createLinearGradient(0, gy2, 0, GAME_H + 20);
      gg.addColorStop(0, 'rgba(46,58,86,0.95)');
      gg.addColorStop(1, 'rgba(24,30,48,0.98)');
      ctx.fillStyle = gg;
      ctx.fillRect(-20, gy2, GAME_W + 40, GAME_H + 40 - gy2);
      // sidewalk edge
      ctx.fillStyle = 'rgba(200,210,230,0.35)';
      ctx.fillRect(-20, gy2, GAME_W + 40, 3);
      // road dashes
      ctx.fillStyle = 'rgba(255,220,120,0.3)';
      for (let dx2 = 10; dx2 < GAME_W; dx2 += 60) ctx.fillRect(dx2, gy2 + 22, 26, 3);
    }
  }

  // tower — with wind sway that grows with altitude
  for (const b of blocks) {
    const sy = worldToScreen(levelY(b.level));
    if (sy > -BH - 12 && sy < GAME_H + BH) {
      drawBlock(b.cx + swayFor(b.level), sy, b.w, b.hue, false, b.level, b.perfectT || 0);
    }
  }

  // moving block + crane cable
  if (moving && state === 'playing') {
    const my = worldToScreen(moving.y);
    drawCrane(moving.cx, my, moving.w);
    drawBlock(moving.cx, my, moving.w, moving.hue, true, moving.level, 0);
  } else if (ropePulse > 0 && state === 'playing') {
    drawCrane(lastDropX, -30, 40);
  }

  // debris — fading cut pieces with window detail
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, worldToScreen(d.y) + BH / 2);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life);
    ctx.fillStyle = `hsl(${d.hue},70%,50%)`;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.fillStyle = 'rgba(255,224,130,0.5)';
    for (let wx2 = -d.w / 2 + 5; wx2 < d.w / 2 - 9; wx2 += 17) ctx.fillRect(wx2, -d.h / 2 + 10, 8, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-d.w / 2, d.h / 2 - 4, d.w, 4);
    ctx.restore();
  }

  // particles
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    ctx.fillStyle = `hsla(${p.hue},85%,65%,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(p.x, worldToScreen(p.y), 3.5 * a + 1, 0, Math.PI * 2); ctx.fill();
  }

  // floaters — pop-in scale animation
  for (const f of floaters) {
    const a = 1 - f.t / f.life;
    const pop = f.t < 0.14 ? 0.5 + (f.t / 0.14) * 0.62 : 1.12 - Math.min(0.12, (f.t - 0.14) * 0.8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(f.x, worldToScreen(f.y));
    ctx.scale(pop, pop);
    ctx.font = `900 ${f.size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,16,4,0.55)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }

  // perfect flash — quick warm full-screen glow
  if (flashT > 0) {
    ctx.fillStyle = `rgba(255,240,190,${(flashT / 0.18 * 0.22).toFixed(3)})`;
    ctx.fillRect(-20, -20, GAME_W + 40, GAME_H + 40);
  }

  // HUD
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (state === 'playing' || state === 'gameover' || state === 'ad') {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '900 56px "Segoe UI", Arial, sans-serif';
    ctx.fillText(String(score), GAME_W / 2, 28);
    ctx.font = '600 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('BEST ' + best + '   ·   FLOOR ' + level, GAME_W / 2, 92);
    if (perfectCombo >= 2) {
      ctx.fillStyle = '#ffe86b';
      ctx.font = '800 24px "Segoe UI", Arial, sans-serif';
      ctx.fillText('PERFECT x' + perfectCombo, GAME_W / 2, 122);
    }
    cloudsHud(16, 20);
    if (state === 'playing') drawAltimeter();
  }

  // in-run power-up buttons + active timers
  if (state === 'playing') {
    if (save.slowmo > 0 && slowmoT <= 0) drawBtn(70, GAME_H - 50, 116, 54, '⏱ ×' + save.slowmo, 'pu-slowmo', 'rgba(159,212,255,0.92)', 22);
    if (save.magnet > 0 && magnetT <= 0) drawBtn(GAME_W - 70, GAME_H - 50, 116, 54, '🧲 ×' + save.magnet, 'pu-magnet', 'rgba(255,210,159,0.92)', 22);
    ctx.font = '700 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (slowmoT > 0) { ctx.fillStyle = '#9fd4ff'; ctx.fillText('⏱ ' + slowmoT.toFixed(0) + 's', 16, 60); }
    if (magnetT > 0) { ctx.fillStyle = '#ffd29f'; ctx.fillText('🧲 ' + magnetT.toFixed(0) + 's', 16, slowmoT > 0 ? 84 : 60); }

    // contextual first-play hint
    if (!save.hintDone && moving) {
      const top = blocks[blocks.length - 1];
      const aligned = Math.abs(moving.cx - top.cx) < top.w * 0.35;
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 180);
      ctx.textAlign = 'center';
      ctx.fillStyle = aligned ? `rgba(123,255,176,${pulse.toFixed(2)})` : 'rgba(255,255,255,0.85)';
      ctx.font = '800 28px "Segoe UI", Arial, sans-serif';
      ctx.fillText(aligned ? 'TAP NOW!' : 'Wait for the block to line up…', GAME_W / 2, GAME_H - 140);
    }
  }

  if (state === 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(120,180,255,0.9)'; ctx.shadowBlur = 24;
    ctx.font = '900 84px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('SKY', GAME_W / 2, 150);
    ctx.fillText('STACK', GAME_W / 2, 240);
    ctx.shadowBlur = 0;
    ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Tap to drop. Stack to the stars.', GAME_W / 2, 350);
    ctx.fillText('BEST: ' + best, GAME_W / 2, 390);
    cloudsHud(16, 20);
    // streak badge
    if (save.streak.count > 1) {
      ctx.fillStyle = '#ffd27b';
      ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
      ctx.fillText('🔥 ' + save.streak.count + '-day streak', GAME_W / 2, 424);
    }
    drawBtn(GAME_W / 2, 520, 240, 74, 'PLAY', 'play', '#ffe86b');
    drawBtn(GAME_W / 2, 616, 240, 60, '☁ SHOP', 'shop', '#9fd4ff', 24);
    drawBtn(GAME_W - 54, 44, 76, 48, save.musicOn ? '♪ ON' : '♪ OFF', 'music', 'rgba(255,255,255,0.75)', 18);

    // daily missions panel
    ensureDaily();
    cloudPanel(50, 680, GAME_W - 100, 190, 0.34);
    ctx.fillStyle = '#ffe86b';
    ctx.font = '800 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText('DAILY MISSIONS', GAME_W / 2, 696);
    ctx.font = '600 19px "Segoe UI", Arial, sans-serif';
    let my = 734;
    for (const m of save.daily.missions) {
      ctx.fillStyle = m.done ? '#7bffb0' : 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText((m.done ? '✓ ' : '• ') + m.text, 70, my);
      ctx.textAlign = 'right';
      ctx.fillText(m.done ? 'DONE' : (Math.min(m.prog, m.goal) + '/' + m.goal + '  +' + m.reward + '☁'), GAME_W - 70, my);
      my += 40;
      ctx.textAlign = 'center';
    }
  }

  if (state === 'shop') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('CLOUD SHOP', GAME_W / 2, 30);
    cloudsHud(16, 20);

    // themes grid 3x2
    ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('TOWER THEMES', GAME_W / 2, 96);
    THEMES.forEach((t, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const bx = 100 + col * 170, by = 170 + row * 110;
      const owned = save.themesOwned.includes(t.id);
      const equipped = save.theme === t.id;
      // swatch
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = `hsl(${t.hue(k * 8)},${t.sat}%,55%)`;
        ctx.fillRect(bx - 45, by - 44 + k * 12, 90, 11);
      }
      const label = equipped ? '✓ ' + t.name : owned ? t.name : t.name + ' ' + t.cost + '☁';
      drawBtn(bx, by + 16, 150, 44, label, 'theme-' + t.id, equipped ? '#7bffb0' : owned ? '#ffe86b' : 'rgba(255,255,255,0.82)', 17);
    });

    // upgrades / powerups
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('UPGRADES & POWER-UPS', GAME_W / 2, 420);
    const wideLabel = save.wideLvl >= 3 ? 'WIDER BASE — MAX' : 'WIDER BASE Lv' + (save.wideLvl + 1) + ' — ' + WIDE_COSTS[save.wideLvl] + '☁';
    drawBtn(GAME_W / 2, 486, 400, 56, wideLabel, 'buy-wide', save.wideLvl >= 3 ? 'rgba(160,160,160,0.7)' : '#ffe86b', 20);
    POWERUPS.forEach((p, i) => {
      const label = p.name + ' ×' + save[p.id] + ' — ' + p.cost + '☁';
      drawBtn(GAME_W / 2, 562 + i * 76, 400, 56, label, 'buy-' + p.id, save[p.id] >= p.max ? 'rgba(160,160,160,0.7)' : i === 0 ? '#9fd4ff' : '#ffd29f', 20);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '600 15px "Segoe UI", Arial, sans-serif';
      ctx.fillText(p.desc + ' (key ' + (i + 1) + ')', GAME_W / 2, 562 + i * 76 + 32);
      ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    });

    if (shopMsgT > 0 && shopMsg) {
      ctx.fillStyle = '#ffe86b';
      ctx.font = '800 24px "Segoe UI", Arial, sans-serif';
      ctx.fillText(shopMsg, GAME_W / 2, 716);
    }
    drawBtn(GAME_W / 2, 800, 240, 64, '← BACK', 'back', 'rgba(255,255,255,0.85)', 24);
  }

  if (state === 'gameover') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '900 60px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('GAME OVER', GAME_W / 2, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Score: ' + score, GAME_W / 2, 290);
    ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Best: ' + best + '    ·    ☁ +' + cloudsRun, GAME_W / 2, 340);
    let by = 440;
    if (!usedContinue) {
      drawBtn(GAME_W / 2, by, 340, 66, '▶ CONTINUE (AD)', 'continue', '#7bffb0');
      by += 90;
    }
    if (!doubledClouds && cloudsRun > 0) {
      drawBtn(GAME_W / 2, by, 340, 66, '☁ ×2 CLOUDS (AD)', 'double', '#9fd4ff');
      by += 90;
    }
    drawBtn(GAME_W / 2, by, 340, 66, 'PLAY AGAIN', 'again', '#ffe86b');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Space = instant restart', GAME_W / 2, by + 56);
  }

  if (state === 'ad') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('...', GAME_W / 2, GAME_H / 2);
  }

  // toasts (screen space, top center)
  let ty = 170;
  for (const t of toasts) {
    const a = t.t < 0.25 ? t.t / 0.25 : t.t > t.life - 0.4 ? (t.life - t.t) / 0.4 : 1;
    ctx.globalAlpha = Math.max(0, a);
    cloudPanel(GAME_W / 2 - 190, ty, 380, t.sub ? 66 : 44, 0.55);
    ctx.fillStyle = '#ffe86b';
    ctx.font = '800 24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.text, GAME_W / 2, ty + 8);
    if (t.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
      ctx.fillText(t.sub, GAME_W / 2, ty + 38);
    }
    ctx.globalAlpha = 1;
    ty += t.sub ? 76 : 54;
  }

  ctx.restore();
}

// ---------- loop ----------
function frame(t) {
  const dt = Math.min(0.05, (t - tPrev) / 1000 || 0.016);
  tPrev = t;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
async function boot() {
  await initSDK();
  loadingStart();
  bindSDK(getSDK());
  initMeta();
  best = save.best;
  setMuted(getMuteSetting());
  onSettingsChange((s) => { if (s && 'muteAudio' in s) setMuted(!!s.muteAudio); });
  const streak = checkStreak();
  if (streak) toast('DAY ' + streak.count + ' STREAK!', '+' + streak.bonus + ' ☁ daily bonus');
  loadingStop();
  state = 'menu';
  window.addEventListener('beforeunload', () => persistNow());

  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__astro = {
      forceGameOver: () => { if (state === 'playing') { moving = null; triggerGameOver(); } },
      getState: () => ({
        state, score, best, level, perfectCombo, usedContinue, blocks: blocks.length,
        movingW: moving ? moving.w : null, movingCx: moving ? moving.cx : null,
        topCx: blocks.length ? blocks[blocks.length - 1].cx : null,
        clouds: save.clouds, cloudsRun, theme: save.theme, themesOwned: save.themesOwned.slice(),
        wideLvl: save.wideLvl, slowmo: save.slowmo, magnet: save.magnet,
        slowmoT, magnetT, totalPlay: save.totalPlay,
        streak: save.streak.count, missions: save.daily.missions.map(m => ({ id: m.id, prog: m.prog, done: m.done })),
        runBaseW,
      }),
      addScore: (n) => { score += n; },
      getButtons: () => buttons.map(b => ({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 })),
      grantClouds: (n) => { save.clouds += n; persistNow(); },
      buyTheme: (id) => buyTheme(id),
      buyWide: () => buyWide(),
      buyPowerup: (id) => buyPowerup(id),
      usePowerup: (id) => usePowerup(id),
      resetSave: () => { try { localStorage.removeItem('skystack.save'); } catch (e) {} },
      openShop: () => { if (state === 'menu') state = 'shop'; },
    };
  }
  requestAnimationFrame(frame);
}

boot();
