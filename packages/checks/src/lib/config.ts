/**
 * Per-repo configuration for the nodeve checks. A consumer drops a
 * `nodeve.checks.js` (ESM, default-exporting the object below) at the repo root;
 * anything omitted falls back to the org defaults here. Every section is
 * optional, so a repo can adopt one check and leave the rest on defaults.
 *
 *   // nodeve.checks.js
 *   export default {
 *     docTokens: { overrides: [{ glob: 'CLAUDE.md', tiers: { fail: { maxTokens: 4000 } } }] },
 *     pageSize: { overrides: [{ glob: '*+page.svelte', tiers: { fail: { maxLines: 280 } } }] },
 *   };
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeDeep } from 'remeda';
import { type LengthConfig } from './length.js';
import DEFAULTS from './defaults.js';

// The length checks (doc-tokens, page-size, file-size) all read the one
// `LengthConfig` shape — scope `globs`, default `warn`/`fail` tiers, and per-glob
// `overrides`. Re-exported here so the `@nodeve/checks/config` surface still
// carries the budgeting types.
export { type Budget, type Tiers, type Override, type LengthConfig } from './length.js';

export type ReshapeConfig = {
	globs: string[];
	/** `relPath::kind::keys` entries — confirmed boundaries the gate should ignore. */
	allowlist: string[];
};

export type InlineDupesConfig = {
	globs: string[];
	/** Bare names that legitimately recur across files. */
	allowlist: string[];
};

export type HelperCollisionsConfig = {
	globs: string[];
	/** Dependency packages whose exports shouldn't be reinvented inline. */
	libs: string[];
	/** Domain words to append/prepend to each lib export during collision matching. */
	libKeywords: Record<string, string[]>;
	/**
	 * Alternate names a lib export is known by under *other* libraries, keyed by the
	 * real export name. Catches a reinvention that borrows a different library's
	 * vocabulary even though the names share no tokens — e.g. lodash's `upperFirst`
	 * is remeda's `capitalize`: `{ capitalize: ['upperFirst'] }`.
	 */
	aliases: Record<string, string[]>;
	/** Repo-root-relative path to the committed lib-names index. */
	libNamesPath: string;
	threshold: number;
	/** `relPath::local→lib` entries — confirmed false positives. */
	allowlist: string[];
};

/**
 * On by default: a structural copy-paste detector over the repo's own sources,
 * backed by jscpd v5 (the Rust `cpd` binary). Catches duplicated *blocks* —
 * clones living in function bodies that the name-based gates (`inline-dupes`,
 * `helper-collisions`) can't see. A whole-tree property, so it scans `paths` in
 * full rather than just staged files. jscpd itself does the gating via
 * `--threshold`; no-ops if the jscpd binary isn't installed.
 */
export type ClonesConfig = {
	/** Repo-root-relative dirs to scan (missing dirs are tolerated). */
	paths: string[];
	/** jscpd formats to tokenize (its `--format`). */
	formats: string[];
	/** Glob patterns jscpd ignores (its `--ignore`) — the file-level escape hatch. */
	ignore: string[];
	/** Minimum duplicated tokens to report a clone (jscpd `--min-tokens`). */
	minTokens: number;
	/** Minimum duplicated lines to report a clone (jscpd `--min-lines`). */
	minLines: number;
	/** jscpd detection mode: `mild` | `weak` | `strict`. */
	mode: string;
	/** Max duplication % jscpd tolerates before failing (its `--threshold`); 0 = any clone fails. */
	threshold: number;
};

/**
 * Opt-in: every dependency version must be single-sourced from a workspace
 * catalog — no literal version pins in workspace packages. Works with both
 * pnpm (catalog in `pnpm-workspace.yaml`) and Bun (catalog in the root
 * `package.json#workspaces`); the check auto-detects whichever the repo uses.
 */
