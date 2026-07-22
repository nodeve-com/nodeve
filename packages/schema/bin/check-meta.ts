// Schema-metadata gate: every authored slot and enum MUST carry an external
// reference, and every slot, enum, and class MUST carry a title. The grimoire
// port dropped mappings that were already made upstream (HA values, wikidata); a
// missing reference is silent data loss, so it fails the build, not a review. No
// allowlist — a slot with no external concept is the exception the author states,
// not one this check invents. Offline + deterministic, so it belongs in the gate
// (unlike check-refs.ts, which is network). Reads the merged linkml/*.yaml.
import { glob, readYaml } from '../src/io.ts';

// `meaning` is the ultimate reference — one URI naming the concept exactly —
// checked first. Failing that, one close SKOS mapping (exact/close/related) also
// pins the concept. Narrow/broad only bound it, so two are required to triangulate.
const EXACT_KEYS = ['exact_mappings', 'close_mappings', 'related_mappings'] as const;
const WIDE_KEYS = ['narrow_mappings', 'broad_mappings'] as const;

type Def = Record<string, unknown>;
type SchemaDoc = {
	slots?: Record<string, Def>;
	enums?: Record<string, Def>;
	classes?: Record<string, Def>;
};

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const hasMapping = (d: Def) =>
	(typeof d.meaning === 'string' && d.meaning.trim() !== '') ||
	EXACT_KEYS.some((k) => len(d[k]) > 0) ||
	WIDE_KEYS.reduce((n, k) => n + len(d[k]), 0) >= 2;
const hasTitle = (d: Def) => typeof d.title === 'string' && d.title.trim() !== '';

// missing meta for one def, or '' if complete
const missingMeta = (def: Def, needsMapping: boolean) => {
	const missing: string[] = [];
	if (needsMapping && !hasMapping(def)) missing.push('mapping');
	if (!hasTitle(def)) missing.push('title');
	return missing.join(' + ');
};

// slots + enums: mapping AND title. classes: title only.
const scoped = (s: SchemaDoc) =>
	[
		['slot', s.slots, true],
		['enum', s.enums, true],
		['class', s.classes, false],
	] as const;

// violations for one file's slots/enums/classes
const scanFile = (rel: string, schema: SchemaDoc) =>
	scoped(schema).flatMap(([kind, defs, needsMapping]) =>
		Object.entries(defs ?? {}).flatMap(([name, def]) => {
			const missing = missingMeta(def, needsMapping);
			return missing ? [`${rel}\t${kind} ${name} — missing ${missing}`] : [];
		}),
	);

const violations = glob('linkml/*.yaml')
	.sort()
	.flatMap((file) =>
		scanFile(file.slice(file.indexOf('linkml/')), (readYaml<SchemaDoc>(file) ?? {}) as SchemaDoc),
	);

for (const v of violations) console.error(v);
console.error(
	`${violations.length ? '✖' : 'ok'} schema-meta: ${violations.length} missing (meaning/exact mapping — or 2+ narrow/broad — on every slot/enum, title on every slot/enum/class)`,
);
if (violations.length) process.exit(1);
