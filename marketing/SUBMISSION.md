# Sky Stack — CrazyGames submission

## Game name

Sky Stack

## Category and discovery

- Primary category: **Arcade** (`/c/arcade`)
- Secondary discovery: **Casual**
- Verified tags only: **Casual, One Button, Skill, Mobile, 2D, Physics**

## Short description (132 characters)

Time each drop, land perfect floors, and raise a detailed city tower from the
street to the edge of space.

## Full description

Build the skyline with a single well-timed action. Release each moving floor
above the tower, preserve as much width as possible, and chain PERFECT landings
to recover space and earn Clouds.

The landing shadow and cut-off preview make the opening clear without a tutorial
wall. As the tower becomes narrower and higher, a gentle structural sway and a
wind indicator make its risk readable while preserving the one-button timing
loop. Climb through changing city, cloud, jetstream, orbital-night and space
environments, with visible district rewards every 10 floors and landmark rewards
every 25 floors.

Spend Clouds on architectural themes, wider starting floors, Slow-Mo and Magnet
assists, then return for rotating daily missions and altitude rewards.

## Current features

- One-click start; quick local restart after a natural game-over break
- Forgiving but skill-based first three floors, then precise overlap timing
- PERFECT chains, width recovery, score, Clouds, missions, streaks and themes
- Bounded cut-piece debris and celebratory particles
- Time-based 120 Hz fixed-step simulation for consistent movement and physics
- Reduced-motion support, SDK mute support and strong in-game contrast
- Persistent best score, currency, themes, upgrades and daily progress

## Controls

- Desktop: click or Space/Enter to release a floor; 1/2 use owned power-ups
- Mobile: tap anywhere in play to release; all mobile buttons are at least 44
  CSS pixels

## SDK, data and ads

- CrazyGames SDK v3 initializes with a safe timeout; loading calls occur around
  boot, and gameplay start/stop track active play.
- Visibility, window focus and SDK ad events pause simulation, input and audio
  once, then resume once when appropriate.
- CrazyGames mute settings are respected. Local save is dual-written through
  the SDK data module when available and localStorage fallback otherwise;
  malformed/old data safely migrates or falls back.
- A midgame ad may appear only at a natural Play Again break and is throttled;
  rewarded Continue and ×2 Clouds are optional. No ad is mandatory to start,
  restart, or progress in the core loop.

## Audience, URL and resubmission

- PEGI12 suitable: non-violent abstract construction; no blood, chat, user
  content, cross-promotion or custom fullscreen.
- Live URL: https://tukieav.github.io/sky-stack/
- Quality resubmission: refreshed for responsive DPR=1 layouts, deterministic
  timing, lifecycle safety, bounded effects, accessible motion settings and
  clearer early-game risk feedback.

## Upload files

- Build: `sky-stack.zip`
- Covers: `marketing/cover-16x9.png`, `marketing/cover-1x1.png`,
  `marketing/cover-2x3.png`
- Gameplay screenshots: `marketing/screenshot-1.png`,
  `marketing/screenshot-2.png`
- Gameplay videos: `marketing/video-landscape.mp4`,
  `marketing/video-portrait.mp4`
