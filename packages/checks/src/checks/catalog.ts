/**
 * Commit gate (opt-in): every dependency version must be single-sourced through
 * a workspace catalog. No manifest the package manager installs from — every
 * workspace package AND the root `package.json` — may pin a literal version; each
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
 * On by default. A workspace is REQUIRED to declare a catalog — a workspace with
 * no catalog at all fails, since the whole point is keeping versions aligned.
 * Set `catalog.enforce: false` in nodeve.checks.js to deliberately opt a repo out.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Check } from '../lib/runner.js';
import { type Catalog, readWorkspace, workspaceManifests } from '../lib/repo.js';

const DEP_FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

function missingCatalogFailure() {
	return {
		status: 'fail' as const,
		summary: 'this workspace declares no catalog',
		rows: [
			'Every workspace must single-source its dependency versions through a',
			'catalog. Add a `catalog:` block to pnpm-workspace.yaml (or',
			'`workspaces.catalog` in package.json for Bun), move your versions into',
			'it, and reference them with "catalog:".',
			'',
			'To deliberately opt out, set `catalog: { enforce: false }` in nodeve.checks.js.',
		],
	};
}

type Workspace = NonNullable<ReturnType<typeof readWorkspace>>;

function catalogEntryError({
	manifest,
	name,
	version,
	ws,
}: {
	manifest: string;
	name: string;
	version: string;
	ws: Workspace;
}) {
	if (!version.startsWith('catalog:'))
		return `${manifest}: "${name}": "${version}" — pin it in a root catalog and use "catalog:" (or "catalog:<group>")`;
	const group = version.slice('catalog:'.length);
	const table = group === '' ? ws.catalog : ws.catalogs[group];
	if (!table)
		return `${manifest}: "${name}": "${version}" — no catalog group named "${group}" in the workspace`;
	if (name in table) return null;
	const where = group === '' ? 'the default catalog' : `catalog "${group}"`;
	return `${manifest}: "${name}": "${version}" — ${where} does not define "${name}"`;
}

function catalogErrors(options: {
	root: string;
	manifests: string[];
	ws: Workspace;
	allowlist: Set<string>;
}): string[] {
	const { root, manifests, ws, allowlist } = options;
	return manifests.flatMap((manifest) => {
		const pkg = JSON.parse(readFileSync(join(root, manifest), 'utf8'));
		return DEP_FIELDS.flatMap((field) =>
			Object.entries((pkg[field] ?? {}) as Catalog).flatMap(([name, version]) => {
				if (allowlist.has(`${manifest}::${name}`) || /^(workspace|link|file):/.test(version))
					return [];
				const error = catalogEntryError({ manifest, name, version, ws });
				return error ? [error] : [];
			}),
		);
	});
}

export const catalog: Check<'catalog'> = {
	name: 'catalog',
	section: 'catalog',
	explain: `Every dependency version must be single-sourced from a workspace catalog.
Add the version to the catalog (pnpm-workspace.yaml or package.json#workspaces),
reference it with "catalog:", then reinstall.`,

	run({ root, cfg, allowlist }) {
		if (!cfg.enforce) return { status: 'skip', summary: 'disabled (catalog.enforce: false)' };

		const ws = readWorkspace(root);
		if (!ws) return { status: 'skip', summary: 'no workspace manifest found — nothing to enforce' };

		// A workspace must declare a catalog — alignment is the point, so "no catalog"
		// is itself a failure, not a free pass. Opt a repo out deliberately with
		// `catalog.enforce: false` rather than by omitting the catalog.
		if (Object.keys(ws.catalog).length === 0 && Object.keys(ws.catalogs).length === 0)
			return missingCatalogFailure();

		const manifests = workspaceManifests(root, ws);
		const errors = catalogErrors({ root, manifests, ws, allowlist });

		if (errors.length > 0)
			return {
				status: 'fail',
				summary: 'every dependency version must be single-sourced from a workspace catalog',
				rows: errors,
			};

		return { status: 'pass', summary: 'clean' };
	},
};
