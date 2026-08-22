# Sky Stack final polish audit — 2026-08-22

## Current-build exercise

I exercised the current hardened build at 907x510, 1920x1080 and 390x844
(DPR 1): a 90-second active session, one forced death/retry, Shop, and an
accelerated 120-second successful ascent plus repeat restart cycles. I also
opened the Shop at 821x462 and repeated the game-over Continue path with
`?nosdk=1`. Existing viewport, determinism, lifecycle, persistence and soak
gates were left in scope. The three defects below are the only reproduced
findings selected for this polish pass.

## 1. Rendered sway and the placement/cut calculation use different tower positions

**Reproduction.** Build to floor 12 or higher, preferably after a few narrow
cuts so the WIND meter rises. Watch the top floor shift horizontally, then
release the crane block when it visually lines up with that shifted roof. The
cut guide and the overlap result use the unswayed `cx`, so the visible roof,
the predicted cut and the actual PERFECT/cut boundary disagree. The same
state was captured after an accelerated floor-16 ascent in
`qa/final-polish-baseline/907x510-floor16.png` (`level: 16`, `risk: 0.096`);
at higher/narrower towers the source-defined discrepancy grows to the full
sway amplitude.

**User impact.** A player can make the visually correct timing decision and
receive an unexpected cut or miss. That is a fairness and wind-comprehension
failure precisely when the tower becomes harder to read.

**Root cause.** `src/main.js:173-225` calculates overlap from `prev.cx`, while
the tower is drawn at `b.cx + swayFor(b.level)` on line 1019. The landing ghost
and cut markers likewise use the unswayed `top.cx` on lines 1034-1048.

## 2. The landscape Shop falls below readable text size at 821x462

**Reproduction.** At 821x462 DPR 1 open Shop from the menu. The screenshot
`qa/final-polish-baseline/821x462-shop.png` shows theme labels and costs at
about 8 CSS pixels: the 16px logical theme-button font is scaled by
462/960 = 0.481. It remains clickable, but prices, ownership and upgrade
meaning cannot be read comfortably.

**User impact.** Players cannot make informed upgrade purchases at a required
small desktop viewport, despite the Shop being part of the progression loop.

**Root cause.** `src/main.js:959-983` renders a fixed 560x730 logical panel
with 16–21px labels. The global landscape transform uses height/960, so the
smallest labels become 7.7 CSS pixels at 821x462.

## 3. Continue advert fails silently when no SDK advert is available

**Reproduction.** Load `?debug=1&nosdk=1`, start, force a game over, then
click `CONTINUE (AD)`. The pre/post debug state remains
`{ state: "gameover", usedContinue: false }`; no explanation is drawn. The
resulting state is captured in
`qa/final-polish-baseline/390x844-offline-continue.png`.

**User impact.** The action promises a continuation but appears to do nothing
in local, offline or unavailable-ad sessions. Players lose the reason and the
obvious restart route at a frustrating moment.

**Root cause.** `src/sdk.js:50-57` resolves unavailable rewarded ads as
`false`; `src/main.js:284-298` simply returns to `gameover`, while
`src/main.js:1256-1264` always presents the actionable ad buttons and no
unavailable-ad explanation.
