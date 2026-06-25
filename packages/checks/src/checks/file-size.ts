/**
 * Commit gate (on by default): TS source files in `apps/` and `packages/` have a
 * line budget. Over the `warn` tier is a non-blocking nudge; over `fail` blocks
 * the commit.
 *
 * Scope: `fileSize.globs` (default `apps/`, `packages/` `.ts`). Unlike the other
 * `.ts` checks this does NOT auto-skip tests or declaration files — a long file
 * is a long file. A file that genuinely runs long gets a bigger budget (or an
 * exemption) via `fileSize.overrides` with a WHY comment. The measure/classify
 * machinery is shared with page-size and doc-tokens in `lib/length.ts`.
 */
import { type Check } from '../lib/runner.js';
import { gradeOffenders, measureBudgets } from '../lib/length.js';

export const fileSize: Check<'fileSize'> = {
	name: 'file-size',
	section: 'fileSize',
	explain: `A large file usually means one file is doing several jobs. Step back:
  • Name the distinct responsibilities — can each move to its own module
    (one reason to change per file)?
  • Pull pure helpers into a file that can be unit-tested on its own.
  • Group the related files in a directory, but only if the split doesn't add
    friction at the call sites.
If it's genuinely one responsibility that just runs long (a schema, a lookup
table, a table-driven test), give it a bigger budget or 'exempt' via
fileSize.overrides in nodeve.checks.js with a WHY comment. --warn downgrades
this to report-only.`,

	run({ root, cfg, paths }) {
		const offenders = measureBudgets(root, cfg, paths);
		return gradeOffenders(offenders, {
			fail: (n) => `${n} file(s) over the line budget`,
			warn: (n) => `${n} file(s) over the soft budget — worth a look`,
			pass: 'all files within budget',
		});
	},
};
