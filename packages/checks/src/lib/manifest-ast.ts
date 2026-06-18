/**
 * Source-reading layer for the helper-manifest generator: turn a package's
 * `exports` map and the TS/Svelte files behind it into structured records. Pure
 * parsing — no config, no output formatting — so each piece (declaration
 * extraction, barrel resolution, doc-comment scraping) is independently testable
 * and the bin is left with orchestration + rendering.
 */
import { trimText } from '@nodeve/text/trim';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export type Kind = 'fn' | 'const' | 'class' | 'component';

/** A declared symbol's kind/signature/summary, before barrel context is attached. */
export type Decl = { kind: Kind; signature: string; summary: string };

export type ReExport = { exportedName: string; localName: string; module: string; typeOnly: boolean };

export type Barrel = { importPath: string; barrelPath: string };

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
export function moduleDocOf(sourcePath: string): string {
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
export function declarationsOf(sourcePath: string): Map<string, Decl> {
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
export function resolveSource(barrelDir: string, spec: string): string | null {
	const base = join(barrelDir, spec);
	const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')];
	return candidates.find((c) => existsSync(c)) ?? null;
}

/** Parse a barrel's `export { … } from './…'` declarations into re-export records. */
export function reExportsOf(barrelPath: string): ReExport[] {
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
export function barrelsOf(pkgDir: string): Barrel[] {
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
