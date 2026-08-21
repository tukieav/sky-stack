// 120-second accelerated mixed-run soak. Uses the same fixed-step update as
// rAF and asserts bounded pools, stable listener/loop counts and zero errors.
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8525/';
const url = base + (base.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__astro);
  await page.evaluate(() => window.__astro.resetSave()); await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__astro);
  for (let cycle = 0; cycle < 12; cycle++) {
    await page.evaluate(() => { window.__astro.openShop(); window.__astro.closeShop(); });
    await page.evaluate(() => window.__astro.restart());
    for (let i=0;i<16;i++) await page.evaluate(() => { window.__astro.alignMoving(); window.__astro.drop(); window.__astro.soakStep(.35); });
    await page.evaluate(() => window.__astro.forceGameOver());
    await page.evaluate(() => window.__astro.restart());
  }
  // A 120-second active ascent after the restart/UI cycles catches growth
  // that only emerges during a long successful session.
  await page.evaluate(() => {
    window.__astro.restart();
    for (let second = 0; second < 120; second++) { window.__astro.alignMoving(); window.__astro.drop(); window.__astro.soakStep(1); }
  });
  const state = await page.evaluate(() => window.__astro.getState());
  const c = state.counts;
  const bounds = c.debris <= 36 && c.particles <= 180 && c.floaters <= 20 && c.toasts <= 4 && c.flyers <= 12 && c.listeners === 5 && c.loops === 1;
  console.log('soak state', JSON.stringify({ state: state.state, counts:c, totalPlay:state.totalPlay }));
  await browser.close();
  if (errors.length || !bounds) { console.error('soak failed', { errors, bounds }); process.exit(1); }
  console.log('soak PASS: 120s accelerated mixed run');
})().catch(e => { console.error(e); process.exit(1); });
