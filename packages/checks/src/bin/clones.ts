#!/usr/bin/env node
/**
 * Commit gate: structural copy-paste detector over the repo's own sources,
 * backed by jscpd v5 (the Rust `cpd` binary). It flags duplicated *blocks* — the
 * large clones living in function bodies, which the name-based gates
 * (`inline-dupes`, `helper-collisions`) can't see. A clone is a whole-tree
 * property, so like `inline-dupes` this scans the configured `paths` in full.
 *
 * jscpd does the detection, the reporting, AND the pass/fail (its `--threshold`),
 * so this bin just shells it and surfaces its output — quiet on a clean run,
 * printing jscpd's own clone listing when it fails. Escape hatches are jscpd's
 * own: narrow scope with `clones.ignore` globs, or `--warn` to downgrade the
 * whole gate to report-only.
 *
 * jscpd's platform binary ships as an optionalDependency, so a partial or offline
 * install can leave it absent — then this no-ops (exit 0) rather than blocking the
 * commit, matching `helper-collisions`'s behaviour when its lib index is missing.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadGate } from '../lib/bin.js';

const { root, cfg, warn, verbose } = await loadGate('clones');

let launcher: string;
try {
	launcher = createRequire(import.meta.url).resolve('jscpd/run-jscpd.js');
} catch {
	if (verbose) console.log('clones: jscpd binary not installed — skipping');
	process.exit(0);
}

// Missing dirs (e.g. `apps/` in a repo that has none) are tolerated by jscpd, so
// the configured paths go through as-is. `--absolute` makes the reported paths
// unambiguous and clickable regardless of which path arg they came from.
const jscpdRun = spawnSync(
	process.execPath,
	[
		launcher,
		...cfg.paths,
		'--absolute',
		'--min-tokens', String(cfg.minTokens),
		'--min-lines', String(cfg.minLines),
		'--mode', cfg.mode,
		'--format', cfg.formats.join(','),
		'--ignore', cfg.ignore.join(','),
		'--reporters', 'console',
		'--threshold', String(cfg.threshold),
	],
	{ cwd: root, encoding: 'utf8' },
);

// jscpd exits non-zero only when duplication crosses `--threshold`. Stay silent on
// a clean run (unless --verbose); on a violation print jscpd's clone listing and
// fail — `--warn` downgrades that to report-only.
if (jscpdRun.status === 0) {
	if (verbose) process.stdout.write(jscpdRun.stdout ?? '');
	process.exit(0);
}
process.stdout.write(jscpdRun.stdout ?? '');
if (jscpdRun.stderr) process.stderr.write(jscpdRun.stderr);
process.exit(warn ? 0 : (jscpdRun.status ?? 1));
