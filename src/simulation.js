// Shared time-based simulation primitives. Keeping them pure makes refresh-rate
// regressions testable without a browser or a rendering loop.
export const FIXED_STEP = 1 / 120;
export const MAX_FRAME_DELTA = 0.1;

export function clampFrameDelta(seconds) {
  return Math.max(0, Math.min(MAX_FRAME_DELTA, Number.isFinite(seconds) ? seconds : 0));
}

export function advanceMoving(moving, dt, slowmo = false, gameWidth = 540) {
  const speed = moving.speed * (slowmo ? 0.45 : 1);
  moving.cx += moving.dir * speed * dt;
  const half = moving.w / 2, margin = 40;
  if (moving.cx - half < -margin) { moving.cx = -margin + half; moving.dir = 1; }
  if (moving.cx + half > gameWidth + margin) { moving.cx = gameWidth + margin - half; moving.dir = -1; }
}

// A small representative timeline used by the browser gate. Events are based
// on elapsed seconds, never rendered frames, and exercise position, spawning,
// score and difficulty together.
export function simulateTiming(hz, seconds = 12) {
  const frameDt = 1 / hz;
  let accumulator = 0, elapsed = 0, nextSpawn = 1.25, score = 0, spawns = 0;
  const moving = { cx: -90, w: 180, dir: 1, speed: 212 };
  while (elapsed < seconds - 1e-9) {
    const delta = Math.min(frameDt, seconds - elapsed);
    elapsed += delta;
    accumulator += clampFrameDelta(delta);
    while (accumulator + 1e-12 >= FIXED_STEP) {
      const difficulty = 0.72 + 0.28 * Math.min(1, elapsed / 120);
      moving.speed = 212 * difficulty;
      advanceMoving(moving, FIXED_STEP, false);
      if (elapsed + 1e-12 >= nextSpawn) {
        spawns++;
        score += 10 + spawns;
        nextSpawn += 1.25;
      }
      accumulator -= FIXED_STEP;
    }
  }
  return { position: Number(moving.cx.toFixed(6)), score, spawns, difficulty: Number((0.72 + 0.28 * Math.min(1, elapsed / 120)).toFixed(6)) };
}
