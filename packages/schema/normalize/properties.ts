// Rows projected from the SCHEMA, not from an authored tree — every slot with a
// user-facing title becomes a Property node so its form label can be localized.
// Identical in every tree, so only the package owning the schema emits them
// (normalize/catalog.ts gates on `schemaRows`); a downstream bundle that
// re-emitted them would collide on the PK the moment it concatenated.
import type { TableRow } from '../src/load.ts';
import { seg, type SlotDef, slotByName } from './model.ts';

/** one slot's Content rows, one per language. EVERYTHING is read from the schema
 * — no data/ sidecar. en Content: `title` ← slot `title`, `lede` ← slot
 * `description`. Every translation and any en `body` rides
 * `annotations.i18n.value.<field ∈ {title,lede,body}>.<lang>` on the slot. */
function propertyContents(node: string, def: SlotDef): Record<string, unknown>[] {
	const i18n = def.annotations?.i18n?.value ?? {};
	const langs = new Set<string>(['en']); // en first, deterministic
	for (const byLang of Object.values(i18n)) for (const lang of Object.keys(byLang)) langs.add(lang);

	return [...langs].map((lang) => {
		const row: Record<string, unknown> = { node: `${node}/${lang}`, about: node, language: lang };
		if (lang === 'en') {
			row.title = def.title;
			if (def.description !== undefined) row.lede = def.description;
		} else {
			if (i18n.title?.[lang] !== undefined) row.title = i18n.title[lang];
			if (i18n.lede?.[lang] !== undefined) row.lede = i18n.lede[lang];
		}
		if (i18n.body?.[lang] !== undefined) row.body = i18n.body[lang];
		return row;
	});
}

/** the Property row-set and the Content it carries, plus every node path the two
 * mint. A title-less slot is structural and gets no row. The caller owns the
 * pass accumulators, so this stays pure. */
export function projectProperties(): {
	rows: TableRow[];
	contents: Record<string, unknown>[];
	paths: string[];
} {
	const rows: TableRow[] = [];
	const contents: Record<string, unknown>[] = [];
	const paths: string[] = [];
	for (const [name, def] of Object.entries(slotByName)) {
		if (!def.title) continue;
		const slug = seg(name);
		const node = `node:property/${slug}`;
		const own = propertyContents(node, def);
		paths.push(`property/${slug}`, ...own.map((c) => (c.node as string).replace(/^node:/, '')));
		contents.push(...own);
		rows.push({ node });
	}
	return { rows, contents, paths };
}
