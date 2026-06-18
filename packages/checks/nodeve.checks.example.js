// Copy to your repo root as `nodeve.checks.js` and trim to taste. Every section
// is optional — omitted keys fall back to the org defaults baked into
// @nodeve/checks. Shown values ARE the defaults unless noted.
export default {
	docTokens: {
		maxLines: 150,
		maxTokens: 3000,
		// Globs the gate fails on (git pathspecs; `*` recurses).
		enforce: ['CLAUDE.md', 'guide/*.md', 'docs/*.md'],
		// Per-file budget overrides, keyed by repo-root-relative path.
		overrides: {
			// 'CLAUDE.md': { maxTokens: 3500 },
		},
	},

	reshape: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		// `relPath::kind::keys` — confirmed boundaries where the identical-shape
		// reshape IS the point (kind ∈ identity|spread-clone|projection|passthrough).
		allowlist: [],
	},

	inlineDupes: {
		globs: ['apps/*.ts'],
		// Bare names that legitimately recur across files.
		allowlist: [],
	},

	helperCollisions: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		// Dependency surfaces you don't want reinvented inline.
		libs: ['remeda'],
		// Committed index, regenerated with `nodeve-build-lib-names`.
		libNamesPath: '.nodeve/lib-names.json',
		threshold: 0.8,
		// `relPath::local→lib` — confirmed false positives.
		allowlist: [],
	},

	// Opt-in: empty by default → the check no-ops. Each rule fails a file matching
	// `glob` that exceeds `maxLines`.
	pageSize: {
		rules: [
			// { glob: '*+page.svelte', maxLines: 280 },
		],
	},

	// On by default. Every workspace MUST declare a catalog (pnpm-workspace.yaml
	// or package.json#workspaces), and every dependency — deps, devDeps, peers —
	// must reference it via `catalog:` rather than a literal pin. A repo with no
	// catalog fails. Set `enforce: false` to deliberately opt out.
	catalog: {
		enforce: true,
		// `manifest::name` — confirmed exceptions allowed to pin literally.
		allowlist: [],
	},

	// Opt-in: list package dirs to index their public export surface for grepping.
	helperManifest: {
		packages: [
			// 'packages/utils', 'packages/server',
		],
		output: '.nodeve/helper-manifest.txt',
	},
};
