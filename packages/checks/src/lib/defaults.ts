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
 * if you set an array field (e.g. `docTokens.globs` or any `overrides`) you must
 * restate every entry you want to keep, not just the ones you're adding.
 */
export default {
	// Guarded markdown (CLAUDE.md + READMEs + guide/ + docs/) bounded on both lines
	// and tokens. No default `warn` tier — add one per repo to nudge before the
	// hard fail. Per-path bumps go in `overrides` (glob → tiers).
	docTokens: {
		globs: ['CLAUDE.md', 'README.md', '*/README.md', 'guide/*.md', 'docs/*.md'],
		fail: { maxLines: 150, maxTokens: 3000 },
		overrides: [],
	},
	// On by default: Conventional Commits header + a body for non-trivial changes.
	// Runs on the commit-msg hook. `bodyRequiredOverLines` measures the STAGED diff
	// (insertions + deletions), so a commit only owes a "why" once it's sizeable.
	commitMsg: {
		enforce: true,
		types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
		requireScope: false,
		maxSubjectLength: 72,
		bodyRequiredOverLines: 50,
	},
	reshape: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		allowlist: [],
	},
	// On by default: a count-plural name must hold an array, not a map/object (a
	// Set is array-like, so it's fine). `pluralize` scores the name;
	// `plural`/`singular` correct its domain misses.
	// `singular` is seeded with `-s` nouns pluralize over-counts that are almost
	// never arrays (payloads/values, not lists).
	pluralArrays: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		plural: [],
		singular: ['data', 'metadata', 'series', 'news'],
		allowlist: [],
	},
	inlineDupes: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		allowlist: [],
	},
	helperCollisions: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		libs: ['remeda'],
		libKeywords: {},
		// Seeded with the lodash→remeda renames (keyed by the remeda export). The org
		// standardizes on remeda, but reinventions often borrow lodash's names, which
		// share no tokens with remeda's — so without these the fuzzy match misses them.
		aliases: {
			capitalize: ['upperFirst'],
			uncapitalize: ['lowerFirst'],
			first: ['head'],
			flat: ['flatten', 'flattenDeep'],
			fromEntries: ['fromPairs'],
		},
		libNamesPath: '.nodeve/lib-names.json',
		threshold: 0.8,
		allowlist: [],
	},
	// On by default: structural copy-paste detection (jscpd v5). No-ops if the
	// jscpd binary isn't installed. `apps/` is skipped when absent.
	clones: {
		paths: ['apps', 'packages'],
		formats: ['typescript', 'javascript'],
		ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
		minTokens: 50,
		minLines: 5,
		mode: 'mild',
		threshold: 0,
	},
	// Opt-in (empty `globs` → scope comes only from override globs): SvelteKit
	// pages over 280 lines should rip inline components out into their own files.
	// The `*+page.svelte` glob is a no-op in repos with no SvelteKit pages, so this
	// stays harmless org-wide. Override per repo.
	pageSize: { globs: [], overrides: [{ glob: '*+page.svelte', tiers: { fail: { maxLines: 280 } } }] },
	// On by default: warn past 225 lines, block past 300. Give a long-but-cohesive
	// file a bigger budget (or `tiers: 'exempt'`) via `overrides`, per repo.
	fileSize: {
		globs: ['apps/*.ts', 'packages/*.ts'],
		warn: { maxLines: 225 },
		fail: { maxLines: 300 },
		overrides: [],
	},
	// On by default: a workspace must declare a catalog (set enforce:false to opt out).
	catalog: { enforce: true, allowlist: [] },
	// On by default: the workspace catalog must define remeda (set deps:[] to opt out).
	requireDeps: { deps: ['remeda'] },
	// Opt-in: no packages → no-op.
	helperManifest: { packages: [], output: '.nodeve/helper-manifest.txt' },
} satisfies Config;