export type CatalogConfig = {
	/**
	 * Master switch (default `true`). A workspace with no catalog at all FAILS —
	 * declaring one is mandatory. Set this `false` to deliberately opt a repo out.
	 */
	enforce: boolean;
	/** `manifest::name` entries — confirmed exceptions allowed to pin literally. */
	allowlist: string[];
};

/** Opt-in: index the public export surface of the listed packages. */
export type HelperManifestConfig = {
	/** Repo-root-relative package dirs to scan (each must have a package.json `exports`). */
	packages: string[];
	/** Repo-root-relative output path. */
	output: string;
};

/**
 * On by default: the workspace catalog must define each listed dependency, so the
 * version is blessed and ready to adopt with `catalog:` anywhere. The org
 * standardizes on `remeda` for functional helpers — cataloguing it makes that
 * expectation explicit without forcing every package to take the dep. Set
 * `deps: []` to opt out.
 */
export type RequireDepsConfig = {
	/** Bare package names the workspace catalog must define. */
	deps: string[];
};

/**
 * On by default: the commit message must follow Conventional Commits, and a
 * non-trivial change must carry a body. Runs on the `commit-msg` hook. The
 * header is matched against `<type>(<scope>)!: <subject>`; `type` must be one of
 * `types` and the subject is length-capped. A body becomes mandatory once the
 * STAGED diff changes more than `bodyRequiredOverLines` lines — size, not type,
 * decides when the "why" needs spelling out. Set `enforce: false` to opt out.
 */
export type CommitMsgConfig = {
	/** Master switch (default `true`). Set `false` to opt a repo out entirely. */
	enforce: boolean;
	/** Allowed Conventional Commit types; an empty list accepts any `word:` type. */
	types: string[];
	/** Require a `(scope)` in the header. */
	requireScope: boolean;
	/** Max length of the subject (the text after `type(scope): `). */
	maxSubjectLength: number;
	/** A body is required once the staged diff changes more than this many lines. */
	bodyRequiredOverLines: number;
};

export type Config = {
	docTokens: LengthConfig;
	commitMsg: CommitMsgConfig;
	reshape: ReshapeConfig;
	inlineDupes: InlineDupesConfig;
	helperCollisions: HelperCollisionsConfig;
	clones: ClonesConfig;
	pageSize: LengthConfig;
	fileSize: LengthConfig;
	catalog: CatalogConfig;
	requireDeps: RequireDepsConfig;
	helperManifest: HelperManifestConfig;
};

// The authoritative defaults live in `./defaults.ts`, which is itself a valid
// `nodeve.checks.js` (a bare `export default {...}`) so it doubles as the copyable
// reference shipped to consumers. Re-exported here to keep the `@nodeve/checks/config`
// public surface intact.
export { DEFAULTS };

const CONFIG_FILES = ['nodeve.checks.js', 'nodeve.checks.mjs', 'nodeve.checks.config.js'];

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

/**
 * Load `nodeve.checks.*` from the repo root, deep-merging the user config over
 * DEFAULTS. Nested records (e.g. a length check's `fail` tier) merge key-by-key;
 * arrays (e.g. `globs`, `overrides`) are REPLACED wholesale, so a repo that sets
 * one must restate the full list.
 */
export async function loadConfig(root: string): Promise<Config> {
	for (const name of CONFIG_FILES) {
		const path = join(root, name);
		if (!existsSync(path)) continue;
		const mod = (await import(pathToFileURL(path).href)) as { default?: DeepPartial<Config> };
		const user = mod.default ?? (mod as DeepPartial<Config>);
		return mergeDeep(DEFAULTS, user) as Config;
	}
	return DEFAULTS;
}

/** Shared CLI flag parsing — explicit paths plus the common toggles. */
export function parseArgs(argv: string[]): {
	paths: string[];
	warn: boolean;
	report: boolean;
	verbose: boolean;
	explain: boolean;
} {
	return {
		paths: argv.filter((a) => !a.startsWith('--')),
		warn: argv.includes('--warn'),
		report: argv.includes('--report'),
		verbose: argv.includes('--verbose'),
		explain: argv.includes('--explain'),
	};
}
