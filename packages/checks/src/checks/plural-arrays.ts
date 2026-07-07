/**
 * Commit gate: flag a count-plural variable name bound to a keyed collection —
 * a name that promises a list but holds a map/object. Flags ONLY when the
 * binding provably is NOT an array, from its type annotation or initializer:
 *
 *   const users = {}                       object literal
 *   const users: Record<string, User>      Record / index-signature type
 *   const users = new Map()                 Map / WeakMap
 *   const users = Object.fromEntries(...)   object builder
 *
 * A Set is deliberately NOT flagged: it's array-like (ordered, iterable, spreads
 * to an array), so a plural name over it reads fine. A plural bound to an array
 * literal, a `.map()`/`.filter()` chain, a call whose shape we can't see, or
 * nothing at all is likewise left alone — same "flag only what it can prove"
 * stance as `reshape`. Intentional maps read their intent in the name
 * (`usersById`, `userMap`, `nameToId`), which `pluralize` already scores singular
 * and the name-hint guard covers besides.
 */
import pluralize from 'pluralize';
import ts from 'typescript';
import { forEachTsNode, unwrap } from '../lib/ast.js';
import { locationRows } from '../lib/report.js';
import { type Check } from '../lib/runner.js';

/** Constructors whose instances are keyed collections, not arrays. */
const MAP_CTORS = new Set(['Map', 'WeakMap']);
/** Type-reference names that denote a keyed collection, not an array. */
const MAP_TYPES = new Set(['Record', 'Map', 'WeakMap', 'Dictionary']);
/** Calls that materialize an object/map rather than an array. */
const MAP_BUILDERS = new Set(['Object.fromEntries', 'Object.groupBy', 'Map.groupBy']);

/**
 * Names that carry their keyed-collection intent, so a plural stem is expected:
 * `usersById`, `userMap`, `tagSet`, `nameLookup`, `idIndex`, `nameToFiles`. These
 * read as maps by construction — never flag them.
 */
const MAP_NAME_HINT =
	/(?:By[A-Z]\w*|To[A-Z]\w*|Map|Set|Dict|Dictionary|Lookup|Index|Table|Registry|Cache)$/;

/** Dotted name of a call/new callee (`Object.fromEntries`, `Map`), or ''. */
function calleeName(expr: ts.Expression): string {
	if (ts.isIdentifier(expr)) return expr.text;
	if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression))
		return `${expr.expression.text}.${expr.name.text}`;
	return '';
}

/** A keyed-collection reason from the declared TYPE, or null if not provably one. */
function fromType(type: ts.TypeNode): string | null {
	// `{ [k: string]: V }` / `{ a: 1 }` — object type (index signature = map-like).
	if (ts.isTypeLiteralNode(type)) return 'object type';
	if (ts.isTypeReferenceNode(type)) {
		const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text;
		if (MAP_TYPES.has(name)) return `${name}<…>`;
	}
	return null;
}

/** A keyed-collection reason from the INITIALIZER, or null if not provably one. */
function fromInit(init: ts.Expression): string | null {
	const expr = unwrap(init);
	if (ts.isObjectLiteralExpression(expr)) return 'object literal';
	if (ts.isNewExpression(expr) && MAP_CTORS.has(calleeName(expr.expression)))
		return `new ${calleeName(expr.expression)}()`;
	if (ts.isCallExpression(expr) && MAP_BUILDERS.has(calleeName(expr.expression)))
		return calleeName(expr.expression);
	return null;
}

/**
 * True when `name` reads as a count-plural: forced by config, else `pluralize`'s
 * verdict minus the config suppressions and the map-name hints. A single word or
 * a non-count `-s` noun (`status`, `data`) scores false and is left alone.
 */
function isPluralName(name: string, plural: Set<string>, singular: Set<string>): boolean {
	if (plural.has(name)) return true;
	if (singular.has(name)) return false;
	if (MAP_NAME_HINT.test(name)) return false;
	return pluralize.isPlural(name) && pluralize.singular(name) !== name;
}

type Finding = { rel: string; line: number; name: string; reason: string };

export const pluralArrays: Check<'pluralArrays'> = {
	name: 'plural-arrays',
	section: 'pluralArrays',
	explain: `A count-plural name (\`users\`, \`tags\`) promises an array; binding it to a
map/object makes every reader guess the shape. Rename to say what it holds —
\`usersById\`, \`userMap\`, \`nameToId\`, \`userCount\` — or, if it really is a list, hold an
array. \`pluralize\` decides what counts as plural: add a domain word it misreads to
\`pluralArrays.plural\` (force plural) or \`pluralArrays.singular\` (never plural). A
confirmed intentional binding goes in \`pluralArrays.allowlist\` as \`relPath::name\`.
--warn downgrades this to report-only.`,

	run({ root, cfg, paths, allowlist }) {
		const plural = new Set(cfg.plural);
		const singular = new Set(cfg.singular);
		const findings: Finding[] = [];

		forEachTsNode(root, cfg.globs, paths, (node, rel, src) => {
			if (
				!ts.isVariableDeclaration(node) ||
				!ts.isIdentifier(node.name) ||
				!isPluralName(node.name.text, plural, singular)
			)
				return;
			// The type annotation is the stronger signal; fall back to the initializer.
			const reason = node.type
				? fromType(node.type)
				: node.initializer
					? fromInit(node.initializer)
					: null;
			const key = `${rel}::${node.name.text}`;
			if (reason && !allowlist.has(key)) {
				const { line } = src.getLineAndCharacterOfPosition(node.name.getStart());
				findings.push({ rel, line: line + 1, name: node.name.text, reason });
			}
		});

		if (findings.length === 0) return { status: 'pass', summary: 'clean' };

		return {
			status: 'fail',
			summary: `${findings.length} plural name(s) bound to a map/object instead of an array`,
			rows: locationRows(findings, (f) => f.name, (f) => f.reason),
		};
	},
};
