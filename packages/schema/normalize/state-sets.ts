// State sets projected from the SCHEMA, not from an authored tree — an enum
// marked `annotations: { state_set: true }` IS the vocabulary, and these are its
// storage rows. The enum keeps validating a decode before the insert; the rows
// give a State something to FK, so the two can never disagree about which
// values exist. Same deal as normalize/properties.ts, and gated the same way
// (`schemaRows`): identical in every tree, so only the package owning the
// schema emits them.
import { type EnumDef, enumByName, seg, type ValueDef } from './model.ts';

/** the authored `content:` block for a titled schema element — en from `title`
 * and `description`, every other language off `annotations.i18n.value` */
function content(def: EnumDef | ValueDef): Record<string, Record<string, string>> {
	const i18n = def.annotations?.i18n?.value ?? {};
	const en: Record<string, string> = { title: def.title ?? '' };
	if (def.description !== undefined) en.lede = def.description;

	const out: Record<string, Record<string, string>> = { en };
	for (const [field, byLang] of Object.entries(i18n))
		for (const [lang, text] of Object.entries(byLang)) (out[lang] ??= {})[field] = text;
	return out;
}

// `meaning` is a plain exact match; the SKOS mapping slots carry their own
// strength in their name. One ref per registry — `ref` is keyed by it.
const MAPPINGS = {
	exact_mappings: 'exact',
	close_mappings: 'close',
	related_mappings: 'related',
	narrow_mappings: 'narrow',
	broad_mappings: 'broad',
} as const;

/** a value's CURIEs → the authored `ref:` block, keyed by bare registry slug */
function refs(name: string, def: ValueDef): Record<string, Record<string, string>> {
	const curies: [string, string][] = def.meaning ? [[def.meaning, 'exact']] : [];
	for (const [slot, match] of Object.entries(MAPPINGS))
		for (const curie of def[slot as keyof typeof MAPPINGS] ?? []) curies.push([curie, match]);

	const out: Record<string, Record<string, string>> = {};
	for (const [curie, match] of curies) {
		const [registry, ...rest] = curie.split(':');
		const term = rest.join(':');
		if (!registry || !term) throw new Error(`state set value ${name}: ${curie} is not a CURIE`);
		if (out[registry])
			throw new Error(
				`state set value ${name}: two ${registry} refs, and ref is keyed by registry`,
			);
		out[registry] = { term, match };
	}
	return out;
}

/** every enum marked `state_set` → an authored-shaped doc, so the projection
 * takes the same normalizeDoc path an authored file would and mints its nodes,
 * ordinals, and Content the one way they are ever minted */
export function stateSetDocs(): { slug: string; doc: Record<string, unknown> }[] {
	return Object.entries(enumByName)
		.filter(([, def]) => def.annotations?.state_set)
		.map(([name, def]) => {
			const values = Object.entries(def.permissible_values ?? {});
			if (!values.length) throw new Error(`state set ${name}: no permissible values`);
			const optionBySlug: Record<string, unknown> = {};
			for (const [value, vdef] of values) {
				const own = (vdef ?? {}) as ValueDef;
				const ref = refs(`${name}.${value}`, own);
				optionBySlug[seg(value)] = {
					content: content(own),
					...(Object.keys(ref).length ? { ref } : {}),
				};
			}
			return {
				slug: seg(name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase()),
				doc: { content: content(def), state_option: optionBySlug },
			};
		});
}
