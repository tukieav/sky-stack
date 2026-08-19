# Sky Stack

One-tap tower-stacking arcade game for CrazyGames. Tap to drop the sliding
block; overhang gets sliced off. Chain PERFECT drops to grow your block back
and climb from daytime skies into starry space.

**Play:** https://tukieav.github.io/sky-stack/

## Tech
- Vanilla JS + Canvas 2D, procedural graphics & WebAudio sounds (no asset files)
- esbuild bundle (~10 KB), CrazyGames SDK v3 full integration
- Playwright e2e tests against system Chrome

## Develop
```bash
npm ci
npm run dev      # esbuild watch + dev server
npm run build    # minified bundle -> dist/
node tests/e2e.mjs [url]   # e2e (default http://localhost:8481/)
```

## Submission
`npm run build && cd dist && zip -r ../sky-stack.zip .`
Covers & copy: see `marketing/`.
