#!/usr/bin/env node
/**
 * Commit gate (on by default): TS source files in `apps/` and `packages/` have
 * a line budget. Over `warnLines` prints a non-blocking nudge; over `maxLines`
 * blocks the commit.
 *
 * WHY: file size is the cheapest proxy for "this unit took on more than one
 * job." Past ~200-250 lines a module usually mixes responsibilities, which
 * works against SoC/SRP and makes the pieces harder to test in isolation. The
 * gate doesn't prescribe the split — that's a judgement call — it just forces
 * the step-back: what are the distinct responsibilities here, and can each one
 * own its own file (one reason to change apiece), grouped in a directory without
 * adding friction at the call sites?
 *
 * Scope: `fileSize.globs` (default `apps/`, `packages/` `.ts`). Unlike the other
 * `.ts` checks this does NOT auto-skip tests or declaration files — a long file
 * is a long file. Genuinely-single-responsibility files that run long (a big
 * schema, a lookup table, a table-driven test) go in `fileSize.allowlist` with
 * a WHY comment. `--warn` downgrades a hard offender to report-only (exit 0).
 */
import { loadGate } from '../lib/bin.js';
import { gitFiles, lineCount } from '../lib/repo.js';

const { root, cfg, paths, warn, verbose, allowlist } = await loadGate('fileSize');

// All tracked files in scope, narrowed to staged paths (lefthook `{staged_files}`)
// when given so a commit only pays for what it touches.
const matched = gitFiles(root, cfg.globs);
const targets = paths.length > 0 ? matched.filter((f) => paths.includes(f)) : matched;

type Hit = { path: string; lines: number };
const failing: Hit[] = [];
const warning: Hit[] = [];

for (const path of targets) {
	if (allowlist.has(path)) continue;
	const lines = lineCount(root, path);
	if (lines > cfg.maxLines) failing.push({ path, lines });
	else if (lines > cfg.warnLines) warning.push({ path, lines });
}

const byLines = (a: Hit, b: Hit) => b.lines - a.lines;

if (warning.length > 0) {
	console.error(`\n⚠ file(s) over the ${cfg.warnLines}-line soft budget — worth a look:\n`);
	for (const h of warning.sort(byLines))
		console.error(`  ${String(h.lines).padStart(5)}/${cfg.warnLines}L  ${h.path}`);
	console.error('');
}

if (failing.length === 0) {
	if (verbose && warning.length === 0) console.error('✓ file-size: all files within budget');
	process.exit(0);
}

console.error(`\n✖ file(s) over the ${cfg.maxLines}-line budget:\n`);
for (const h of failing.sort(byLines))
	console.error(`  ${String(h.lines).padStart(5)}/${cfg.maxLines}L  ${h.path}`);
console.error(`
A large file usually means one file is doing several jobs. Step back:
  • Name the distinct responsibilities — can each move to its own module
    (one reason to change per file)?
  • Pull pure helpers into a file that can be unit-tested on its own.
  • Group the related files in a directory, but only if the split doesn't add
    friction at the call sites.
If it's genuinely one responsibility that just runs long (a schema, a lookup
table, a table-driven test), add the path to fileSize.allowlist in
nodeve.checks.js with a WHY comment. --warn downgrades this to report-only.
`);

process.exit(warn ? 0 : 1);
