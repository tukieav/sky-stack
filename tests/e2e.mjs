// Playwright e2e test for Sky Stack (run with: node tests/e2e.mjs [url])
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8481/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'debug=1';
const GAME_W = 540, GAME_H = 960;

const errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

let failed = false;
function fail(msg) { console.error('FAIL: ' + msg); failed = true; }

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.waitForTimeout(500);

const st = async () => page.evaluate(() => window.__astro.getState());
async function waitState(pred, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await st();
    if (pred(s)) return s;
    await page.waitForTimeout(250);
  }
  return st();
}

let s = await st();
console.log('boot state:', JSON.stringify(s));
if (s.state !== 'menu') fail('expected menu, got ' + s.state);

const bbox = await page.locator('#game').boundingBox();
const gx = (x) => bbox.x + x * (bbox.width / GAME_W);
const gy = (y) => bbox.y + y * (bbox.height / GAME_H);

// click PLAY (270, 580)
await page.mouse.click(gx(270), gy(580));
await page.waitForTimeout(300);
s = await st();
if (s.state !== 'playing') fail('expected playing after PLAY, got ' + s.state);

// smart gameplay: drop when moving block is aligned over the tower
async function smartDrop() {
  for (let t = 0; t < 100; t++) {
    const q = await st();
    if (q.state !== 'playing' || q.movingCx == null) return q;
    if (Math.abs(q.movingCx - q.topCx) < 25) {
      await page.mouse.click(gx(270), gy(760));
      await page.waitForTimeout(120);
      return st();
    }
    await page.waitForTimeout(40);
  }
  return st();
}

for (let i = 0; i < 14; i++) {
  s = await smartDrop();
  if (s.state !== 'playing') break;
}
console.log('after 14 drops:', JSON.stringify(s));
if (s.score < 8) fail('score too low after drops: ' + s.score);
if (s.blocks < 10) fail('tower too short: ' + s.blocks);

// force game over
if (s.state === 'playing') {
  await page.evaluate(() => window.__astro.forceGameOver());
  s = await waitState((q) => q.state === 'gameover', 3000);
}
if (s.state !== 'gameover') fail('expected gameover, got ' + s.state);
const scoreBefore = s.score;
console.log('gameover state:', JSON.stringify(s));
await page.screenshot({ path: 'tests/shot-gameover.png' });

// rewarded CONTINUE button (y=500)
await page.mouse.click(gx(270), gy(500));
s = await waitState((q) => q.state !== 'ad', 25000);
console.log('after continue:', JSON.stringify(s));
// local (no SDK): rewarded fails -> gameover; with SDK test ad -> playing
if (s.state === 'playing') {
  if (!s.usedContinue) fail('continue granted but usedContinue false');
  s = await smartDrop();
  await page.evaluate(() => window.__astro.forceGameOver());
  s = await waitState((q) => q.state === 'gameover', 3000);
}
if (s.state !== 'gameover') fail('expected gameover before play again, got ' + s.state);

// PLAY AGAIN (midgame ad): y=600 if continue button visible, else 500
const againY = s.usedContinue ? 500 : 600;
for (let attempt = 0; attempt < 5; attempt++) {
  await page.mouse.click(gx(270), gy(againY));
  s = await waitState((q) => q.state !== 'gameover', 5000);
  if (s.state !== 'gameover') break;
  console.log('play-again click attempt ' + (attempt + 1) + ' state still ' + s.state);
}
s = await waitState((q) => q.state === 'playing', 40000);
console.log('after play again:', JSON.stringify(s));
if (s.state !== 'playing') fail('expected playing after PLAY AGAIN, got ' + s.state);
if (s.score !== 0) fail('score not reset: ' + s.score);

// a few more drops on the fresh run
for (let i = 0; i < 4; i++) { s = await smartDrop(); if (s.state !== 'playing') break; }
console.log('final state:', JSON.stringify(s));
if (s.score < 2) fail('new run score did not grow');

await page.screenshot({ path: 'tests/shot-final.png' });
await browser.close();

if (errors.length) { console.error('Console/page errors:', errors); failed = true; }
console.log('ERRORS: ' + errors.length);
console.log(failed ? 'TEST FAILED' : 'TEST PASSED');
process.exit(failed ? 1 : 0);
