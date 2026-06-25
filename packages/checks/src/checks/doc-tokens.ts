/**
 * Commit gate: guarded markdown over its line or token budget.
 *
 * WHY: always-loaded / frequently-linked docs cost tokens and attention, so both
 * dimensions are bounded. Tokenizer is js-tiktoken `o200k_base` — Claude's is
 * unpublished and differs, so this is a stable *proxy* for budgeting, not an
 * exact count: good enough to catch bloat, consistent run-to-run. Measure and
 * classify are shared with file-size and page-size in `lib/length.ts`; this check
 * owns the markdown scope, the two-axis default, and `--report` backlog mode.
 */
import { type Check } from '../lib/runner.js';
import { gradeOffenders, lengthRow, measureBudgets } from '../lib/length.js';

export const docTokens: Check<'docTokens'> = {
	name: 'doc-tokens',
	section: 'docTokens',
	explain: `Guarded markdown (CLAUDE.md, READMEs, guide/, docs/) has line and token
budgets so always-loaded docs stay terse. Past the budget, don't trim to the
edge — split the doc into a directory with an index page plus detail pages, then
repoint inbound links at the new locations. --report lists the whole backlog
without failing, so you can work it down over time rather than at commit time.`,

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
			fail: (n) => `${n} markdown file(s) over budget — split into a dir with an index`,
			warn: (n) => `${n} markdown file(s) approaching budget`,
			pass: 'all docs within budget',
		});
	},
};
