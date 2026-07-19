/**
 * Commit gate: flag a top-level definition name (const, function, type, or
 * interface) that appears in 2+ tracked source files — a sign it should live in
 * one shared module and be imported instead. Exported names count only when
 * `includeExported` is set (a library-only repo); otherwise private decls only.
 *
 * Scope: `inlineDupes.globs` (default `apps/`, `packages/`). Note this always
 * scans the full configured scope, not just staged files — a dupe is a
 * relationship between two files, so the second file landing must see the first.
 */
import { join } from 'node:path';
import ts from 'typescript';
import { type Check } from '../lib/runner.js';
import { parseSource } from '../lib/ast.js';
import { scopedTsSources } from '../lib/bin.js';

/**
 * Top-level definition names in a source file: `const`/`function` VALUE decls
 * and `type`/`interface` TYPE decls (a re-declared type — `Obj = Record<…>` in
 * three files — is a second source of truth exactly like a re-declared helper).
 * Exported names are skipped unless `includeExported` — an app repo legitimately
 * repeats exported route handlers (`load`, `actions`, `GET`) per route; a
 * library-only repo turns the flag on to catch exported dupes too. Re-exports
 * (`export { X } from './y'`) are ExportDeclarations, not declarations, so a
 * barrel re-exporting a name never counts as a second definition.
 */
function topLevelNames(absPath: string, includeExported: boolean): string[] {
	const src = parseSource(absPath);
	const out: string[] = [];
	for (const stmt of src.statements) {
		if (!includeExported) {
			const isExported =
				ts.canHaveModifiers(stmt) &&
				(ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
			if (isExported) continue;
		}

		if (ts.isFunctionDeclaration(stmt) && stmt.name) out.push(stmt.name.text);
		else if (ts.isVariableStatement(stmt)) out.push(...variableNames(stmt));
		else if (ts.isTypeAliasDeclaration(stmt)) out.push(stmt.name.text);
		else if (ts.isInterfaceDeclaration(stmt)) out.push(stmt.name.text);
	}
	return out;
}

function variableNames(statement: ts.VariableStatement): string[] {
	return statement.declarationList.declarations.flatMap((declaration) =>
		ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
	);
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

	run(gate) {
		const { root, allowlist, explain, cfg } = gate;
		const includeExported = cfg.includeExported ?? false;
		const nameToFiles = new Map<string, Set<string>>();

		// staged omitted → full scope (see header): a dupe needs both files, even if one isn't staged.
		for (const rel of scopedTsSources(gate)) {
			const abs = join(root, rel);
			for (const name of topLevelNames(abs, includeExported)) {
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

		// One row per duplicated name, then WHERE it's declared — the file list IS the finding
		// (you can't act on a name without its files), so it prints by default. Capped so a
		// name in dozens of files can't wall the output; --explain lifts the cap.
		const CAP = 6;
		const rows: string[] = [];
		for (const [name, files] of dupes) {
			rows.push(`${name}  (${files.size} files)`);
			const list = [...files];
			for (const file of explain ? list : list.slice(0, CAP)) rows.push(`  ${file}`);
			if (!explain && list.length > CAP) rows.push(`  … +${list.length - CAP} more (--explain)`);
		}
		return {
			status: 'fail',
			summary: `${dupes.length} name(s) declared in multiple files`,
			rows,
		};
	},
};
