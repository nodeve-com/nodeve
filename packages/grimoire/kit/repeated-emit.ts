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

// A spec-row's identity: the band axes of an interval (`interval:`-nested or flat). Rows in `default`
// and an instance/part override join on this key. Rating tier + mode identify a rating band; a
// measurable channel is identified instead by interval_kind + its flow_direction/period axes — so
// two energy channels (out vs in, lifetime vs daily) don't collide under one empty `|` key.
const bandKey = (row: Obj): string => {
	const r = isPlainObject(row.interval) ? row.interval : row;
	return [r.interval_kind, r.rating, r.mode, r.flow_direction, r.period].map((v) => String(v ?? '')).join('|');
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

/** Interval slug de-sugar + uniqueness. An interval's `identity.slug` is its addressable ID
 *  (a `condition.interval_item` names `{feature, property, interval}`; downstream sensors point at
 *  bands the same way); authored YAML rarely spells it — an unslugged row de-sugars from its
 *  `rating` axis. De-sugar runs FIRST so two bare rows sharing a rating collide and force explicit
 *  slugs — which guard-interval-slugs then requires to be defined vocabulary (a `limit_class`
 *  member, another enum member, an interval_item target, or a titled band), never free prose. A
 *  rating-less row (mode-only I-V points) stays unslugged. Mutates the resolved entry in place;
 *  runs AFTER resolveRepeatedFeatures so the filled part/instance rows are covered too. */
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

/** The gating tokens of a row's `condition` list — each setting's `equals` value or interval_item
 *  target, in order. They suffix the auto-slug so sibling rows sharing a tier but differing by
 *  condition disambiguate themselves (nominal_eu_230v_50hz, continuous_intermittent). */
function conditionSuffix(row: Obj): string {
	const conds = Array.isArray(row.condition) ? row.condition : [];
	const toks: string[] = [];
	for (const c of conds) {
		if (!isPlainObject(c)) continue;
		if (typeof c.equals === 'string') toks.push(c.equals); // { setting, equals: <member> }
		else if (typeof c.test_condition === 'string') toks.push(c.test_condition); // { test_condition }
		else {
			const item = c.interval_item;
			if (isPlainObject(item) && typeof item.interval === 'string') toks.push(item.interval);
		}
	}
	return toks.join('_');
}

/** The auto-slug for a row: its tier (or `zone` kind), the measurable channel's flow_direction/period
 *  axes, `mode`, and condition tokens — or undefined when the row is not auto-addressable (an
 *  unclassified band with no axis: the single undirected/lifetime measurable channel). Shared by the
 *  de-sugar and the slug-classifier check so both agree on what a legitimate auto-slug is. */
export function autoSlug(row: Obj): string | undefined {
	const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
	// Compose the handle from the band's identity axes, in order: its base classifier (rating tier,
	// else `nominal` for a bounds-free nameplate value — a derived tier, not an enum member, so it
	// never collides with the nominal property; else `zone`); then a measurable channel's
	// flow_direction + period (energy: out / out_daily / in / in_daily / daily); then `mode`, then each
	// gating condition. Enough to disambiguate every sibling that differs on any axis. A measurable band
	// with no axis at all (the one undirected/lifetime channel) has no auto-slug.
	const tokens: string[] = [];
	if (typeof band.rating === 'string') tokens.push(band.rating);
	else if (band.nominal !== undefined && band.min === undefined && band.max === undefined)
		tokens.push('nominal');
	else if (band.interval_kind === 'zone') tokens.push('zone');
	if (typeof band.flow_direction === 'string') tokens.push(band.flow_direction);
	if (typeof band.period === 'string') tokens.push(band.period);
	if (typeof band.mode === 'string') tokens.push(band.mode);
	const suffix = conditionSuffix(row);
	if (suffix) tokens.push(suffix);
	return tokens.length > 0 ? tokens.join('_') : undefined;
}

function slugIntervalRows(rows: unknown[], at: string): void {
	const seen = new Map<string, number>();
	rows.forEach((row, i) => {
		if (!isPlainObject(row)) return;
		const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
		// interval_kind: rating is DERIVED from a rating tier OR a bounds-free `nominal` (a nameplate
		// value IS a rating); never authored. measurable / zone are authored on interval_kind directly.
		if (
			band.interval_kind === undefined &&
			(typeof band.rating === 'string' ||
				(band.nominal !== undefined && band.min === undefined && band.max === undefined))
		)
			band.interval_kind = 'rating';
		const identity = isPlainObject(row.identity) ? (row.identity as Obj) : {};
		let slug = identity.slug;
		if (slug === undefined) {
			const auto = autoSlug(row);
			if (auto === undefined) return; // measurable / unclassified — not a reference handle
			slug = auto;
			row.identity = { ...identity, slug };
		}
		const prior = seen.get(String(slug));
		if (prior !== undefined)
			throw new Error(
				`grimoire catalog: interval slug "${String(slug)}" duplicated at ${at}[${prior}] and ${at}[${i}] — disambiguate via a distinct condition or author identity.slug`,
			);
		seen.set(String(slug), i);
	});
}

type BandSlug = { slug?: string; auto?: string; titled: boolean; kind?: string; at: string };

/** One walk of a resolved entry: every interval row (slug, its auto-slug, titled, interval_kind)
 *  plus every interval_item.interval target. */
function collectBandSlugs(node: unknown, at: string, bands: BandSlug[], targets: Set<string>): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => collectBandSlugs(v, `${at}[${i}]`, bands, targets));
		return;
	}
	if (!isPlainObject(node)) return;
	const item = node.interval_item;
	if (isPlainObject(item) && typeof item.interval === 'string') targets.add(item.interval);
	if (Array.isArray(node.intervals))
		node.intervals.forEach((row, i) => {
			if (!isPlainObject(row)) return;
			const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
			const identity = isPlainObject(row.identity) ? (row.identity as Obj) : {};
			bands.push({
				slug: typeof identity.slug === 'string' ? identity.slug : undefined,
				auto: autoSlug(row),
				titled: isPlainObject(row.title),
				kind: typeof band.interval_kind === 'string' ? band.interval_kind : undefined,
				at: `${at}.intervals[${i}]`,
			});
		});
	for (const [k, v] of Object.entries(node))
		collectBandSlugs(v, at ? `${at}.${k}` : k, bands, targets);
}

