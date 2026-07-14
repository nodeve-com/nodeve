/**
 * Commit gate: structural copy-paste detector over the repo's own sources,
 * backed by jscpd v5. It flags duplicated *blocks* living in function bodies,
 * which the name-based gates (`inline-dupes`, `helper-collisions`) can't see. A
 * clone is a whole-tree property, so this scans the configured `paths` in full.
 *
 * jscpd does the detection; we own the REPORTING. Its `consoleFull` reporter
 * buries the one thing that matters — *where* the duplicated blocks are. So we
 * run it `--silent` with the `json` reporter and parse that, surfacing each
 * clone's two locations by default (the bulky shared fragment only under
 * `--explain`, so a multi-clone repo doesn't bury the gate). jscpd is a hard
 * dependency: if its binary can't be resolved the install is broken, so this
 * FAILS loudly rather than skipping — a silently-skipped copy-paste gate is worse
 * than none, since the repo believes it's covered when it isn't.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { type Check } from '../lib/runner.js';

type Loc = { name: string; start: number; end: number };
type Duplicate = {
	format: string;
	lines: number;
	fragment?: string;
	firstFile: Loc;
	secondFile: Loc;
};

function jscpdLauncher(): string | null {
	try {
		return createRequire(import.meta.url).resolve('jscpd/run-jscpd.js');
	} catch {
		return null;
	}
}

function jscpdArgs(launcher: string, cfg: Parameters<typeof runJscpd>[2]): string[] {
	return [
		launcher,
		...cfg.paths,
		'--absolute',
		'--min-tokens',
		String(cfg.minTokens),
		'--min-lines',
		String(cfg.minLines),
		'--mode',
		cfg.mode,
		'--format',
		cfg.formats.join(','),
		'--ignore',
		cfg.ignore.join(','),
		'--reporters',
		'json',
		'--output',
		cfg.output,
		'--silent',
		'--threshold',
		String(cfg.threshold),
	];
}

function runJscpd(
	root: string,
	launcher: string,
	cfg: {
		paths: string[];
		minTokens: number;
		minLines: number;
		mode: string;
		formats: string[];
		ignore: string[];
		output: string;
		threshold: number;
	},
) {
	return spawnSync(process.execPath, jscpdArgs(launcher, cfg), {
		cwd: root,
		encoding: 'utf8',
	});
}

function readDuplicates(outDir: string): Duplicate[] | null {
	try {
		const report = JSON.parse(readFileSync(join(outDir, 'jscpd-report.json'), 'utf8'));
		return report.duplicates ?? [];
	} catch {
		return null;
	}
}

function processOutput(run: ReturnType<typeof runJscpd>): string[] {
	return [run.stdout ?? '', run.stderr ?? '']
		.filter((line) => line.length > 0)
		.join('\n')
		.split('\n')
		.filter((line) => line.length > 0);
}

function duplicateRows(root: string, duplicates: Duplicate[], explain: boolean): string[] {
	return duplicates.flatMap((duplicate) => {
		const first = relative(root, duplicate.firstFile.name);
		const second = relative(root, duplicate.secondFile.name);
		const location =
			`${first}:${duplicate.firstFile.start}-${duplicate.firstFile.end}\n` +
			`↔ ${second}:${duplicate.secondFile.start}-${duplicate.secondFile.end}` +
			`  (${duplicate.lines} lines, ${duplicate.format})`;
		const fragment = duplicate.fragment?.replace(/^/gm, '  ').replace(/\s+$/, '');
		return explain && fragment ? [location, fragment] : [location];
	});
}

export const clones: Check<'clones'> = {
	name: 'clones',
	section: 'clones',
	explain: `Structural copy-paste (jscpd) flags duplicated blocks the name-based gates
can't see. Extract the shared logic, or narrow scope with clones.ignore globs.
--warn downgrades the gate to report-only.`,

	run({ root, cfg, explain }) {
		const launcher = jscpdLauncher();
		if (!launcher)
			return {
				status: 'fail',
				summary: 'jscpd not resolvable — copy-paste gate is DOWN, not skipped',
				rows: [
					'jscpd is a hard dependency of @nodeve/checks but its binary could not be resolved.',
					'The install is broken; the clones gate is blind. Fix, do not bypass:',
					'  reinstall deps (pnpm install / bun install) so jscpd/run-jscpd.js resolves.',
				],
			};

		// jscpd's `json` reporter writes `<output>/jscpd-report.json`; `--silent`
		// keeps its progress bar, stats table, and footer off our stdout. Missing
		// dirs are tolerated, so the configured paths go through as-is. `--absolute`
		// makes report paths unambiguous; we re-relativize them for the listing.
		const outDir = mkdtempSync(join(tmpdir(), 'nodeve-clones-'));
		const jscpdRun = runJscpd(root, launcher, { ...cfg, output: outDir });

		// jscpd exits non-zero only when duplication crosses `--threshold`.
		if (jscpdRun.status === 0) {
			rmSync(outDir, { recursive: true, force: true });
			return { status: 'pass', summary: 'no duplicated blocks over threshold' };
		}

		try {
			const duplicates = readDuplicates(outDir);
			if (!duplicates)
				// No report written → jscpd failed before detection (bad args, crash).
				// Surface its own output so the failure isn't swallowed.
				return {
					status: 'fail',
					summary: 'jscpd failed before detection',
					rows: processOutput(jscpdRun),
				};
			return {
				status: 'fail',
				summary: `${duplicates.length} duplicated block(s) — extract the shared logic`,
				rows: duplicateRows(root, duplicates, explain),
			};
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	},
};
