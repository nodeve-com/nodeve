// Codegen (`pnpm generate`): bake the runtime mirrors from the YAML sources so nothing on the
// runtime path — and nothing outside grimoire, ever — parses YAML. DATA FIRST, schemas
// are one projection. generated/ mirrors concepts/ flat (no generated/concepts/ wrapper):
//   - <layer>/<slug>.json — resolved data tree per concept (title/description/ui/refs + each leaf's
//     `schema:`); <slug>.schema.json — its draft-07 projection; <slug>.ts — the camelCase type only
//   - enumeration/<name>.json — merged member docs (`schema:`/`feature:` plumbing stripped), keyed by
//     file stem (the literal); `.ts` beside it where a TS consumer needs the member-code union
//   - catalog/<slug>.json — one cascade-merged snake_case entry per item (repeated features resolved
//     to part.<name> / instances[n]; enveloped `identity: {archetype, slug, code}`); no committed
//     all-in-one — a JSON reader assembles its own bundle from the per-slug files
// Every catalog + property/enumeration leaf validates against its archetype's projected schema before
// anything emits — an invalid doc fails the whole generate (and the pre-commit that runs it).

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Ajv } from 'ajv';
import { mergeDeep } from 'remeda';
import { shortCode } from '@nodeve/encoding/short-code';
import { effectiveSlug, loadCascade } from './kit/cascade.ts';
import { instructionKeys, resolveConcept } from './kit/compile.ts';
import { type RefContext, projectSchema, stableStringify } from './kit/project.ts';
import { type Obj, isObj, layerIndex } from './kit/concept-sources.ts';
import { backfillRegisterSpecNodes, resolveRepeatedFeatures } from './kit/repeated-emit.ts';
import { renderConceptModule, renderConceptsIndex } from './kit/emit-types.ts';
import { enumerationMemberData, enumerations, renderVocabModule, VOCABS } from './kit/emit-enumeration.ts';
import { renderJson } from './kit/json-schema.ts';
import { renderHoistedConst } from './kit/hoist.ts';
import { parseDisplayPolicy } from './display-policy/policy.ts';

const ROOT = import.meta.dirname;
const PROPERTY_DIR = join(ROOT, 'concepts', 'property');
const ENUMERATION_DIR = join(ROOT, 'concepts', 'enumeration');
const CATALOG_DIR = join(ROOT, 'concepts', 'catalog');
const FEATURES_DIR = join(ROOT, 'concepts', 'features');
const GENERATED = join(ROOT, 'generated');
const DISPLAY_POLICY_YAML = join(ROOT, 'display-policy', 'sensors.yaml');

// --- Catalog ---

interface CatalogEntryJson {
	identity: { archetype: string; slug: string; code: string };
	aliases?: string[];
	[key: string]: unknown;
}

/** The cascade-merged catalog, snake_case and enveloped, keyed by SLUG (globally unique across
 *  archetypes — a collision is an authoring error). Everything identifying lives under
 *  `identity`: `archetype` + `slug` + `code` (AUTHORED short-code minted at entry creation — the
 *  stable reference consumers persist; it survives file moves and slug renames, so the emit
 *  never derives it); the filing path stays out of the emit. The authored `archetype` selector
 *  may sit top-level or under `identity.archetype` (both forms); the emit canonicalizes. */
// THE emit gate: every doc's cascade-merged data must satisfy its archetype's projected schema.
const ajv = new Ajv({ strict: false, allErrors: true });
const archetypeSchemas = new Map<string, ReturnType<Ajv['compile']>>();
function assertDocValid(label: string, archetype: string, data: unknown): void {
	let check = archetypeSchemas.get(archetype);
	if (!check) archetypeSchemas.set(archetype, (check = ajv.compile(projectSchema(resolveConcept(archetype)))));
	if (check(data)) return;
	const errors = (check.errors ?? [])
		.map((e) => {
			const detail = 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : '';
			return `  ${e.instancePath || '/'}: ${e.message}${detail}`;
		})
		.join('\n');
	throw new Error(`grimoire ${label} fails its ${archetype} schema:\n${errors}`);
}

/** Validate every leaf doc — concepts/property/** (single fields) + concepts/enumeration/** (members)
 *  — against its declared archetype (`identity.archetype`), the same gate catalog leaves pass.
 *  Def-language keys (`schema:`, `feature:`) are compiler plumbing, stripped before validating. */
