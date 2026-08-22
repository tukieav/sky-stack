# Round 4 proof — 2026-08-22

All evidence was generated from this worktree after rebuilding `dist/` and
serving it in isolation at `http://127.0.0.1:9149/`.

## Cover refresh

The procedural source at `marketing/cover.html` now renders a bright, layered
day-sky construction scene in every required ratio. It uses a large friendly
crane, glossy character blocks, sun rays, clouds, skyline depth and a heavy
two-line outlined `SKY STACK` title. The cover contains no other text.

- `qa/round4-cover-907x510.png` — fresh 16:9 cover inspection frame.
- `qa/round4-menu-907x510.png` — fresh menu inspection frame at the same size.
- `marketing/cover-16x9.png`, `cover-2x3.png`, `cover-1x1.png` — regenerated
  from that same source at 1920x1080, 800x1200 and 800x800 respectively.

The small menu treatment is intentionally limited to a warm animated sunburst,
a lighter panel and chunky outlined title; gameplay scenes retain their prior
altitude-based art direction.

## Brightness gate

The gate calculates Rec. 709 sRGB byte luminance and HSV saturation for every
pixel. It requires `meanLum >= 80`, `darkFrac <= 0.35` (luminance < 40), and
`meanSat >= 0.35`.

| Cover | Previous meanLum / darkFrac / meanSat | New meanLum / darkFrac / meanSat | Result |
| --- | --- | --- | --- |
| 16:9 | 124.48 / 0.0894 / 0.5964 | 157.22 / 0.0000 / 0.4546 | PASS |
| 2:3 | 156.92 / 0.0004 / 0.5531 | 154.96 / 0.0000 / 0.4938 | PASS |
| 1:1 | 139.90 / 0.0323 / 0.5674 | 152.69 / 0.0000 / 0.4720 | PASS |

## Refreshed videos

Both videos were re-recorded after the menu update. The renderer uses the new
matching cover as its first 0.7 seconds, then freshly captured active gameplay;
there is no audio track.

| File | Codec / dimensions | Duration | Size |
| --- | --- | --- | --- |
| `marketing/video-landscape.mp4` | H.264 video, 1920x1080 (16:9) | 17.000s | 6,146,695 bytes |
| `marketing/video-portrait.mp4` | H.264 video, 720x1080 (2:3) | 17.000s | 4,519,649 bytes |

Decoding frame zero and comparing it to the corresponding cover (the portrait
cover scaled to 720x1080) measured RGB PSNR 35.99 dB for landscape and 34.77
dB for portrait. The difference is H.264 compression only; the first frame has
the same source composition.

## Commands and results

Every command below exited `0`.

```text
npm run build
node tools/e2e-viewport.cjs http://127.0.0.1:9149/ --proof
node tests/e2e.mjs http://127.0.0.1:9149/
node tests/determinism.mjs
node tools/e2e-viewport.cjs http://127.0.0.1:9149/
node tools/e2e-lifecycle.cjs http://127.0.0.1:9149/
node tools/e2e-soak.cjs http://127.0.0.1:9149/
npm run test:polish -- http://127.0.0.1:9149/
npm run test:compliance -- http://127.0.0.1:9149/
npm run test:cover-brightness
ffprobe -v error -show_entries format=duration,size:stream=codec_name,codec_type,width,height -of default=noprint_wrappers=1 marketing/video-landscape.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,codec_type,width,height -of default=noprint_wrappers=1 marketing/video-portrait.mp4
```

The full viewport gate passed at 907x510, 1216x684, 1077x606, 821x462,
1366x768, 1920x1080, 1536x864, 1280x720, 800x450 and 1080x607.
