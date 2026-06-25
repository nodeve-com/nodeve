/**
 * Commit gate: flag a top-level name (non-exported const or function) that
 * appears in 2+ tracked source files — a sign it should live in a shared
 * package and be imported instead.
 *
 * Scope: `inlineDupes.globs` (default `apps/`, `packages/`). Note this always
 * scans the full configured scope, not just staged files — a dupe is a
 * relationship between two files, so the second file landing must see the first.
 */
import { join } from 'node:path';
import ts from 'typescript';
import { type Check } from '../lib/runner.js';
import { parseSource } from '../lib/ast.js';
import { tsSources } from '../lib/bin.js';

/**
 * Non-exported top-level names in a source file: private `const` and
 * `function` declarations. Exported names (SvelteKit `load`, `actions`,
 * HTTP verbs, etc.) are skipped — they're legitimately repeated per route.
 */
function topLevelNames(absPath: string): string[] {
	const src = parseSource(absPath);
	const out: string[] = [];
	for (const stmt of src.statements) {
		const isExported =
			ts.canHaveModifiers(stmt) &&
			(ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
		if (isExported) continue;

		if (ts.isFunctionDeclaration(stmt) && stmt.name) {
			out.push(stmt.name.text);
		} else if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (ts.isIdentifier(d.name)) out.push(d.name.text);
			}
		}
	}
	return out;
}

export const inlineDupes: Check<'inlineDupes'> = {
	name: 'inline-dupes',
	section: 'inlineDupes',
	explain: `A top-level name declared in 2+ files should live in a shared package
and be imported instead. Clear it by:
  • a uniform SET of names recurring together (a shared prologue, the same
    handful of locals) → extract them into one shared module and give the
    bundle a TS type/interface, then import it (see lib/bin.ts#Gate);
  • a single helper duplicated → move it to a shared package and import;
  • a confirmed false positive → add the bare name to inlineDupes.allowlist
    with a WHY comment.
--warn downgrades this to report-only.`,

	run({ root, cfg, allowlist, explain }) {
		const nameToFiles = new Map<string, Set<string>>();

		// paths ignored: always scan full scope (see header) regardless of staged files.
		for (const rel of tsSources(root, cfg.globs)) {
			const abs = join(root, rel);
			for (const name of topLevelNames(abs)) {
				if (allowlist.has(name)) continue;
				const files = nameToFiles.get(name) ?? new Set();
				files.add(rel);
				nameToFiles.set(name, files);
			}
		}

		const dupes = [...nameToFiles.entries()]
			.filter(([, files]) => files.size >= 2)
			.sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

		if (dupes.length === 0) return { status: 'pass', summary: 'clean' };

		// One row per duplicated name + its file count; the per-name file list is the
		// bulk (a 30-name repo = hundreds of paths), so it only expands under
		// --explain, which the failure's pointer advertises.
		const rows: string[] = [];
		for (const [name, files] of dupes) {
			rows.push(`${name}  (${files.size} files)`);
			if (explain) for (const file of files) rows.push(`  ${file}`);
		}
		return {
			status: 'fail',
			summary: `${dupes.length} name(s) declared in multiple files`,
			rows,
		};
	},
};
