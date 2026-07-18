// Guard: no large `#` comment block in a concept YAML — durable prose belongs in `body:`.
//
// A concept is DATA that projects to JSON/TS/schema (concepts/README.md). A `#` comment survives
// none of those projections — it's lost the instant the YAML is baked. So rationale/spec prose
// hidden in a header comment can never become documentation. The `body` field (i18n text, mounted
// on `thing`, so every archetype/feature/enumeration-member/property def carries it) is where that
// prose lives instead: it bakes into `artifacts/<layer>/<slug>.json` and the TS emit, queryable and
// renderable. See concepts/enumeration/interval_kind/zone.yaml for the shape.
//
// This guard fails on any contiguous run of >= MAX_RUN comment-only lines. Short inline annotations
// on a data row (<= MAX_RUN-1 lines) stay — they're data-local, not prose. `_defaults.yaml` cascade
// docs are exempt (yamlFiles skips them): they describe a dir, not a projectable concept.
// Run standalone: `node scripts/guard-comment-blocks.ts`.
import { readFileSync } from 'node:fs';
import { yamlFiles } from './yaml-files.ts';
import { CONCEPTS } from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

// A block of this many contiguous comment lines (or more) must move to `body:`. Three or fewer is a
// tolerated inline annotation.
const MAX_RUN = 4;

// A comment-only line: optional indent, then `#`. A `#` inside a quoted value or mid-line isn't
// caught (the line starts with a data key), so only standalone comments count.
const COMMENT = /^\s*#/;

// Report every >= MAX_RUN contiguous comment block in one file's text.
function scanBlocks(rel: string, text: string, fail: (line: string) => void): void {
	const lines = text.split('\n');
	let runStart = -1;
	let run = 0;
	const flush = () => {
		if (run >= MAX_RUN) fail(`${rel}:${runStart + 1}  —  ${run}-line comment block`);
		run = 0;
		runStart = -1;
	};
	for (let i = 0; i < lines.length; i++) {
		if (!COMMENT.test(lines[i] ?? '')) flush();
		else {
			if (run === 0) runStart = i;
			run++;
		}
	}
	flush();
}

runGuard(
	{
		header: (n) => `\n✖ ${n} oversized comment block(s) — move the prose into a \`body:\` field:\n`,
		hint: `
A \`#\` comment is lost the moment the YAML bakes to JSON/TS — it can never become docs. Author
durable prose in \`body: { en: > … }\` instead (it bakes into artifacts + the TS emit). Runs of
${MAX_RUN}+ contiguous comment lines are the trigger; keep inline row annotations to ${MAX_RUN - 1} lines or fewer.
See concepts/enumeration/interval_kind/zone.yaml.
`,
	},
	(fail) => {
		for (const path of yamlFiles(CONCEPTS)) {
			scanBlocks(path.slice(CONCEPTS.length + 1), readFileSync(path, 'utf8'), fail);
		}
		return '✓ no concept YAML carries prose that belongs in a `body:` field';
	},
);
