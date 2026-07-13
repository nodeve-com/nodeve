/**
 * Shared TypeScript parsing for the source-scanning checks. Several gates open a
 * file the same way — read it, parse with full position info, then walk the
 * top-level statements — which is itself the kind of cross-file clone the
 * `clones` and `inline-dupes` gates exist to flag. Centralized here so each
 * caller parses once and differs only in what it extracts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { scopedTsSources, type ScopedGate } from './bin.js';

/** Strip `!` and parens so `item.href!` / `(x)` read as the bare underlying expression. */
export function unwrap(node: ts.Expression): ts.Expression {
	let n = node;
	while (ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
	return n;
}

/** Parse a source file into a full-AST `SourceFile` (positions kept, so callers can `getText`). */
export function parseSource(absPath: string): ts.SourceFile {
	return ts.createSourceFile(absPath, readFileSync(absPath, 'utf8'), ts.ScriptTarget.Latest, true);
}

/**
 * Walk every in-scope TS source depth-first, calling `onNode` for each node with
 * its file's rel path and parsed `SourceFile`. Folds the read → parse → recursive
 * `forEachChild` scaffold that the node-scanning gates (`reshape`, `plural-arrays`)
 * would otherwise each re-roll — so a caller supplies only what it extracts.
 */
export function forEachTsNode(
	gate: ScopedGate,
	onNode: (node: ts.Node, rel: string, src: ts.SourceFile) => void,
	staged = false,
): void {
	for (const rel of scopedTsSources(gate, staged)) {
		const src = parseSource(join(gate.root, rel));
		const visit = (node: ts.Node): void => {
			onNode(node, rel, src);
			ts.forEachChild(node, visit);
		};
		visit(src);
	}
}
