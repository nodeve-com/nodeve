// Guard: NO hand-authored object shapes on the runtime TS surface. `src/` (minus `src/generated/` and
// the `src/scribe/` YAML→JSON tool, which is build tooling like `kit/`, not runtime glue) is glue over
// the generated projection — it may IMPORT concept types and DERIVE from them, never re-author a shape. An `interface X { … }` or a `type X = { a: …; b: … }` in `src/*.ts` is a second source of
// truth that drifts silently from the YAML concepts (`grimoire-no-ts-spec-grammar`). `CatalogDevice`,
// `LinkedRegister`, `SiteSensor`, `Vocab`, `CascadeEntry`, `ResolvedDevice` were exactly this — slop.
//
// FORBIDDEN (in non-generated src): `interface` declarations; `type` aliases whose body introduces a
// named-member object literal (`{ foo: … }`), including inside `&`/`|`/arrays/generics.
// ALLOWED: derivations that name NO fresh members — indexed access (`ConceptTypes['x']`), `Pick`/`Omit`/
// `Required`/`NonNullable`/`ReturnType`/`Static`/`Camelize`, unions of those, `Record<…>`, primitives,
// and pure index-signature literals (`{ [k: string]: unknown }` — Record spelled out, no member names).
// Run standalone: `node scripts/guard-authored-shapes.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { GENERATED_DIR, SRC_DIR, tsFiles } from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

/** Build-tooling subtree that lives under `src/` for the dist layout but is NOT runtime glue — the
 *  YAML→JSON scribe, held to `kit/`'s rules (its own tool), not the concept-projection rule here. */
const SCRIBE_DIR = join(SRC_DIR, 'scribe');

/** A type-literal that NAMES members — `{ foo: T }`. Pure index signatures (`{ [k: string]: unknown }`)
 *  are Record spelled out and carry no member names, so they don't re-author a shape. */
const namesMembers = (node: ts.TypeLiteralNode): boolean =>
	node.members.some((m) => ts.isPropertySignature(m) || ts.isMethodSignature(m));

runGuard(
	{
		header: (n) => `\n✖ ${n} hand-authored object shape(s) on the runtime TS surface (src/):\n`,
		hint: `
Runtime src glues over the generated projection — it IMPORTS concept types and DERIVES from them, never
re-authors a shape. Replace the interface/type-literal with the generated type (import from src/generated/)
or a derivation of it (Pick/Omit/&/indexed access). Missing shape? Fix the YAML concept + codegen, never
hand-write it here. See docs/typebox-vs-zod.md and the grimoire-no-ts-spec-grammar rule.
`,
	},
	(fail) => {
		for (const rel of tsFiles(SRC_DIR, (path) => path === GENERATED_DIR || path === SCRIBE_DIR)) {
			const src = ts.createSourceFile(
				rel,
				readFileSync(join(SRC_DIR, rel), 'utf8'),
				ts.ScriptTarget.Latest,
				true,
			);
			const at = (node: ts.Node): number =>
				src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
			const walk = (node: ts.Node): void => {
				if (ts.isInterfaceDeclaration(node)) {
					fail(`${rel}:${at(node)}  —  interface ${node.name.text}`);
				} else if (ts.isTypeAliasDeclaration(node)) {
					let named: ts.TypeLiteralNode | null = null;
					const scan = (t: ts.Node): void => {
						if (ts.isTypeLiteralNode(t) && namesMembers(t)) named ??= t;
						ts.forEachChild(t, scan);
					};
					scan(node.type);
					if (named) fail(`${rel}:${at(node)}  —  type ${node.name.text} = { … }`);
				}
				ts.forEachChild(node, walk);
			};
			walk(src);
		}
		return '✓ runtime TS surface authors no object shapes';
	},
);
