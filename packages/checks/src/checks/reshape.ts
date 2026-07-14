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
type Hit = { kind: Kind; keys: string };

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

function projectionKeys(param: ts.Identifier, props: ts.NodeArray<ts.ObjectLiteralElementLike>) {
	const keys: string[] = [];
	for (const prop of props) {
		if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) return null;
		const value = unwrap(prop.initializer);
		if (
			!ts.isPropertyAccessExpression(value) ||
			!ts.isIdentifier(value.expression) ||
			value.expression.text !== param.text ||
			value.name.text !== prop.name.text
		)
			return null;
		keys.push(prop.name.text);
	}
	return keys.sort().join(', ');
}

function passthroughKeys(
	param: ts.ObjectBindingPattern,
	props: ts.NodeArray<ts.ObjectLiteralElementLike>,
): string | null {
	const bound = new Set<string>();
	for (const element of param.elements) {
		if (
			element.dotDotDotToken ||
			element.propertyName ||
			element.initializer ||
			!ts.isIdentifier(element.name)
		)
			return null;
		bound.add(element.name.text);
	}
	const keys = props.map((prop) =>
		ts.isShorthandPropertyAssignment(prop) ? prop.name.text : null,
	);
	if (keys.some((key) => key === null)) return null;
	const names = keys as string[];
	return names.length === bound.size && names.every((key) => bound.has(key))
		? names.sort().join(', ')
		: null;
}

/** Classify a reshape callback, or null if it does real work. */
function classify(fn: ts.ArrowFunction | ts.FunctionExpression): Hit | null {
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
		const keys = projectionKeys(param, props);
		return keys === null ? null : { kind: 'projection', keys };
	}

	// ({ a, b }) => ({ a, b })  — destructure, rebuild the identical shorthand set
	if (ts.isObjectBindingPattern(param)) {
		const keys = passthroughKeys(param, props);
		return keys === null ? null : { kind: 'passthrough', keys };
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

	run(gate) {
		const { allowlist } = gate;
		const findings: Finding[] = [];

		forEachTsNode(
			gate,
			(node, rel, src) => {
				if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return;
				const hit = classify(node);
				if (hit && !allowlist.has(`${rel}::${hit.kind}::${hit.keys}`)) {
					const { line } = src.getLineAndCharacterOfPosition(node.getStart());
					findings.push({ rel, line: line + 1, kind: hit.kind, keys: hit.keys });
				}
			},
			true,
		);

		if (findings.length === 0) return { status: 'pass', summary: 'clean' };

		return {
			status: 'fail',
			summary: `${findings.length} reshape(s) reproduce the input shape (no-op / pick / clone)`,
			rows: locationRows(
				findings,
				(f) => f.kind,
				(f) => `{ ${f.keys} }`,
			),
		};
	},
};
