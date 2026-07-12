// Guard: an archetype assembles FEATURES ONLY — never a bare field or enum.
//
// The concept model (concepts/README.md) is layered property/enumeration -> features -> archetypes.
// An archetype is a CLASS: it assembles features (a `feature:` map), nests sibling classes as named
// slots (an `archetype:` map), and flattens same-layer siblings (`concept_settings.compose`) — and
// nothing else. A property or an enum reaches an archetype EXCLUSIVELY one
// layer down, inside a feature (a feature's `prop:` map, or a feature's own `enums:`). So a `prop:`
// map, a bare property key, or an `enums:` list sitting directly on an archetype is illegal — the
// field/enum must be re-homed onto a feature FIRST, then composed/referenced.
//
// This is exactly how slop slips in: promoting a feature-with-prop/enum into archetypes/ carries its
// `prop:`/`enums:` along (vedirect_medium.pid; the application_protocol enum on the modbus/usbhid/
// vedirect media). This guard walks every archetype YAML and fails on any top-level key outside the
// allowed set — which catches `prop:`, `enums:`, AND bare property keys in one sweep. Run standalone:
// `bun run guard:archetype-features` (root alias).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { yamlFiles } from './yaml-files.ts';

const CONCEPTS = join(import.meta.dir, '../concepts');
const ARCHETYPES_DIR = join(CONCEPTS, 'archetypes');

// The ONLY top-level keys an archetype may carry. Everything else — `prop:`, `enums:`, or a bare
// property key — is a field/enum that belongs on a feature, not on the class.
const ALLOWED = new Set(['identity', 'title', 'description', 'refs', 'concept_settings', 'feature', 'archetype']);

const violations: Array<{ file: string; key: string }> = [];

for (const path of yamlFiles(ARCHETYPES_DIR)) {
	const rel = path.slice(CONCEPTS.length + 1);
	const doc = parseYaml(readFileSync(path, 'utf8'));
	if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) continue;
	for (const key of Object.keys(doc as Record<string, unknown>)) {
		if (!ALLOWED.has(key)) violations.push({ file: rel, key });
	}
}

if (violations.length === 0) process.exit(0);

console.error(`\n✖ archetype(s) carrying a key that isn't a feature:\n`);
for (const { file, key } of violations) console.error(`  ${key}  —  ${file}`);
console.error(`
An archetype assembles FEATURES ONLY. The allowed top-level keys are:
  ${[...ALLOWED].join(' / ')}
A \`prop:\` map, a bare property key, or an \`enums:\` list is a field/enum — re-home it onto a
FEATURE first (a feature's \`prop:\` map, or a feature's own \`enums:\`), then reference/compose that
feature from the archetype. See concepts/README.md ("Archetype").
`);
process.exit(1);
