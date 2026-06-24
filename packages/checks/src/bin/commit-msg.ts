#!/usr/bin/env node
/**
 * Commit-msg gate (on by default): the commit message must follow Conventional
 * Commits, and a non-trivial change must carry a body explaining it.
 *
 * Unlike the other checks this runs on the `commit-msg` hook, not `pre-commit`:
 * lefthook passes the path to the message file as `{1}`, which arrives here as
 * the first positional arg. The header is matched against
 * `<type>(<scope>)!: <subject>`; `type` must be one of `commitMsg.types` (the
 * standard Conventional set by default) and the subject is length-capped.
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
import { loadGate } from '../lib/bin.js';
import { stagedDiffLines } from '../lib/repo.js';

const { root, cfg, paths, warn } = await loadGate('commitMsg');

if (!cfg.enforce) process.exit(0);

const msgPath = paths[0];
if (!msgPath) {
	console.error('\n✖ commit-msg: no message file path given (expected lefthook `{1}`).\n');
	process.exit(1);
}

const raw = readFileSync(msgPath, 'utf8');

// git ignores comment lines and everything after the `# >8` scissors line (added
// by `commit --verbose`), so strip both before reading — otherwise the diff dump
// would read as a body and the comment hints would skew the header.
const scissors = raw.indexOf('\n# ------------------------ >8');
const lines = (scissors === -1 ? raw : raw.slice(0, scissors))
	.split('\n')
	.filter((l) => !l.startsWith('#'));

const headerIdx = lines.findIndex((l) => l.trim().length > 0);
const header = headerIdx === -1 ? '' : lines[headerIdx].trim();

// Empty message → the user is aborting; git rejects it without our help.
if (header === '') process.exit(0);

// Messages git or an autosquash rebase generates and later consumes — not ours to gate.
if (/^(merge |revert "|fixup!|squash!|amend!)/i.test(header)) process.exit(0);

const problems: string[] = [];

const m = header.match(/^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<subject>.+)$/);
if (!m?.groups) {
	problems.push(`header doesn't match "<type>(<scope>): <subject>" — got ${JSON.stringify(header)}`);
} else {
	const { type, scope, subject } = m.groups;
	if (cfg.types.length > 0 && !cfg.types.includes(type))
		problems.push(`type "${type}" is not allowed — use one of: ${cfg.types.join(', ')}`);
	if (cfg.requireScope && !scope) problems.push('a scope is required: <type>(<scope>): <subject>');
	if (subject.length > cfg.maxSubjectLength)
		problems.push(`subject is ${subject.length} chars, over the ${cfg.maxSubjectLength}-char limit`);
}

// A body is any non-empty content separated from the header by a blank line.
const after = lines.slice(headerIdx + 1);
const hasBody = after.length > 1 && after[0].trim() === '' && after.slice(1).some((l) => l.trim().length > 0);

const changed = stagedDiffLines(root);
if (changed > cfg.bodyRequiredOverLines && !hasBody)
	problems.push(
		`this commit changes ${changed} lines (> ${cfg.bodyRequiredOverLines}) and needs a body — ` +
			'add a blank line after the subject, then explain WHY the change is needed',
	);

if (problems.length === 0) process.exit(0);

console.error('\n✖ commit-msg:');
for (const p of problems) console.error(`  • ${p}`);
console.error(
	'\nConventional Commits — <type>(<optional scope>): <subject>\n' +
		`  allowed types: ${cfg.types.join(', ')}\n` +
		'  example:\n' +
		'    feat(checks): add commit-message gate\n\n' +
		'    Sizeable changes need a body after a blank line explaining the why.\n',
);

process.exit(warn ? 0 : 1);
