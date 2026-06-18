#!/usr/bin/env node
/**
 * Generate a single greppable index of the public helper surface of the
 * configured packages (`helperManifest.packages` → `helperManifest.output`).
 * Grep this file before adding a generic helper, instead of blind-sweeping
 * `packages/`. Deterministic — no LLM, no embeddings.
 *
 * Source of truth is each package's `exports` map — every subpath barrel, not
 * just the root one. For every value export we resolve the declaration's
 * signature + first JSDoc line, plus each module's top-level doc comment as a
 * one-line intro above its block. Type-only exports and Svelte component
 * internals are out of scope.
 *
 * No-op unless a repo lists packages. Run: `nodeve-build-helper-manifest`.
 */
import { trimText } from '@nodeve/text/trim';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { loadConfig } from '../lib/config.js';
import { repoRoot } from '../lib/repo.js';

const root = repoRoot();
const cfg = (await loadConfig(root)).helperManifest;

if (cfg.packages.length === 0) process.exit(0);

const OUTPUT = join(root, cfg.output);

type Kind = 'fn' | 'const' | 'class' | 'component';

type Entry = {
	importPath: string;
	file: string;
	srcPath: string;
	symbol: string;
	kind: Kind;
	signature: string;
	summary: string;
};

type Decl = Omit<Entry, 'importPath' | 'file' | 'srcPath' | 'symbol'>;

/** Leading JSDoc block of a node as a single capped line. */
function jsDocSummary(node: ts.Node): string {
	const docs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
	const comment = docs?.[docs.length - 1]?.comment;
	if (!comment) return '';
	const text = typeof comment === 'string' ? comment : comment.map((c) => c.text).join('');
	return trimText(text, { max: 120, ellipsis: '...' });
}

const moduleDocCache = new Map<string, string>();

/**
 * The file's top-level doc comment as a single capped line, or ''. Distinguished
 * from a declaration's own JSDoc by a blank-line gap or a leading import — TS only
 * attaches JSDoc to an adjacent declaration, so an orphaned top comment is module
 * intent worth surfacing once per file.
 */
function moduleDocOf(sourcePath: string): string {
	if (sourcePath.endsWith('.svelte')) return '';
	const cached = moduleDocCache.get(sourcePath);
	if (cached !== undefined) return cached;

	const text = readFileSync(sourcePath, 'utf8');
	const range = ts.getLeadingCommentRanges(text, 0)?.[0];
	let doc = '';
	if (range) {
		const after = text.slice(range.end);
		const rest = after.trimStart();
		const blankAfter = /^\n\s*\n/.test(after); // not adjacent to the next declaration
		const importFirst = rest.startsWith('import ') || rest.startsWith('import{');
		if (blankAfter || importFirst) {
			const body = text
				.slice(range.pos, range.end)
				.replace(/^\/\*\*?/, '')
				.replace(/\*\/\s*$/, '')
				.replace(/^[ \t]*\*[ \t]?/gm, '')
				.replace(/^[ \t]*\/\/[ \t]?/gm, '');
			doc = trimText(body, { max: 140, ellipsis: '...' });
		}
	}
	moduleDocCache.set(sourcePath, doc);
	return doc;
}

function fnSignature(
	name: string,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	returnType: ts.TypeNode | undefined,
	source: ts.SourceFile,
): string {
	const args = params.map((p) => p.getText(source).replace(/\s+/g, ' ')).join(', ');
	const ret = returnType ? `: ${returnType.getText(source).replace(/\s+/g, ' ')}` : '';
	return `${name}(${args})${ret}`;
}

/** Map every top-level declared name in a source file to its kind/signature/summary. */
function declarationsOf(sourcePath: string): Map<string, Decl> {
	const out = new Map<string, Decl>();
	const text = readFileSync(sourcePath, 'utf8');
	const source = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);

	for (const stmt of source.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name) {
			const name = stmt.name.text;
			if (out.has(name)) continue; // first overload signature wins
			out.set(name, {
				kind: 'fn',
				signature: fnSignature(name, stmt.parameters, stmt.type, source),
				summary: jsDocSummary(stmt),
			});
		} else if (ts.isVariableStatement(stmt)) {
			const summary = jsDocSummary(stmt);
			for (const decl of stmt.declarationList.declarations) {
				if (!ts.isIdentifier(decl.name)) continue;
				const name = decl.name.text;
				const init = decl.initializer;
				if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
					out.set(name, {
						kind: 'fn',
						signature: fnSignature(name, init.parameters, init.type, source),
						summary,
					});
				} else {
					const typeText = decl.type ? `: ${decl.type.getText(source).replace(/\s+/g, ' ')}` : '';
					out.set(name, { kind: 'const', signature: `${name}${typeText}`, summary });
				}
			}
		} else if (ts.isClassDeclaration(stmt) && stmt.name) {
			out.set(stmt.name.text, {
				kind: 'class',
				signature: stmt.name.text,
				summary: jsDocSummary(stmt),
			});
		}
	}
	return out;
}

