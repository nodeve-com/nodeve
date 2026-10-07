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
	// EVERY tracked markdown file, bounded on both lines and tokens — same scope as
	// the prose gate, so staging a doc means it conforms, whatever it's called or
	// where it sits. A named-doc list was a hole: an unlisted name (AGENTS.md, a
	// nested docs/ tree) grew unbudgeted, and the budget it dodged was invisible.
	// `*.md` is a git pathspec, so it spans the whole tree. No default `warn` tier
	// — add one per repo to nudge before the hard fail. Per-path bumps go in
	// `overrides` (glob → tiers).
	//
	// An INDEX doc (README/CLAUDE/AGENTS) gets HALF the token budget: it's the
	// entry point, read or auto-loaded before anything else, so its cost is paid on
	// every visit while a detail page is paid only when opened. 1500 is the tier
	// that keeps one; past it, move each section to the page that owns it and leave
	// one line per link — the split only pays when what's split is an index.
	//
	// CHANGELOGs are ignored: changesets writes them and they grow forever, so the
	// budget could never be met by cutting. Machine-written docs belong in `ignore`
	// (the `.prettierignore` rule, applied to budgets).
	docTokens: {
		globs: ['*.md'],
		ignore: ['**/CHANGELOG.md', 'CHANGELOG.md'],
		fail: { maxLines: 150, maxTokens: 3000 },
		overrides: [
			{ glob: '*README.md', tiers: { fail: { maxTokens: 1500 } } },
			{ glob: '*CLAUDE.md', tiers: { fail: { maxTokens: 1500 } } },
			{ glob: '*AGENTS.md', tiers: { fail: { maxTokens: 1500 } } },
		],
	},
	// On by default: Conventional Commits header + a body for non-trivial changes.
	// Runs on the commit-msg hook. `bodyRequiredOverLines` measures the STAGED diff
	// (insertions + deletions), so a commit only owes a "why" once it's sizeable.
	commitMsg: {
		enforce: true,
		types: [
			'feat',
			'fix',
			'docs',
			'style',
			'refactor',
			'perf',
			'test',
			'build',
			'ci',
			'chore',
			'revert',
		],
		requireScope: false,
		maxSubjectLength: 72,
		bodyRequiredOverLines: 50,
	},
	// The four AST checks below parse with the TypeScript compiler, so their scope
	// is TS tree-wide — not per-layout. Declarations are machine output.
	reshape: {
		globs: ['*.ts'],
		ignore: ['**/*.d.ts'],
		allowlist: [],
	},
	// On by default: a count-plural name must hold an array, not a map/object (a
	// Set is array-like, so it's fine). `pluralize` scores the name;
	// `plural`/`singular` correct its domain misses.
	// `singular` is seeded with `-s` nouns pluralize over-counts that are almost
	// never arrays (payloads/values, not lists).
	pluralArrays: {
		globs: ['*.ts'],
		ignore: ['**/*.d.ts'],
		plural: [],
		singular: ['data', 'metadata', 'series', 'news'],
		allowlist: [],
	},
	inlineDupes: {
		globs: ['*.ts'],
		ignore: ['**/*.d.ts'],
		allowlist: [],
		// Off by default: an app repo legitimately repeats exported route handlers per route.
		// A library-only repo (no route files) sets this true to catch exported dupes too.
		includeExported: false,
	},
	helperCollisions: {
		globs: ['*.ts'],
		ignore: ['**/*.d.ts'],
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
			// lodash's object guards. remeda's `isObjectType` carries an extra token
			// (`type`) that dilutes the fuzzy score below threshold, so the `isObject`
			// alias is what lands a local `isObj` (stems to `is object` → 1.0).
			isObjectType: ['isObject', 'isObjectLike'],
			// remeda-humps' default `humps` deep-camelCases object keys; a local key-camelizer
			// (camelKey/camelKeys) reinvents it under names sharing no tokens.
			humps: ['camelizeKeys', 'camelKeys', 'camelKey'],
		},
		libNamesPath: '.nodeve/lib-names.json',
		threshold: 0.8,
		allowlist: [],
	},
	// On by default: structural copy-paste detection (jscpd v5) over the whole
	// tree in every org language; `ignore` keeps build output and vendored trees out.
	clones: {
		paths: ['.'],
		formats: ['typescript', 'javascript', 'rust', 'python'],
		ignore: [
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/.svelte-kit/**',
			'**/target/**',
			'**/.venv/**',
			'**/__pycache__/**',
			'**/*.d.ts',
			'**/*.test.ts',
			'**/*.spec.ts',
		],
		minTokens: 50,
		minLines: 5,
		mode: 'mild',
		threshold: 0,
	},
	// Opt-in (empty `globs` → scope comes only from override globs): SvelteKit
	// pages over 280 lines should rip inline components out into their own files.
	// The `*+page.svelte` glob is a no-op in repos with no SvelteKit pages, so this
	// stays harmless org-wide. Override per repo.
	pageSize: {
		globs: [],
		overrides: [{ glob: '*+page.svelte', tiers: { fail: { maxLines: 280 } } }],
	},
	// On by default: warn past 225 lines, block past 300. Whole tree, every source
	// language the org writes — a repo's layout (`src/`, `apps/`, `packages/`) never
	// decides whether the budget applies. Give a long-but-cohesive file a bigger
	// budget (or `tiers: 'exempt'`) via `overrides`, per repo.
	fileSize: {
		globs: ['*.ts', '*.js', '*.mjs', '*.svelte', '*.rs', '*.py'],
		ignore: ['**/*.d.ts'],
		warn: { maxLines: 225 },
		fail: { maxLines: 300 },
		overrides: [],
	},
	// On by default: a workspace must declare a catalog (set enforce:false to opt out).
	catalog: { enforce: true, allowlist: [] },
	// On by default: the workspace catalog must define remeda (set deps:[] to opt out).
	requireDeps: { deps: ['remeda'] },
	// On by default: every project must ship a root eslint flat config (set
	// enforce:false to opt out). The rules live in @nodeve/config/eslint.
	requireEslint: { enforce: true },
	// Opt-in: no packages → no-op.
	helperManifest: { packages: [], output: '.nodeve/helper-manifest.txt' },
} satisfies Config;
