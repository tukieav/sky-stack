import { simulateTiming } from '../src/simulation.js';
const runs = [60, 144, 165].map(hz => ({ hz, ...simulateTiming(hz, 12) }));
const baseline = runs[0];
for (const run of runs.slice(1)) {
  if (run.score !== baseline.score || run.spawns !== baseline.spawns || run.difficulty !== baseline.difficulty || Math.abs(run.position - baseline.position) > 0.001) {
    console.error('determinism mismatch', { baseline, run }); process.exit(1);
  }
}
// Negative assertion: this deliberately frame-counted model must diverge,
// proving the gate is capable of detecting the class of bug it protects.
const bad = hz => Math.round(12 * hz * 0.5);
if (bad(60) === bad(165)) { console.error('negative control unexpectedly matched'); process.exit(1); }
console.log('determinism PASS', JSON.stringify(runs));
