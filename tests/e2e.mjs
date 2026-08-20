// Playwright e2e test for Sky Stack (run with: node tests/e2e.mjs [url])
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8512/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'debug=1';
const GAME_W = 540, GAME_H = 960;

const errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

let failed = false;
function fail(msg) { console.error('FAIL: ' + msg); failed = true; }
function ok(cond, msg) { if (!cond) fail(msg); }

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.evaluate(() => window.__astro.resetSave());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.waitForTimeout(500);

const st = async () => page.evaluate(() => window.__astro.getState());
const btns = async () => page.evaluate(() => window.__astro.getButtons());
async function waitState(pred, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await st();
    if (pred(s)) return s;
    await page.waitForTimeout(250);
  }
  return st();
}

const bbox = await page.locator('#game').boundingBox();
const gx = (x) => bbox.x + x * (bbox.width / GAME_W);
const gy = (y) => bbox.y + y * (bbox.height / GAME_H);
async function clickBtn(id) {
  let bs = [];
  for (let t = 0; t < 20; t++) {
    bs = await btns();
    const b = bs.find(q => q.id === id);
    if (b) {
      await page.mouse.click(gx(b.x), gy(b.y));
      await page.waitForTimeout(250);
      return true;
    }
    await page.waitForTimeout(150);
  }
  fail('button not found: ' + id + ' (have: ' + bs.map(q => q.id).join(',') + ')');
  return false;
}

let s = await st();
console.log('boot state:', JSON.stringify(s));
ok(s.state === 'menu', 'expected menu, got ' + s.state);
ok(typeof s.clouds === 'number', 'clouds missing from state');
ok(s.streak >= 1, 'streak not initialized: ' + s.streak);
ok(Array.isArray(s.missions) && s.missions.length === 3, 'expected 3 daily missions');

// canvas pixels non-black (menu rendered)
const px = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4013 * 4) if (d[i] + d[i + 1] + d[i + 2] > 90) bright++;
  return bright;
});
ok(px > 5, 'canvas looks blank, bright samples: ' + px);

// ---- SHOP flow ----
await clickBtn('shop');
s = await st();
ok(s.state === 'shop', 'expected shop, got ' + s.state);
await page.evaluate(() => window.__astro.grantClouds(2000));
const boughtTheme = await page.evaluate(() => window.__astro.buyTheme('sunset'));
ok(boughtTheme, 'buyTheme sunset failed');
const boughtWide = await page.evaluate(() => window.__astro.buyWide());
ok(boughtWide, 'buyWide failed');
const boughtPu = await page.evaluate(() => window.__astro.buyPowerup('slowmo') && window.__astro.buyPowerup('magnet'));
ok(boughtPu, 'buyPowerup failed');
s = await st();
console.log('after purchases:', JSON.stringify({ clouds: s.clouds, theme: s.theme, wideLvl: s.wideLvl, slowmo: s.slowmo, magnet: s.magnet }));
ok(s.theme === 'sunset', 'theme not equipped');
ok(s.wideLvl === 1, 'wideLvl not 1');
ok(s.slowmo >= 1 && s.magnet >= 1, 'powerups not owned');
await clickBtn('back');
s = await st();
ok(s.state === 'menu', 'expected menu after back, got ' + s.state);

// ---- persistence across reload ----
const cloudsBefore = s.clouds;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.waitForTimeout(400);
s = await st();
ok(s.clouds === cloudsBefore, `clouds not persisted: ${s.clouds} != ${cloudsBefore}`);
ok(s.theme === 'sunset' && s.wideLvl === 1, 'theme/upgrade not persisted');
console.log('persistence OK:', JSON.stringify({ clouds: s.clouds, theme: s.theme, wideLvl: s.wideLvl }));

// ---- gameplay ----
await clickBtn('play');
s = await st();
ok(s.state === 'playing', 'expected playing after PLAY, got ' + s.state);
ok(s.runBaseW === 278, 'wider base not applied: ' + s.runBaseW);

