// The catalog emit's repeated-feature resolution (docs/feature-model.md): `default` is
// authoring-only and never leaves the package — the emit fills `part.<name>` / `instances[n]`
// from it. BUILD- AND TEST-ONLY (reads the concept YAML via kit/concept-sources).

import { type Obj, layerIndex, readYaml } from '../src/concept-sources.ts';
import { isPlainObject } from 'remeda';

/** A features/<slug> def's repeated nature: a parts map (kind → part names), counted, or single. */
function featureNature(slug: string): { parts?: Record<string, string[]>; counted?: boolean } {
	const path = layerIndex('features').get(slug);
	if (!path) return {};
	// The repeated/part grammar lives under `concept_settings` (concepts/features/concept_settings.yaml).
	const settings = (readYaml(path).concept_settings ?? {}) as Record<string, unknown>;
	if (typeof settings.part === 'string') {
		const partsPath = layerIndex('parts').get(settings.part);
		if (!partsPath)
			throw new Error(`grimoire generate: no parts/${settings.part}.yaml (feature ${slug})`);
		return { parts: readYaml(partsPath).parts as Record<string, string[]> };
	}
	if (settings.repeated === true) return { counted: true };
	// A pure-reuse feature (`compose: <sibling>`, no own shape — kit/resolve.ts) IS its sibling's shape:
	// follow the single-slug compose chain so its parted/counted nature is discoverable here too.
	if (typeof settings.compose === 'string') return featureNature(settings.compose);
	return {};
}

/** A part-kind feature's OWN agnostic default bands — its def-level `feature_spec.combined` (empty
 *  until the def authors them). A parted parent's `default.<kind>` refines THIS base, so a parent no
 *  longer restates the per-phase bands, it overrides deltas off the kind feature's own def. */
function featureCombined(slug: string): Obj {
	const path = layerIndex('features').get(slug);
	if (!path) return {};
	const doc = readYaml(path);
	const fs = doc.feature_spec;
	if (isPlainObject(fs) && isPlainObject((fs as Obj).combined)) return (fs as Obj).combined as Obj;
	// Pure-reuse feature: its own bands live on the composed sibling (kit/resolve.ts).
	const settings = (doc.concept_settings ?? {}) as Record<string, unknown>;
	return typeof settings.compose === 'string' ? featureCombined(settings.compose) : {};
}

// A spec-row's identity: the band axes of an interval (rating + mode, `interval:`-nested or flat).
// Rows in `default` and an instance/part override join on this key. A measuring range is just a
// `rating: measurable` interval, so it joins here too — there is no separate measurement channel.
const bandKey = (row: Obj): string => {
	const r = isPlainObject(row.interval) ? row.interval : row;
	return `${String(r.rating ?? '')}|${String(r.mode ?? '')}`;
};

/** Row-level array overlay: an override row REPLACES every default row sharing its key (restate
 *  the band for this instance); unstated default rows stay; unmatched override rows append. An
 *  authored EMPTY array is an explicit clear. */
function overlayRows(base: unknown[], over: unknown[], keyOf: (row: Obj) => string): unknown[] {
	if (over.length === 0) return [];
	const restated = new Set(over.map((r) => keyOf(r as Obj)));
	return [...base.filter((r) => !restated.has(keyOf(r as Obj))), ...over];
}

/** The instance/part overlay: deep-merge, except the `intervals` list merges ROW-level (an author
 *  defaults a full band set once and overrides one instance's row without restating the rest); any
 *  other array replaces wholesale. */
function overlaySpec(base: Obj, over: Obj): Obj {
	const out = { ...base };
	for (const [k, v] of Object.entries(over)) {
		const prev = out[k];
		if (isPlainObject(prev) && isPlainObject(v)) out[k] = overlaySpec(prev, v);
		else if (Array.isArray(prev) && Array.isArray(v) && k === 'intervals')
			out[k] = overlayRows(prev, v, bandKey);
		else out[k] = v;
	}
	return out;
}

const childObj = (o: Obj, key: string): Obj =>
	isPlainObject(o[key]) ? (o[key] as Obj) : (o[key] = {});

/** The spec-map node a measurand link addresses within its feature's `feature_spec` body, per the
 *  feature's repeated nature: a parts feature keys `part.<part_id>` (or `combined` when unset — the
 *  aggregate), a counted feature `instances[ordinal-1]` (or `combined`), a single spec feature its
 *  `combined`. Missing containers (incl. `feature_spec` itself) are created so an absent link target
 *  can be filled. */
function measurandNode(feature: Obj, slug: string, reg: Obj): Obj {
	const fs = childObj(feature, 'feature_spec');
	const nature = featureNature(slug);
	if (nature.parts)
		return reg.part_id === undefined
			? childObj(fs, 'combined')
			: childObj(childObj(fs, 'part'), String(reg.part_id));
	if (nature.counted) {
		if (reg.ordinal === undefined) return childObj(fs, 'combined');
		const instances = Array.isArray(fs.instances) ? fs.instances : (fs.instances = []);
		const i = Number(reg.ordinal) - 1;
		if (!isPlainObject(instances[i])) instances[i] = {};
		return instances[i] as Obj;
	}
	return childObj(fs, 'combined');
}

