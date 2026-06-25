/**
 * Commit gate: fail when a file matching one of `pageSize.overrides` exceeds that
 * override's budget. Opt-in — the default scope (`globs`) is empty, so only files
 * a configured override glob matches get a budget.
 *
 * WHY: an oversized template/module is a signal the unit is doing work that
 * belongs in dedicated files — most often a SvelteKit `+page.svelte` with
 * components defined inline that should be ripped out into their own files.
 * Defaults to one override, `{ glob: '*+page.svelte', tiers: { fail: { maxLines:
 * 280 } } }`; any glob → budget works, and a `warn` tier nudges before it blocks.
 * Measure/classify is shared with file-size and doc-tokens in `lib/length.ts`.
 */
import { type Check } from '../lib/runner.js';
import { gradeOffenders, measureBudgets } from '../lib/length.js';

export const pageSize: Check<'pageSize'> = {
	name: 'page-size',
	section: 'pageSize',
	explain: `An oversized template/module — most often a SvelteKit \`+page.svelte\` with
components defined inline — should rip those components out into their own
files. Configure the line budgets via \`pageSize.overrides\` in nodeve.checks.js.`,

	run({ root, cfg, paths }) {
		if (cfg.globs.length === 0 && (cfg.overrides?.length ?? 0) === 0)
			return { status: 'pass', summary: 'no rules configured' };

		const offenders = measureBudgets(root, cfg, paths);
		return gradeOffenders(offenders, {
			fail: (n) => `${n} file(s) over line budget — rip inline components out into their own files`,
			warn: (n) => `${n} file(s) approaching the line budget`,
			pass: 'all files within budget',
		});
	},
};
