// Shared by the guards: collect failure lines, emit a pass/fail summary, exit.
// A guard's only variables are how it FORMATS a failure line and what it says on pass/fail —
// collection, printing, and exit codes are identical, so they live here once.

export type GuardOutput = {
	/** Failure header, given the failure count. */
	header: (count: number) => string;
	/** Optional remediation hint printed under the failure lines. */
	hint?: string;
};

/** Run a guard: `collect` records failures via `fail` and returns the pass message ('' = silent).
 *  No failures → print the pass message and exit 0; else print header + indented lines + hint, exit 1. */
export function runGuard(
	out: GuardOutput,
	collect: (fail: (line: string) => void) => string,
): never {
	const lines: string[] = [];
	const pass = collect((line) => lines.push(line));
	if (lines.length === 0) {
		if (pass) console.log(pass);
		process.exit(0);
	}
	console.error(out.header(lines.length));
	for (const line of lines) console.error(`  ${line}`);
	if (out.hint) console.error(out.hint);
	process.exit(1);
}
