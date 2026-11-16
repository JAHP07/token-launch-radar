// Token Launch Radar — entrypoint (my own code, written for this entry).
//
// Reads the sealed DefiLlama snapshot, scores every rankable pre-token
// protocol with the comps-fitted model, and writes the grader's deliverables:
//
//   <output>/board.json        the ranked board (watchlist + early protocols)
//   <output>/data.js           the same data, as window.RADAR for the dashboard
//   <output>/dashboard/        the static dashboard (copied from dashboard/)
//   <output>/screenshots/      the screenshots (copied from screenshots/)
//   <output>/dossier.json      the dossier, built by the kit's vendor code
//
// Run it from this repository's root:
//
//   node main.ts --input <snapshot.json|dir> --output-dir <dir>
//
// Official layout (kit starter main.ts, RULES.txt, CLI): the snapshot is
// /input/snapshot.json and the output is /output. Outside the grader's
// container, MAKEFUN_INPUT_DIR stands in for /input and MAKEFUN_OUTPUT_DIR
// stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// --input takes a snapshot file or a directory holding snapshot.json; the
// default is $MAKEFUN_INPUT_DIR or /input. --output-dir (alias --output)
// defaults to $MAKEFUN_OUTPUT_DIR or /output. The run is deterministic:
// two runs over the same snapshot produce byte-identical files, because the
// board order breaks ties by TVL then slug, and JSON is written with a fixed
// key order. The kit is NEVER a default input: the delivery package does
// not include it, and the grader mounts the sealed snapshot at /input.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Resolve the snapshot file: a --input file is used as-is, a --input
 *  directory means <dir>/snapshot.json, and with no --input the directory
 *  is $MAKEFUN_INPUT_DIR or /input (the grader's mount). */
function resolveInput(raw: string | undefined): string {
  const dir = raw ?? process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const file = dir.endsWith('.json') ? dir : join(dir, 'snapshot.json');
  if (!existsSync(file)) {
    process.stderr.write(
      `token radar: no snapshot at ${file}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
    );
    process.exit(2);
  }
  return resolve(file);
}

/** Parse --input/--output-dir, falling back to the environment, then the defaults. */
function parseArgs(argv: string[]): { input: string; output: string } {
  let inputRaw: string | undefined;
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--input' && argv[i + 1] !== undefined) inputRaw = argv[++i]!;
    else if (arg.startsWith('--input=')) inputRaw = arg.slice('--input='.length);
    else if ((arg === '--output-dir' || arg === '--output') && argv[i + 1] !== undefined) output = argv[++i]!;
    else if (arg.startsWith('--output-dir=')) output = arg.slice('--output-dir='.length);
    else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node main.ts [--input <snapshot.json|dir>] [--output-dir <dir>]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { input: resolveInput(inputRaw), output: resolve(output) };
}

/** Copy every regular file from `from` to `to` (creating `to`), returning the names copied. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) throw new Error(`missing directory: ${from}`);
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  for (const name of names) copyFileSync(join(from, name), join(to, name));
  return names;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(input, 'utf8');
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error(`snapshot is not JSON: ${input}`);
  }
  const snapshot = parseSnapshot(doc);
  const { board, data } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot.watchlist);
  if (issue !== null) throw new Error(`board invalid: ${issue}`);

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  writeFileSync(join(output, 'data.js'), dataScript(data), 'utf8');
  const dash = copyDir(join(ROOT, 'dashboard'), join(output, 'dashboard'));
  const shots = copyDir(join(ROOT, 'screenshots'), join(output, 'screenshots'));
  const dossier = buildDossier(output, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 512 * 1024 },
    dashboard: { max_files: 400, max_bytes: 4 * 1024 * 1024 },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);

  console.log(`snapshot: ${snapshot.as_of}, ${snapshot.protocols.length} protocols, watchlist ${snapshot.watchlist.length}`);
  console.log(`comps: ${data.fit.comps}, curve log10(mcap) = ${data.fit.intercept} + ${data.fit.slope} * log10(TVL), R2 ${data.fit.r_squared}`);
  console.log(`blind test: held out ${data.blind.held_out}, median error ${data.blind.median_ape_pct}%, within 2x ${data.blind.within_2x_pct}%`);
  console.log(`board: ${board.length} rows (${data.watchlist_size} watchlist + ${data.early_size} early), top ${board[0]!.name} $${board[0]!.implied_value_usd.toLocaleString('en-US')}`);
  console.log(`dashboard: ${dash.join(', ')}`);
  console.log(`screenshots: ${shots.join(', ')}`);
  console.log(`dossier: ${dossier.length} bytes`);
  console.log(`wrote ${output}`);
}

main();
