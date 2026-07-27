/**
 * Commit gate: guarded markdown over its line or token budget.
 *
 * WHY: docs cost tokens and attention, so both dimensions are bounded — over the
 * SAME scope as the prose gate (every tracked `.md`), so staging a doc means it
 * conforms. Tokenizer is js-tiktoken `o200k_base` — Claude's is unpublished and
 * differs, so this is a stable *proxy* for budgeting, not an
 * exact count: good enough to catch bloat, consistent run-to-run. Measure and
 * classify are shared with file-size and page-size in `lib/length.ts`; this check
 * owns the markdown scope, the two-axis default, and `--report` backlog mode.
 */
import { type Check } from '../lib/runner.js';
import { gradeOffenders, lengthRow, measureBudgets } from '../lib/length.js';

export const docTokens: Check<'docTokens'> = {
	name: 'doc-tokens',
	section: 'docTokens',
	explain: `Every tracked markdown file has line and token budgets, so a doc stays
terse whatever it's named or wherever it sits. CUT FIRST: delete what isn't
load-bearing, then compress what survives. The goal is fewer tokens overall, and
splitting adds them — a new file, a link table, and re-stated context — so it
only pays for an INDEX that grew: move each section out to the page that owns it
and leave one line per link. Trading a fat doc for a fat doc plus an index is a
loss. --report lists the whole backlog without failing.`,

	run({ root, cfg, paths, report }) {
		const offenders = measureBudgets(root, cfg, paths);

		// `--report`: backlog mode — list every over-budget file, never fail.
		if (report) {
			if (offenders.length === 0) return { status: 'pass', summary: 'no docs over budget' };
			return {
				status: 'warn',
				summary: `backlog — ${offenders.length} over budget`,
				rows: offenders.map(lengthRow),
			};
		}

		return gradeOffenders(offenders, {
			fail: (n) => `${n} markdown file(s) over budget — cut words (split only a grown index)`,
			warn: (n) => `${n} markdown file(s) approaching budget`,
			pass: 'all docs within budget',
		});
	},
};
