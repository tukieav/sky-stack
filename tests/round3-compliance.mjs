// Round 3 CrazyGames compliance regressions. Run against a fresh, isolated
// local build: node tests/round3-compliance.mjs http://localhost:PORT/
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8525/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'debug=1&nosdk=1';
let failed = false;
const ok = (condition, message) => {
  if (!condition) { failed = true; console.error('FAIL:', message); }
};

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro);
  await page.evaluate(() => window.__astro.resetSave());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro);
  // Escape is not the only keyboard exit alongside the visible BACK button.
  await page.evaluate(() => {
    window.__astro.openShop();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', bubbles: true, cancelable: true }));
  });
  let state = await page.evaluate(() => window.__astro.getState());
  ok(state.state === 'menu', 'Backspace did not close the Shop');
  await page.evaluate(() => window.__astro.start());
  state = await page.evaluate(() => window.__astro.getState());
  ok(state.onboardingActive, 'first-run first-floor TAP / SPACE onboarding is missing');

  // `key` deliberately describes a different layout; gameplay must follow the
  // physical `code` field and still perform the drop.
  await page.evaluate(() => {
    window.__astro.alignMoving();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'z', bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(90);
  state = await page.evaluate(() => window.__astro.getState());
  ok(state.blocks === 2, `code-based Space input did not drop a block (${state.blocks})`);
  ok(!state.onboardingActive, 'onboarding did not dismiss after the first successful input');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro);
  await page.evaluate(() => window.__astro.start());
  state = await page.evaluate(() => window.__astro.getState());
  ok(!state.onboardingActive, 'onboarding repeated in the same save');

  await page.close();
} finally {
  await browser.close();
}

console.log(failed ? 'round3 compliance FAILED' : 'round3 compliance PASSED');
process.exit(failed ? 1 : 0);
