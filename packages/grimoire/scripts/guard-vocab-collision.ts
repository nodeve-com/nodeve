// Guard: an ENUMERATION name is never re-used as an inline-literal field.
//
// The grimoire ethos is one-def-many-tools, and the global-field rule that follows: one property
// NAME means one thing everywhere. An enumeration (`interface_type`, `physical_layer`, … authored
// once under concepts/enumeration/<name>/) owns its name and IS its value set. A field keyed by that
// name is a REFERENCE to it — a feature cites `enums: [<name>]` and carries a bare `prop: { <name>: … }`
// whose body is labels/ui only. It must NEVER declare its own `enum` / `schema.enum` under that name:
// that inline form coins a second, unrelated value set masquerading as the enumeration — exactly the
// collision that once let an archetype grow a local `interface_type` (`modbus_tap`/`modbus_tcp`)
// shadowing the IANA-ifType enumeration (renamed to `ingest_kind`). This guard stops the next one.
//
// It walks every authored concept YAML (concepts/property, concepts/features, concepts/archetypes),
// finds each mapping KEY that is a known enumeration name, and fails when its subtree declares an
// inline enum (`enum:` list, or `schema: { enum: … }`) rather than merely referencing the enumeration.
// A field that genuinely needs a local literal set must be NAMED for what it is, not for an
// enumeration. Run standalone: `node scripts/guard-vocab-collision.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { yamlFiles } from './yaml-files.ts';
import { CONCEPTS, enumerationDirNames } from '../src/concept-sources.ts';

const SCAN_DIRS = [join(CONCEPTS, 'property'), join(CONCEPTS, 'features'), join(CONCEPTS, 'archetypes')];

const enumDirs = enumerationDirNames();

/** True when a node declares an inline literal value set: a bare `enum:` list or `schema.enum`. */
function declaresInlineEnum(node: unknown): boolean {
	if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
	const record = node as Record<string, unknown>;
	if (Array.isArray(record.enum)) return true;
	const schema = record.schema as Record<string, unknown> | undefined;
	return Array.isArray(schema?.enum);
}

type Hit = { file: string; key: string };
const hits: Hit[] = [];

for (const dir of SCAN_DIRS) {
	for (const path of yamlFiles(dir)) {
		const rel = path.slice(CONCEPTS.length + 1);
		const doc = parseYaml(readFileSync(path, 'utf8')) as unknown;
		// Walk every mapping; a KEY that IS an enumeration name whose value coins an inline set collides.
		const visit = (node: unknown): void => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				node.forEach(visit);
				return;
			}
			for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
				if (enumDirs.has(key) && declaresInlineEnum(value)) hits.push({ file: rel, key });
				visit(value);
			}
		};
		visit(doc);
	}
}

if (hits.length === 0) {
	console.log('✓ no enumeration name re-used as an inline-literal field');
	process.exit(0);
}

console.error(`\n✖ enumeration name(s) re-used as an inline-literal field — a global-field-name collision:\n`);
for (const { file, key } of hits) console.error(`  ${key}  —  concepts/${file}`);
console.error(`
\`${[...new Set(hits.map((h) => h.key))].join('`, `')}\` is an enumeration authored under
concepts/enumeration/. A field keyed by an enumeration name must REFERENCE it (cite \`enums: [<name>]\`
+ a bare \`prop\` body), never declare its own \`enum\` / \`schema.enum\` under that name. If the field
is a genuinely different concept, NAME it for what it is (e.g. \`ingest_kind\`, not \`interface_type\`).
`);
process.exit(1);
