// Guard: NO snake_case on the generated TS surface. `src/generated/` is the npm-facing projection —
// type names, schema consts, data `export default`, AND every object KEY are camel/Pascal wall-to-wall
// (docs/typebox-vs-zod.md). Snake belongs to the YAML wire contract and the JSON emits; a snake KEY in a
// `.ts` emit is a generator bug, never style. `ConceptTypes['solar_array']` is exactly the shape this
// catches — a slug leaking through as an object key instead of being camelized at the emit.
//
// Flags NAME positions only — declaration identifiers, object-literal keys, interface/type members,
// import/export specifiers. String-literal VALUES (slugs `foxess_h3`, wire labels `AC_OUT_V`, IRIs
// `ashrae_34`) are data and stay snake; module specifiers (`./features/ac_line.ts`) mirror the snake
// source tree and are paths, not code. Run standalone: `node scripts/guard-generated-camel.ts`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { runGuard } from './guard-report.ts';

const GENERATED_DIR = fileURLToPath(new URL('../src/generated', import.meta.url));

/** Every `.ts` under `src/generated`, recursively, as paths relative to it. */
function generatedFiles(dir: string): string[] {
	return readdirSync(dir)
		.flatMap((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) return generatedFiles(path);
			return path.endsWith('.ts') ? [relative(GENERATED_DIR, path)] : [];
		})
		.sort();
}

/** A name that carries an internal `_` between word chars — snake. Leading/trailing `_` (reserved-name
 *  suffix like `Type_`) and SCREAMING_CASE aren't the target; only lower/mixed snake identifiers are. */
const isSnake = (name: string): boolean => /[a-z0-9]_[a-z0-9]/.test(name);

/** The identifier/string node that names a declaration, key, or member — the positions a snake token
 *  is a bug in. Returns null for value/reference positions (string values, module specifiers, `.member`
 *  reads), which may legitimately be snake. */
function nameNode(node: ts.Node): ts.Identifier | ts.StringLiteralLike | ts.NumericLiteral | null {
	const p = node.parent;
	if (!p) return null;
	const named =
		ts.isPropertyAssignment(p) ||
		ts.isPropertySignature(p) ||
		ts.isMethodSignature(p) ||
		ts.isShorthandPropertyAssignment(p) ||
		ts.isEnumMember(p) ||
		ts.isVariableDeclaration(p) ||
		ts.isFunctionDeclaration(p) ||
		ts.isTypeAliasDeclaration(p) ||
		ts.isInterfaceDeclaration(p) ||
		ts.isImportSpecifier(p) ||
		ts.isExportSpecifier(p);
	if (!named || (p as { name?: ts.Node }).name !== node) return null;
	if (!(ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))) return null;
	// `x-key-map` IS the snake→camel alias projection — its keys carry the snake wire names by design.
	if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.parent)) {
		const owner = p.parent.parent;
		if (ts.isPropertyAssignment(owner) && keyText(owner.name) === 'x-key-map') return null;
	}
	return node;
}

/** The literal text of a property key node (identifier or quoted string). */
function keyText(name: ts.PropertyName): string {
	return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
		? name.text
		: '';
}

runGuard(
	{
		header: (n) => `\n✖ ${n} snake_case name(s) on the generated TS surface (src/generated/):\n`,
		hint: `
The generated TS is camel/Pascal wall-to-wall — type, schema const, data default, AND every object key.
Snake lives in the YAML source and the JSON emits only. Fix the EMITTER (kit/emit-*.ts) to camelize the
key before it writes the file, then regenerate — do not hand-edit src/generated/. See docs/typebox-vs-zod.md.
`,
	},
	(fail) => {
		for (const rel of generatedFiles(GENERATED_DIR)) {
			const src = ts.createSourceFile(
				rel,
				readFileSync(join(GENERATED_DIR, rel), 'utf8'),
				ts.ScriptTarget.Latest,
				true,
			);
			const walk = (node: ts.Node): void => {
				const named = nameNode(node);
				if (named) {
					const text = ts.isIdentifier(named) ? named.text : named.getText(src).slice(1, -1);
					if (isSnake(text)) {
						const { line } = src.getLineAndCharacterOfPosition(named.getStart(src));
						fail(`${rel}:${line + 1}  —  ${text}`);
					}
				}
				ts.forEachChild(node, walk);
			};
			walk(src);
		}
		return '✓ generated TS surface is snake-free';
	},
);
