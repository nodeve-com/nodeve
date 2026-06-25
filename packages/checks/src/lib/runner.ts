/**
 * The check contract and the glue that runs one. Each check is a `Check` object:
 * it declares its `name`, the config `section` it reads, its `explain` prose, and
 * a `run(gate)` that RETURNS a `CheckResult` instead of printing and exiting. The
 * per-check bins (`nodeve-check-file-size` …) and the `nodeve-check` dispatcher
 * both drive checks through here, so output and exit codes are identical however
 * a check is invoked.
 */
import { type Config } from './config.js';
import { loadGate, type Gate } from './bin.js';
import { type CheckResult, exitCode, render } from './report.js';

export type Check<K extends keyof Config = keyof Config> = {
	/** CLI / lefthook-job name, e.g. `file-size`. */
	name: string;
	/** Config section the check reads (drives `loadGate`). */
	section: K;
	/** Full remediation prose, surfaced only on `--explain`. */
	explain: string;
	/** Inspect the gate, return a result. No printing, no `process.exit`. */
	run(gate: Gate<K>): CheckResult | Promise<CheckResult>;
};

/** Run a check against an explicit argv, returning its result and gate. */
export async function runCheck<K extends keyof Config>(
	check: Check<K>,
	argv: string[],
): Promise<{ result: CheckResult; gate: Gate<K> }> {
	const gate = await loadGate(check.section, argv);
	return { result: await check.run(gate), gate };
}

/**
 * Print one check's block to stderr, unless it passed/skipped silently. A clean
 * run stays quiet (the gate shouldn't log on every commit) except under
 * `--verbose`. Spacing around the block is owned here so the caller doesn't have
 * to pad.
 */
export function emit(
	check: Check,
	result: CheckResult,
	flags: { verbose: boolean; explain: boolean },
): void {
	const quiet = (result.status === 'pass' || result.status === 'skip') && !flags.verbose;
	if (quiet) return;
	const block = render(check.name, result, { explain: check.explain });
	process.stderr.write(`\n${block}\n\n`);
}

/**
 * Entry point for a per-check bin: parse `process.argv`, run the check, emit its
 * block, exit. `--explain` with no other work still runs the check (so the prose
 * sits under a live result).
 */
export async function runBin<K extends keyof Config>(check: Check<K>): Promise<never> {
	const argv = process.argv.slice(2);
	const { result, gate } = await runCheck(check, argv);
	emit(check, result, gate);
	process.exit(exitCode(result, gate.warn));
}
