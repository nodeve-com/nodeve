#!/usr/bin/env node
/**
 * Commit gate (opt-in): every dependency version must be single-sourced through
 * a workspace catalog. No workspace package may pin a literal version — each
 * dependency must reference the default `catalog` or a named `catalogs.<group>`
 * with the `catalog:` protocol (a `workspace:*` reference to a sibling is fine
 * too). Two breaches fail the commit:
 *
 *   1. A package pins a literal version (e.g. "yaml": "^2.9.0"). It must read
 *      "catalog:" (or "catalog:<group>") so the version lives once, centrally.
 *   2. A package references a catalog group that doesn't exist, or — for the
 *      default catalog — a name the catalog doesn't define (a typo that wouldn't
 *      resolve).
 *
 * One purpose, two layouts: the catalog lives in `pnpm-workspace.yaml` (pnpm) or
 * in the root `package.json#workspaces` (Bun). This auto-detects whichever the
 * repo uses, so it gates familiar (bun), nodeve, and platform (pnpm) alike.
 *
 * On by default (opt-out): no-ops on repos that define no catalog, so it only
 * gates where catalogs are actually in use. Set `catalog.enforce: false` in
 * nodeve.checks.js to disable it for a catalog-using repo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadConfig, parseArgs } from '../lib/config.js';
import { gitFiles, repoRoot } from '../lib/repo.js';

type Catalog = Record<string, string>;
type Workspace = {
	packages: string[];
	catalog: Catalog;
	catalogs: Record<string, Catalog>;
};

/**
 * Resolve the workspace definition from whichever manifest the repo uses:
 * `pnpm-workspace.yaml` (pnpm) takes precedence, else the root
 * `package.json#workspaces` (Bun, where `workspaces` may be a bare array of
 * globs or an object carrying the catalogs).
 */
function readWorkspace(root: string): Workspace | null {
	const pnpm = join(root, 'pnpm-workspace.yaml');
	if (existsSync(pnpm)) {
		const ws = parseYaml(readFileSync(pnpm, 'utf8')) ?? {};
		return {
			packages: ws.packages ?? [],
			catalog: ws.catalog ?? {},
			catalogs: ws.catalogs ?? {},
		};
	}
	const pkgPath = join(root, 'package.json');
	if (existsSync(pkgPath)) {
		const ws = JSON.parse(readFileSync(pkgPath, 'utf8')).workspaces;
		if (Array.isArray(ws)) return { packages: ws, catalog: {}, catalogs: {} };
		if (ws && typeof ws === 'object') {
			return {
				packages: ws.packages ?? [],
				catalog: ws.catalog ?? {},
				catalogs: ws.catalogs ?? {},
			};
		}
	}
	return null;
}

const root = repoRoot();
const cfg = (await loadConfig(root)).catalog;
const { verbose } = parseArgs(process.argv.slice(2));

if (!cfg.enforce) process.exit(0);

const ws = readWorkspace(root);
if (!ws) {
	if (verbose) console.log('catalog: no workspace manifest found — nothing to enforce');
	process.exit(0);
}

// Opt-out semantics: a repo with no catalog at all isn't trying to single-source
// versions, so don't flag its literal pins. Only gate once a catalog exists.
if (Object.keys(ws.catalog).length === 0 && Object.keys(ws.catalogs).length === 0) {
	if (verbose) console.log('catalog: no catalog defined in the workspace — nothing to enforce');
	process.exit(0);
}

// Mirror the workspace globs (their `*` matches `/` in git pathspecs, same as
// pnpm/bun resolution) and their `!` negations, so the guard sees exactly the
// set the package manager installs — no more, no less.
const positives = ws.packages.filter((p) => !p.startsWith('!'));
const negatives = ws.packages
	.filter((p) => p.startsWith('!'))
	.map((p) => p.slice(1).replace(/\/\*+$/, ''));

const manifests = gitFiles(
	root,
	positives.map((p) => `${p}/package.json`),
).filter((manifest) => {
	const dir = dirname(manifest);
	return !negatives.some((n) => dir === n || dir.startsWith(n + '/'));
});

const DEP_FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;
const ALLOWLIST = new Set(cfg.allowlist);

const errors: string[] = [];

for (const manifest of manifests) {
	const pkg = JSON.parse(readFileSync(join(root, manifest), 'utf8'));
	for (const field of DEP_FIELDS) {
		const deps: Catalog = pkg[field] ?? {};
		for (const [name, version] of Object.entries(deps)) {
			if (ALLOWLIST.has(`${manifest}::${name}`)) continue;
			// Local references, not version pins — single-sourcing doesn't apply.
			if (/^(workspace|link|file):/.test(version)) continue;
			if (!version.startsWith('catalog:')) {
				// Rule 1: literal version pin — every dependency must go through a catalog.
				errors.push(
					`${manifest}: "${name}": "${version}" — pin it in a root catalog and use "catalog:" (or "catalog:<group>")`,
				);
				continue;
			}
			// Rule 2: the referenced catalog must actually define this dependency.
			const group = version.slice('catalog:'.length); // "" → the default catalog
			const table = group === '' ? ws.catalog : ws.catalogs[group];
			if (!table) {
				errors.push(
					`${manifest}: "${name}": "${version}" — no catalog group named "${group}" in the workspace`,
				);
			} else if (!(name in table)) {
				const where = group === '' ? 'the default catalog' : `catalog "${group}"`;
				errors.push(`${manifest}: "${name}": "${version}" — ${where} does not define "${name}"`);
			}
		}
	}
}

if (errors.length === 0) {
	if (verbose) console.log('catalog: clean');
	process.exit(0);
}

console.error('\n✖ every dependency version must be single-sourced from a workspace catalog:\n');
for (const e of errors) console.error(`  ${e}`);
console.error(
	'\n  Add the version to the catalog (pnpm-workspace.yaml or package.json#workspaces),\n  reference it with "catalog:", then reinstall.\n',
);
process.exit(1);
