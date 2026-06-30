/**
 * Uniform reporting for every check. A check no longer prints its own ad-hoc
 * format and calls `process.exit` — it RETURNS a `CheckResult`, and this one
 * reporter renders every check the same way. That's the fix for the gate's
 * failure dump being a wall of per-check formats: each block now opens with the
 * same `<glyph> <name> — <summary>` headline and indents its detail rows by a
 * fixed amount. The multi-paragraph remediation essay lives on `Check.explain`,
 * kept out of the default output and surfaced only under `--explain`.
 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export type CheckResult = {
	status: CheckStatus;
	/** One-line headline shown after the glyph + check name (no leading glyph). */
	summary: string;
	/**
	 * Detail lines, one per visual line; the reporter indents each by two spaces.
	 * A grouped listing uses its own relative indent on top of that (e.g. a
	 * sub-item leads with two more spaces). Empty/omitted for a bare headline.
	 */
	rows?: string[];
};

const GLYPH: Record<CheckStatus, string> = { pass: '✓', warn: '⚠', fail: '✖', skip: '·' };

/** The status glyph, for callers that lay out their own summary (the dispatcher). */
export const glyph = (status: CheckStatus): string => GLYPH[status];

const indent = (text: string, pad = '  ') => text.replace(/^/gm, pad).replace(/\s+$/, '');

/**
 * Render one check's result as a single uniform block (no surrounding blank
 * lines — the caller owns spacing between blocks).
 *
 * `explain` is the check's remediation prose. It prints inline on a failing or
 * warning block — that's the WHY/HOW a developer hitting the gate needs, and
 * gating it behind a flag (or a rerun pointer) means it's never read. Separately,
 * the `--explain` flag expands each check's bulky per-finding DETAIL (clones
 * code fragments, inline-dupes file lists) — handled in the check's own `run`,
 * not here.
 */
export function render(name: string, r: CheckResult, opts: { explain?: string } = {}): string {
	const lines = [`${GLYPH[r.status]} ${name} — ${r.summary}`];
	for (const row of r.rows ?? []) lines.push(indent(row));
	if (r.status === 'fail' || r.status === 'warn') {
		if (opts.explain) lines.push('', indent(opts.explain.trim()));
		// Name-specific rerun pointer, so a developer hitting the gate can
		// reproduce just this check by hand — both package managers, since the
		// bin isn't a script and needs the resolver.
		lines.push(
			'',
			indent(`Run just this check:  pnpm exec nodeve-check ${name}  ·  bunx nodeve-check ${name}`),
		);
	}
	return lines.join('\n');
}

/** A check fails the gate only on `fail`, and `--warn` downgrades even that. */
export function exitCode(r: CheckResult, warn: boolean): number {
	return r.status === 'fail' && !warn ? 1 : 0;
}
