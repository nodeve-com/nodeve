/**
 * Commit gate (on by default): the workspace catalog must define each
 * org-required dependency. The org standardizes on `remeda` for functional
 * helpers — rather than force every package to take the dep, we require it in
 * the catalog so the blessed version is single-sourced and any package can
 * adopt it with `catalog:`. Cataloguing it is the signal that its use is
 * expected (and it pairs with helper-collisions, which flags inline
 * reinventions of its exports).
 *
 * A dependency counts as satisfied if it's a key in the default catalog or any
 * named `catalogs.<group>`. Configure the list via `requireDeps.deps` in
 * nodeve.checks.js (default `['remeda']`); set `deps: []` to opt out.
 *
 * Workspace discovery is shared with the catalog gate (pnpm-workspace.yaml or
 * package.json#workspaces), so it gates pnpm and Bun repos alike.
 */
import { type Check } from '../lib/runner.js';
import { readWorkspace } from '../lib/repo.js';

export const requireDeps: Check<'requireDeps'> = {
	name: 'require-deps',
	section: 'requireDeps',
	explain: `The org standardizes deps in a workspace catalog so the blessed version is
single-sourced. Add them with e.g. \`pnpm add -w <dep>\` (pnpm-workspace.yaml or
package.json#workspaces) so packages can adopt them with "catalog:". Set
\`requireDeps: { deps: [] }\` in nodeve.checks.js to opt out. --warn downgrades
this to report-only.`,

	run({ root, cfg }) {
		if (cfg.deps.length === 0)
			return { status: 'skip', summary: 'no required deps configured — nothing to enforce' };

		const workspace = readWorkspace(root);
		if (!workspace)
			return { status: 'skip', summary: 'no workspace manifest found — nothing to enforce' };

		// A dep is satisfied if any catalog (default or a named group) defines it.
		const catalogued = new Set([
			...Object.keys(workspace.catalog),
			...Object.values(workspace.catalogs).flatMap((group) => Object.keys(group)),
		]);
		const missing = cfg.deps.filter((dep) => !catalogued.has(dep));

		if (missing.length === 0) return { status: 'pass', summary: 'clean' };

		return {
			status: 'fail',
			summary: 'the workspace catalog must define these org-required dependencies',
			rows: missing,
		};
	},
};
