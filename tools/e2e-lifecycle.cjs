// Lifecycle + malformed persistence gate. The debug hook drives the same pause
// ownership used by visibility/ad handlers, without relying on flaky tab focus.
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8525/';
const url = base + (base.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 907, height: 510 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__astro);
  await page.evaluate(() => { localStorage.setItem('skystack.save', '{bad json'); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__astro);
  await page.evaluate(() => { localStorage.setItem('skystack.save', JSON.stringify({ v: 0, clouds: 'bad', themesOwned: null, daily: { missions: [null] }, streak: null })); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__astro);
  let state = await page.evaluate(() => window.__astro.getState());
  if (state.state !== 'menu' || !Array.isArray(state.themesOwned) || !Number.isFinite(state.clouds)) throw new Error('malformed save fallback failed');
  await page.evaluate(() => window.__astro.start());
  const before = await page.evaluate(() => window.__astro.getState().movingCx);
  await page.evaluate(() => { window.__astro.setHidden(true); window.__astro.soakStep(1); });
  state = await page.evaluate(() => window.__astro.getState());
  if (!state.paused || Math.abs(state.movingCx - before) > .001) throw new Error('hidden state did not freeze simulation ' + JSON.stringify({ before, state }));
  await page.evaluate(() => { window.__astro.setHidden(false); window.__astro.soakStep(1); });
  state = await page.evaluate(() => window.__astro.getState());
  if (state.paused || Math.abs(state.movingCx - before) < 1) throw new Error('visible state did not resume once');
  await browser.close();
  if (errors.length) throw new Error(errors.join(' | '));
  console.log('lifecycle/save PASS');
})().catch(e => { console.error(e); process.exit(1); });
