#!/usr/bin/env node
/**
 * Commit gate (on by default): the workspace catalog must define each
 * org-required dependency. The org standardizes on `remeda` for functional
 * helpers — rather than force every package to take the dep, we require it in the
 * catalog so the blessed version is single-sourced and any package can adopt it
 * with `catalog:`. Cataloguing it is the signal that its use is expected (and it
 * pairs with helper-collisions, which flags inline reinventions of its exports).
 *
 * A dependency counts as satisfied if it's a key in the default catalog or any
 * named `catalogs.<group>`. Configure the list via `requireDeps.deps` in
 * nodeve.checks.js (default `['remeda']`); set `deps: []` to opt out.
 *
 * Workspace discovery is shared with the catalog gate (pnpm-workspace.yaml or
 * package.json#workspaces), so it gates pnpm and Bun repos alike.
 */
import { loadConfig, parseArgs } from '../lib/config.js';
import { readWorkspace, repoRoot } from '../lib/repo.js';

const root = repoRoot();
const cfg = (await loadConfig(root)).requireDeps;
const { warn, verbose } = parseArgs(process.argv.slice(2));

if (cfg.deps.length === 0) {
	if (verbose) console.log('require-deps: no required deps configured — nothing to enforce');
	process.exit(0);
}

const ws = readWorkspace(root);
if (!ws) {
	if (verbose) console.log('require-deps: no workspace manifest found — nothing to enforce');
	process.exit(0);
}

// A dep is satisfied if any catalog (default or a named group) defines it.
const catalogued = new Set([
	...Object.keys(ws.catalog),
	...Object.values(ws.catalogs).flatMap((group) => Object.keys(group)),
]);
const missing = cfg.deps.filter((dep) => !catalogued.has(dep));

if (missing.length === 0) {
	if (verbose) console.log('require-deps: clean');
	process.exit(0);
}

console.error('\n✖ the workspace catalog must define these org-required dependencies:\n');
for (const dep of missing) console.error(`  ${dep}`);
console.error(
	`\n  Add them to the catalog (pnpm-workspace.yaml or package.json#workspaces), e.g.\n` +
		`  \`pnpm add -w ${missing.join(' ')}\`, so packages can adopt them with "catalog:".\n` +
		'  Set `requireDeps: { deps: [] }` in nodeve.checks.js to opt out.\n',
);
process.exit(warn ? 0 : 1);
