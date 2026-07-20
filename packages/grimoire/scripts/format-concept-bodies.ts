// FIXER: inside a block scalar (`>` folded / `|` literal), a run of ONE blank line becomes TWO.
//
// WHY: `body` renders as MARKDOWN, where a paragraph break is `\n\n`. In a FOLDED scalar one blank
// line yields a single `\n` (a markdown soft wrap — the paragraphs weld together); only TWO blank
// lines yield `\n\n`. That is a mechanical property of YAML folding, not a style choice:
//     one blank  →  "para one\npara two"
//     two blanks →  "para one\n\npara two"
// Authoring the doubled blank by hand is a trap — it reads as redundant, so it gets "tidied" away,
// and any tool that re-serializes the document drops it silently (this is exactly what a migration
// pass did to 15 defs). So author ONE blank line for a paragraph break and let this normalize it.
//
// Idempotent: a run of two (or more) blank lines is left alone, so re-running is a no-op. Scoped by
// the PARSER, not by regex over the file — only byte ranges the yaml parser reports as block scalars
// are touched, so a blank line in flow content or between top-level keys is never rewritten.
// Run: `node scripts/format-concept-bodies.ts` (wired into `pnpm generate`).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Scalar, visit } from 'yaml';
import { parseDocumentText, yamlFiles } from '../src/scribe/cascade.ts';
import { SRC_DIR } from '../src/concept-sources.ts';

const AUTHORED = join(SRC_DIR, '..', 'concepts');
const isBlank = (line: string): boolean => line.trim() === '';

/** Double every single-blank-line run in `block` (the raw source text of one block scalar). */
function doubleSingleBlanks(block: string): string {
	const lines = block.split('\n');
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!isBlank(line) || i === 0 || i === lines.length - 1) {
			out.push(line);
			continue;
		}
		// A blank run: copy it, and if it is exactly one line long, emit a second.
		let run = 0;
		while (i + run < lines.length && isBlank(lines[i + run]!)) run++;
		for (let k = 0; k < run; k++) out.push(lines[i + k]!);
		if (run === 1) out.push('');
		i += run - 1;
	}
	return out.join('\n');
}

/** Every block-scalar byte range in `text`, innermost last — collected via the parser. */
function blockRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	visit(parseDocumentText(text), {
		Scalar(_key, node) {
			const block = node.type === Scalar.BLOCK_FOLDED || node.type === Scalar.BLOCK_LITERAL;
			if (block && node.range) ranges.push([node.range[0], node.range[1]]);
		},
	});
	return ranges;
}

function fix(path: string): boolean {
	const text = readFileSync(path, 'utf8');
	const ranges = blockRanges(text);
	if (ranges.length === 0) return false;

	// Rewrite back-to-front so earlier ranges keep their offsets.
	let out = text;
	for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) {
		const fixed = doubleSingleBlanks(out.slice(start, end));
		out = out.slice(0, start) + fixed + out.slice(end);
	}
	if (out === text) return false;
	writeFileSync(path, out);
	return true;
}

const fixed = yamlFiles(AUTHORED).filter(fix);
console.log(`normalized paragraph breaks in ${fixed.length} file(s)`);
for (const path of fixed.sort()) console.log(`  ${path.slice(AUTHORED.length + 1)}`);
