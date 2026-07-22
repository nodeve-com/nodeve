// General-purpose yaml formatting, applied on every save. Deterministic
// collection style: a map/seq stays inline flow only if its one-line render
// fits the width budget AND holds no block child or comment; otherwise block.
// Bottom-up — a child forced block forces its parent block, since a flow
// collection cannot hold a block one. This is content-agnostic; domain/semantic
// passes (key sorting by kind, band-key canonicalize) live in the format gate. The width
// budget is the repo's ONE line-width — prettier's printWidth. Serialization
// stays in io.ts; this only sets node.flow, then hands off to serializeYaml.
import {
	visit,
	isPair,
	isCollection,
	Document,
	type Node,
	type Scalar,
	type YAMLMap,
	type YAMLSeq,
} from 'yaml';
import prettier from '@nodeve/config/prettier/base';
import { serializeYaml } from './io.ts';

const WIDTH = prettier.printWidth!;
type Coll = YAMLMap | YAMLSeq;
const hasComment = (n: unknown): boolean => {
	const c = n as { comment?: unknown; commentBefore?: unknown } | null;
	return Boolean(c?.comment || c?.commentBefore);
};

function restyle(doc: Document): void {
	const found: Array<{ node: Coll; depth: number; prefix: number }> = [];
	visit(doc, {
		Collection(_key, node, path) {
			const parent = path[path.length - 1] as Node;
			// column budget already spent before this collection opens: its own indent
			// plus the `key: ` (map value) or `- ` (seq item) that precedes it
			const prefix = isPair(parent) ? String((parent.key as Scalar).value).length + 2 : 2;
			found.push({ node: node as Coll, depth: path.filter(isCollection).length, prefix });
		},
	});
	found.sort((a, b) => b.depth - a.depth); // deepest first
	for (const { node, depth, prefix } of found) {
		const commented = node.items.some((it) =>
			isPair(it) ? hasComment(it.key) || hasComment(it.value) || hasComment(it) : hasComment(it),
		);
		const blockChild = node.items.some((it) => {
			const child = isPair(it) ? it.value : it;
			return isCollection(child) && child.flow === false;
		});
		if (commented || blockChild) {
			node.flow = false;
			continue;
		}
		node.flow = true;
		const width = depth * 2 + prefix + serializeYaml(node).trimEnd().length;
		node.flow = width <= WIDTH;
	}
}

/** value or yaml Document → deterministic yaml text: unwrapped lines +
 * content-agnostic collection restyle. Every yaml the package saves flows
 * through here, so a hand-authored file and a generated one look identical. */
export const dumpYaml = (value: unknown): string => {
	const doc = value instanceof Document ? value : new Document(value);
	restyle(doc);
	return serializeYaml(doc);
};
