// Guard: every feature PROP is backed by a property/enumeration definition, every feature ENUM by an enumeration.
//
// The concept model (concepts/README.md) is layered property/enumeration -> features -> archetypes. A
// feature is a FLAT grouping of backed props: "Each `prop:` key is property-backed & globally unique.
// Each `enums` value points to an `enumeration/<name>` directory." So the identity of a prop lives in
// `property/` (a single field) or `enumeration/` (a member used as a field), never in the feature — the
// feature only cites it. A `prop:` name with no `property/**/<slug>.yaml` or `enumeration/**/<slug>.yaml`,
// or an `enums:` value with no `enumeration/<value>/` directory, is a dangling citation.
//
// This guard walks every feature YAML, collects each `prop:` name (the map keys MINUS any slot — a prop
// whose overlay rebinds to another layer via `feature:`/`feature:`) and each enum value, and fails on
// any that the property layer doesn't back. `prop` must be a map; an array is a shape error. Run
// standalone: `node scripts/guard-feature-props.ts`.
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { yamlFiles } from './yaml-files.ts';
import { CONCEPTS, ENUMERATION_DIR, FEATURES_DIR, PROPERTY_DIR, enumerationDirNames } from '../src/concept-sources.ts';

// The property layer: the set of defined property slugs (basenames, globally unique) and the set of
// category directories (the `enums:` targets).
// A prop is backed by a `property/` field OR an `enumeration/` member used as a field (a
// quantity_kind kind bound via `feature: spec_block`) — the two layers share one flat slug space.
const propertySlugs = new Set(
	[...yamlFiles(PROPERTY_DIR), ...yamlFiles(ENUMERATION_DIR)].map((p) => p.slice(0, -'.yaml'.length).split('/').pop()!),
);
// An `enums:` value points to an `enumeration/<name>/` directory.
const enumCategories = enumerationDirNames();

/** Prop names a feature declares as property-backed — the `prop:` map keys that are OWN scalar fields.
 *  `prop` must be a MAP of `<name>: overlay`; an array is a shape error. Excluded (they aren't
 *  property-backed, they're overlays on a field another instruction introduced): a SLOT (overlay
 *  rebinds via `feature:`/`feature:`), and a name already produced by this def's `enums:`/`features:`. */
function featureProps(doc: unknown, rel: string): string[] {
	const record = (doc ?? {}) as Record<string, unknown>;
	const prop = record.prop;
	if (prop === undefined) return [];
	if (typeof prop !== 'object' || Array.isArray(prop)) {
		shapeErrors.push(rel);
		return [];
	}
	const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
	const introduced = new Set([...strList(record.enums), ...strList(record.features)]);
	const out: string[] = [];
	for (const [name, body] of Object.entries(prop as Record<string, unknown>)) {
		const overlay = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
		if (!('feature' in overlay) && !('feature' in overlay) && !introduced.has(name)) out.push(name);
	}
	return out;
}

/** Enum category names a feature cites. */
function featureEnums(doc: unknown): string[] {
	const enums = (doc as { enums?: unknown } | null)?.enums;
	return Array.isArray(enums) ? enums.filter((e): e is string => typeof e === 'string') : [];
}

const missingProps: Array<{ file: string; slug: string }> = [];
const missingEnums: Array<{ file: string; category: string }> = [];
const shapeErrors: string[] = [];

for (const path of yamlFiles(FEATURES_DIR)) {
	const rel = path.slice(CONCEPTS.length + 1);
	const doc = parseYaml(readFileSync(path, 'utf8'));
	for (const slug of featureProps(doc, rel)) {
		if (!propertySlugs.has(slug)) missingProps.push({ file: rel, slug });
	}
	for (const category of featureEnums(doc)) {
		if (!enumCategories.has(category)) missingEnums.push({ file: rel, category });
	}
}

if (missingProps.length === 0 && missingEnums.length === 0 && shapeErrors.length === 0) {
	process.exit(0);
}

if (shapeErrors.length > 0) {
	console.error(`\n✖ feature(s) whose \`prop\` is not a map:\n`);
	for (const file of shapeErrors) console.error(`  ${file}`);
	console.error(`
\`prop\` must be a MAP of \`<name>: overlay\`. Include a field unchanged with \`<name>: {}\`; a slot's
\`feature\`/\`feature\`, a title override or a constraint is that entry's overlay body.
`);
}

if (missingProps.length > 0) {
	console.error(`\n✖ feature prop(s) with no property/**/<slug>.yaml backing:\n`);
	for (const { file, slug } of missingProps) console.error(`  ${slug}  —  ${file}`);
}
if (missingEnums.length > 0) {
	console.error(`\n✖ feature enum(s) with no enumeration/<name>/ directory:\n`);
	for (const { file, category } of missingEnums) console.error(`  ${category}  —  ${file}`);
}
if (missingProps.length > 0 || missingEnums.length > 0) {
	console.error(`
A feature cites property identity; it never coins it. Define the missing prop under
concepts/property/<category>/<slug>.yaml (or the enum's enumeration directory), or — if the prop is
actually a slot onto another feature/feature — rebind it via that entry's \`feature:\`/\`feature:\` overlay.
`);
}
process.exit(1);
