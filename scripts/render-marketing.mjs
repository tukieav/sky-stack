// Renders covers (1920x1080, 1080x1080) and 2 gameplay screenshots (1920x1080)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

// covers
for (const [w, h, sqp, out] of [[1920, 1080, '', 'cover-16x9.png'], [1080, 1080, '&sq=1', 'cover-1x1.png']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('file://' + root + '/marketing/cover.html?w=' + w + '&h=' + h + sqp);
  await page.waitForFunction(() => document.title === 'ready');
  await page.waitForTimeout(300);
  await page.locator('#cover').screenshot({ path: root + '/marketing/' + out });
  console.log('rendered', out);
  await page.close();
}

// gameplay screenshots 1920x1080
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const GAME_W = 540, GAME_H = 960;
await page.goto('http://localhost:8481/?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const bbox = await page.locator('#game').boundingBox();
const gx = (x) => bbox.x + x * (bbox.width / GAME_W);
const gy = (y) => bbox.y + y * (bbox.height / GAME_H);
const st = () => page.evaluate(() => window.__astro.getState());

await page.mouse.click(gx(270), gy(580)); // PLAY
await page.waitForTimeout(300);

async function smartDrop() {
  for (let t = 0; t < 120; t++) {
    const q = await st();
    if (q.state !== 'playing' || q.movingCx == null) return q;
    if (Math.abs(q.movingCx - q.topCx) < 10) {
      await page.mouse.click(gx(270), gy(760));
      await page.waitForTimeout(120);
      return st();
    }
    await page.waitForTimeout(30);
  }
  return st();
}

for (let i = 0; i < 7; i++) await smartDrop();
await page.waitForTimeout(150);
await page.screenshot({ path: root + '/marketing/screenshot-1.png' });
console.log('rendered screenshot-1.png', JSON.stringify(await st()));

for (let i = 0; i < 8; i++) await smartDrop();
// catch a moment right after a drop (particles/floaters visible)
await smartDrop();
await page.waitForTimeout(60);
await page.screenshot({ path: root + '/marketing/screenshot-2.png' });
console.log('rendered screenshot-2.png', JSON.stringify(await st()));

await browser.close();
