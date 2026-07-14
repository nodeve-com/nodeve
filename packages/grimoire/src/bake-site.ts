// Site compiler (mechanism): bake one `<sitesDir>/<name>/` tree of per-concept YAML into the single
// `site.generated.json` bundle every downstream consumer (ha-config, the gateway) reads. Each top-level
// `<concept>.yaml` (hyphens → underscores) is validated against its grimoire concept schema and
// dropped in under that key. Two subtrees each bake — through their `_defaults.yaml` cascade — to
// an ARRAY of instances: `catalog/` → `site_catalog` entries under `catalog`, `adapter/` →
// `site_adapter` instances under `adapters`. A site_adapter's `ingest.catalog_item` (like any
// `catalog_item` in the bundle) must resolve to a `site_catalog` entry or a grimoire device.
// Anything whose name isn't a grimoire concept is IGNORED — a site may hold blocks grimoire
// doesn't own yet. Output is snake_case (the schemas ARE the snake JSON contract); consumers
// camelCase at their own `parseConcept` edge.
//
// This is pure mechanism: it takes the site's source dir and returns the validated bundle. The
// deploying repo owns *where* sites live and *writing* the artifact (grimoire never resolves a sites
// path from its own installed location); it drives this via `bakeSite` from a thin wrapper.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isPlainObject } from 'remeda';
import humps from 'remeda-humps';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { effectiveSlug, loadCascade } from './cascade.ts';
import { loadDevice } from './catalog.ts';
import { scopedSensorId, sensorId } from './sensor-id.ts';
import {
	type Obj,
	isMeasurandFeature,
	quantityCode,
	quantityCols,
	snakeKey,
	specSlugPatch,
} from './measurand-tree.ts';
import { isConcept, validateSite } from './validate-site.ts';

const readYaml = (path: string): unknown => parseYaml(readFileSync(path, 'utf8'));
const stemKey = (file: string): string => basename(file, '.yaml').replace(/-/g, '_');

const asIdentity = (v: unknown): { archetype_id?: string; slug?: string } =>
	(v && typeof v === 'object' ? v : {}) as never;

function bakeCascade(siteDir: string, dir: string): Record<string, unknown>[] {
	const root = join(siteDir, dir);
	if (!existsSync(root)) return [];
	return loadCascade(root).map(({ path, data }) => {
		const identity = asIdentity(data.identity);
		data.identity = { ...identity, slug: effectiveSlug(path, identity) };
		return data;
	});
}

const inventoryItem = (entry: Record<string, unknown>): { archetype_id?: string; slug?: string } =>
	asIdentity((asIdentity(entry.inventory) as { catalog_item?: unknown }).catalog_item);

const featureSlug = (node: Obj, feature: string): string =>
	isPlainObject(node.identity) && typeof (node.identity as Obj).slug === 'string'
		? ((node.identity as Obj).slug as string)
		: snakeKey(feature);

function assertUniqueFeatureSlugs(features: [string, Obj][], entry: Record<string, unknown>): void {
	const byRendered = new Map<string, string>();
	for (const [feature, node] of features) {
		const rendered = featureSlug(node, feature);
		const holder = byRendered.get(rendered);
		if (holder)
			throw new Error(
				`feature slug collision: ${holder} and ${feature} both render as "${rendered}" (identity.slug on device ${asIdentity(inventoryItem(entry)).slug})`,
			);
		byRendered.set(rendered, feature);
	}
}

function featurePatch(instance: string, feature: string, node: Obj): Obj {
	const slugAt = (
		partId: string | undefined,
		ordinal: number | undefined,
		quantityKind: string,
	) => {
		const parts = { instance, feature: featureSlug(node, feature), partId, ordinal, quantityKind };
		return specSlugPatch(scopedSensorId(parts), sensorId(parts));
	};
	const cols = (source: Obj, partId?: string, ordinal?: number): Obj =>
		Object.fromEntries(
			quantityCols(source).map((kind) => [kind, slugAt(partId, ordinal, quantityCode(kind))]),
		);
	const spec = node.featureSpec as Obj;
	const patch: Obj = {};
	if (isPlainObject(spec.combined)) patch.combined = cols(spec.combined);
	if (isPlainObject(spec.part))
		patch.part = Object.fromEntries(
			Object.entries(spec.part as Obj).map(([id, part]) => [id, cols(part as Obj, id)]),
		);
	if (Array.isArray(spec.instances))
		patch.instances = (spec.instances as Obj[]).map((item, index) =>
			cols(item, undefined, index + 1),
		);
	return patch;
}

