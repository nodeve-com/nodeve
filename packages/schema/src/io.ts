// THE disk + serialization boundary for @nodeve/schema. Every read, write,
// listing, path resolution, AND every yaml/json parse or stringify goes through
// here — no other module imports node:fs or reaches for parse/stringify. `abs`
// resolves a package-root-relative path (data/x, linkml/y.yaml) against the
// package root — this file lives one dir down, in src/. Read helpers parse on
// the way in, serialize helpers stringify on the way out, so callers never pair
// readFileSync with parse or hand-roll an indent. yaml-style.ts owns the
// deterministic collection restyle; it builds on `serializeYaml` here rather
// than reaching for its own stringify. Ready paths (absolute, or a user-typed
// cwd-relative arg) pass straight to fs — only `abs` reroots.
import {
	readFileSync,
	writeFileSync,
	readdirSync,
	mkdirSync,
	existsSync,
	statSync,
	globSync,
	type Dirent,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parse, parseDocument, stringify, Document, type Node } from 'yaml';

/** an authored/parsed yaml document — a bag of string-keyed values */
export type Doc = Record<string, unknown>;

/** package-root-relative path → absolute (this file sits in src/, one dir down) */
export const abs = (rel: string): string => fileURLToPath(new URL(`../${rel}`, import.meta.url));

/** raw utf8 text of a ready path */
export const read = (path: string): string => readFileSync(path, 'utf8');

/** parsed yaml of a ready path; caller states the shape (defaults to unknown) */
export const readYaml = <T = unknown>(path: string): T => parse(read(path)) as T;

/** comment-preserving yaml Document from source text */
export const parseDoc = (source: string): Document => parseDocument(source);

/** comment-preserving yaml Document of a ready path */
export const readDoc = (path: string): Document => parseDoc(read(path));

/** ready paths → raw source text + comment-preserving doc, keyed by path. The
 * batch load a format/rewrite gate opens with: source stays raw for drift
 * diffing; `fix` is an optional pre-parse text repair (e.g. quoting a bare `*`
 * the loader would otherwise error on) applied only on the way to the doc. */
export const loadDocs = (
	paths: string[],
	fix: (source: string) => string = (s) => s,
): Map<string, { source: string; doc: Document }> =>
	new Map(
		paths.map((path) => {
			const source = read(path);
			return [path, { source, doc: parseDoc(fix(source)) }];
		}),
	);

/** value, Document, or node → yaml text with lines never wrapped. The raw
 * serializer — yaml-style.ts layers the deterministic restyle over this. */
export const serializeYaml = (value: unknown): string =>
	value instanceof Document
		? value.toString({ lineWidth: 0 })
		: stringify(value as Node, { lineWidth: 0 });

/** value → pretty json text (tab indent by default) */
export const dumpJson = (value: unknown, indent: string | number = '\t'): string =>
	JSON.stringify(value, null, indent);

export const exists = (path: string): boolean => existsSync(path);
export const isDir = (path: string): boolean => statSync(path).isDirectory();
export const dirents = (path: string): Dirent[] => readdirSync(path, { withFileTypes: true });

/** sorted *.yaml basenames in a directory */
export const yamlNames = (path: string): string[] =>
	readdirSync(path)
		.filter((f) => f.endsWith('.yaml'))
		.sort();

/** absolute paths of files matching a package-root-relative glob */
export const glob = (pattern: string): string[] => globSync(pattern, { cwd: abs('.') }).map(abs);

/** write text, minting the parent dir */
export function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}
