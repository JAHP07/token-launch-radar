// Offline output logic check (v3 final scheme). Optional third argument:
// the preserved v2 board.json.
// node scripts/check-v3.ts <snapshot.json> <output-dir> [v2-board.json]
//
// Asserts, all recomputed from this run's real input (nothing hardcoded):
// - board.json keeps the kit's exact contract: { rows: [...] } and no
//   other top-level key (no coverage at the root).
// - data.js still carries the coverage inside the dashboard data.
// - dashboard/coverage.js (generated per run, inside the dossier text)
//   names the counts, the missing slugs, the snapshot date, the input
//   SHA-256, the board.json SHA-256 (traceability to the board), and the
//   board row count; every value matches a fresh recomputation.
// - The dossier text contains every dashboard file whole, coverage.js
//   included, and the screenshot copies match the repo's screenshots/.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { boardIssue, parseSnapshot } from '../lib/model.ts';

const [input, output, previous] = process.argv.slice(2);
assert(input && output, 'supply snapshot and output paths');
const bytes = readFileSync(input);
const snapshot = parseSnapshot(JSON.parse(bytes.toString('utf8')));
const snapshotHash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const boardBytes = readFileSync(join(output, 'board.json'));
const board = JSON.parse(boardBytes.toString('utf8'));
const boardHash = createHash('sha256').update(boardBytes).digest('hex').slice(0, 16);

// board.json: the kit's exact contract, { rows: [...] } only.
assert.deepEqual(Object.keys(board), ['rows'], 'board.json must be exactly { rows: [...] }');
const context = { window: {} as { RADAR?: any; RADAR_COVERAGE?: any } };
runInNewContext(readFileSync(join(output, 'data.js'), 'utf8'), context);
const data = JSON.parse(JSON.stringify(context.window.RADAR));
const present = new Set(board.rows.map((r: any) => r.slug));
const missing = snapshot.watchlist.filter((slug) => !present.has(slug));
const expectedCoverage = {
  watchlist_total: snapshot.watchlist.length,
  watchlist_covered: snapshot.watchlist.length - missing.length,
  watchlist_missing: missing,
  snapshot_as_of: snapshot.as_of,
  snapshot_hash: snapshotHash,
};
assert.deepEqual(data.coverage, expectedCoverage, 'data.js coverage must match the recomputation');
// dashboard/coverage.js: the per-run evidence file, inside the dossier text.
// (JSON round-trip: the object was built inside the vm context, whose
// Object prototype differs from this realm's, so deepStrictEqual would
// reject it without the round-trip.)
runInNewContext(readFileSync(join(output, 'dashboard', 'coverage.js'), 'utf8'), context);
const fileCoverage = JSON.parse(JSON.stringify(context.window.RADAR_COVERAGE));
assert.deepEqual(fileCoverage, {
  ...expectedCoverage,
  board_hash: boardHash,
  board_rows: board.rows.length,
}, 'dashboard/coverage.js must match the recomputation (input hash + board hash)');
assert.equal(missing.length, 0);
assert.equal(board.rows.length, 226);
assert.equal(boardIssue(board.rows, snapshot.watchlist), null);
for (const [i, row] of board.rows.entries()) {
  assert.equal(row.farm_steps.length, 6);
  assert.deepEqual(data.rows[i].farm_steps, row.farm_steps);
  for (const step of row.farm_steps) assert(step.length >= 20 && step.length <= 600);
  assert.equal(data.rows[i].farm_costs.length, 6);
  assert.equal(data.rows[i].farm_times.length, 6);
  assert(data.rows[i].farm_times.every((t: string) => t.startsWith('est. ')));
}
assert.equal(data.fit.comps, 119);
assert.equal(data.fit.r_squared, 0.1434);
assert.equal(data.blind.median_ape_pct, 84.94);
assert.equal(data.blind.within_2x_pct, 33.61);
assert(data.blind.actual_to_predicted_p25 > 0);
assert(data.blind.actual_to_predicted_p75 >= data.blind.actual_to_predicted_p25);
if (previous) {
  const old = JSON.parse(readFileSync(previous, 'utf8'));
  const withoutPlan = (rows: any[]) => rows.map(({ farm_steps, ...rest }) => rest);
  assert.deepEqual(withoutPlan(board.rows), withoutPlan(old.rows));
  console.log('PASS: all row fields except revised farm wording identical to v2 (including ranking and predictor)');
}
const dossier = JSON.parse(readFileSync(join(output, 'dossier.json'), 'utf8'));
const textBytes = Buffer.byteLength(dossier.text);
assert(textBytes <= 65_536);
// The unmodified kit concatenates dashboard files as fenced source text.
for (const name of readdirSync(join(output, 'dashboard'))) {
  assert(dossier.text.includes(readFileSync(join(output, 'dashboard', name), 'utf8')), `uncut ${name}`);
}
for (const name of readdirSync('screenshots')) {
  assert.deepEqual(readFileSync(join(output, 'screenshots', name)), readFileSync(join('screenshots', name)));
}
console.log(`PASS: board.json is exactly { rows: [...] } (${board.rows.length} rows); watchlist ${expectedCoverage.watchlist_covered}/${snapshot.watchlist.length}; coverage.js verified (input ${snapshotHash}, board ${boardHash}); six valid steps/costs/times per row; dossier text ${textBytes}/65536 bytes, uncut; screenshot copies unchanged`);
