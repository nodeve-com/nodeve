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
import { parseSource } from './ast.js';

export type Kind = 'fn' | 'const' | 'class' | 'component';

/** A declared symbol's kind/signature/summary, before barrel context is attached. */
export type Decl = { kind: Kind; signature: string; summary: string };

export type ReExport = {
	exportedName: string;
	localName: string;
	module: string;
	typeOnly: boolean;
};

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

function fnSignature(options: {
	name: string;
	params: ts.NodeArray<ts.ParameterDeclaration>;
	returnType: ts.TypeNode | undefined;
	source: ts.SourceFile;
}): string {
	const { name, params, returnType, source } = options;
	const args = params.map((p) => p.getText(source).replace(/\s+/g, ' ')).join(', ');
	const ret = returnType ? `: ${returnType.getText(source).replace(/\s+/g, ' ')}` : '';
	return `${name}(${args})${ret}`;
}

function variableDeclarations(
	statement: ts.VariableStatement,
	source: ts.SourceFile,
): [string, Decl][] {
	const summary = jsDocSummary(statement);
	return statement.declarationList.declarations.flatMap((declaration) => {
		if (!ts.isIdentifier(declaration.name)) return [];
		const name = declaration.name.text;
		const init = declaration.initializer;
		if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
			return [
				[
					name,
					{
						kind: 'fn',
						signature: fnSignature({
							name,
							params: init.parameters,
							returnType: init.type,
							source,
						}),
						summary,
					},
				] as [string, Decl],
			];
		const type = declaration.type?.getText(source).replace(/\s+/g, ' ');
		return [[name, { kind: 'const', signature: `${name}${type ? `: ${type}` : ''}`, summary }]];
	});
}

function declarationEntries(statement: ts.Statement, source: ts.SourceFile): [string, Decl][] {
	if (ts.isFunctionDeclaration(statement) && statement.name) {
		const name = statement.name.text;
		return [
			[
				name,
				{
					kind: 'fn',
					signature: fnSignature({
						name,
						params: statement.parameters,
						returnType: statement.type,
						source,
					}),
					summary: jsDocSummary(statement),
				},
			],
		];
	}
	if (ts.isVariableStatement(statement)) return variableDeclarations(statement, source);
	if (!ts.isClassDeclaration(statement) || !statement.name) return [];
	const name = statement.name.text;
	return [[name, { kind: 'class', signature: name, summary: jsDocSummary(statement) }]];
}

/** Map every top-level declared name in a source file to its kind/signature/summary. */
export function declarationsOf(sourcePath: string): Map<string, Decl> {
	const out = new Map<string, Decl>();
	const source = parseSource(sourcePath);

	for (const statement of source.statements)
		for (const [name, declaration] of declarationEntries(statement, source))
			if (!out.has(name)) out.set(name, declaration); // first overload signature wins
	return out;
}

/** Resolve a barrel module specifier to an on-disk source path. */
export function resolveSource(barrelDir: string, spec: string): string | null {
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

/** Parse a barrel's `export { … } from './…'` declarations into re-export records. */
export function reExportsOf(barrelPath: string): ReExport[] {
	const source = parseSource(barrelPath);
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
