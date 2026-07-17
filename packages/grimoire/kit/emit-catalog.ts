// The catalog slice of `pnpm generate`: the cascade-merged entries and their two emitted grains —
// artifacts/catalog/<slug>.json for JSON readers, src/generated/catalog/<slug>.ts (+ index.ts) for
// the fs-free JS/TS reader path (src/catalog.ts keys the composed array by identity).

import humps from 'remeda-humps';
import { isPlainObject } from 'remeda';
import { camelizeSchema } from '@nodeve/schema-case';
import { enumerationMemberData } from './emit-enumeration.ts';
import { shortCode } from '@nodeve/encoding/short-code';
import { effectiveSlug, loadCascade } from '../src/cascade.ts';
import { CATALOG_DIR } from '../src/concept-sources.ts';
import { assertDocValid, assertMetaSchema } from './validate-docs.ts';
import {
	backfillRegisterSpecNodes,
	desugarIntervalSlugs,
	resolveRepeatedFeatures,
} from './repeated-emit.ts';
import { validateConditionRefs } from './validate-conditions.ts';
import { renderHoistedConst } from './hoist.ts';

export interface CatalogEntryJson {
	identity: { archetype_id: string; slug: string; code: string };
	aliases?: string[];
	[key: string]: unknown;
}

/** A per-kind uniqueness claimer — a second claim of the same key is an authoring error. */
function claimer(what: string): (key: string, path: string) => void {
	const claimed = new Map<string, string>(); // key -> path that claimed it
	return (key, path) => {
		const prior = claimed.get(key);
		if (prior)
			throw new Error(`grimoire catalog: ${what} "${key}" is claimed by both ${prior} and ${path}`);
		claimed.set(key, path);
	};
}

// quantity code → its base quantity_kind (enumeration/quantity `measures.quantity_kind`), built once.
let baseKindByQuantity: Map<string, string> | undefined;
function quantityBaseKind(code: string, path: string): string {
	baseKindByQuantity ??= new Map(
		Object.entries(enumerationMemberData('quantity')).map(([c, doc]) => {
			const measures = isPlainObject(doc) && isPlainObject(doc.measures) ? doc.measures : {};
			return [c, String(measures.quantity_kind ?? '')];
		}),
	);
	const kind = baseKindByQuantity.get(code);
	if (!kind)
		throw new Error(
			`grimoire catalog ${path}: register quantity "${code}" has no enumeration/quantity member with measures.quantity_kind`,
		);
	return kind;
}

/** Bake each named-`quantity` register's resolved BASE kind into `quantity_kind`, so an artifact
 *  reader routes on the kind (energy vs power) without the TS enumeration module. The effective
 *  column stays `quantity ?? quantity_kind` — the named quantity wins. Authoring both is still an
 *  error when the authored kind contradicts the resolved base. */
function bakeRegisterBaseKinds(entry: Record<string, unknown>, path: string): void {
	const medium = entry.modbus;
	if (!isPlainObject(medium) || !Array.isArray(medium.modbus_registers)) return;
	for (const reg of medium.modbus_registers) {
		if (!isPlainObject(reg) || typeof reg.quantity !== 'string') continue;
		const kind = quantityBaseKind(reg.quantity, path);
		if (reg.quantity_kind !== undefined && reg.quantity_kind !== kind)
			throw new Error(
				`grimoire catalog ${path}: register quantity "${reg.quantity}" authored with quantity_kind "${String(reg.quantity_kind)}" ≠ its base "${kind}" — author only the quantity`,
			);
		reg.quantity_kind = kind;
	}
}

/** The emit-side spec resolution + gates for one leaf: repeated features filled, base kinds baked
 *  onto named-quantity registers, register links landed, interval slugs de-sugared + unique per
 *  list, condition pointers resolved. */
function resolveEntry(data: Record<string, unknown>, path: string): Record<string, unknown> {
	const resolved = resolveRepeatedFeatures(data);
	bakeRegisterBaseKinds(resolved, path); // named `quantity` → its base kind rides the artifact too
	backfillRegisterSpecNodes(resolved); // every LINKED modbus register must land on a spec node (its quantity)
	desugarIntervalSlugs(resolved, path); // rating → identity.slug on unslugged rows, then per-list uniqueness
	validateConditionRefs(resolved, path); // every interval_item / setting gate resolves within the entry
	return resolved;
}

/** The cascade-merged catalog, snake_case and enveloped, keyed by SLUG (globally unique across
 *  archetypes — a collision is an authoring error). Everything identifying lives under
 *  `identity`: `archetype_id` + `slug` + `code` (AUTHORED short-code minted at entry creation — the
 *  stable reference consumers persist; it survives file moves and slug renames, so the emit
 *  never derives it); the filing path stays out of the emit. The authored `archetype_id` selector
 *  may sit top-level or under `identity.archetype_id` (both forms); the emit canonicalizes.
 *  The emit gate itself (assertDocValid + the leaf/feature sweeps) lives in kit/validate-docs.ts. */
