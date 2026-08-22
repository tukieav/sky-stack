// Regenerates full marketing kit from REAL gameplay with the new art:
//  - marketing/screenshot-1.png / screenshot-2.png (1920x1080)
//  - marketing/cover-16x9.png (1920x1080), cover-1x1.png (800x800), cover-2x3.png (800x1200)
//  - 17s cover-led, no-audio gameplay videos via recordVideo + ffmpeg
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';

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

// ---------- covers: play to nice height, grab canvas, compose with title ----------
if (!process.env.MARKETING_VIDEO) {
  const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
  await prep(page);
  await clickPlay(page);
  await playTo(page, 15);
  // let toasts/floaters fade so the capture is clean
  await page.waitForTimeout(2600);
  // hide during-composition noise: capture the raw game canvas as data URL
  const dataUrl = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  await page.close();

  for (const [W, H, out] of [[1920, 1080, 'cover-16x9.png'], [800, 800, 'cover-1x1.png'], [800, 1200, 'cover-2x3.png']]) {
    const p2 = await browser.newPage({ viewport: { width: W, height: H } });
    await p2.setContent(`<html><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`);
    await p2.evaluate(async ({ dataUrl, W, H }) => {
      const c = document.getElementById('c'); const g = c.getContext('2d');
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = dataUrl; });
      // sky backdrop matching game palette (space top -> day bottom)
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0a1230'); bg.addColorStop(0.5, '#2a5aa8'); bg.addColorStop(1, '#8ec8f2');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // stars in the top half
      let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let i = 0; i < 160; i++) {
        const x = rnd() * W, y = rnd() * H * 0.5;
        g.fillStyle = `rgba(255,255,255,${((0.25 + rnd() * 0.6) * (1 - y / (H * 0.55))).toFixed(3)})`;
        g.beginPath(); g.arc(x, y, rnd() * 2 + 0.5, 0, Math.PI * 2); g.fill();
      }
      // gameplay tower: crop HUD off the top, fit by height, anchored bottom
      const srcY = 210, srcH = img.height - srcY;
      const scale = (H * 1.02) / srcH;
      const dw = img.width * scale, dh = srcH * scale;
      const dx = W > H ? W * 0.58 - dw / 2 : (W - dw) / 2;
      g.drawImage(img, 0, srcY, img.width, srcH, dx, H - dh, dw, dh);
      // soft edge fade so the crop blends into backdrop
      const fL = g.createLinearGradient(dx - 2, 0, dx + 70, 0);
      fL.addColorStop(0, 'rgba(20,50,110,0.55)'); fL.addColorStop(1, 'rgba(20,50,110,0)');
      g.fillStyle = fL; g.fillRect(dx - 2, 0, 72, H);
      const fR = g.createLinearGradient(dx + dw + 2, 0, dx + dw - 70, 0);
      fR.addColorStop(0, 'rgba(20,50,110,0.55)'); fR.addColorStop(1, 'rgba(20,50,110,0)');
      g.fillStyle = fR; g.fillRect(dx + dw - 70, 0, 72, H);
      // title in clear sky
      const ts = Math.min(W, H);
      const tx = W > H ? W * 0.29 : W / 2;
      const ty = W > H ? H * 0.42 : H * 0.15;
      g.textAlign = 'center';
      g.font = `900 ${Math.round(ts * (W > H ? 0.135 : 0.115))}px "Segoe UI", Arial, sans-serif`;
      g.lineWidth = Math.round(ts * 0.015);
      g.strokeStyle = 'rgba(10,14,36,0.9)';
      g.shadowColor = 'rgba(120,180,255,0.85)'; g.shadowBlur = Math.round(ts * 0.045);
      if (W > H) {
        g.strokeText('SKY', tx, ty); g.fillStyle = '#ffffff'; g.fillText('SKY', tx, ty);
        g.strokeText('STACK', tx, ty + ts * 0.15); g.fillText('STACK', tx, ty + ts * 0.15);
      } else {
        g.strokeText('SKY STACK', tx, ty); g.fillStyle = '#ffffff'; g.fillText('SKY STACK', tx, ty);
      }
    }, { dataUrl, W, H });
    await p2.locator('#c').screenshot({ path: root + '/marketing/' + out });
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
  const webm = dir + '/' + readdirSync(dir).find(f => f.endsWith('.webm'));
  // 0.7 seconds of the corresponding cover is the exact opening visual. The
  // following trim starts after boot/play and yields 17 seconds total, with no
  // audio track, menus, game-over panel or cursor in the submitted asset.
  execSync(`ffmpeg -y -loop 1 -framerate 30 -t 0.7 -i "${root}/marketing/${cover}" -ss 2.5 -i "${webm}" -filter_complex "[0:v]fps=30,scale=${vw}:${vh},format=yuv420p[cover];[1:v]fps=30,trim=duration=16.3,setpts=PTS-STARTPTS,format=yuv420p[game];[cover][game]concat=n=2:v=1:a=0[v]" -map "[v]" -t 17 -an -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "${root}/marketing/${name}.mp4" 2>/dev/null`);
  rmSync(dir, { recursive: true, force: true });
  console.log('rendered', name + '.mp4');
}

await browser.close();
console.log('marketing kit done');
