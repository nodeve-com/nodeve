/**
 * The shared length-budget engine behind file-size, page-size and doc-tokens.
 * Each of those checks is the same shape — measure every file in a scope, compare
 * it to a per-file budget, report the offenders worst-first — and differed only
 * in which axes they bound (lines, tokens), whether they carry a soft tier, and
 * how they override the default per path. Three override vocabularies
 * (`allowlist`, `rules`, per-path `overrides`) collapsed into one here: a check
 * supplies a `LengthConfig` and maps the returned offenders to its CheckResult.
 */
import { getEncoding } from 'js-tiktoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CheckResult } from './report.js';
import { gitFiles, lineCount } from './repo.js';

/** A length budget. An omitted axis is unbounded — the check doesn't bound it. */
export type Budget = { maxLines?: number; maxTokens?: number };

/** A file's budget split into the soft (warn) and hard (fail) tiers; either may be absent. */
export type Tiers = { warn?: Budget; fail?: Budget };

/** Severity of a budget breach. `fail` blocks the commit; `warn` is a nudge. */
export type Severity = 'warn' | 'fail';

/**
 * One per-glob budget adjustment. Files matching `glob` (a git pathspec, so `*`
 * matches `/`) take `tiers` merged per-axis over the check's default tiers — set
 * only the axis you change. `'exempt'` drops the file from the gate entirely (the
 * old fileSize `allowlist`). Later overrides win where they overlap.
 */
export type Override = { glob: string; tiers: Tiers | 'exempt' };

/**
 * The uniform config every length check reads. `globs` is the scope; `warn`/`fail`
 * are the default tiers (omit an axis to leave it unbounded, omit a whole tier to
 * drop it). A check with no default `fail` and `globs: []` is opt-in: only files
 * matched by an override glob get a budget (page-size).
 */
export type LengthConfig = {
	globs: string[];
	warn?: Budget;
	fail?: Budget;
	overrides?: Override[];
};

export type Offender = {
	path: string;
	severity: Severity;
	/** Per-axis `actual/limit` labels for the breached tier, e.g. `['392/300L']` or `['180/150L', '4200/3000T']`. */
	breaches: string[];
	/** The worst breached axis's actual count, for worst-first sorting. */
	weight: number;
};

/** Merge `over` per-axis onto `base`; an absent `over` leaves `base` untouched. */
const mergeBudget = (base: Budget | undefined, over: Budget | undefined): Budget | undefined =>
	over ? { ...base, ...over } : base;

/**
 * Resolve every in-scope file to its tiers: start at the default warn/fail, apply
 * each matching override in order (later wins, `'exempt'` drops it), and keep the
 * survivors. The target set is `globs` ∪ every override glob, so a file matched
 * only by an override (page-size's `*+page.svelte`) is still measured. Each
 * override's match set is globbed once, not per file.
 */
function resolveTargets(root: string, config: LengthConfig): { path: string; tiers: Tiers }[] {
	const overrides = (config.overrides ?? []).map((o) => ({
		match: new Set(gitFiles(root, [o.glob])),
		tiers: o.tiers,
	}));

	const scope = new Set(gitFiles(root, config.globs));
	for (const o of overrides) for (const path of o.match) scope.add(path);

	const out: { path: string; tiers: Tiers }[] = [];
	for (const path of scope) {
		// `null` = exempt. A later tier override re-budgets from scratch (the `?? {}`),
		// so exemption isn't sticky if a more specific glob deliberately re-adds one.
		let tiers: Tiers | null = { warn: config.warn, fail: config.fail };
		for (const o of overrides) {
			if (!o.match.has(path)) continue;
			if (o.tiers === 'exempt') {
				tiers = null;
				continue;
			}
			const cur: Tiers = tiers ?? {};
			tiers = { warn: mergeBudget(cur.warn, o.tiers.warn), fail: mergeBudget(cur.fail, o.tiers.fail) };
		}
		if (tiers) out.push({ path, tiers });
	}
	return out;
}

type Breach = { label: string; actual: number };

/** The breached axes of `budget`, with the actual count for sorting; empty if within budget. */
function breachesOf(lines: number, tokens: () => number, budget: Budget | undefined): Breach[] {
	if (!budget) return [];
	const out: Breach[] = [];
	if (budget.maxLines !== undefined && lines > budget.maxLines)
		out.push({ label: `${lines}/${budget.maxLines}L`, actual: lines });
	// `tokens()` is only invoked when an axis actually bounds tokens, so a
	// lines-only check (file-size, page-size) never pays the tiktoken encode.
	if (budget.maxTokens !== undefined && tokens() > budget.maxTokens)
		out.push({ label: `${tokens()}/${budget.maxTokens}T`, actual: tokens() });
	return out;
}

/**
 * Measure each in-scope file and classify it against its resolved tiers — `fail`
 * takes precedence over `warn`. `only` (lefthook `{staged_files}`) narrows the
 * scan to staged paths when non-empty. Offenders come back sorted worst-first.
 */
export function measureBudgets(root: string, config: LengthConfig, only: string[] = []): Offender[] {
	const onlySet = only.length > 0 ? new Set(only) : null;
	const targets = resolveTargets(root, config).filter((t) => !onlySet || onlySet.has(t.path));

	// One encoder for the whole run; per-file token counts are memoized in `tokens`.
	let enc: ReturnType<typeof getEncoding> | null = null;
	const offenders: Offender[] = [];

	for (const { path, tiers } of targets) {
		const lines = lineCount(root, path);
		let counted: number | null = null;
		const tokens = () => {
			if (counted === null) {
				enc ??= getEncoding('o200k_base');
				counted = enc.encode(readFileSync(join(root, path), 'utf8')).length;
			}
			return counted;
		};

		const breaches = breachesOf(lines, tokens, tiers.fail);
		const severity: Severity = breaches.length > 0 ? 'fail' : 'warn';
		const hits = breaches.length > 0 ? breaches : breachesOf(lines, tokens, tiers.warn);
		if (hits.length === 0) continue;
		offenders.push({
			path,
			severity,
			breaches: hits.map((h) => h.label),
			weight: Math.max(...hits.map((h) => h.actual)),
		});
	}
	return offenders.sort((a, b) => b.weight - a.weight);
}

/** Uniform offender row: the breach labels, left-justified, then the path. */
export const lengthRow = (o: Offender): string => `${o.breaches.join(' ').padEnd(22)} ${o.path}`;

/**
 * The warn/fail grading every blocking length check shares: `fail` offenders block
 * (with a tail count of the soft-budget ones), else `warn` offenders nudge, else
 * pass. `labels` supplies the three summaries.
 */
export function gradeOffenders(
	offenders: Offender[],
	labels: { fail: (n: number) => string; warn: (n: number) => string; pass: string },
): CheckResult {
	const failing = offenders.filter((o) => o.severity === 'fail');
	const warning = offenders.filter((o) => o.severity === 'warn');

	if (failing.length > 0) {
		const rows = failing.map(lengthRow);
		if (warning.length > 0) rows.push(`… plus ${warning.length} over the soft budget`);
		return { status: 'fail', summary: labels.fail(failing.length), rows };
	}
	if (warning.length > 0)
		return { status: 'warn', summary: labels.warn(warning.length), rows: warning.map(lengthRow) };
	return { status: 'pass', summary: labels.pass };
}