export function catalogEntries(): Record<string, CatalogEntryJson> {
	const out: Record<string, CatalogEntryJson> = {};
	const claimSlug = claimer('slug');
	const claimCode = claimer('code'); // codes are authored, so dupes possible
	for (const leaf of loadCascade(CATALOG_DIR)) {
		const identity = (leaf.data.identity ?? {}) as Record<string, unknown>;
		const archetype =
			typeof identity.archetype_id === 'string' ? identity.archetype_id : leaf.archetype;
		// `settings_schema` is the ONE sanctioned break from "an archetype assembles features": a device
		// declares its commissioning knobs as a RAW JSON-schema (its own `required`/`properties`), not a
		// modelled feature. Lift it out before the archetype check (whose additionalProperties:false would
		// reject it), meta-validate it is a real schema, and let it flow verbatim into the emitted entry.
		const { settings_schema, ...forSchema } = leaf.data as Record<string, unknown>;
		if (settings_schema !== undefined) assertMetaSchema(leaf.path, settings_schema);
		const slug = effectiveSlug(leaf.path, identity);
		// Validate the DE-SUGARED doc — identity.{archetype, slug} is required (features/identity.yaml),
		// filled from the cascade + file stem exactly as the emit envelope will carry them.
		assertDocValid(`catalog ${leaf.path}`, archetype, {
			...forSchema,
			identity: { ...identity, archetype_id: archetype, slug },
		});
		claimSlug(slug, leaf.path);
		const code = identity.code;
		if (typeof code !== 'string')
			throw new Error(
				`grimoire catalog ${leaf.path}: no identity.code — mint one at creation and author it (suggested: ${shortCode(slug)})`,
			);
		claimCode(code, leaf.path);
		const aliases = leaf.aliases === undefined ? {} : { aliases: leaf.aliases as string[] };
		// snake_case verbatim — JSON emits keep the wire casing; camelCase exists only in TS emits.
		out[slug] = {
			...aliases,
			...resolveEntry(leaf.data, leaf.path),
			identity: { archetype_id: archetype, slug, code },
		};
	}
	return out;
}

/** A catalog entry's own module: the one entry as a literal const — pure code (no fs, no JSON
 *  import), the isolated part catalog/index.ts composes. The <slug>.json twin serves JSON readers. */
const entryLocal = (slug: string): string => (/^[0-9]/.test(slug) ? `_${slug}` : slug);

/** The TS spelling of an entry: every KEY camelized deep (humps — values, slugs, codes untouched),
 *  the .json twin keeping the snake wire shape. `settings_schema` is the exception: a RAW JSON
 *  schema whose `properties`/`required` name snake wire settings — @nodeve/schema-case camelizes it
 *  AS a schema (`x-key-map` stamped), so it still validates wire data renamed at the parse edge. */
function camelizeEntry(entry: CatalogEntryJson): unknown {
	const { settings_schema, ...rest } = entry;
	return {
		...(humps(rest) as Record<string, unknown>),
		...(settings_schema === undefined ? {} : { settingsSchema: camelizeSchema(settings_schema) }),
	};
}

export const renderCatalogEntry = (entry: CatalogEntryJson): string =>
	'// GENERATED by `pnpm generate` — one catalog entry as the module default, composed into\n' +
	'// catalog/index.ts (camelCase keys — the snake wire shape is the <slug>.json twin). A repeated-\n' +
	'// feature spec the emit fills into every part (the authored `default`) is lifted to one `_sN`\n' +
	'// const and referenced per part. Do not edit by hand — edit the YAML, regenerate.\n\n' +
	renderHoistedConst(camelizeEntry(entry));

/** The catalog reader's module: composes the per-slug entry modules into one array — pure code (no
 *  fs, no JSON import), so it bundles serverless; kit/catalog.ts keys it by identity. Each entry is
 *  the module's `default`; the local alias here is filing only (the identity keys the map). */
export const renderCatalogIndex = (slugs: string[]): string =>
	'// GENERATED by `pnpm generate` — composes every per-slug catalog module into one array, keyed by\n' +
	'// identity (archetype + slug) by kit/catalog.ts. Do not edit by hand — edit the YAML, regenerate.\n\n' +
	slugs.map((s) => `import ${entryLocal(s)} from './${s}.ts';`).join('\n') +
	'\n\n' +
	`export const catalogEntries = [\n${slugs.map((s) => `\t${entryLocal(s)},`).join('\n')}\n] as const;\n`;
