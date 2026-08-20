// QA screenshot capture: menu, early game, cloud band, space, gameover, shop
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8525/';
const URL = BASE + '?debug=1';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 1000 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.evaluate(() => window.__astro.resetSave());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
await page.waitForTimeout(600);
const shot = (n) => page.screenshot({ path: 'tests/qa-' + n + '.png' });
await shot('menu');
const st = () => page.evaluate(() => window.__astro.getState());
const btns = () => page.evaluate(() => window.__astro.getButtons());
async function clickBtn(id) {
  const bs = await btns();
  const b = bs.find(q => q.id === id);
  const bb = await page.locator('#game').boundingBox();
  await page.mouse.click(bb.x + b.x * bb.width / 540, bb.y + b.y * bb.height / 960);
  await page.waitForTimeout(300);
}
await clickBtn('shop');
await shot('shop');
await clickBtn('back');
await clickBtn('play');
// smart drop until target floors, screenshot at milestones
async function playTo(floor, name) {
  for (let guard = 0; guard < 3000; guard++) {
    const s = await st();
    if (s.state !== 'playing') return false;
    if (s.level >= floor) { await page.waitForTimeout(200); await shot(name); return true; }
    if (s.movingCx != null && Math.abs(s.movingCx - s.topCx) < 6) {
      const bb = await page.locator('#game').boundingBox();
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(90);
    } else await page.waitForTimeout(30);
  }
  return false;
}
await playTo(6, 'early');
await playTo(20, 'clouds');
await playTo(45, 'strato');
await playTo(70, 'space');
await page.evaluate(() => window.__astro.forceGameOver());
await page.waitForTimeout(600);
await shot('gameover');
console.log('done', JSON.stringify(await st()));
await browser.close();