/** Interval slug de-sugar + uniqueness. An interval's `identity.slug` is its addressable handle
 *  (a `condition.interval_item` names `{feature, property, interval}`); authored YAML rarely spells
 *  it — an unslugged row de-sugars from its `rating` axis. De-sugar runs FIRST so two bare rows
 *  sharing a rating collide and force explicit slugs. A rating-less row (mode-only I-V points) stays
 *  unslugged. Mutates the resolved entry in place; runs AFTER resolveRepeatedFeatures so the filled
 *  part/instance rows are covered too. */
export function desugarIntervalSlugs(node: unknown, at: string): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => desugarIntervalSlugs(v, `${at}[${i}]`));
		return;
	}
	if (!isPlainObject(node)) return;
	for (const [k, v] of Object.entries(node)) {
		if (k === 'intervals' && Array.isArray(v)) slugIntervalRows(v, `${at}.intervals`);
		else desugarIntervalSlugs(v, `${at}.${k}`);
	}
}

function slugIntervalRows(rows: unknown[], at: string): void {
	const seen = new Map<string, number>();
	rows.forEach((row, i) => {
		if (!isPlainObject(row)) return;
		const identity = isPlainObject(row.identity) ? (row.identity as Obj) : {};
		let slug = identity.slug;
		if (slug === undefined) {
			const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
			if (typeof band.rating !== 'string') return; // rating-less AND unslugged — nothing to de-sugar, not addressable
			slug = band.rating;
			row.identity = { ...identity, slug };
		}
		const prior = seen.get(String(slug));
		if (prior !== undefined)
			throw new Error(
				`grimoire catalog: interval slug "${String(slug)}" duplicated at ${at}[${prior}] and ${at}[${i}] — author distinct identity.slug on each row`,
			);
		seen.set(String(slug), i);
	});
}

/** Ensure a spec node exists for every LINKED modbus register: a register carrying a measurand link
 *  (feature_id + quantity_kind) reads one quantity of the feature tree, so that quantity's spec node
 *  must exist as the link target — create it (empty until a spec interval is authored; a measuring
 *  range is a `rating: measurable` interval, NOT a separate slot). RAW registers (raw_name only, no
 *  quantity_kind) and category registers (enum-valued `state`/`fault`, no quantity_kind) are
 *  deliberately unlinked and skipped. Mutates the resolved entry in place; runs AFTER
 *  resolveRepeatedFeatures so the part/instance nodes a link targets already exist. */
export function backfillRegisterSpecNodes(entry: Obj): void {
	const medium = entry.modbus;
	if (!isPlainObject(medium) || !Array.isArray(medium.modbus_registers)) return;
	for (const reg of medium.modbus_registers) {
		if (!isPlainObject(reg) || reg.feature_id === undefined || reg.quantity_kind === undefined)
			continue;
		const feature = entry[String(reg.feature_id)];
		if (!isPlainObject(feature)) continue; // unresolvable link — a separate link-validation concern, not ours to invent
		childObj(measurandNode(feature, String(reg.feature_id), reg), String(reg.quantity_kind));
	}
}

function resolvePartsFeature(value: Obj, fs: Obj, parts: Record<string, string[]>): Obj {
	const {
		default: base = {},
		part: overrides = {},
		...rest
	} = fs as Record<string, Record<string, Obj>>;
	const resolved: Obj = {};
	for (const [kind, names] of Object.entries(parts)) {
		const kindBase = overlaySpec(featureCombined(kind), base[kind] ?? {});
		for (const name of names) {
			const node = overlaySpec(kindBase, overrides[name] ?? {});
			if (Object.keys(node).length > 0) resolved[name] = node;
		}
	}
	return { ...value, feature_spec: { ...rest, part: resolved } };
}

function resolveCountedFeature(value: Obj, fs: Obj): Obj {
	const {
		default: base = {},
		instances = [],
		...rest
	} = fs as {
		default?: Obj;
		instances?: Obj[];
	};
	const settings = isPlainObject(value.concept_settings) ? (value.concept_settings as Obj) : {};
	const rows = Array.from({ length: Number(settings.count ?? 0) }, (_, index) => {
		const match = instances.find((row) => row.ordinal === index + 1) ?? {};
		const override = Object.fromEntries(Object.entries(match).filter(([key]) => key !== 'ordinal'));
		return overlaySpec(base, override);
	});
	return { ...value, feature_spec: { ...rest, instances: rows } };
}

/** Resolve an entry's repeated features for the emit — `default` is authoring-only and never
 *  leaves the package. Parts feature → `part.<name>` = its kind's default ⊕ the authored part
 *  override, one node per named part (empty ones dropped). Counted feature → `instances[n]`,
 *  one row per `count`, each `default` ⊕ its authored `{ordinal}`-tagged override. */
export function resolveRepeatedFeatures(data: Obj): Obj {
	const out = { ...data };
	for (const [key, value] of Object.entries(out)) {
		if (!isPlainObject(value)) continue;
		const nature = featureNature(key);
		if (!nature.parts && !nature.counted) continue;
		// The spec body lives under `feature_spec` now; `count` under `concept_settings` (the grammar).
		const fs = isPlainObject(value.feature_spec) ? (value.feature_spec as Obj) : {};
		out[key] = nature.parts
			? resolvePartsFeature(value, fs, nature.parts)
			: resolveCountedFeature(value, fs);
	}
	return out;
}
