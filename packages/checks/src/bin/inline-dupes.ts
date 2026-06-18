#!/usr/bin/env node
/**
 * Commit gate: flag a top-level name (non-exported const or function) that
 * appears in 2+ tracked source files — a sign it should live in a shared
 * package and be imported instead.
 *
 * BLOCKS by default: any non-allowlisted finding exits 1. Clear by extracting
 * the name to a package, or — for a confirmed false positive — adding it to
 * `inlineDupes.allowlist` with a WHY comment. `--warn` downgrades to report-only.
 *
 * Scope: `inlineDupes.globs` (default `apps/*.ts`). Note this always scans the
 * full configured scope, not just staged files — a dupe is a relationship
 * between two files, so the second file landing must see the first.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { loadConfig, parseArgs } from '../lib/config.js';
import { gitFiles, repoRoot } from '../lib/repo.js';

const root = repoRoot();
const cfg = (await loadConfig(root)).inlineDupes;
const { warn, verbose } = parseArgs(process.argv.slice(2));
const ALLOWLIST = new Set(cfg.allowlist);

function sourceFiles(): string[] {
	return gitFiles(root, cfg.globs).filter((f) => !/\.(d|test|spec)\.ts$/.test(f));
}

/**
 * Non-exported top-level names in a source file: private `const` and
 * `function` declarations. Exported names (SvelteKit `load`, `actions`,
 * HTTP verbs, etc.) are skipped — they're legitimately repeated per route.
 */
function topLevelNames(absPath: string): string[] {
	const src = ts.createSourceFile(
		absPath,
		readFileSync(absPath, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
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

const nameToFiles = new Map<string, Set<string>>();

for (const rel of sourceFiles()) {
	const abs = join(root, rel);
	for (const name of topLevelNames(abs)) {
		if (ALLOWLIST.has(name)) continue;
		const files = nameToFiles.get(name) ?? new Set();
		files.add(rel);
		nameToFiles.set(name, files);
	}
}

const dupes = [...nameToFiles.entries()]
	.filter(([, files]) => files.size >= 2)
	.sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

if (dupes.length === 0) {
	if (verbose) console.log('inline-dupes: clean');
	process.exit(0);
}

console.log(
	`inline-dupes: ${dupes.length} name(s) declared in multiple files.\n` +
		`Extract to a shared package and import, or allowlist with a WHY comment:\n`,
);
for (const [name, files] of dupes) {
	console.log(`  ${name}  (${files.size} files)`);
	for (const file of files) console.log(`    ${file}`);
}

process.exit(warn ? 0 : 1);
