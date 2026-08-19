// Sky Stack — tap-timing tower builder for CrazyGames
import { initSDK, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, requestAd, getMuteSetting, onSettingsChange, loadBest, saveBest } from './sdk.js';
import { setMuted, unlockAudio, cutSound, perfectSound, growSound, gameOverSound, clickSound } from './audio.js';

const GAME_W = 540, GAME_H = 960;
const BASE_W = 260, BH = 36;          // base block width, block height
const MIN_W = 8;                       // narrower than this = game over
const PERFECT_FRAC = 0.98;             // overlap >= 98% of moving block = perfect
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
let state = 'boot';        // boot | menu | playing | dropping | gameover | ad
let blocks = [];           // {cx, w, level, hue}
let moving = null;         // {cx, w, dir, speed, level, hue, y}
let dropping = null;       // block falling into place {cx, w, level, hue, y, vy, targetY}
let debris = [];           // cut pieces {x, y, w, h, vx, vy, rot, vr, hue, life}
let particles = [];
let floaters = [];         // {x, y, text, life, color, size}
let score = 0, best = 0, level = 0;
let perfectCombo = 0;
let camY = 0, targetCamY = 0;
let shake = 0;
let usedContinue = false;
let stars = [];
let buttons = [];          // hit rects {x,y,w,h,id}
let tPrev = 0;

for (let i = 0; i < 120; i++) {
  stars.push({ x: Math.random() * GAME_W, y: Math.random() * 4000, r: Math.random() * 1.6 + 0.4, a: 0.3 + Math.random() * 0.6 });
}

function hueFor(lv) { return (lv * 9) % 360; }
function levelY(lv) { return BASE_Y - lv * BH; }   // world y of block top

function blockSpeed(lv) { return Math.min(150 + lv * 5, 460); }

function resetGame() {
  blocks = [{ cx: GAME_W / 2, w: BASE_W, level: 0, hue: hueFor(0) }];
  debris = []; particles = []; floaters = [];
  score = 0; level = 0; perfectCombo = 0; usedContinue = false;
  camY = 0; targetCamY = 0; shake = 0;
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

  const isPerfect = overlap >= PERFECT_FRAC * moving.w;
  let placed;
  if (isPerfect) {
    perfectCombo++;
    let w = moving.w;
    let grew = false;
    if (perfectCombo >= 3 && w < BASE_W) { w = Math.min(BASE_W, w + 10); grew = true; }
    placed = { cx: prev.cx, w, level: moving.level, hue: moving.hue };
    const bonus = 5 * perfectCombo;
    score += 1 + bonus;
    perfectSound(perfectCombo);
    burst(prev.cx, y + BH / 2, moving.hue, 26, 220);
    floatText(prev.cx, y - 10, 'PERFECT +' + bonus, '#ffe86b', 30);
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
  if (level % 25 === 0 && level > 0) happytime();
  if (placed.w < MIN_W) { triggerGameOver(); return; }
  spawnMoving(placed.w);
}

function triggerGameOver() {
  state = 'gameover';
  shake = 18;
  gameOverSound();
  gameplayStop();
  if (score > best) { best = score; saveBest(best); }
}

async function playAgain() {
  state = 'ad';
  await requestAd('midgame', {
    onStart: () => setMuted(true),
    onFinish: () => setMuted(getMuteSetting()),
  });
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
    spawnMoving(Math.max(MIN_W + 20, Math.round(BASE_W * 0.7)));
    state = 'playing';
    gameplayStart();
  } else {
    state = 'gameover';
  }
}

// ---------- input ----------
function gameCoords(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (GAME_W / r.width), y: (e.clientY - r.top) * (GAME_H / r.height) };
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const p = gameCoords(e);
  for (const b of buttons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      clickSound();
      if (b.id === 'play') startGame();
      else if (b.id === 'again') playAgain();
      else if (b.id === 'continue') doContinue();
      return;
    }
  }
  if (state === 'playing') doDrop();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    unlockAudio();
    if (state === 'playing') doDrop();
    else if (state === 'menu') startGame();
  }
});

