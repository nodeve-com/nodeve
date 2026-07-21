// The parsed schema as a lookup model — shared by the normalizer and the
// migrate scripts so neither carries its own copy of these derivations.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const atRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export type ClassDef = { annotations?: Record<string, string>; slots?: string[] };
export type SlotDef = { range?: string; pattern?: string };

export const schema = parse(readFileSync(atRoot('linkml/nodeve.yaml'), 'utf8'));
const shared = parse(readFileSync(atRoot('linkml/nodeve-slots.yaml'), 'utf8'));
export const slotByName: Record<string, SlotDef> = { ...shared.slots, ...schema.slots };
export const classByName: Record<string, ClassDef> = schema.classes;
export const classByTable: Record<string, string> = Object.fromEntries(
	Object.entries(classByName).flatMap(([name, c]) =>
		c.annotations?.sql_table ? [[c.annotations.sql_table, name]] : [],
	),
);

/** node path segments are kebab; sql_table is snake (quantity_kind → quantity-kind) */
export const seg = (table: string) => table.replaceAll('_', '-');

/** a slot's FK target table, when it ranges a table-backed class */
export const fkTable = (slot: string): string | undefined => {
	const range = slotByName[slot]?.range;
	return range ? classByName[range]?.annotations?.sql_table : undefined;
};

// the slug grammar comes off the slug SLOT — the schema owns it, never a TS copy
const slugPattern = slotByName.slug?.pattern;
if (!slugPattern) throw new Error('nodeve-slots.yaml: slug slot has no pattern');
export const SLUG = new RegExp(slugPattern);
