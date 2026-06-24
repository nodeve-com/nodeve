/**
 * Shared TypeScript parsing for the source-scanning checks. Several gates open a
 * file the same way — read it, parse with full position info, then walk the
 * top-level statements — which is itself the kind of cross-file clone the
 * `clones` and `inline-dupes` gates exist to flag. Centralized here so each
 * caller parses once and differs only in what it extracts.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Parse a source file into a full-AST `SourceFile` (positions kept, so callers can `getText`). */
export function parseSource(absPath: string): ts.SourceFile {
	return ts.createSourceFile(absPath, readFileSync(absPath, 'utf8'), ts.ScriptTarget.Latest, true);
}