function assertLeafDocsValid(): void {
	const failures: string[] = [];
	const walk = (root: string, dir: string, inherited: Record<string, unknown>): void => {
		const names = readdirSync(dir, { withFileTypes: true });
		const defaults = names.some((e) => e.isFile() && e.name === '_defaults.yaml')
			? (mergeDeep(inherited, (parseYaml(readFileSync(join(dir, '_defaults.yaml'), 'utf8')) ?? {}) as Record<string, unknown>) as Record<string, unknown>)
			: inherited;
		for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.isDirectory()) {
				walk(root, join(dir, entry.name), defaults);
			} else if (entry.name.endsWith('.yaml') && entry.name !== '_defaults.yaml') {
				const path = join(dir, entry.name);
				const data = mergeDeep(defaults, (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>) as Record<string, unknown>;
				delete data.schema; // def-language field shape — the compiler's contract, not member data
				delete data.feature; // def-language field binding
				const identity = (data.identity ?? {}) as Record<string, unknown>;
				if (typeof identity.archetype !== 'string') throw new Error(`grimoire ${path} declares no identity.archetype (cascade _defaults.yaml)`);
				try {
					assertDocValid(path.slice(root.length + 1), identity.archetype, data);
				} catch (e) {
					failures.push(e instanceof Error ? e.message : String(e));
				}
			}
		}
	};
	walk(PROPERTY_DIR, PROPERTY_DIR, {});
	walk(ENUMERATION_DIR, ENUMERATION_DIR, {});
	if (failures.length > 0) throw new Error(`${failures.length} leaf docs fail validation:\n${failures.join('\n')}`);
}

/** Validate every concepts/features/** def against the `feature` archetype. The def-language
 *  keys the archetype DOES declare (concept_settings: compose/repeated/array/map) validate as fields; the
 *  rest of the instruction vocabulary (compose/prop/enums/…) is still the compiler's contract and
 *  is stripped, like `schema:`/`feature:` on property docs. */
function assertFeatureDocsValid(): void {
	const featureSchema = projectSchema(resolveConcept('feature'));
	const declared = new Set(Object.keys((featureSchema.properties ?? {}) as Record<string, unknown>));
	const failures: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith('_')) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
			} else if (entry.name.endsWith('.yaml')) {
				const doc = (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>;
				const instr = instructionKeys(doc as Obj);
				const data = Object.fromEntries(
					Object.entries(doc).filter(([k]) => !(instr.has(k) && !declared.has(k))),
				);
				try {
					assertDocValid(`feature ${path.slice(FEATURES_DIR.length + 1)}`, 'feature', data);
				} catch (e) {
					failures.push(e instanceof Error ? e.message : String(e));
				}
			}
		}
	};
	walk(FEATURES_DIR);
	if (failures.length > 0) throw new Error(`${failures.length} feature docs fail validation:\n${failures.join('\n')}`);
}

function catalogEntries(): Record<string, CatalogEntryJson> {
	const out: Record<string, CatalogEntryJson> = {};
	const claimed = new Map<string, string>(); // slug -> path that claimed it
	const claimedCodes = new Map<string, string>(); // code -> path that claimed it (authored, so dupes possible)
	for (const leaf of loadCascade(CATALOG_DIR)) {
		const identity = (leaf.data.identity ?? {}) as Record<string, unknown>;
		const archetype = typeof identity.archetype === 'string' ? identity.archetype : leaf.archetype;
		// `settings_schema` is the ONE sanctioned break from "an archetype assembles features": a device
		// declares its commissioning knobs as a RAW JSON-schema (its own `required`/`properties`), not a
		// modelled feature. Lift it out before the archetype check (whose additionalProperties:false would
		// reject it), meta-validate it is a real schema, and let it flow verbatim into the emitted entry.
		const { settings_schema, ...forSchema } = leaf.data as Record<string, unknown>;
		if (settings_schema !== undefined) {
			if (!isObj(settings_schema)) throw new Error(`grimoire catalog ${leaf.path}: settings_schema must be a JSON-schema object`);
			if (!ajv.validateSchema(settings_schema)) throw new Error(`grimoire catalog ${leaf.path}: settings_schema is not a valid JSON schema:\n${ajv.errorsText(ajv.errors)}`);
		}
		assertDocValid(`catalog ${leaf.path}`, archetype, forSchema);
		const slug = effectiveSlug(leaf.path, identity);
		const prior = claimed.get(slug);
		if (prior) throw new Error(`grimoire catalog: slug "${slug}" is claimed by both ${prior} and ${leaf.path}`);
		claimed.set(slug, leaf.path);
		const code = identity.code;
		if (typeof code !== 'string')
			throw new Error(
				`grimoire catalog ${leaf.path}: no identity.code — mint one at creation and author it (suggested: ${shortCode(slug)})`,
			);
		const priorCode = claimedCodes.get(code);
		if (priorCode) throw new Error(`grimoire catalog: code "${code}" is claimed by both ${priorCode} and ${leaf.path}`);
		claimedCodes.set(code, leaf.path);
		const aliases = leaf.aliases === undefined ? {} : { aliases: leaf.aliases as string[] };
		// snake_case verbatim — JSON emits keep the wire casing; camelCase exists only in TS emits.
		const resolved = resolveRepeatedFeatures(leaf.data);
		backfillRegisterSpecNodes(resolved); // every LINKED modbus register must land on a spec node (its quantity)
		out[slug] = {
			...aliases,
			...resolved,
			identity: { archetype, slug, code },
		};
	}
	return out;
}

