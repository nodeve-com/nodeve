/**
 * Commit gate: flag a callback that reshapes its input into a structurally
 * identical (or pick-equivalent) shape — i.e. a reshape that isn't the point.
 * Flags ONLY when the output provably mirrors the input:
 *
 *   x => x                       identity      (no-op map)
 *   x => ({ ...x })              spread-clone  (reinvents structuredClone)
 *   x => ({ a: x.a, b: x.b })    projection    (reinvents remeda.pick)
 *   ({ a, b }) => ({ a, b })     passthrough   (destructure-rebuild = pick / no-op)
 */
import ts from 'typescript';
import { forEachTsNode, unwrap } from '../lib/ast.js';
import { locationRows } from '../lib/report.js';
import { type Check } from '../lib/runner.js';

type Kind = 'identity' | 'spread-clone' | 'projection' | 'passthrough';

/** The single returned expression of a concise arrow or a `return`-only body. */
function returnExpr(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Expression | null {
	if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return unwrap(fn.body);
	const body = fn.body;
	if (!body || !ts.isBlock(body) || body.statements.length !== 1) return null;
	const [stmt] = body.statements;
	return ts.isReturnStatement(stmt) && stmt.expression ? unwrap(stmt.expression) : null;
}

/** True when `fn` is the callback argument of a `.map(...)` / `.flatMap(...)`. */
function isMapCallback(fn: ts.Node): boolean {
	const call = fn.parent;
	return (
		!!call &&
		ts.isCallExpression(call) &&
		call.arguments.includes(fn as ts.Expression) &&
		ts.isPropertyAccessExpression(call.expression) &&
		(call.expression.name.text === 'map' || call.expression.name.text === 'flatMap')
	);
}

/** Classify a reshape callback, or null if it does real work. */
function classify(
	fn: ts.ArrowFunction | ts.FunctionExpression,
): { kind: Kind; keys: string } | null {
	if (fn.parameters.length !== 1) return null; // (x, i) => ... uses the index — not a pure reshape
	const param = fn.parameters[0].name;
	const body = returnExpr(fn);
	if (!body) return null;

	// x => x — a no-op ONLY inside a map; elsewhere it's a legit typed-identity
	// helper or an API-required passthrough callback (`(content) => content`).
	if (ts.isIdentifier(param) && ts.isIdentifier(body) && body.text === param.text)
		return isMapCallback(fn) ? { kind: 'identity', keys: 'self' } : null;

	if (!ts.isObjectLiteralExpression(body) || body.properties.length === 0) return null;
	const props = body.properties;

	// x => ({ ...x })  — spread of the param, nothing else
	if (
		ts.isIdentifier(param) &&
		props.length === 1 &&
		ts.isSpreadAssignment(props[0]) &&
		ts.isIdentifier(props[0].expression) &&
		props[0].expression.text === param.text
	)
		return { kind: 'spread-clone', keys: '...' };

	// x => ({ a: x.a, b: x.b })  — every prop is `name: param.name`, same name
	if (ts.isIdentifier(param)) {
		const keys: string[] = [];
		for (const p of props) {
			if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) return null;
			const val = unwrap(p.initializer);
			if (
				!ts.isPropertyAccessExpression(val) ||
				!ts.isIdentifier(val.expression) ||
				val.expression.text !== param.text ||
				val.name.text !== p.name.text
			)
				return null;
			keys.push(p.name.text);
		}
		return { kind: 'projection', keys: keys.sort().join(', ') };
	}

	// ({ a, b }) => ({ a, b })  — destructure, rebuild the identical shorthand set
	if (ts.isObjectBindingPattern(param)) {
		const bound = new Set<string>();
		for (const el of param.elements) {
			// rename / default / rest changes meaning — not a pure passthrough
			if (el.dotDotDotToken || el.propertyName || el.initializer || !ts.isIdentifier(el.name))
				return null;
			bound.add(el.name.text);
		}
		const keys: string[] = [];
		for (const p of props) {
			if (!ts.isShorthandPropertyAssignment(p)) return null;
			keys.push(p.name.text);
		}
		if (keys.length !== bound.size || !keys.every((k) => bound.has(k))) return null;
		return { kind: 'passthrough', keys: keys.sort().join(', ') };
	}

	return null;
}

type Finding = { rel: string; line: number; kind: Kind; keys: string };

export const reshape: Check<'reshape'> = {
	name: 'reshape',
	section: 'reshape',
	explain: `These callbacks rebuild their input unchanged — a reshape that isn't the
point. Pass the value as-is, or use a pick/clone helper if narrowing is
genuinely the point. If a confirmed boundary needs the shape, allowlist it in
reshape.allowlist as \`relPath::kind::keys\`. A rename that only dodges the
match keeps the smell. --warn downgrades this to report-only.`,

	run({ root, cfg, paths, allowlist }) {
		const findings: Finding[] = [];

		forEachTsNode(root, cfg.globs, paths, (node, rel, src) => {
			if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return;
			const hit = classify(node);
			if (hit && !allowlist.has(`${rel}::${hit.kind}::${hit.keys}`)) {
				const { line } = src.getLineAndCharacterOfPosition(node.getStart());
				findings.push({ rel, line: line + 1, kind: hit.kind, keys: hit.keys });
			}
		});

		if (findings.length === 0) return { status: 'pass', summary: 'clean' };

		return {
			status: 'fail',
			summary: `${findings.length} reshape(s) reproduce the input shape (no-op / pick / clone)`,
			rows: locationRows(findings, (f) => f.kind, (f) => `{ ${f.keys} }`),
		};
	},
};
