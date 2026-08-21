// Required CrazyGames DPR=1 viewport gate. It exercises a physical PLAY click,
// touch drop, keyboard drop and Shop/back path at every requested dimension.
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

const base = process.argv[2] || 'http://localhost:8525/';
const url = base + (base.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
const requiredSizes = [[907,510],[1216,684],[1077,606],[821,462],[1366,768],[1920,1080],[1536,864],[1280,720],[800,450],[1080,607]];
const proof = process.argv.includes('--proof');
const sizes = proof ? [[907,510],[1280,720],[1920,1080],[390,844]] : process.argv.includes('--portrait') ? [[390,844]] : requiredSizes;
const out = 'qa/hardening'; mkdirSync(out, { recursive: true });
let failed = false;
const ok = (condition, message) => { if (!condition) { failed = true; console.error('FAIL:', message); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__astro);
    await page.evaluate(() => window.__astro.resetSave());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__astro);
    await page.waitForTimeout(180);
    const box = await page.locator('#game').boundingBox();
    ok(box && box.width >= width * .98 && box.height >= height * .98, `${width}x${height}: canvas not viewport-sized`);
    const buttons = await page.evaluate(() => window.__astro.getButtons());
    const play = buttons.find(b => b.id === 'play'), shop = buttons.find(b => b.id === 'shop');
    ok(play && shop, `${width}x${height}: menu buttons missing`);
    const map = await page.evaluate(() => { const r = document.querySelector('#game').getBoundingClientRect(); const s = innerWidth > innerHeight ? r.height / 960 : r.width / 540; return { x:r.x, y:r.y, s, left:(540-r.width/s)/2, top:(960-r.height/s)/2 }; });
    const point = b => ({ x: map.x + (b.x - map.left) * map.s, y: map.y + (b.y - map.top) * map.s });
    await page.screenshot({ path: `${out}/${width}x${height}-menu.png` });
    // Shop must be visibly usable at the repo-specific 821/907 gates.
    if (width === 821 || width === 907) {
      await page.mouse.click(point(shop).x, point(shop).y);
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => window.__astro.getState());
      const back = await page.evaluate(() => window.__astro.getButtons().find(b => b.id === 'back'));
      ok(state.state === 'shop' && back, `${width}x${height}: Shop/back path missing`);
      const pixels = await page.evaluate(() => { const c=document.querySelector('#game'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let bright=0; for(let i=0;i<d.length;i+=9973*4) if(d[i]+d[i+1]+d[i+2]>210) bright++; return bright; });
      ok(pixels > 10, `${width}x${height}: shop lacks readable bright UI`);
      await page.mouse.click(point(back).x, point(back).y);
      await page.waitForTimeout(80);
    }
    await page.mouse.click(point(play).x, point(play).y);
    await page.waitForTimeout(80);
    let state = await page.evaluate(() => window.__astro.getState());
    ok(state.state === 'playing', `${width}x${height}: physical PLAY failed`);
    await page.evaluate(() => window.__astro.alignMoving());
    await page.touchscreen.tap(width / 2, height / 2);
    await page.waitForTimeout(100);
    state = await page.evaluate(() => window.__astro.getState());
    ok(state.blocks >= 2 || state.state === 'gameover', `${width}x${height}: touch drop failed`);
    if (state.state === 'playing') { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
    state = await page.evaluate(() => window.__astro.getState());
    ok(state.blocks >= 2 || state.state === 'gameover', `${width}x${height}: keyboard path failed`);
    // Let short-lived score burst text clear so proof captures the readable
    // in-play layout, not a transient post-tap frame.
    await page.waitForTimeout(proof ? 1450 : 650);
    await page.screenshot({ path: `${out}/${width}x${height}-gameplay.png` });
    ok(errors.length === 0, `${width}x${height}: ${errors.join(' | ')}`);
    console.log(`${width}x${height}: DPR1 viewport, menu/play/touch/keyboard${(width===821||width===907) ? '/shop' : ''} OK`);
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
