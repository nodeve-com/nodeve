// Shared by the guards: accumulate failure lines, then emit a pass/fail summary and exit.
// A guard's only variable is how it FORMATS one failure line — collection, printing, and exit
// codes are identical, so they live here once.

export class GuardReport {
	private readonly lines: string[] = [];

	/** Record one pre-formatted failure line. */
	fail(line: string): void {
		this.lines.push(line);
	}

	get count(): number {
		return this.lines.length;
	}

	/** No failures → print `pass` (if any) and exit 0; else print `header(count)`, each indented
	 *  line, an optional `hint`, and exit 1. */
	done(pass: string, header: (count: number) => string, hint = ''): never {
		if (this.lines.length === 0) {
			if (pass) console.log(pass);
			process.exit(0);
		}
		console.error(header(this.lines.length));
		for (const line of this.lines) console.error(`  ${line}`);
		if (hint) console.error(hint);
		process.exit(1);
	}
}