// --- Concept schemas + types (consumer swap slice) ---

/** EVERY named concept compiled, keyed by slug in resolution order (features shadow archetypes — the same order kit/compile.ts resolves references). Tree-driven: the concepts/
 *  dirs are the only list, and ANY compile failure fails the whole generate (no silent skips). */
function compiledConcepts(): Array<{ name: string; data: Record<string, unknown>; layer: string }> {
	const out: Array<{ name: string; data: Record<string, unknown>; layer: string }> = [];
	const seen = new Set<string>();
	for (const layer of ['features', 'archetypes']) {
		for (const name of [...layerIndex(layer).keys()].sort()) {
			if (seen.has(name)) continue;
			seen.add(name);
			out.push({ name, data: resolveConcept(name), layer });
		}
	}
	return out;
}

// --- Emit ---

/** Every file this codegen emits, as { path → contents } — shared by the writer and drift test.
 *  Layout mirrors the concepts/ source tree, flat: generated/<layer>/<name> carries a concept's
 *  data tree, TS module, and (archetypes) wire schema side by side; generated/enumeration/<name>
 *  carries an enumeration's member data and (where a TS consumer exists) its vocab module. */
/** A catalog entry's own module: the one entry as a literal const — pure code (no fs, no JSON
 *  import), the isolated part catalog/index.ts composes. The <slug>.json twin serves JSON readers. */
const entryConst = (slug: string): string => (/^[0-9]/.test(slug) ? `_${slug}` : slug);
const renderCatalogEntry = (slug: string, entry: unknown): string =>
	'// GENERATED by `pnpm generate` — one catalog entry as a literal const, composed into\n' +
	'// catalog/index.ts. A repeated-feature spec the emit fills into every part (the authored `default`)\n' +
	'// is lifted to one `_sN` const and referenced per part. Do not edit by hand — edit the YAML, regenerate.\n\n' +
	renderHoistedConst(entryConst(slug), entry);

/** The catalog reader's module: composes the per-slug entry modules into one array — pure code (no
 *  fs, no JSON import), so it bundles serverless; kit/catalog.ts keys it by identity. */
const renderCatalogIndex = (slugs: string[]): string =>
	'// GENERATED by `pnpm generate` — composes every per-slug catalog module into one array, keyed by\n' +
	'// identity (archetype + slug) by kit/catalog.ts. Do not edit by hand — edit the YAML, regenerate.\n\n' +
	slugs.map((s) => `import { ${entryConst(s)} } from './${s}.ts';`).join('\n') +
	'\n\n' +
	`export const catalogEntries = [\n${slugs.map((s) => `\t${entryConst(s)},`).join('\n')}\n] as const;\n`;

/** The display-policy reader's module: the authored sensors.yaml baked to one typed const — pure code
 *  (no fs, no YAML), so every consumer reads the policy through grimoire's API, never a file. */
const renderDisplayPolicyModule = (policy: unknown): string =>
	'// GENERATED by `pnpm generate` from display-policy/sensors.yaml — the authored display policy as\n' +
	'// one typed const. Do not edit by hand — edit the YAML, regenerate.\n\n' +
	"import type { DisplayPolicy } from '../display-policy/policy.ts';\n\n" +
	`export const displayPolicy: DisplayPolicy = ${renderJson(policy).trimEnd()};\n`;