/** Parse-time slug-classifier gate — runs AFTER desugar (moved here from the former standalone
 *  scripts/guard-interval-slugs.ts). An interval's `identity.slug` is a REFERENCE HANDLE, never a
 *  classifier. Legitimate only when it is the row's OWN auto-slug (tier/kind + condition tokens), a
 *  referenced interval_item target, or a titled band. A hand-typed classifier (`peak`,
 *  `rated_continuous`) is none of these — model it as an axis. A zone MUST carry a slug and be
 *  referenced (a slugless zone is unreachable, an unreferenced one a dead anchor). */
export function validateIntervalSlugs(entry: Record<string, unknown>, path: string): void {
	const bands: BandSlug[] = [];
	const targets = new Set<string>();
	collectBandSlugs(entry, '', bands, targets);
	const fails: string[] = [];
	for (const b of bands) {
		const referenced = b.slug !== undefined && targets.has(b.slug);
		if (b.kind === 'zone') {
			if (b.slug === undefined) fails.push(`${b.at}: zone band without identity.slug — unreachable`);
			else if (!referenced)
				fails.push(`${b.at}: zone "${b.slug}" has no inbound interval_item — dead anchor`);
			continue;
		}
		if (b.slug !== undefined && b.slug !== b.auto && !referenced && !b.titled)
			fails.push(
				`${b.at}: slug "${b.slug}" is a classifier — not its auto-slug, unreferenced, untitled; move its meaning onto an axis`,
			);
	}
	if (fails.length > 0)
		throw new Error(
			`grimoire catalog ${path}: ${fails.length} classifier slug(s) / broken zone(s):\n  ${fails.join('\n  ')}`,
		);
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
		// The column key is the bare `quantity_kind` (features/measurand_link.yaml). flow_direction /
		// period narrow it to one measurable interval — authored on the entry, not invented here.
		// measurandNode reads only part_id/ordinal.
		const colKey = isPlainObject(reg) ? reg.quantity_kind : undefined;
		if (!isPlainObject(reg) || reg.feature_id === undefined || colKey === undefined) continue;
		const feature = entry[String(reg.feature_id)];
		if (!isPlainObject(feature)) continue; // unresolvable link — a separate link-validation concern, not ours to invent
		childObj(measurandNode(feature, String(reg.feature_id), reg), String(colKey));
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
