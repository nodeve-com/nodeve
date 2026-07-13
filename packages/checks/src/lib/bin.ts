/**
 * The uniform runtime context every check bin opens with. Each bin used to
 * re-declare the same prologue (`root`, `cfg`, parsed args, an allowlist Set) —
 * which is exactly the kind of cross-file repetition `inline-dupes` flags. It
 * lives here once, typed, so a bin destructures what it needs instead.
 */
import { loadConfig, parseArgs, type Config } from './config.js';
import { type Scoped } from './length.js';
import { gitFiles, globMatcher, repoRoot } from './repo.js';

export type Gate<K extends keyof Config> = {
	/** Absolute git work-tree root; every check resolves scope against it. */
	root: string;
	/** This check's resolved config section (defaults merged with the repo's). */
	cfg: Config[K];
	/** Explicit paths passed on argv (lefthook `{staged_files}`), else `[]`. */
	paths: string[];
	/** `--warn`: downgrade a blocking gate to report-only (exit 0). */
	warn: boolean;
	/** `--report`: list the whole backlog without failing (doc-tokens). */
	report: boolean;
	/** `--verbose`: print on a clean run too. */
	verbose: boolean;
	/** `--explain`: expand the check's full remediation prose. */
	explain: boolean;
	/** `cfg.allowlist` as a Set; empty for sections that have none. */
	allowlist: Set<string>;
};

/**
 * Load the shared context for one check section. `argv` defaults to the process
 * args (how a per-check bin is invoked); the `nodeve-check` dispatcher passes the
 * args left after it strips the subcommand, so the check name never leaks in as a
 * path.
 */
export async function loadGate<K extends keyof Config>(
	section: K,
	argv: string[] = process.argv.slice(2),
): Promise<Gate<K>> {
	const root = repoRoot();
	const cfg = (await loadConfig(root))[section];
	const { paths, warn, report, verbose, explain } = parseArgs(argv);
	const allowlist = new Set<string>(
		'allowlist' in cfg ? (cfg as { allowlist: string[] }).allowlist : [],
	);
	return { root, cfg, paths, warn, report, verbose, explain, allowlist };
}

/**
 * Tracked `.ts` sources in scope, minus declaration and test files. Explicit
 * `paths` (staged files) override the configured globs; pass `[]` to always
 * scan the full configured scope regardless of what's staged. `ignore` globs
 * drop matches from either scope (generated output, vendored trees).
 */
export function tsSources(root: string, globs: string[], paths: string[] = [], ignore: string[] = []): string[] {
	const drop = globMatcher(ignore);
	const scope = paths.length > 0 ? paths.filter((f) => !drop(f)) : gitFiles(root, globs, ignore);
	return scope.filter((f) => f.endsWith('.ts') && !/\.(d|test|spec|test-d)\.ts$/.test(f));
}

/** The Gate fields the scope resolver reads — any `Gate<K>` whose section is `Scoped` satisfies it. */
export type ScopedGate = { root: string; cfg: Scoped; paths: string[] };

/**
 * In-scope TS sources for a check, straight from its gate — the one place a check turns config
 * into a file list, so no call restates `root`/`globs`/`ignore`/`paths`. `staged` honors the
 * argv paths (lefthook's staged files) to narrow the run; the default scans the FULL configured
 * scope, which the whole-tree checks (`inline-dupes`) require — a relation needs both files present.
 * `forEachTsNode` walks these; name-list checks iterate them directly.
 */
export const scopedTsSources = ({ root, cfg, paths }: ScopedGate, staged = false): string[] =>
	tsSources(root, cfg.globs, staged ? paths : [], cfg.ignore);
