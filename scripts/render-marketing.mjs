// Regenerates full marketing kit from REAL gameplay with the new art:
//  - marketing/screenshot-1.png / screenshot-2.png (1920x1080)
//  - marketing/cover-16x9.png (1920x1080), cover-1x1.png (800x800), cover-2x3.png (800x1200)
//  - 17s cover-led, no-audio gameplay videos via recordVideo + ffmpeg
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://localhost:8525/';
const URL = BASE + '?debug=1&nosdk=1';
const GAME_W = 540, GAME_H = 960;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

async function prep(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__astro, { timeout: 30000 });
  await page.waitForTimeout(700);
}
const stOf = (page) => page.evaluate(() => window.__astro.getState());
async function clickPlay(page) {
  const bs = await page.evaluate(() => window.__astro.getButtons());
  const b = bs.find(q => q.id === 'play');
  const bb = await page.locator('#game').boundingBox();
  const map = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const scale = innerWidth > innerHeight ? r.height / 960 : r.width / 540;
    return { scale, left: (540 - r.width / scale) / 2, top: (960 - r.height / scale) / 2 };
  });
  await page.mouse.click(bb.x + (b.x - map.left) * map.scale, bb.y + (b.y - map.top) * map.scale);
  await page.waitForTimeout(300);
}
async function smartDrop(page, tol = 7) {
  const bb = await page.locator('#game').boundingBox();
  for (let t = 0; t < 200; t++) {
    const q = await stOf(page);
    if (q.state !== 'playing' || q.movingCx == null) return q;
    if (Math.abs(q.movingCx - q.topCx) < tol) {
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(110);
      return stOf(page);
    }
    // Debug builds expose a deterministic alignment hook so marketing renders
    // from a fresh bundle without spending minutes waiting for every pass.
    if (t === 0) await page.evaluate(() => window.__astro.alignMoving());
    await page.waitForTimeout(25);
  }
  return stOf(page);
}
async function playTo(page, floor) {
  for (let g = 0; g < 2000; g++) {
    const s = await stOf(page);
    if (s.state !== 'playing' || s.level >= floor) return s;
    await smartDrop(page);
  }
}

// ---------- screenshots 1920x1080 ----------
if (!process.env.MARKETING_VIDEO) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await prep(page);
  await clickPlay(page);
  await playTo(page, 8);
  await smartDrop(page);
  await page.waitForTimeout(120);
  await page.screenshot({ path: root + '/marketing/screenshot-1.png' });
  console.log('screenshot-1', JSON.stringify(await stOf(page)).slice(0, 90));
  await playTo(page, 24);
  await smartDrop(page);
  await page.waitForTimeout(80);
  await page.screenshot({ path: root + '/marketing/screenshot-2.png' });
  console.log('screenshot-2 done');
  await page.close();
}

// ---------- covers: render the single procedural marketing source exactly ----------
if (!process.env.MARKETING_VIDEO) {
  for (const [W, H, out] of [[1920, 1080, 'cover-16x9.png'], [800, 800, 'cover-1x1.png'], [800, 1200, 'cover-2x3.png']]) {
    const p2 = await browser.newPage({ viewport: { width: W, height: H } });
    await p2.goto(`${pathToFileURL(root + '/marketing/cover.html')}?w=${W}&h=${H}`, { waitUntil: 'networkidle' });
    await p2.locator('#cover').screenshot({ path: root + '/marketing/' + out });
    console.log('rendered', out);
    await p2.close();
  }
}

// ---------- videos: exact cover opening, then fresh active gameplay ----------
for (const [vw, vh, name, cover] of [
  [1920, 1080, 'video-landscape', 'cover-16x9.png'],
  [720, 1080, 'video-portrait', 'cover-2x3.png'],
].filter(([, , name]) => !process.env.MARKETING_VIDEO || name === `video-${process.env.MARKETING_VIDEO}`)) {
  const dir = root + '/marketing/_vid';
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx2 = await browser.newContext({ viewport: { width: vw, height: vh }, recordVideo: { dir, size: { width: vw, height: vh } } });
  const page = await ctx2.newPage();
  const recordedVideo = page.video();
  await prep(page);
  await clickPlay(page);
  // The recorded file begins at page creation, so trim the boot/menu portion
  // below. This loop is deliberately aligned to stay in active gameplay.
  const t0 = Date.now();
  while (Date.now() - t0 < 18500) {
    const s = await smartDrop(page);
    if (s.state !== 'playing') { await page.evaluate(() => window.__astro.restart()); continue; }
    await page.waitForTimeout(310);
  }
  await page.close(); await ctx2.close();
  const webm = await recordedVideo.path();
  // 0.7 seconds of the corresponding cover is the exact opening visual. The
  // following trim starts after boot/play and yields 17 seconds total, with no
  // audio track, menus, game-over panel or cursor in the submitted asset.
  execSync(`ffmpeg -y -loop 1 -framerate 30 -t 0.7 -i "${root}/marketing/${cover}" -ss 2.5 -i "${webm}" -filter_complex "[0:v]fps=30,scale=${vw}:${vh},format=yuv420p[cover];[1:v]fps=30,trim=duration=16.3,setpts=PTS-STARTPTS,format=yuv420p[game];[cover][game]concat=n=2:v=1:a=0[v]" -map "[v]" -t 17 -an -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "${root}/marketing/${name}.mp4" 2>/dev/null`);
  rmSync(dir, { recursive: true, force: true });
  console.log('rendered', name + '.mp4');
}

await browser.close();
console.log('marketing kit done');