// smart gameplay: drop when moving block is aligned over the tower
async function smartDrop() {
  for (let t = 0; t < 120; t++) {
    const q = await st();
    if (q.state !== 'playing' || q.movingCx == null) return q;
    if (Math.abs(q.movingCx - q.topCx) < 25) {
      await page.mouse.click(gx(270), gy(500));
      await page.waitForTimeout(120);
      return st();
    }
    await page.waitForTimeout(40);
  }
  return st();
}

// use powerups mid-run
await page.evaluate(() => window.__astro.usePowerup('slowmo'));
s = await st();
ok(s.slowmoT > 0, 'slowmo not active');
await page.evaluate(() => window.__astro.usePowerup('magnet'));
s = await st();
ok(s.magnetT > 0, 'magnet not active');

for (let i = 0; i < 14; i++) {
  s = await smartDrop();
  if (s.state !== 'playing') break;
}
console.log('after 14 drops:', JSON.stringify({ score: s.score, blocks: s.blocks, clouds: s.clouds, totalPlay: Math.round(s.totalPlay) }));
ok(s.score >= 8, 'score too low after drops: ' + s.score);
ok(s.blocks >= 10, 'tower too short: ' + s.blocks);
ok(s.totalPlay > 3, 'totalPlay not accumulating: ' + s.totalPlay);

// force game over
if (s.state === 'playing') {
  await page.evaluate(() => window.__astro.forceGameOver());
  s = await waitState((q) => q.state === 'gameover', 3000);
}
ok(s.state === 'gameover', 'expected gameover, got ' + s.state);
console.log('gameover state:', JSON.stringify({ score: s.score, clouds: s.clouds, cloudsRun: s.cloudsRun }));
await page.screenshot({ path: 'tests/shot-gameover.png' });

// rewarded CONTINUE
if (await clickBtn('continue')) {
  s = await waitState((q) => q.state !== 'ad', 25000);
  console.log('after continue:', JSON.stringify({ state: s.state, usedContinue: s.usedContinue }));
  if (s.state === 'playing') {
    ok(s.usedContinue, 'continue granted but usedContinue false');
    s = await smartDrop();
    await page.evaluate(() => window.__astro.forceGameOver());
    s = await waitState((q) => q.state === 'gameover', 3000);
  }
}
ok(s.state === 'gameover', 'expected gameover before play again, got ' + s.state);

// PLAY AGAIN (instant restart / midgame throttled)
for (let attempt = 0; attempt < 5; attempt++) {
  await clickBtn('again');
  s = await waitState((q) => q.state !== 'gameover', 5000);
  if (s.state !== 'gameover') break;
}
s = await waitState((q) => q.state === 'playing', 40000);
console.log('after play again:', JSON.stringify({ state: s.state, score: s.score }));
ok(s.state === 'playing', 'expected playing after PLAY AGAIN, got ' + s.state);
ok(s.score === 0, 'score not reset: ' + s.score);

// keyboard drop: keyboard.down + 120ms + up
const blocksBefore = s.blocks;
for (let t = 0; t < 120; t++) {
  const q = await st();
  if (q.movingCx != null && Math.abs(q.movingCx - q.topCx) < 25) break;
  await page.waitForTimeout(40);
}
await page.keyboard.down('Space');
await page.waitForTimeout(120);
await page.keyboard.up('Space');
await page.waitForTimeout(200);
s = await st();
ok(s.blocks > blocksBefore || s.state !== 'playing', 'keyboard drop did nothing');

// a few more drops on the fresh run
for (let i = 0; i < 4; i++) { s = await smartDrop(); if (s.state !== 'playing') break; }
console.log('final state:', JSON.stringify({ score: s.score, blocks: s.blocks, clouds: s.clouds }));
ok(s.score >= 2, 'new run score did not grow');

await page.screenshot({ path: 'tests/shot-final.png' });
await browser.close();

if (errors.length) { console.error('Console/page errors:', errors); failed = true; }
console.log('ERRORS: ' + errors.length);
console.log(failed ? 'TEST FAILED' : 'TEST PASSED');
process.exit(failed ? 1 : 0);
