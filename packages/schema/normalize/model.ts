// The parsed schema as a lookup model — shared by the normalizer and the
// migrate scripts so neither carries its own copy of these derivations.
import { abs, readYaml } from '../src/io.ts';

export type ClassDef = {
	title?: string;
	annotations?: Record<string, string>;
	slots?: string[];
	attributes?: Record<string, SlotDef>;
};
export type SlotDef = {
	range?: string;
	pattern?: string;
	multivalued?: boolean;
	inlined_as_list?: boolean;
	title?: string;
	description?: string;
	// translations ride the slot: value.<field ∈ {title,lede,body}>.<lang> → Content
	annotations?: { camel?: string; i18n?: { value?: Record<string, Record<string, string>> } };
};

type Schema = {
	imports?: string[];
	classes?: Record<string, ClassDef>;
	slots?: Record<string, SlotDef>;
};

const loadSchema = (name: string, seen = new Set<string>()): Schema => {
	if (seen.has(name) || name.includes(':')) return {};
	seen.add(name);
	const source: Schema = readYaml(abs(`linkml/${name}.yaml`));
	const imports = (source.imports ?? []).map((dependency) => loadSchema(dependency, seen));
	return {
		...source,
		classes: Object.assign({}, ...imports.map(({ classes }) => classes), source.classes),
		slots: Object.assign({}, ...imports.map(({ slots }) => slots), source.slots),
	};
};

export const schema = loadSchema('nodeve');
export const slotByName: Record<string, SlotDef> = schema.slots ?? {};
export const classByName: Record<string, ClassDef> = schema.classes ?? {};
export const classByTable: Record<string, string> = Object.fromEntries(
	Object.entries(classByName).flatMap(([name, c]) =>
		c.annotations?.sql_table ? [[c.annotations.sql_table, name]] : [],
	),
);

/** node path segments are kebab; sql_table is snake (quantity_kind → quantity-kind) */
export const seg = (table: string) => table.replaceAll('_', '-');

/** a class's authored key trail — keyed_by as an ordered slot list. One entry
 * = a keyed child map; several = stacked map levels assembling one row. */
export const keysOf = (className: string): string[] =>
	(classByName[className]?.annotations?.keyed_by ?? '').split(' ').filter(Boolean);

/** which slot of `parentClass` owns rows of `childClass`. A declared owned slot
 * ranging it wins; else a universal about-attached facet (Content) attaches to
 * ANY node via its own `about` FK and buckets under the global multivalued slot
 * ranging it — no per-parent slot needed. undefined ⇒ this parent can't own it. */
export const ownerSlotFor = (parentClass: string, childClass: string): string | undefined => {
	const owned = (classByName[parentClass]?.slots ?? []).find(
		(s) => slotByName[s]?.range === childClass,
	);
	if (owned) return owned;
	const aboutAttached = classByName[childClass]?.slots?.some(
		(s) => s === 'about' && slotByName[s]?.range === 'Node',
	);
	if (!aboutAttached) return undefined;
	return Object.keys(slotByName).find(
		(s) => slotByName[s]?.range === childClass && slotByName[s]?.multivalued,
	);
};

/** a slot's FK target table, when it ranges a table-backed class */
export const fkTable = (slot: string): string | undefined => {
	const range = slotByName[slot]?.range;
	return range ? classByName[range]?.annotations?.sql_table : undefined;
};

// the slug grammar comes off the slug SLOT — the schema owns it, never a TS copy
const slugPattern = slotByName.slug?.pattern;
if (!slugPattern) throw new Error('nodeve schema: slug slot has no pattern');
export const SLUG = new RegExp(slugPattern);