/** A concept's canonical INLINE projection (no refs), memoized — the equality yardstick a `$ref`
 *  slot must match to be hoisted (a shape-changing overlay differs, so it stays inline). */
const inlineSchemaCache = new Map<string, string>();
const inlineSchemaOf = (name: string): string => {
	let s = inlineSchemaCache.get(name);
	if (s === undefined) inlineSchemaCache.set(name, (s = stableStringify(projectSchema(resolveConcept(name)))));
	return s;
};

/** Rewrite kit/project.ts's bare `{$ref: <name>}` markers into draft-07 `#/$defs/<name>` pointers. */
function toJsonRefs(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(toJsonRefs);
	if (!isObj(node)) return node;
	if (typeof node.$ref === 'string') return { $ref: `#/$defs/${node.$ref}` };
	return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toJsonRefs(v)]));
}

/** The structural keys a concept slot's `$ref` stands in for — replaced by the reference to the
 *  concept's own file, the rest of the node (authored title/refs/ui overlay) rides alongside. */
const STRUCTURAL = new Set(['prop', 'array', 'map', 'anyOf']);

/** The generated/ layer a concept slug's module lives under: features shadow archetypes shadow the
 *  property atoms — the same resolution order kit/compile.ts walks. */
const layerOf = (name: string): string =>
	layerIndex('features').has(name) ? 'features' : layerIndex('archetypes').has(name) ? 'archetypes' : 'property';

/** The cross-file `$ref` a slot in `fromLayer` uses to point at concept `name`'s own generated data
 *  file — a sibling in the flat generated/ tree (`./x.json` same layer, `../features/x.json` across). */
function refPath(fromLayer: string, name: string): string {
	const toLayer = layerOf(name);
	return `${fromLayer === toLayer ? './' : `../${toLayer}/`}${name}.json`;
}

/** Referentialize a resolved DATA node — the data-tree twin of kit/project.ts's ref hoisting: a nested
 *  concept slot (tagged `$concept`) whose SHAPE is unchanged from its standalone concept — the same
 *  equality test project.ts runs — collapses to `{…authored overlay, $ref: <that concept's file>}`
 *  instead of splicing the concept's whole subtree in. The concept lives once, in its OWN file; a
 *  reader resolves the `$ref` across files (a resolve-time job). A shape-changing overlay fails the
 *  test and stays inline (recursing for deeper refs), exactly as the schema keeps it inline. The
 *  `$concept` tag itself never ships — replaced by `$ref` where a slot hoists, dropped where it doesn't. */
function referentialize(node: unknown, fromLayer: string): unknown {
	if (Array.isArray(node)) return node.map((n) => referentialize(n, fromLayer));
	if (!isObj(node)) return node;
	if (typeof node.$concept === 'string' && stableStringify(projectSchema(node)) === inlineSchemaOf(node.$concept)) {
		const rest = Object.entries(node).filter(([k]) => k !== '$concept' && !STRUCTURAL.has(k));
		return { ...Object.fromEntries(rest.map(([k, v]) => [k, referentialize(v, fromLayer)])), $ref: refPath(fromLayer, node.$concept) };
	}
	return Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$concept').map(([k, v]) => [k, referentialize(v, fromLayer)]));
}

/** The self-contained draft-07 schema for a concept: its ref-hoisted body plus a `$defs` block
 *  carrying every concept it (transitively) references, each itself ref-hoisted. */
function schemaWithDefs(data: Record<string, unknown>): { json: Obj; body: Obj; imports: Array<{ name: string; layer: string }> } {
	const deps = new Set<string>();
	const body = toJsonRefs(projectSchema(data, { schemaOf: inlineSchemaOf, deps })) as Obj;
	const direct = [...deps];
	const $defs: Obj = {};
	const queue = [...deps];
	while (queue.length > 0) {
		const name = queue.shift()!;
		if (name in $defs) continue;
		const sub: RefContext = { schemaOf: inlineSchemaOf, deps: new Set() };
		$defs[name] = toJsonRefs(projectSchema(resolveConcept(name), sub));
		for (const n of sub.deps) if (!(n in $defs)) queue.push(n);
	}
	// `json`: the self-contained draft-07 (refs resolve via `$defs`). `body`: the same minus `$defs`
	// — the .ts resolves each `$ref` through an imported sibling const, so a local `$defs` would only
	// re-inline (and re-bloat) the very shapes the refs exist to share.
	const json = { ...body, ...(Object.keys($defs).length > 0 ? { $defs } : {}) };
	return { json, body, imports: direct.map((name) => ({ name, layer: layerOf(name) })) };
}

