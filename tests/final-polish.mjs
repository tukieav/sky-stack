// Focused regressions for the three defects documented in FINAL_POLISH_AUDIT.
// Run against a built local server: node tests/final-polish.mjs http://localhost:8525/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8525/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
const out = 'qa/final-polish';
mkdirSync(out, { recursive: true });

let failed = false;
function ok(condition, message) {
  if (!condition) { failed = true; console.error('FAIL:', message); }
}

async function fresh(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro);
  await page.evaluate(() => window.__astro.resetSave());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro);
}

function point(box, viewport, button) {
  const scale = viewport.width > viewport.height ? box.height / 960 : box.width / 540;
  return { x: box.x + (button.x - (540 - box.width / scale) / 2) * scale, y: box.y + (button.y - (960 - box.height / scale) / 2) * scale };
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
try {
  // 1. The first three friendly placements and a later narrow tower must use
  // the rendered roof for both the guide and the scoring calculation. The
  // unswayed comparison is a negative/mutation-style control.
  const windPage = await browser.newPage({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1 });
  await fresh(windPage);
  await windPage.evaluate(() => window.__astro.start());
  for (let i = 0; i < 3; i++) await windPage.evaluate(() => { window.__astro.alignMoving(); window.__astro.drop(); });
  let state = await windPage.evaluate(() => window.__astro.getState());
  ok(state.perfectCombo === 3, 'first three aligned placements were not all PERFECT');
  for (let i = 0; i < 12; i++) {
    await windPage.evaluate(() => { const s = window.__astro.getState(); window.__astro.setMovingCx(s.topCx + 8); window.__astro.drop(); });
  }
  let proof = null;
  for (let t = 0; t <= 100; t += 0.05) {
    proof = await windPage.evaluate((windTime) => {
      window.__astro.setWindTime(windTime);
      const p = window.__astro.placementPreview();
      if (p) window.__astro.setMovingCx(p.renderedCx);
      return window.__astro.placementPreview();
    }, t);
    if (proof && Math.abs(proof.sway) > proof.threshold - proof.renderedOverlap + 0.05 && proof.unswayedOverlap < proof.threshold) break;
  }
  ok(proof && proof.renderedOverlap >= proof.threshold, 'rendered alignment is not a PERFECT');
  ok(proof && proof.unswayedOverlap < proof.threshold, 'negative unswayed placement control unexpectedly passes');
  await windPage.evaluate(() => window.__astro.drop());
  state = await windPage.evaluate(() => window.__astro.getState());
  ok(state.perfectCombo === 1, 'rendered roof did not score a PERFECT after cut sequence');
  await windPage.screenshot({ path: `${out}/907x510-wind-fairness.png` });
  await windPage.close();

  // 2. Shop labels at the required 821x462 viewport must be at least 12 CSS px.
  const shopViewport = { width: 821, height: 462 };
  const shopPage = await browser.newPage({ viewport: shopViewport, deviceScaleFactor: 1 });
  await fresh(shopPage);
  await shopPage.evaluate(() => window.__astro.openShop());
  await shopPage.waitForTimeout(80);
  state = await shopPage.evaluate(() => window.__astro.getState());
  const shopButtons = await shopPage.evaluate(() => window.__astro.getButtons());
  ok(state.shopMinTextCss >= 12, `shop labels too small: ${state.shopMinTextCss}px`);
  ok(shopButtons.filter(b => b.id.startsWith('theme-')).every(b => b.w * (462 / 960) >= 120 && b.h * (462 / 960) >= 28), 'shop theme targets are too small');
  await shopPage.screenshot({ path: `${out}/821x462-shop.png` });
  await shopPage.close();

  // 3. No-SDK game-over UI must not promise an unavailable ad, and restart
  // must still be a physical one-click action. Direct continue is retained as
  // a defensive guard for an in-flight/ad-race invocation.
  const offlineViewport = { width: 390, height: 844 };
  const offlinePage = await browser.newPage({ viewport: offlineViewport, deviceScaleFactor: 1 });
  await fresh(offlinePage);
  await offlinePage.evaluate(() => { window.__astro.start(); window.__astro.forceGameOver(); });
  await offlinePage.waitForTimeout(80);
  let offline = await offlinePage.evaluate(() => window.__astro.getState());
  let offlineButtons = await offlinePage.evaluate(() => window.__astro.getButtons());
  ok(!offline.adAvailable && !offlineButtons.some(b => b.id === 'continue'), 'offline game over still advertises CONTINUE (AD)');
  ok(offline.gameoverNotice.includes('Ads are unavailable') && offlineButtons.some(b => b.id === 'again'), 'offline restart explanation/fallback missing');
  await offlinePage.evaluate(() => window.__astro.continueRun());
  offline = await offlinePage.evaluate(() => window.__astro.getState());
  ok(offline.state === 'gameover' && offline.gameoverNotice.includes('PLAY AGAIN'), 'guarded offline continue did not return a clear fallback');
  const again = (await offlinePage.evaluate(() => window.__astro.getButtons())).find(b => b.id === 'again');
  const box = await offlinePage.locator('#game').boundingBox();
  const p = point(box, offlineViewport, again);
  await offlinePage.mouse.click(p.x, p.y);
  await offlinePage.waitForTimeout(100);
  offline = await offlinePage.evaluate(() => window.__astro.getState());
  ok(offline.state === 'playing' && offline.score === 0, 'offline PLAY AGAIN did not restart');
  await offlinePage.screenshot({ path: `${out}/390x844-offline-restart.png` });
  await offlinePage.close();
} finally {
  await browser.close();
}

console.log(failed ? 'final polish FAILED' : 'final polish PASSED');
process.exit(failed ? 1 : 0);
