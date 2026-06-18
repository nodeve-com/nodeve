// Copy to your repo root as `nodeve.checks.js` and keep ONLY what you change.
// Every section is optional; omitted keys fall back to the org defaults baked
// into @nodeve/checks (see the `Config` type / `DEFAULTS` in the package for the
// authoritative values). The user config is deep-merged over those defaults:
// nested records merge key-by-key, but ARRAYS REPLACE — so if you set an array
// field (e.g. `docTokens.enforce`) you must restate the entries you want to keep,
// not just the ones you're adding.
//
// The blocks below are illustrative overrides, not the defaults. Delete any you
// don't need.
export default {
	// Widen the enforced doc set (this array REPLACES the default list — the
	// default is CLAUDE.md + READMEs + guide/ + docs/, restated here plus adr/):
	docTokens: {
		enforce: ['CLAUDE.md', 'README.md', '*/README.md', 'guide/*.md', 'docs/*.md', 'adr/*.md'],
		// Per-file budget bumps, keyed by repo-root-relative path (merges with defaults):
		overrides: {
			'CLAUDE.md': { maxTokens: 3500 },
		},
	},

	// Opt in to a per-glob page-size budget (default: no rules → no-op):
	pageSize: {
		rules: [{ glob: '*+page.svelte', maxLines: 280 }],
	},

	// Deliberately opt a repo out of the (default-on) catalog gate:
	catalog: { enforce: false },

	// Change the org-required catalog deps (default: ['remeda']; [] to opt out):
	requireDeps: { deps: ['remeda'] },

	// Opt in to the helper-manifest index by listing package dirs to scan:
	helperManifest: {
		packages: ['packages/utils'],
	},
};
