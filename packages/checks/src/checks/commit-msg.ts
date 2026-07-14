/**
 * Commit-msg gate (on by default): the commit message must follow Conventional
 * Commits, and a non-trivial change must carry a body explaining it.
 *
 * Unlike the other checks this runs on the `commit-msg` hook, not `pre-commit`:
 * lefthook passes the path to the message file as `{1}`, which arrives here as
 * `gate.paths[0]`. The header is matched against `<type>(<scope>)!: <subject>`;
 * `type` must be one of `commitMsg.types` (the standard Conventional set by
 * default) and the subject is length-capped.
 *
 * WHY a conditional body: a one-line subject is fine for a small, self-evident
 * change, but past `commitMsg.bodyRequiredOverLines` changed lines (measured
 * from the STAGED diff via `git diff --cached --numstat`) the "what" no longer
 * implies the "why" — those commits must include a body. Size, not the declared
 * type, is what decides a change needs explaining.
 *
 * Skipped automatically: merge commits, reverts, and fixup!/squash!/amend!
 * autosquash messages — git or rebase authors and consumes those. An empty
 * message is left alone too, since git aborts that commit on its own.
 *
 * `commitMsg.enforce: false` opts a repo out; `--warn` downgrades to report-only.
 */
import { readFileSync } from 'node:fs';
import { type Check } from '../lib/runner.js';
import { stagedDiffLines } from '../lib/repo.js';

function messageLines(raw: string): string[] {
	const scissors = raw.indexOf('\n# ------------------------ >8');
	return (scissors === -1 ? raw : raw.slice(0, scissors))
		.split('\n')
		.filter((line) => !line.startsWith('#'));
}

function validateHeader(
	header: string,
	cfg: { types: string[]; requireScope: boolean; maxSubjectLength: number },
): string[] {
	const match = header.match(/^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<subject>.+)$/);
	if (!match?.groups)
		return [`header doesn't match "<type>(<scope>): <subject>" — got ${JSON.stringify(header)}`];
	const { type, scope, subject } = match.groups;
	const problems: string[] = [];
	if (cfg.types.length > 0 && !cfg.types.includes(type))
		problems.push(`type "${type}" is not allowed — use one of: ${cfg.types.join(', ')}`);
	if (cfg.requireScope && !scope) problems.push('a scope is required: <type>(<scope>): <subject>');
	if (subject.length > cfg.maxSubjectLength)
		problems.push(
			`subject is ${subject.length} chars, over the ${cfg.maxSubjectLength}-char limit`,
		);
	return problems;
}

export const commitMsg: Check<'commitMsg'> = {
	name: 'commit-msg',
	section: 'commitMsg',
	explain: `Conventional Commits — format <type>(<optional scope>): <subject>.
The type must be one of the configured types, and the subject is length-capped.
Example:
  feat(checks): add commit-message gate

Sizeable changes need a body: leave a blank line after the subject, then
explain WHY the change is needed.`,

	run({ root, cfg, paths }) {
		if (!cfg.enforce) return { status: 'skip', summary: 'disabled (commitMsg.enforce: false)' };

		// lefthook passes the message file path as `{1}` → first positional arg.
		const msgPath = paths[0];
		if (!msgPath)
			return { status: 'fail', summary: 'no message file path given (expected lefthook `{1}`)' };

		const raw = readFileSync(msgPath, 'utf8');

		// git ignores comment lines and everything after the `# >8` scissors line
		// (added by `commit --verbose`), so strip both before reading — otherwise the
		// diff dump would read as a body and the comment hints would skew the header.
		const lines = messageLines(raw);

		const headerIdx = lines.findIndex((l) => l.trim().length > 0);
		const header = headerIdx === -1 ? '' : lines[headerIdx].trim();

		// Empty message → the user is aborting; git rejects it without our help.
		if (header === '') return { status: 'skip', summary: 'empty message' };

		// Messages git or an autosquash rebase generates and later consumes — not ours to gate.
		if (/^(merge |revert "|fixup!|squash!|amend!)/i.test(header))
			return {
				status: 'skip',
				summary: 'generated message (merge/revert/autosquash) — not gated',
			};

		const problems = validateHeader(header, cfg);

		// A body is any non-empty content separated from the header by a blank line.
		const after = lines.slice(headerIdx + 1);
		const hasBody =
			after.length > 1 && after[0].trim() === '' && after.slice(1).some((l) => l.trim().length > 0);

		const changed = stagedDiffLines(root);
		if (changed > cfg.bodyRequiredOverLines && !hasBody)
			problems.push(
				`this commit changes ${changed} lines (> ${cfg.bodyRequiredOverLines}) and needs a body — ` +
					'add a blank line after the subject, then explain WHY the change is needed',
			);

		if (problems.length === 0) return { status: 'pass', summary: 'ok' };

		return { status: 'fail', summary: 'commit message', rows: problems.map((p) => `• ${p}`) };
	},
};
