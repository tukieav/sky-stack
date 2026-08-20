# Sky Stack — CrazyGames Submission Kit

Wszystko poniżej wklejasz w formularz na https://developer.crazygames.com/

## Game name
Sky Stack

## Category
Casual (secondary: Arcade)

## Tags
stack, tower, tap, timing, one-tap, arcade, casual, endless, reflex, one-hand

## Short description (max ~140 chars)
Tap to drop blocks and stack a rainbow tower to the stars! Nail PERFECT drops to grow your block back. One tap, endless heights.

## Full description
Sky Stack is a one-tap tower builder that's easy to learn and impossible to
put down. A block slides back and forth above your tower — tap at just the
right moment to drop it. Any part hanging over the edge gets sliced off and
tumbles away, making your tower thinner and the game tenser with every level.

Land a PERFECT drop (dead-center) to keep your full block — and chain 3+
perfects in a row to GROW your block back and rack up huge combo bonuses!

FEATURES
- Pure one-tap gameplay: works with mouse, touch or spacebar
- PERFECT combo system: chain flawless drops for multiplied points
- Blocks grow back after perfect streaks — comebacks are always possible
- Rainbow tower: colors cycle through the spectrum as you climb
- Fly from daytime skies into starry space as your tower rises
- Speed increases with height for an ever-growing challenge
- Watch cut pieces tumble away with satisfying physics
- Earn CLOUDS ☁ from perfects, milestones and height — spend them in the shop
- 6 unlockable tower/sky themes (Sunset, Ocean, Forest, Neon, Mono)
- Permanent upgrades (wider starting base) + Slow-Mo and Magnet power-ups
- Daily missions and a day-streak bonus that grows each day you return
- Floor milestones every 25 floors with cloud rewards
- Your best score and full progress are saved across devices

HOW TO PLAY
1. Tap / click / press Space to drop the moving block
2. Overhanging parts get cut off — keep your block wide!
3. Perfect drops (98%+ overlap) keep the full width
4. 3+ perfects in a row make your block grow back
5. Miss completely or shrink below the limit — game over!

How high can you stack?

## Controls text
Click / tap / Space — drop the block.

## SDK integration notes (QA reviewer info)
- HTML5 SDK v3, manual init before game start
- gameplayStart/gameplayStop on play/game over/ad breaks
- loadingStart/loadingStop around boot
- Midgame ad on "Play Again" after game over (throttled: max 1 per 90 s, instant restart otherwise)
- Rewarded ad "Continue" (resume run from current height with a 70%-width block, once per run)
- Rewarded ad "×2 Clouds" on the game-over screen (doubles the run's currency)
- happytime() every 25 floors climbed and on daily-mission completion
- game.settings.muteAudio respected + settings change listener
- Full progress (best score, clouds currency, themes, upgrades, missions, streak) via data module with localStorage fallback
- No external requests, all assets procedural (Canvas 2D + WebAudio), bundle ~10 KB
- Touch + mouse + keyboard; portrait-friendly, works on low-end devices
- Live demo: https://tukieav.github.io/sky-stack/

## Files to upload
- Build zip: sky-stack.zip (repo root po `npm run build` + `cd dist && zip -r ../sky-stack.zip .`)
- Cover 16:9 (1920x1080): marketing/cover-16x9.png
- Cover 1:1 (1080x1080): marketing/cover-1x1.png
- Screenshots: marketing/screenshot-1.png, marketing/screenshot-2.png (1920x1080)

## Age rating / audience
All ages; designed for 10–16. No violence, no blood, no text chat, no user content.
