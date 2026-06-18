/**
 * Per-repo configuration for the nodeve checks. A consumer drops a
 * `nodeve.checks.js` (ESM, default-exporting the object below) at the repo root;
 * anything omitted falls back to the org defaults here. Every section is
 * optional, so a repo can adopt one check and leave the rest on defaults.
 *
 *   // nodeve.checks.js
 *   export default {
 *     docTokens: { maxTokens: 3500, overrides: { 'CLAUDE.md': { maxTokens: 4000 } } },
 *     pageSize: { rules: [{ glob: '*+page.svelte', maxLines: 280 }] }, // opt-in
 *   };
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeDeep } from 'remeda';

export type Budget = { maxLines: number; maxTokens: number };

export type DocTokensConfig = {
	maxLines: number;
	maxTokens: number;
	/** Git pathspecs the gate FAILS on (and `--report` lists); `*` matches `/`. */
	enforce: string[];
	/** Per-file budget overrides, keyed by repo-root-relative path. */
	overrides: Record<string, Partial<Budget>>;
};

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
	/** Repo-root-relative path to the committed lib-names index. */
	libNamesPath: string;
	threshold: number;
	/** `relPath::local→lib` entries — confirmed false positives. */
	allowlist: string[];
};

/** Opt-in: each rule fails when a file matching `glob` exceeds `maxLines`. */
export type PageSizeConfig = {
	rules: { glob: string; maxLines: number }[];
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

export type Config = {
	docTokens: DocTokensConfig;
	reshape: ReshapeConfig;
	inlineDupes: InlineDupesConfig;
	helperCollisions: HelperCollisionsConfig;
	pageSize: PageSizeConfig;
	catalog: CatalogConfig;
	requireDeps: RequireDepsConfig;
	helperManifest: HelperManifestConfig;
};

export const DEFAULTS: Config = {
	docTokens: {
		maxLines: 150,
		maxTokens: 3000,
		enforce: ['CLAUDE.md', 'README.md', '*/README.md', 'guide/*.md', 'docs/*.md'],
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
	// Opt-in: empty rules → no-op until a repo declares its own.
	pageSize: { rules: [] },
	// On by default: a workspace must declare a catalog (set enforce:false to opt out).
	catalog: { enforce: true, allowlist: [] },
	// On by default: the workspace catalog must define remeda (set deps:[] to opt out).
	requireDeps: { deps: ['remeda'] },
	// Opt-in: no packages → no-op.
	helperManifest: { packages: [], output: '.nodeve/helper-manifest.txt' },
};

const CONFIG_FILES = ['nodeve.checks.js', 'nodeve.checks.mjs', 'nodeve.checks.config.js'];

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

/**
 * Load `nodeve.checks.*` from the repo root, deep-merging the user config over
 * DEFAULTS. Nested records (e.g. `docTokens.overrides`) merge key-by-key; arrays
 * (e.g. `docTokens.enforce`) are REPLACED wholesale, so a repo that sets `enforce`
 * must restate the full list.
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
} {
	return {
		paths: argv.filter((a) => !a.startsWith('--')),
		warn: argv.includes('--warn'),
		report: argv.includes('--report'),
		verbose: argv.includes('--verbose'),
	};
}
