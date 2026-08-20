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
    placed = { cx: prev.cx, w, level: moving.level, hue: moving.hue };
    const bonus = 5 * perfectCombo;
    score += 1 + bonus;
    hitStop = 0.06;
    perfectSound(perfectCombo);
    burst(prev.cx, y + BH / 2, moving.hue, 26, 220);
    floatText(prev.cx, y - 10, 'PERFECT +' + bonus, '#ffe86b', 30);
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
  camY += (targetCamY - camY) * Math.min(1, dt * 5);
  if (shake > 0) shake = Math.max(0, shake - dt * 30);
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
function skyColors(lv) {
  const [dTop, nTop, dBot, nBot] = theme().sky;
  const t = Math.min(1, lv / 90);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const top = `rgb(${lerp(dTop[0], nTop[0])},${lerp(dTop[1], nTop[1])},${lerp(dTop[2], nTop[2])})`;
  const bot = `rgb(${lerp(dBot[0], nBot[0])},${lerp(dBot[1], nBot[1])},${lerp(dBot[2], nBot[2])})`;
  return [top, bot];
}

function drawBlock(cx, y, w, hue, glow) {
  const x = cx - w / 2;
  const sat = theme().sat;
  const grad = ctx.createLinearGradient(x, y, x, y + BH);
  grad.addColorStop(0, `hsl(${hue},${sat}%,62%)`);
  grad.addColorStop(1, `hsl(${hue},${sat}%,44%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, BH);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + BH - 5, w, 5);
  if (glow) {
    ctx.strokeStyle = magnetT > 0 ? 'rgba(255,210,120,0.85)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, BH - 2);
  }
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

function cloudsHud(x, y) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.roundRect(x - 8, y - 4, 116, 34, 10); ctx.fill();
  ctx.fillStyle = '#bfe3ff';
  ctx.font = '800 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('☁ ' + save.clouds, x, y);
}

function worldToScreen(wy) { return wy + camY; }

function draw() {
  buttons = [];
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const [cTop, cBot] = skyColors(level);
  const bg = ctx.createLinearGradient(0, 0, 0, GAME_H);
  bg.addColorStop(0, cTop); bg.addColorStop(1, cBot);
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, GAME_W + 40, GAME_H + 40);

  // stars above level 40
  if (level > 40) {
    const alpha = Math.min(1, (level - 40) / 30);
    for (const s of stars) {
      const sy = ((s.y + camY * 0.35) % (GAME_H + 40)) - 20;
      ctx.fillStyle = `rgba(255,255,255,${(s.a * alpha).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, sy, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // clouds (simple, parallax, fade out with height)
  const cloudA = Math.max(0, 1 - level / 55);
  if (cloudA > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(0.35 * cloudA).toFixed(3)})`;
    for (let i = 0; i < 5; i++) {
      const cy2 = ((i * 233 + camY * 0.5) % (GAME_H + 200)) - 100;
      const cx2 = (i * 197) % GAME_W;
      ctx.beginPath();
      ctx.ellipse(cx2, cy2, 70, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(cx2 + 45, cy2 + 8, 50, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // tower
  for (const b of blocks) {
    const sy = worldToScreen(levelY(b.level));
    if (sy > -BH && sy < GAME_H + BH) drawBlock(b.cx, sy, b.w, b.hue, false);
  }

  // moving block
  if (moving && state === 'playing') {
    drawBlock(moving.cx, worldToScreen(moving.y), moving.w, moving.hue, true);
  }

  // debris
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, worldToScreen(d.y) + BH / 2);
    ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life);
    ctx.fillStyle = `hsl(${d.hue},70%,50%)`;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();
  }

  // particles
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    ctx.fillStyle = `hsla(${p.hue},85%,65%,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(p.x, worldToScreen(p.y), 3.5 * a + 1, 0, Math.PI * 2); ctx.fill();
  }

  // floaters
  for (const f of floaters) {
    const a = 1 - f.t / f.life;
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.font = `900 ${f.size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, worldToScreen(f.y));
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.roundRect(50, 680, GAME_W - 100, 190, 14); ctx.fill();
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
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(GAME_W / 2 - 190, ty, 380, t.sub ? 66 : 44, 12); ctx.fill();
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
