import type { Config } from './config.js';

/**
 * The org defaults for @nodeve/checks — the single source of truth.
 *
 * This file IS a valid `nodeve.checks.js`: it's the exact shape a repo drops at
 * its root, default-exporting the config object. To customize, copy it (shipped
 * as `node_modules/@nodeve/checks/nodeve.checks.defaults.js`) to your repo root
 * as `nodeve.checks.js` and keep ONLY the keys you change — everything you omit
 * falls back to the value here.
 *
 * Merge semantics (see `loadConfig`): your config is deep-merged OVER these
 * defaults. Nested records merge key-by-key, but ARRAYS REPLACE wholesale — so
 * if you set an array field (e.g. `docTokens.enforce`) you must restate every
 * entry you want to keep, not just the ones you're adding.
 */
export default {
	docTokens: {
		maxLines: 150,
		maxTokens: 3000,
		// Git pathspecs the gate FAILS on: CLAUDE.md + READMEs + guide/ + docs/.
		enforce: ['CLAUDE.md', 'README.md', '*/README.md', 'guide/*.md', 'docs/*.md'],
		// Per-file budget bumps, keyed by repo-root-relative path.
		overrides: {},
	},
	reshape: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		allowlist: [],
	},
	inlineDupes: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		allowlist: [],
	},
	helperCollisions: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		libs: ['remeda'],
		libNamesPath: '.nodeve/lib-names.json',
		threshold: 0.8,
		allowlist: [],
	},
	// On by default: SvelteKit pages over 280 lines should rip inline components
	// out into their own files. The `*+page.svelte` glob is a no-op in repos with
	// no SvelteKit pages, so this stays harmless org-wide. Override per repo.
	pageSize: { rules: [{ glob: '*+page.svelte', maxLines: 280 }] },
	// On by default: warn past 225 lines, block past 300 (override per repo).
	fileSize: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		warnLines: 225,
		maxLines: 300,
		allowlist: [],
	},
	// On by default: a workspace must declare a catalog (set enforce:false to opt out).
	catalog: { enforce: true, allowlist: [] },
	// On by default: the workspace catalog must define remeda (set deps:[] to opt out).
	requireDeps: { deps: ['remeda'] },
	// Opt-in: no packages → no-op.
	helperManifest: { packages: [], output: '.nodeve/helper-manifest.txt' },
} satisfies Config;
