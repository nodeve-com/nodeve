// THE emit gate: every doc's cascade-merged data must satisfy its archetype's projected schema.
// Shared by generate.ts — catalog leaves, property/enumeration leaves, and feature defs all pass
// through here before anything emits; an invalid doc fails the whole generate (and the pre-commit).

import { type ValidateFunction } from 'ajv';
import { isPlainObject } from 'remeda';
import { resolveConcept } from './compile.ts';
import { projectSchema } from './project.ts';
import { ajv } from '../src/ajv.ts';
import { type Obj, ARCHETYPES_DIR, ENUMERATION_DIR, FEATURES_DIR, PROPERTY_DIR, jsonFiles, readJson } from '../src/concept-sources.ts';

const schemaByArchetype = new Map<string, ValidateFunction>();

export function assertDocValid(label: string, archetype: string, data: unknown): void {
	let check = schemaByArchetype.get(archetype);
	if (!check) schemaByArchetype.set(archetype, (check = ajv.compile(projectSchema(resolveConcept(archetype)))));
	if (check(data)) return;
	const errors = (check.errors ?? [])
		.map((e) => {
			const detail = 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : '';
			return `  ${e.instancePath || '/'}: ${e.message}${detail}`;
		})
		.join('\n');
	throw new Error(`grimoire ${label} fails its ${archetype} schema:\n${errors}`);
}

/** Meta-validate a raw JSON-schema authored inline (a catalog's `settings_schema` — the ONE sanctioned
 *  break from "an archetype assembles features"): it must be an object AND a valid draft schema. */
export function assertMetaSchema(label: string, schema: unknown): void {
	if (!isPlainObject(schema)) throw new Error(`grimoire catalog ${label}: settings_schema must be a JSON-schema object`);
	if (!ajv.validateSchema(schema)) throw new Error(`grimoire catalog ${label}: settings_schema is not a valid JSON schema:\n${ajv.errorsText(ajv.errors)}`);
}

/** Validate every leaf doc — concepts/property/** (single fields) + concepts/enumeration/** (members)
 *  — against its declared archetype (`identity.archetype_id`), the same gate catalog leaves pass.
 *  Def-language keys (`schema:`, `feature:`) are compiler plumbing, stripped before validating. */
export function assertLeafDocsValid(): void {
	const failures: string[] = [];
	// scribe already folded the cascade and stamped identity.{archetype_id, slug}; read each leaf and
	// validate against the archetype its identity declares. Def-language keys are compiler plumbing.
	for (const root of [PROPERTY_DIR, ENUMERATION_DIR]) {
		for (const path of jsonFiles(root)) {
			const data = readJson(path);
			delete data.schema; // def-language field shape — the compiler's contract, not member data
			delete data.feature; // def-language field binding
			const identity = (data.identity ?? {}) as Record<string, unknown>;
			if (typeof identity.archetype_id !== 'string')
				throw new Error(`grimoire ${path} declares no identity.archetype_id (cascade _defaults.yaml)`);
			try {
				assertDocValid(path.slice(root.length + 1), identity.archetype_id, data);
			} catch (e) {
				failures.push(e instanceof Error ? e.message : String(e));
			}
		}
	}
	if (failures.length > 0) throw new Error(`${failures.length} leaf docs fail validation:\n${failures.join('\n')}`);
}

/** Validate every concepts/features/** def against the `feature` archetype — the self-hosting gate,
 *  and like its archetype twin it strips NOTHING. `feature.yaml` declares the whole feature-level
 *  grammar (prop / enums / concept_settings / feature_spec), so an undeclared key is rejected. That
 *  is what keeps `archetype_settings` archetype-only: assembly is undeclared here, so a feature def
 *  reaching for it fails — no per-key exception needed, which is how the old allow-list crept back. */
export function assertFeatureDocsValid(): void {
	const failures: string[] = [];
	for (const path of jsonFiles(FEATURES_DIR)) {
		const data = readJson(path);
		try {
			assertDocValid(`feature ${path.slice(FEATURES_DIR.length + 1)}`, 'feature', data);
		} catch (e) {
			failures.push(e instanceof Error ? e.message : String(e));
		}
	}
	if (failures.length > 0) throw new Error(`${failures.length} feature docs fail validation:\n${failures.join('\n')}`);
}

/** Validate every concepts/archetypes/** def against the `archetype` meta-def — the same
 *  self-hosting gate feature defs pass. Requires the labels every class must carry (title,
 *  description — archetypes/archetype.yaml); an empty def fails in parseDoc.
 *
 *  `prop:`/`enums:` are the FIELD-layer instruction keys — illegal on a class, which assembles
 *  features only (concepts/README.md "Archetype"). They stay in `data` so the meta-def's closed
 *  projection rejects them; stripping them as instructions is what let `vedirect_medium.pid` and
 *  the `application_protocol` enum land here. The class-layer keys below ARE legal and strip. */
export function assertArchetypeDocsValid(): void {
	const archetypeSchema = projectSchema(resolveConcept('archetype'));
	const declared = new Set(Object.keys((archetypeSchema.properties ?? {}) as Record<string, unknown>));
	const failures: string[] = [];
	for (const path of jsonFiles(ARCHETYPES_DIR)) {
		try {
			const doc = readJson(path);
			// NOTHING is stripped: a key an archetype may carry is a key `archetype.yaml` DECLARES,
			// and the projection is closed. Stripping undeclared instruction keys made declaring
			// optional — it hid `prop:`/`enums:` (illegal here) and left `feature:`/`archetype:`/
			// `schema:` unvalidated in 36 defs. Undeclared ⇒ rejected, no exceptions.
			const data = doc;
			assertDocValid(`archetype ${path.slice(ARCHETYPES_DIR.length + 1)}`, 'archetype', data);
		} catch (e) {
			failures.push(e instanceof Error ? e.message : String(e));
		}
	}
	if (failures.length > 0) throw new Error(`${failures.length} archetype defs fail validation:\n${failures.join('\n')}`);
}
