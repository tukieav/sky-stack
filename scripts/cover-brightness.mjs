// Deterministic acceptance gate for the three submitted cover PNGs.
// Luminance is Rec. 709 on sRGB bytes; saturation is the HSV saturation.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = process.argv.slice(2);
const covers = files.length ? files : [
  'marketing/cover-16x9.png',
  'marketing/cover-2x3.png',
  'marketing/cover-1x1.png',
];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let passed = true;
for (const relative of covers) {
  const data = (await readFile(resolve(root, relative))).toString('base64');
  const page = await browser.newPage();
  const metrics = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const d = c.getContext('2d', { willReadFrequently: true }); d.drawImage(img, 0, 0);
    const px = d.getImageData(0, 0, c.width, c.height).data;
    let lum = 0, dark = 0, sat = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      lum += l; dark += l < 40 ? 1 : 0; sat += hi ? (hi - lo) / hi : 0;
    }
    const n = px.length / 4;
    return { width: c.width, height: c.height, meanLum: lum / n, darkFrac: dark / n, meanSat: sat / n };
  }, `data:image/png;base64,${data}`);
  await page.close();
  const ok = metrics.meanLum >= 80 && metrics.darkFrac <= 0.35 && metrics.meanSat >= 0.35;
  passed &&= ok;
  console.log(`${relative} ${ok ? 'PASS' : 'FAIL'} meanLum=${metrics.meanLum.toFixed(2)} darkFrac=${metrics.darkFrac.toFixed(4)} meanSat=${metrics.meanSat.toFixed(4)} ${metrics.width}x${metrics.height}`);
}
await browser.close();
if (!passed) process.exitCode = 1;