export function outputs(): Record<string, string> {
	assertLeafDocsValid();
	assertFeatureDocsValid();
	const entries = catalogEntries();
	const concepts = compiledConcepts();
	const out: Record<string, string> = {
		[join(GENERATED, 'index.ts')]: renderConceptsIndex(concepts),
	};
	// Per catalog entry, keyed by slug: the committed JSON grain a JSON reader assembles, and its
	// TS-const twin — the isolated part the JS/TS reader path imports (code, no fs/JSON import).
	const slugs = Object.keys(entries).sort();
	for (const slug of slugs) {
		out[join(GENERATED, 'catalog', `${slug}.json`)] = renderJson(entries[slug]);
		out[join(GENERATED, 'catalog', `${slug}.ts`)] = renderCatalogEntry(slug, entries[slug]);
	}
	// The JS/TS reader's grain: catalog/index.ts composes the per-slug modules into one array — code,
	// no fs/JSON import, so `loadDevice` bundles into a serverless build (kit/catalog.ts keys by identity).
	out[join(GENERATED, 'catalog', 'index.ts')] = renderCatalogIndex(slugs);
	// One concept's three sibling files (data .json, camelCase-type .ts, draft-07 .schema.json), the
	// same layout every layer emits. Returns the direct concept refs so the caller can chase them.
	// - Ref-hoisted projection: each composed slot is a `$ref` (self-contained `$defs` in the .schema.json,
	//   a sibling `<Name>Schema` import in the .ts) — one shape defined once, not restated per use site.
	// - The data .json: the one-level-referential tree (labels, ui, refs, each leaf's `schema:`); a cold
	//   reader resolves each `$ref` across files itself, so the file never splices a nested concept in.
	const emitConcept = (name: string, data: Record<string, unknown>, layer: string): Array<{ name: string; layer: string }> => {
		const { json, body, imports } = schemaWithDefs(data);
		const dir = join(GENERATED, layer);
		out[join(dir, `${name}.json`)] = renderJson(referentialize(data, layer));
		out[join(dir, `${name}.ts`)] = renderConceptModule({ name, schema: body, layer, imports });
		out[join(dir, `${name}.schema.json`)] = renderJson(json);
		return imports;
	};
	// features + archetypes, collecting the property atoms they $ref so each gets its own module.
	const propQueue: string[] = [];
	const queueProps = (imports: Array<{ name: string; layer: string }>): void => {
		for (const d of imports) if (d.layer === 'property') propQueue.push(d.name);
	};
	for (const c of concepts) queueProps(emitConcept(c.name, c.data, c.layer));
	// The referenced property atoms, transitively — the importable home a composer $refs instead of
	// inlining the field. A property NOT $ref'd (e.g. a bare part-instance name) emits no module.
	const emittedProps = new Set<string>();
	while (propQueue.length > 0) {
		const name = propQueue.shift()!;
		if (emittedProps.has(name)) continue;
		emittedProps.add(name);
		queueProps(emitConcept(name, resolveConcept(name), 'property'));
	}
	// Member data per enumeration — every enumeration, tree-driven.
	for (const name of enumerations()) {
		out[join(GENERATED, 'enumeration', `${name}.json`)] = renderJson(enumerationMemberData(name));
	}
	for (const v of VOCABS) out[join(GENERATED, 'enumeration', `${v.enumeration}.ts`)] = renderVocabModule(v.enumeration, v.exportName, v.asConst);
	// The authored display policy, baked to a typed const so every consumer reads it through the API.
	out[join(GENERATED, 'display-policy.ts')] = renderDisplayPolicyModule(
		parseDisplayPolicy(parseYaml(readFileSync(DISPLAY_POLICY_YAML, 'utf8'))),
	);
	return out;
}

// Write only when run directly, not when imported by the drift test.
if (import.meta.filename === process.argv[1]) {
	// Wipe generated/ first so no stale file (renamed/deleted concept) survives the bake.
	rmSync(GENERATED, { recursive: true, force: true });
	for (const [path, contents] of Object.entries(outputs())) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, contents);
		console.log(`grimoire: wrote ${path}`);
	}
}