// ---------- update ----------
function update(dt) {
  camY += (targetCamY - camY) * Math.min(1, dt * 5);
  if (shake > 0) shake = Math.max(0, shake - dt * 30);

  if (state === 'playing' && moving) {
    moving.cx += moving.dir * moving.speed * dt;
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
}

// ---------- draw ----------
function skyColors(lv) {
  // day sky at bottom → deep space with height
  const t = Math.min(1, lv / 90);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const top = `rgb(${lerp(90, 8)},${lerp(160, 10)},${lerp(230, 32)})`;
  const bot = `rgb(${lerp(160, 24)},${lerp(210, 30)},${lerp(250, 70)})`;
  return [top, bot];
}

function drawBlock(cx, y, w, hue, glow) {
  const x = cx - w / 2;
  const grad = ctx.createLinearGradient(x, y, x, y + BH);
  grad.addColorStop(0, `hsl(${hue},72%,62%)`);
  grad.addColorStop(1, `hsl(${hue},72%,44%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, BH);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + BH - 5, w, 5);
  if (glow) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, BH - 2);
  }
}

function drawBtn(cx, cy, w, h, label, id, color) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.fillStyle = '#0b0e1a';
  ctx.font = '800 26px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);
  buttons.push({ x, y, w, h, id });
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

  // stars above level 50
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
  const first = Math.max(0, Math.floor((-camY) / BH) - 2);
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
    ctx.fillText('BEST ' + best + '   ·   LVL ' + level, GAME_W / 2, 92);
    if (perfectCombo >= 2) {
      ctx.fillStyle = '#ffe86b';
      ctx.font = '800 24px "Segoe UI", Arial, sans-serif';
      ctx.fillText('PERFECT x' + perfectCombo, GAME_W / 2, 122);
    }
  }

  if (state === 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(120,180,255,0.9)'; ctx.shadowBlur = 24;
    ctx.font = '900 84px "Segoe UI", Arial, sans-serif';
    ctx.fillText('SKY', GAME_W / 2, 200);
    ctx.fillText('STACK', GAME_W / 2, 290);
    ctx.shadowBlur = 0;
    ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Tap to drop. Stack to the stars.', GAME_W / 2, 410);
    ctx.fillText('BEST: ' + best, GAME_W / 2, 452);
    drawBtn(GAME_W / 2, 580, 240, 74, 'PLAY', 'play', '#ffe86b');
  }

  if (state === 'gameover') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '900 60px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GAME OVER', GAME_W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Score: ' + score, GAME_W / 2, 340);
    ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Best: ' + best, GAME_W / 2, 388);
    let by = 500;
    if (!usedContinue) {
      drawBtn(GAME_W / 2, by, 320, 70, '▶ CONTINUE (AD)', 'continue', '#7bffb0');
      by += 100;
    }
    drawBtn(GAME_W / 2, by, 320, 70, 'PLAY AGAIN', 'again', '#ffe86b');
  }

  if (state === 'ad') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText('...', GAME_W / 2, GAME_H / 2);
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
  loadingStart();
  await initSDK();
  best = loadBest();
  setMuted(getMuteSetting());
  onSettingsChange((s) => { if (s && 'muteAudio' in s) setMuted(!!s.muteAudio); });
  loadingStop();
  state = 'menu';

  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__astro = {
      forceGameOver: () => { if (state === 'playing') { moving = null; triggerGameOver(); } },
      getState: () => ({ state, score, best, level, perfectCombo, usedContinue, blocks: blocks.length, movingW: moving ? moving.w : null, movingCx: moving ? moving.cx : null, topCx: blocks.length ? blocks[blocks.length - 1].cx : null }),
      addScore: (n) => { score += n; },
    };
  }
  requestAnimationFrame(frame);
}

boot();
