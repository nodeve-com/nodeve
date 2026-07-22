// Semantic canonicalize pass for authored data yaml: a mis-authored relative-
// band key (fraction_lower/upper in a valued_range payload) is corrected to its
// canonical spelling (margin_lower/upper), so the normalizer
// (valued-range-expand.ts) only sees canonical band names. Schema sorts live in
// format-schema.ts; collection style in io.dumpYaml. Pure doc mutation — no I/O.
import { visit, isMap, type Document, type Scalar, type YAMLMap } from 'yaml';

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
