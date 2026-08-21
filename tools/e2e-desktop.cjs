// Full-viewport smoke test for the desktop-first presentation.
// Usage: node tools/e2e-desktop.cjs [base-url]
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

const base = process.argv[2] || 'http://localhost:8525/';
const url = base + (base.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
const sizes = [[1280, 720], [1920, 1080], [390, 844]];
const outDir = 'qa/desktop';
mkdirSync(outDir, { recursive: true });

let failed = false;
const fail = (message) => { failed = true; console.error('FAIL:', message); };
const ok = (condition, message) => { if (!condition) fail(message); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  for (const [width, height] of sizes) {
    const errors = [];
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
    await page.evaluate(() => window.__astro.resetSave());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
    await page.waitForTimeout(450);

    const box = await page.locator('#game').boundingBox();
    ok(box && box.width >= width * 0.98 && box.height >= height * 0.98, `${width}x${height}: canvas is not full viewport (${JSON.stringify(box)})`);

    const edge = await page.evaluate(() => {
      const c = document.getElementById('game');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const sample = (x, y) => {
        const i = (Math.max(0, Math.min(c.height - 1, y)) * c.width + Math.max(0, Math.min(c.width - 1, x))) * 4;
        return [d[i], d[i + 1], d[i + 2]];
      };
      const pixels = [];
      for (const x of [2, c.width - 3]) for (const y of [c.height * 0.12, c.height * 0.32, c.height * 0.55, c.height * 0.78]) pixels.push(sample(x, Math.floor(y)));
      const lit = pixels.filter(p => p[0] + p[1] + p[2] > 45).length;
      const distinct = new Set(pixels.map(p => p.join(','))).size;
      return { pixels, lit, distinct };
    });
    ok(edge.lit >= 7 && edge.distinct >= 3, `${width}x${height}: inactive edge pixels ${JSON.stringify(edge)}`);

    const view = await page.evaluate(() => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      const landscape = innerWidth > innerHeight;
      const s = landscape ? r.height / 960 : r.width / 540;
      return { left: (540 - r.width / s) / 2, top: (960 - r.height / s) / 2, scale: s, x: r.x, y: r.y };
    });
    const point = (x, y) => ({ x: view.x + (x - view.left) * view.scale, y: view.y + (y - view.top) * view.scale });
    async function clickButton(id) {
      for (let tries = 0; tries < 25; tries++) {
        const buttons = await page.evaluate(() => window.__astro.getButtons());
        const button = buttons.find(b => b.id === id);
        if (button) { await page.mouse.click(...Object.values(point(button.x, button.y))); return true; }
        await page.waitForTimeout(80);
      }
      fail(`${width}x${height}: missing button ${id}`);
      return false;
    }

    await page.screenshot({ path: `${outDir}/${width}x${height}-menu.png` });
    await clickButton('play');
    await page.waitForTimeout(200);
    let placed = 0;
    for (let tries = 0; tries < 180 && placed < 4; tries++) {
      const state = await page.evaluate(() => window.__astro.getState());
      if (state.state !== 'playing') break;
      if (state.movingCx != null && Math.abs(state.movingCx - state.topCx) < 38) {
        const p = point(270, 500);
        await page.mouse.click(p.x, p.y);
        placed++;
        await page.waitForTimeout(130);
      } else await page.waitForTimeout(35);
    }
    const state = await page.evaluate(() => window.__astro.getState());
    ok(state.state === 'playing' && state.blocks >= 4, `${width}x${height}: PLAY/drop path failed ${JSON.stringify(state)}`);
    await page.screenshot({ path: `${outDir}/${width}x${height}-play.png` });
    ok(errors.length === 0, `${width}x${height}: runtime errors ${errors.join(' | ')}`);
    console.log(`${width}x${height}: canvas OK, edges alive, ${state.blocks} blocks, errors=${errors.length}`);
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
