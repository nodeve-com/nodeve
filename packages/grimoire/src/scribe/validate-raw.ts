// Concept-mode raw validation — checks that only make sense on the TEXT, before it becomes JSON, and
// only when grimoire opts in with `conceptRules` (generic YAML→JSON conversion does not — comments
// and terse files are normal there). Applied to concept leaves AND their `_defaults.yaml` cascade
// files alike. A `#` comment survives none of the JSON/TS/schema projections; it's lost the instant
// the YAML bakes. So durable prose hidden in a header comment can never become documentation — it
// belongs in a `body:` field (i18n text on `thing`, carried into artifacts + the TS emit) or in dev
// docs. This is the ONE place that reads comment text; every downstream reader sees comment-free
// JSON. Add future concept-raw gates here.

// A run of this many contiguous comment-only lines (or more) must move to `body:`. Three or fewer is
// a tolerated inline annotation on a data row.
const MAX_RUN = 4;

// A comment-only line: optional indent, then `#`. A `#` inside a quoted value or mid-line isn't
// caught (the line starts with a data key), so only standalone comments count.
const COMMENT = /^\s*#/;

/** Every `>= MAX_RUN` contiguous comment block in one file's text, as `line:count` findings. */
function commentBlocks(text: string): Array<{ line: number; run: number }> {
	const lines = text.split('\n');
	const out: Array<{ line: number; run: number }> = [];
	let start = -1;
	let run = 0;
	const flush = () => {
		if (run >= MAX_RUN) out.push({ line: start + 1, run });
		run = 0;
		start = -1;
	};
	for (let i = 0; i < lines.length; i++) {
		if (!COMMENT.test(lines[i] ?? '')) flush();
		else {
			if (run === 0) start = i;
			run++;
		}
	}
	flush();
	return out;
}

/** Throw if `text` (the raw YAML of `path`) breaks a concept-mode raw rule. Runs before the parse,
 *  so the message points at the source file, not the desugared JSON. */
export function validateConceptText(path: string, text: string): void {
	const blocks = commentBlocks(text);
	if (blocks.length === 0) return;
	const where = blocks.map((b) => `  ${path}:${b.line} — ${b.run}-line comment block`).join('\n');
	throw new Error(
		`grimoire scribe: oversized comment block(s) — move the prose into a \`body:\` field:\n${where}\n\n` +
			`A \`#\` comment is lost the moment the YAML bakes to JSON/TS — it can never become docs. Author\n` +
			`durable prose in \`body: { en: > … }\` instead. Runs of ${MAX_RUN}+ contiguous comment lines trigger\n` +
			`this; keep inline row annotations to ${MAX_RUN - 1} lines or fewer.`,
	);
}