function catalogPatch(entry: Record<string, unknown>): Obj {
	const instance = asIdentity(entry.identity).slug as string;
	const item = inventoryItem(entry);
	const device = loadDevice({
		archetypeId: item.archetype_id as string,
		slug: item.slug as string,
	});
	const features = Object.entries(device).filter(([, node]) => isMeasurandFeature(node)) as [
		string,
		Obj,
	][];
	assertUniqueFeatureSlugs(features, entry);
	return Object.fromEntries(
		features.map(([feature, node]) => [
			feature,
			{ featureSpec: featurePatch(instance, feature, node) },
		]),
	);
}

const SITE_CATALOG_KEYS = new Set(['identity', 'title', 'description', 'refs', 'inventory']);

function applyCatalogPatch(entry: Record<string, unknown>): void {
	const patch = catalogPatch(entry);
	for (const key of Object.keys(entry)) {
		if (SITE_CATALOG_KEYS.has(key)) continue;
		Object.assign(patch, humps({ [key]: entry[key] }));
		delete entry[key];
	}
	if (Object.keys(patch).length === 0) return;
	const inventory = (
		isPlainObject(entry.inventory) ? entry.inventory : (entry.inventory = {})
	) as Obj;
	inventory.catalog_patch = patch;
}

function checkCatalogItems(
	node: unknown,
	context: { where: string; label: string; refs: Set<string> },
): void {
	const { where, label, refs } = context;
	if (Array.isArray(node)) {
		node.forEach((value, index) =>
			checkCatalogItems(value, { ...context, where: `${where}[${index}]` }),
		);
		return;
	}
	if (!node || typeof node !== 'object') return;
	for (const [key, value] of Object.entries(node)) {
		if (key === 'catalog_item') validateCatalogItem(value, { where, label, refs });
		checkCatalogItems(value, { ...context, where: `${where}.${key}` });
	}
}

function validateCatalogItem(
	value: unknown,
	context: { where: string; label: string; refs: Set<string> },
): void {
	const ref = asIdentity(value);
	if (context.refs.has(`${ref.archetype_id}/${ref.slug}`)) return;
	try {
		loadDevice({ archetypeId: ref.archetype_id as string, slug: ref.slug as string });
	} catch (error) {
		throw new Error(
			`${context.label} at ${context.where}.catalog_item: ${(error as Error).message}`,
			{
				cause: error,
			},
		);
	}
}

/** Bake a site's source YAML tree into its validated `site.generated.json` bundle. `siteDir` is the
 *  absolute path to `<sitesDir>/<name>/`; `label` names the site in error messages (defaults to the
 *  dir's basename). Returns the assembled, schema-checked bundle — the caller writes it. */
export function bakeSite(
	siteDir: string,
	label: string = basename(siteDir),
): Record<string, unknown> {
	const bundle: Record<string, unknown> = {};

	// Top-level <concept>.yaml → bundle[<concept>]. Non-concept stems (z_wave, …) are ignored.
	for (const entry of readdirSync(siteDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.yaml') || entry.name.startsWith('_')) continue;
		const key = stemKey(entry.name);
		if (!isConcept(key)) continue;
		bundle[key] = readYaml(join(siteDir, entry.name));
	}

	// catalog/ dir → `site_catalog` entries. Their identity (now always slug-bearing) + underlying
	// device archetype (`inventory.catalog_item`) is the reference target adapters name; build that
	// lookup as we bake.
	const catalog = bakeCascade(siteDir, 'catalog');
	const catalogRefs = new Set(
		catalog.map((e) => `${inventoryItem(e).archetype_id}/${asIdentity(e.identity).slug}`),
	);
	for (const entry of catalog) applyCatalogPatch(entry);
	if (catalog.length > 0) bundle.site_catalog = catalog;

	// adapter/ dir → `site_adapter` instances. An adapter names its metered thing via
	// `ingest.catalog_item` — a site_catalog entry (the common case, resolving the device + its baked
	// slugs) or a grimoire device direct; both are validated by `checkCatalogItems` below.
	const adapters = bakeCascade(siteDir, 'adapter');
	if (adapters.length > 0) bundle.site_adapter = adapters;

	// Every `catalog_item` anywhere in the bundle must resolve — either to a site_catalog entry
	// (archetype + slug in `catalogRefs`, the site-local indirection) or, failing that, to a real
	// grimoire catalog device by identity. A ref that is neither is a wiring bug, caught here via the
	// shared loader, which names the bad ref and the valid set.
	for (const [key, value] of Object.entries(bundle))
		checkCatalogItems(value, { where: key, label, refs: catalogRefs });

	// One schema check over the fully-assembled bundle — every block against its concept, keyed by the
	// bundle's own shape. Consumers read the written artifact and trust it; they don't re-validate.
	validateSite(bundle, label);

	return bundle;
}
