#!/usr/bin/env node
/**
 * `nodeve-check` — the single front door to the checks.
 *
 *   nodeve-check <name> [paths…] [--explain] [--warn] [--verbose] [--report]
 *       Run one check (identical to the `nodeve-check-<name>` bin). `--explain`
 *       expands its full remediation prose under the result.
 *   nodeve-check            Run the whole pre-commit suite, summary-first: a
 *   nodeve-check all        status line per check, then a detail block for each
 *                           that failed or warned. Exits 1 if any blocked.
 *   nodeve-check list       List the available check names.
 *
 * The per-check bins stay (lefthook shells them per job, so the gate keeps its
 * parallel run + summary tree). This dispatcher is the friendly hand-run path —
 * `pnpm exec nodeve-check file-size` — and the one-shot whole-suite preview.
 */
import { parseArgs } from '../lib/config.js';
import { byName, CHECKS, PRE_COMMIT } from '../lib/registry.js';
import { exitCode, glyph, render } from '../lib/report.js';
import { emit, runCheck } from '../lib/runner.js';

const argv = process.argv.slice(2);
// First non-flag token is the subcommand; everything else (paths + flags) is the
// check's own argv, so the subcommand never leaks in as a path.
const cmdIdx = argv.findIndex((a) => !a.startsWith('--'));
const cmd = cmdIdx === -1 ? undefined : argv[cmdIdx];
const passthrough = cmdIdx === -1 ? argv : [...argv.slice(0, cmdIdx), ...argv.slice(cmdIdx + 1)];

if (cmd === 'list') {
	for (const c of CHECKS) console.log(c.name);
	process.exit(0);
}

if (cmd && cmd !== 'all') {
	const check = byName.get(cmd);
	if (!check) {
		process.stderr.write(`\n✖ unknown check: ${cmd}\n  run \`nodeve-check list\` to see them\n\n`);
		process.exit(2);
	}
	const { result, gate } = await runCheck(check, passthrough);
	emit(check, result, gate);
	process.exit(exitCode(result, gate.warn));
}

// Whole-suite run: every pre-commit check (commit-msg runs on its own hook).
const flags = parseArgs(passthrough);
const results = [];
for (const check of PRE_COMMIT) {
	const { result } = await runCheck(check, passthrough);
	results.push({ check, result });
}

// Summary first: one aligned status line per check.
const pad = Math.max(...PRE_COMMIT.map((c) => c.name.length));
const tally = { pass: 0, warn: 0, fail: 0, skip: 0 };
const lines = [`\nnodeve-check · ${results.length} checks\n`];
for (const { check, result } of results) {
	tally[result.status]++;
	const note = result.status === 'pass' || result.status === 'skip' ? '' : `  ${result.summary}`;
	lines.push(`  ${glyph(result.status)} ${check.name.padEnd(pad)}${note}`);
}
lines.push(
	`\n  ${tally.fail} failed · ${tally.warn} warned · ${tally.pass} passed · ${tally.skip} skipped`,
);
process.stdout.write(lines.join('\n') + '\n');

// Then a detail block for each check that failed or warned.
const detailed = results.filter((r) => r.result.status === 'fail' || r.result.status === 'warn');
if (detailed.length > 0) {
	process.stdout.write('\n' + '─'.repeat(56) + '\n');
	for (const { check, result } of detailed)
		process.stdout.write('\n' + render(check.name, result, { explain: check.explain }) + '\n');
	process.stdout.write('\n');
}

process.exit(tally.fail > 0 && !flags.warn ? 1 : 0);
