# Sky Stack hardening audit — 2026-08-21

## Scope and baseline exercise

This audit covers the pre-hardening `235144d` build. I read the game loop,
Canvas renderer, SDK/audio/save/meta modules, existing Playwright flows and the
submission copy. The baseline build was exercised locally with a fresh save:
menu → Shop → Play → fourteen aligned placements → forced fail → restart at
1280×720, 1920×1080 and 390×844 (DPR 1). `tests/e2e.mjs` and the existing
three-viewport desktop smoke passed with no browser errors. The current
portrait-oriented world is visible at 907×510 and 1920×1080, but its Shop text
is scaled down in landscape; that is not a substitute for the required
ten-viewport gate.

## Core loop, session and depth

One click on PLAY starts a timing loop: release a horizontally moving floor,
retain its overlap, collect PERFECT combo rewards and Clouds, then fail and
restart. Persistent Clouds buy themes, a wider base, Slow-Mo and Magnet; daily
missions and a streak add return goals. The session has satisfying immediate
feedback, but the opening lacks a visible landing/cut preview and the altitude
variety is largely a continuous background gradient rather than paced rewards.

## Prioritized findings

1. **P0 — no refresh-rate deterministic simulation proof.** The rAF callback
   calls `update` once using a variable delta (`src/main.js:1185-1190`), while
   movement, gravity and timer state are integrated directly (`419-444`). It
   is time-based in intent but has no fixed-step accumulator or 60/144/165 Hz
   regression gate, so long-frame behavior is unproven.
2. **P0 — lifecycle is not a game lifecycle.** There are no visibility or
   blur/focus handlers (`src/main.js:34,352-379,1206`); rAF and audio continue
   in the background. SDK ad callbacks only mute/unmute (`251-260,265-296`),
   so simulation and input ownership are not reliably paused for ads.
3. **P0 — unsafe save shape migration.** `loadSave` shallow-merges arbitrary
   JSON into defaults (`src/save.js:27-48`). A malformed nested `daily`,
   `themesOwned`, `streak`, or numeric field can later throw in normal render
   and shop paths (`src/main.js:865-870,1086-1097`).
4. **P1 — landscape Shop is not readable at required small desktop sizes.**
   The fixed 540×960 Shop layout (`src/main.js:1073-1121`) is scaled by the
   height in landscape (`19-30`); at 821×462 this makes its nominal 15–20px
   labels roughly 7–10 CSS px. Existing smoke does not open the Shop.
5. **P1 — onboarding leaves the required precision aid absent.** The hint is
   only a text prompt (`1010-1019`) and is permanently removed after floor 3
   (`217-219`), not after a first PERFECT. There is no alignment shadow or
   visible cut-off/overhang preview at release.
6. **P1 — risk feedback is too subtle and uncommunicated.** Sway begins only
   above level 12 (`606-610`) and there is no wind-direction indicator or
   narrowness-driven risk cue. Moving and placed blocks do not share a clearly
   readable structural response.
7. **P1 — milestone pacing misses the brief.** Rewards are only at every 25th
   floor (`221-229`); there is no 10-floor variety/reward and no explicit
   10/25 environment transition. Continuous sky interpolation (`449-457`)
   does not relieve the endless plateau.
8. **P1 — transient pools have no explicit caps/bounds.** `burst` appends an
   arbitrary count (`121-130`), and debris is only removed on a two-second
   timer (`427-432`), not world bounds/capacity. Repeated high-frequency input
   has no soak gate or debug count assertion.
9. **P2 — accessibility preferences are missing.** Shake and full-screen
   perfect flash are always enabled (`385-388,977-981`); there is no
   `prefers-reduced-motion` support. Audio has a music button but no explicit
   accessible mute control beyond SDK setting (`1048-1050`).
10. **P2 — test and proof coverage is incomplete.** The only viewport smoke
   enumerates 1280×720, 1920×1080 and 390×844 (`tools/e2e-desktop.cjs:9`),
   lacks the ten required dimensions, physical touch, lifecycle, deterministic
   timing and 120-second soak checks. The baseline QA capture also stalls
   before its later ascent screenshots in an ordinary 30s CI window.

## Likely quit causes

| Moment | Risk | Evidence |
| --- | --- | --- |
| First 10 seconds | A player has to infer exact overlap timing; no landing shadow or cut preview. | `src/main.js:1010-1019` |
| First 60 seconds | The Shop is cramped/too small in 821×462 landscape, and risk increases without an intelligible wind cue. | `src/main.js:19-30,606-610,1073-1121` |
| Five minutes | Environment change is gradual and rewards skip floors 10/20; particle/debris behavior has not been soak-tested. | `src/main.js:221-229,427-444,449-457` |

## Graphics and game-feel audit

The current architectural block faces, skyline, crane, clouds, flyers and
altitude palette are a strong identity worth preserving (`603-716,720-771`).
The main gaps are communicative rather than stylistic: no landing ghost/cut
line, no readable wind direction, weak correlation between tower slenderness
and sway, and no celebratory landmark at 10 floors. The perfect flash must be
softened under reduced-motion settings.

## CrazyGames requirement matrix (baseline)

| Requirement | Status | Baseline evidence |
| --- | --- | --- |
| Gameplay in at most one click | PASS | `PLAY` calls `startGame` directly (`321-324,1048`). |
| DPR 1 ten-viewport gate | FAIL | only three viewports (`tools/e2e-desktop.cjs:9`). |
| 60/144/165 Hz deterministic gate | FAIL | variable rAF step, no comparison test (`1185-1190`). |
| Visibility/blur/ad pause-resume | FAIL | no document/window lifecycle handlers; ad only mutes. |
| Reload plus malformed/old-save safety | PARTIAL | reload is tested, but shallow parsing is unsafe (`src/save.js:33-36`). |
| 120s accelerated soak with bounded resources | FAIL | no soak runner/counters. |
| Keyboard, mouse and touch | PARTIAL | pointer + Space/Enter exist (`352-379`), but physical touch is not tested. |
| SDK loading/gameplay/ad/mute behavior | PARTIAL | init timeout and SDK calls exist, but ad lifecycle pause/resume is absent. |
| Reduced motion and readable contrast | PARTIAL | contrast is generally strong; no reduced-motion handling. |
| PEGI12/no custom fullscreen/cross-promotion | PASS | no fullscreen or cross-promotion code; content is non-violent. |

## Taxonomy/copy audit

`.hardening/portfolio-map.json` defines **Arcade** as the sole primary
category, with **Casual** secondary discovery and exactly: **Casual, One
Button, Skill, Mobile, 2D, Physics**. `marketing/SUBMISSION.md` instead says
Casual primary / Arcade secondary and lists invented portal tags such as
`stack`, `tower`, `tap`, `timing`, `one-tap`, `endless`, `reflex`, and
`one-hand`. Its short copy and feature claims also omit the required honest
wind, landing-guide and 10/25 milestone behavior until implementation lands.
