// THE emit gate: every doc's cascade-merged data must satisfy its archetype's projected schema.
// Shared by generate.ts — catalog leaves, property/enumeration leaves, and feature defs all pass
// through here before anything emits; an invalid doc fails the whole generate (and the pre-commit).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Ajv } from 'ajv';
import { mergeDeep } from 'remeda';
import { instructionKeys, resolveConcept } from './compile.ts';
import { projectSchema } from './project.ts';
import { type Obj, ENUMERATION_DIR, FEATURES_DIR, PROPERTY_DIR, isObj } from '../src/concept-sources.ts';

const ajv = new Ajv({ strict: false, allErrors: true });
const schemaByArchetype = new Map<string, ReturnType<Ajv['compile']>>();

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
	if (!isObj(schema)) throw new Error(`grimoire catalog ${label}: settings_schema must be a JSON-schema object`);
	if (!ajv.validateSchema(schema)) throw new Error(`grimoire catalog ${label}: settings_schema is not a valid JSON schema:\n${ajv.errorsText(ajv.errors)}`);
}

/** Validate every leaf doc — concepts/property/** (single fields) + concepts/enumeration/** (members)
 *  — against its declared archetype (`identity.archetype`), the same gate catalog leaves pass.
 *  Def-language keys (`schema:`, `feature:`) are compiler plumbing, stripped before validating. */
export function assertLeafDocsValid(): void {
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
export function assertFeatureDocsValid(): void {
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
