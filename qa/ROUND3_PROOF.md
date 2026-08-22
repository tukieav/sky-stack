# Round 3 proof — 2026-08-22

All evidence below was generated from this worktree's rebuilt `dist/` folder on
the isolated server `http://127.0.0.1:9147/` (not a shared development server).

## Fresh gameplay captures

- `qa/hardening/907x510-gameplay.png` — DPR 1 desktop gameplay and Shop path.
- `qa/hardening/1920x1080-gameplay.png` — DPR 1 landscape gameplay.
- `qa/hardening/390x844-gameplay.png` — DPR 1 touch/mobile gameplay.

The visual uplift is present in these fresh frames: the menu skyline drifts at
depth, successful blocks emit a short warm impact-dust puff, and the crane cable
has a moving tension curve/recoil. The viewport proof runner also refreshed the
full required landscape matrix and its matching menu frames under
`qa/hardening/`.

## Marketing media metadata

`ffprobe -v error -show_entries format=duration,size:stream=codec_name,codec_type,width,height -of default=noprint_wrappers=1` and the PNG stream probe reported:

| File | Measured dimensions / ratio | Duration | Other evidence |
| --- | --- | --- | --- |
| `marketing/cover-16x9.png` | 1920×1080, 16:9 | n/a | RGB PNG; title only, no border |
| `marketing/cover-2x3.png` | 800×1200, 2:3 | n/a | RGB PNG; title only, no border |
| `marketing/cover-1x1.png` | 800×800, 1:1 | n/a | RGB PNG; title only, no border |
| `marketing/video-landscape.mp4` | 1920×1080, 16:9 | 17.000s | H.264 video stream only; no audio |
| `marketing/video-portrait.mp4` | 720×1080, 2:3 | 17.000s | H.264 video stream only; no audio |

Both videos were made with `scripts/render-marketing.mjs` from a fresh aligned
gameplay recording. The matching cover is looped for the opening 0.7 seconds,
then the boot/menu portion is trimmed before active gameplay. The recordings use
headless Playwright capture, so no pointer cursor is encoded.

Decoded first-frame comparisons against the matching cover (the portrait cover
was first scaled to 720×1080) measured RGB PSNR 39.69 dB for landscape and
37.31 dB for portrait; the small loss is the expected H.264 compression, not a
different opening image.

## Gate commands and results

All commands exited `0` against port `9147`:

```text
npm run build
node tools/e2e-viewport.cjs http://127.0.0.1:9147/ --proof
node tests/e2e.mjs http://127.0.0.1:9147/
node tests/determinism.mjs
node tools/e2e-viewport.cjs http://127.0.0.1:9147/
node tools/e2e-lifecycle.cjs http://127.0.0.1:9147/
node tools/e2e-soak.cjs http://127.0.0.1:9147/
node tests/final-polish.mjs http://127.0.0.1:9147/
node tests/round3-compliance.mjs http://127.0.0.1:9147/
```

The compliance regression dispatches a `KeyboardEvent` with `code: "Space"`
and a deliberately mismatched `key: "z"`; the first block still drops, proving
the gameplay action is layout-independent.
