// Authoring fixes for data yaml, two kinds. quoteBareStars is a PRE-parse text
// fix: bare `*` (an empty-anchor alias — a parse error the loader never yields a
// node for) is quoted to the literal string, so `*` need not be authored quoted.
// formatData is the POST-parse canonicalize: a mis-authored relative-band key
// (fraction_lower/upper in a valued_range payload) is corrected to its canonical
// spelling (margin_lower/upper), so the normalizer (valued-range-expand.ts) only
// sees canonical band names. Schema sorts live in format-schema.ts; collection
// style in io.dumpYaml. No I/O.
import { visit, isMap, type Document, type Scalar, type YAMLMap } from 'yaml';

/** authored data source → bare `*` quoted to the literal string, in key, value,
 * and seq-item position. Pre-parse because a bare `*` errors the loader and so
 * cannot be corrected on the parsed Document; a real `*name` alias is left be. */
export function quoteBareStars(source: string): string {
	return source
		.split('\n')
		.map(
			(line) =>
				line
					.replace(/^(\s*)\*(\s*:)/, '$1"*"$2') // key:        *: → "*":
					.replace(/([:-]\s+)\*(\s*(?:#.*)?)$/, '$1"*"$2'), // value/seq:  k: * / - *
		)
		.join('\n');
}

// mis-authored band key → canonical band key
const CANONICAL_BAND: Record<string, string> = {
	fraction_lower: 'margin_lower',
	fraction_upper: 'margin_upper',
};

/** data yaml → mis-authored valued_range band keys corrected to canonical, in place. */
export function formatData(doc: Document): void {
	visit(doc, {
		Pair(_key, pair) {
			if ((pair.key as Scalar)?.value !== 'valued_range' || !isMap(pair.value)) return;
			for (const p of (pair.value as YAMLMap).items) {
				const k = p.key as Scalar<string>;
				const canonical = CANONICAL_BAND[k.value];
				if (canonical) k.value = canonical;
			}
		},
	});
}