/** Resolve a barrel module specifier to an on-disk source path. */
function resolveSource(barrelDir: string, spec: string): string | null {
	const base = join(barrelDir, spec);
	const candidates = [
		base,
		base.replace(/\.js$/, '.ts'),
		`${base}.ts`,
		`${base}.svelte`,
		join(base, 'index.ts'),
	];
	return candidates.find((c) => existsSync(c)) ?? null;
}

type ReExport = { exportedName: string; localName: string; module: string; typeOnly: boolean };

/** Parse a barrel's `export { … } from './…'` declarations into re-export records. */
function reExportsOf(barrelPath: string): ReExport[] {
	const text = readFileSync(barrelPath, 'utf8');
	const source = ts.createSourceFile(barrelPath, text, ts.ScriptTarget.Latest, true);
	const out: ReExport[] = [];

	for (const stmt of source.statements) {
		if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const module = stmt.moduleSpecifier.text;
		const clause = stmt.exportClause;
		if (!clause || !ts.isNamedExports(clause)) continue; // skip `export * from`
		for (const el of clause.elements) {
			out.push({
				exportedName: el.name.text,
				localName: el.propertyName?.text ?? el.name.text,
				module,
				typeOnly: stmt.isTypeOnly || el.isTypeOnly,
			});
		}
	}
	return out;
}

type Barrel = { importPath: string; barrelPath: string };

/** Resolve an `exports` target (string, or conditional object) to a single file path. */
function exportTarget(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		const pick = o.default ?? o.svelte ?? o.types;
		return typeof pick === 'string' ? pick : null;
	}
	return null;
}

/** Every subpath barrel a package publicly exposes via its `exports` map. */
function barrelsOf(pkgDir: string): Barrel[] {
	const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
		name: string;
		exports?: Record<string, unknown>;
	};
	const out: Barrel[] = [];
	for (const [key, value] of Object.entries(pkg.exports ?? {})) {
		if (key.includes('*')) continue; // wildcard pass-throughs aren't barrels
		const target = exportTarget(value);
		if (!target?.endsWith('.ts')) continue; // skip .css and the like
		out.push({
			importPath: pkg.name + (key === '.' ? '' : key.slice(1)),
			barrelPath: join(pkgDir, target),
		});
	}
	return out;
}

function collect(): Entry[] {
	const entries: Entry[] = [];
	const declCache = new Map<string, Map<string, Decl>>();
	const declsFor = (p: string) => {
		if (!declCache.has(p)) declCache.set(p, declarationsOf(p));
		return declCache.get(p)!;
	};

	for (const pkgRel of cfg.packages) {
		const pkgDir = join(root, pkgRel);
		for (const barrel of barrelsOf(pkgDir)) {
			if (!existsSync(barrel.barrelPath)) continue;
			const barrelDir = dirname(barrel.barrelPath);

			for (const re of reExportsOf(barrel.barrelPath)) {
				if (re.typeOnly) continue; // types are out of scope for v1
				const sourcePath = resolveSource(barrelDir, re.module);
				if (!sourcePath) continue;
				const file = relative(pkgDir, sourcePath);

				if (sourcePath.endsWith('.svelte')) {
					entries.push({
						importPath: barrel.importPath,
						file,
						srcPath: sourcePath,
						symbol: re.exportedName,
						kind: 'component',
						signature: re.exportedName,
						summary: '',
					});
					continue;
				}

				const decl = declsFor(sourcePath).get(re.localName);
				if (!decl) continue;
				entries.push({
					importPath: barrel.importPath,
					file,
					srcPath: sourcePath,
					symbol: re.exportedName,
					...decl,
				});
			}
		}
	}

	return entries.sort(
		(a, b) =>
			a.importPath.localeCompare(b.importPath) ||
			a.file.localeCompare(b.file) ||
			a.symbol.localeCompare(b.symbol),
	);
}

function render(entries: Entry[]): string {
	const packages = new Set(entries.map((e) => e.importPath.split('/').slice(0, 2).join('/')));
	const lines: string[] = [
		'# Helper manifest — public surface of the configured packages',
		'#',
		'# GENERATED by `nodeve-build-helper-manifest`. Do not edit.',
		'# Grep this file before adding a generic helper. One self-contained line per symbol:',
		'#   <import-path>  ·  <kind>  ·  <signature>  —  <summary>  [src/file]',
		"# A `#  src/file — …` line above a block is that module's top-level doc.",
		`# ${entries.length} symbols across ${packages.size} packages.`,
		'',
	];

	let importPath = '';
	let file = '';
	for (const e of entries) {
		if (e.importPath !== importPath) {
			importPath = e.importPath;
			file = '';
			lines.push(`## ${importPath}`);
		}
		if (e.file !== file) {
			file = e.file;
			const moduleDoc = moduleDocOf(e.srcPath);
			if (moduleDoc) lines.push(`#  ${file} — ${moduleDoc}`);
		}
		const summary = e.summary ? `  —  ${e.summary}` : '';
		lines.push(`${e.importPath}  ·  ${e.kind}  ·  ${e.signature}${summary}  [${e.file}]`);
	}
	lines.push('');
	return lines.join('\n');
}

const entries = collect();
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, render(entries));
console.log(`Wrote ${entries.length} symbols to ${relative(root, OUTPUT)}`);
