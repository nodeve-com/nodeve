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
 * `--explain`, so a multi-clone repo doesn't bury the gate). jscpd's binary ships
 * as an optionalDependency, so a partial/offline install can leave it absent —
 * then this skips rather than blocking the commit.
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

export const clones: Check<'clones'> = {
	name: 'clones',
	section: 'clones',
	explain: `Structural copy-paste (jscpd) flags duplicated blocks the name-based gates
can't see. Extract the shared logic, or narrow scope with clones.ignore globs.
--warn downgrades the gate to report-only.`,

	run({ root, cfg, explain }) {
		let launcher: string;
		try {
			launcher = createRequire(import.meta.url).resolve('jscpd/run-jscpd.js');
		} catch {
			return { status: 'skip', summary: 'jscpd binary not installed — skipping' };
		}

		// jscpd's `json` reporter writes `<output>/jscpd-report.json`; `--silent`
		// keeps its progress bar, stats table, and footer off our stdout. Missing
		// dirs are tolerated, so the configured paths go through as-is. `--absolute`
		// makes report paths unambiguous; we re-relativize them for the listing.
		const outDir = mkdtempSync(join(tmpdir(), 'nodeve-clones-'));
		const jscpdRun = spawnSync(
			process.execPath,
			[
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
				outDir,
				'--silent',
				'--threshold',
				String(cfg.threshold),
			],
			{ cwd: root, encoding: 'utf8' },
		);

		// jscpd exits non-zero only when duplication crosses `--threshold`.
		if (jscpdRun.status === 0) {
			rmSync(outDir, { recursive: true, force: true });
			return { status: 'pass', summary: 'no duplicated blocks over threshold' };
		}

		const rel = (p: string) => relative(root, p);
		try {
			let duplicates: Duplicate[];
			try {
				const report = JSON.parse(readFileSync(join(outDir, 'jscpd-report.json'), 'utf8'));
				duplicates = report.duplicates ?? [];
			} catch {
				// No report written → jscpd failed before detection (bad args, crash).
				// Surface its own output so the failure isn't swallowed.
				const out = [jscpdRun.stdout ?? '', jscpdRun.stderr ?? '']
					.filter((s) => s.length > 0)
					.join('\n')
					.split('\n')
					.filter((l) => l.length > 0);
				return { status: 'fail', summary: 'jscpd failed before detection', rows: out };
			}

			const rows: string[] = [];
			for (const d of duplicates) {
				rows.push(
					`${rel(d.firstFile.name)}:${d.firstFile.start}-${d.firstFile.end}\n` +
						`↔ ${rel(d.secondFile.name)}:${d.secondFile.start}-${d.secondFile.end}` +
						`  (${d.lines} lines, ${d.format})`,
				);
				// The shared code fragment is the bulky part (one clone can be 60+
				// lines); a repo with several clones would bury the whole gate in code.
				// Default to just the two locations + size; surface the fragments only
				// under --explain, which the failure's pointer already advertises.
				if (explain && d.fragment) rows.push(d.fragment.replace(/^/gm, '  ').replace(/\s+$/, ''));
			}
			return {
				status: 'fail',
				summary: `${duplicates.length} duplicated block(s) — extract the shared logic`,
				rows,
			};
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	},
};
