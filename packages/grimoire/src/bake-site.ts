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
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { effectiveSlug, loadCascade } from './cascade.ts';
import { loadDevice } from './catalog.ts';
import { scopedSensorId, sensorId } from './sensor-id.ts';
import { type Obj, isMeasurandFeature, quantityCols, specSlugPatch } from './measurand-tree.ts';
import { isConcept, validateSite } from './validate-site.ts';

const readYaml = (path: string): unknown => parseYaml(readFileSync(path, 'utf8'));
const stemKey = (file: string): string => basename(file, '.yaml').replace(/-/g, '_');

const asIdentity = (v: unknown): { archetype_id?: string; slug?: string } =>
	(v && typeof v === 'object' ? v : {}) as never;

/** Bake a site's source YAML tree into its validated `site.generated.json` bundle. `siteDir` is the
 *  absolute path to `<sitesDir>/<name>/`; `label` names the site in error messages (defaults to the
 *  dir's basename). Returns the assembled, schema-checked bundle — the caller writes it. */
export function bakeSite(siteDir: string, label: string = basename(siteDir)): Record<string, unknown> {
	const bundle: Record<string, unknown> = {};

	// Top-level <concept>.yaml → bundle[<concept>]. Non-concept stems (z_wave, …) are ignored.
	for (const entry of readdirSync(siteDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.yaml') || entry.name.startsWith('_')) continue;
		const key = stemKey(entry.name);
		if (!isConcept(key)) continue;
		bundle[key] = readYaml(join(siteDir, entry.name));
	}

	// A cascade subtree (catalog/, adapter/) → an ARRAY of instances, loaded through the SAME
	// `_defaults.yaml`-cascade walker the catalog bake uses (`loadCascade`). Each leaf's `identity.slug`
	// is filled from its path via the shared `effectiveSlug`. Empty/absent dir → []. The assembled
	// bundle is schema-checked in one pass below (`validateSite`), not per-leaf here.
	const bakeCascade = (dir: string): Record<string, unknown>[] => {
		const root = join(siteDir, dir);
		if (!existsSync(root)) return [];
		return loadCascade(root).map(({ path, data }) => {
			const identity = asIdentity(data.identity);
			data.identity = { ...identity, slug: effectiveSlug(path, identity) };
			return data;
		});
	};

	// catalog/ dir → `site_catalog` entries. Their identity (now always slug-bearing) + underlying
	// device archetype (`inventory.catalog_item`) is the reference target adapters name; build that
	// lookup as we bake.
	const catalog = bakeCascade('catalog');
	const inventoryItem = (e: Record<string, unknown>): { archetype_id?: string; slug?: string } =>
		asIdentity((asIdentity(e.inventory) as { catalog_item?: unknown }).catalog_item);
	const catalogRefs = new Set(
		catalog.map((e) => `${inventoryItem(e).archetype_id}/${asIdentity(e.identity).slug}`),
	);
	// Sensor-slug projection: THE one place a measurand's on-bus name is derived. For every site_catalog
	// entry we load its grimoire device, walk its SPECIFICATION measurand tree (the quantity columns —
	// raw/setting registers never appear here), and project one deterministic `slug` per column via
	// `sensorId`. The feature segment is the feature's own on-bus handle — its authored `identity.slug`
	// (e.g. `ac_phase_three_point → ac`, a catalog fact, site-agnostic), or the feature slug itself when
	// unauthored. The result is a SPARSE PATCH mirroring the device tree —
	// `{feature}.{combined|part.<id>|instances[n]}.{quantity_kind}.identity.slug` — stamped onto the
	// entry's `inventory.catalog_patch`. Only the patch travels in site.generated.json; consumers deep-
	// merge it onto the loaded device themselves (PLANS/deterministic-sensor-ids.md). The structural
	// grammar (isMeasurandFeature/quantityCols) is shared with the reader in kit/measurand-tree.ts.
	const featureSlug = (node: Obj, feature: string): string =>
		isPlainObject(node.identity) && typeof (node.identity as Obj).slug === 'string'
			? ((node.identity as Obj).slug as string)
			: feature;
	const catalogPatch = (entry: Record<string, unknown>): Obj => {
		const instance = asIdentity(entry.identity).slug as string;
		const item = inventoryItem(entry);
		const device = loadDevice({ archetypeId: item.archetype_id as string, slug: item.slug as string });
		const features = Object.entries(device).filter(([, node]) => isMeasurandFeature(node)) as [string, Obj][];
		// The feature-segment slugs must not collide — two features rendering to one on-bus handle would
		// mint the same sensor id for distinct measurands.
		const byRendered = new Map<string, string>();
		for (const [feature, node] of features) {
			const rendered = featureSlug(node, feature);
			const holder = byRendered.get(rendered);
			if (holder) throw new Error(`feature slug collision: ${holder} and ${feature} both render as "${rendered}" (identity.slug on device ${asIdentity(inventoryItem(entry)).slug})`);
			byRendered.set(rendered, feature);
		}

		const patch: Obj = {};
		for (const [feature, node] of features) {
			const slugAt = (partId: string | undefined, ordinal: number | undefined, quantityKind: string): Obj => {
				const parts = { instance, feature: featureSlug(node, feature), partId, ordinal, quantityKind };
				return specSlugPatch(scopedSensorId(parts), sensorId(parts));
			};
			const cols = (src: Obj, partId?: string, ordinal?: number): Obj =>
				Object.fromEntries(quantityCols(src).map((qk) => [qk, slugAt(partId, ordinal, qk)]));
			const fs = node.feature_spec as Obj;
			const fp: Obj = {};
			if (isPlainObject(fs.combined)) fp.combined = cols(fs.combined); // the whole / a single spec feature's columns
			if (isPlainObject(fs.part)) fp.part = Object.fromEntries(Object.entries(fs.part as Obj).map(([pid, p]) => [pid, cols(p as Obj, pid)]));
			if (Array.isArray(fs.instances)) fp.instances = (fs.instances as Obj[]).map((inst, i) => cols(inst, undefined, i + 1));
			patch[feature] = { feature_spec: fp };
		}
		return patch;
	};

	// A site_catalog entry owns exactly these top-level keys (its `thing` identity + the `inventory`
	// feature). Anything else the author wrote is a sparse OVERLAY onto the referenced device — device
	// facts the site adds that no measurand projection can know (e.g. `network_interfaces` mac_addresses,
	// keyed by each NIC's `identity.slug`). Fold those into `catalog_patch` beside the baked measurand
	// slugs and strip them from the entry, so it validates as a pure site_catalog and the reader
	// (kit/site-view `overlayPatch`) merges the whole patch onto the device. See docs/site-overlay.md.
	const SITE_CATALOG_KEYS = new Set(['identity', 'title', 'description', 'refs', 'inventory']);
	for (const entry of catalog) {
		const patch = catalogPatch(entry);
		for (const key of Object.keys(entry)) {
			if (SITE_CATALOG_KEYS.has(key)) continue;
			patch[key] = entry[key];
			delete entry[key];
		}
		if (Object.keys(patch).length > 0) {
			const inventory = (isPlainObject(entry.inventory) ? entry.inventory : (entry.inventory = {})) as Obj;
			inventory.catalog_patch = patch;
		}
	}
	if (catalog.length > 0) bundle.site_catalog = catalog;

	// adapter/ dir → `site_adapter` instances. An adapter names its metered thing via
	// `ingest.catalog_item` — a site_catalog entry (the common case, resolving the device + its baked
	// slugs) or a grimoire device direct; both are validated by `checkCatalogItems` below.
	const adapters = bakeCascade('adapter');
	if (adapters.length > 0) bundle.site_adapter = adapters;

	// Every `catalog_item` anywhere in the bundle must resolve — either to a site_catalog entry
	// (archetype + slug in `catalogRefs`, the site-local indirection) or, failing that, to a real
	// grimoire catalog device by identity. A ref that is neither is a wiring bug, caught here via the
	// shared loader, which names the bad ref and the valid set.
	const checkCatalogItems = (node: unknown, where: string): void => {
		if (Array.isArray(node)) return node.forEach((v, i) => checkCatalogItems(v, `${where}[${i}]`));
		if (!node || typeof node !== 'object') return;
		for (const [key, value] of Object.entries(node)) {
			if (key === 'catalog_item') {
				const ref = asIdentity(value);
				if (!catalogRefs.has(`${ref.archetype_id}/${ref.slug}`)) {
					try {
						loadDevice({ archetypeId: ref.archetype_id as string, slug: ref.slug as string });
					} catch (e) {
						throw new Error(`${label} at ${where}.catalog_item: ${(e as Error).message}`);
					}
				}
			}
			checkCatalogItems(value, `${where}.${key}`);
		}
	};
	for (const [key, value] of Object.entries(bundle)) checkCatalogItems(value, key);

	// One schema check over the fully-assembled bundle — every block against its concept, keyed by the
	// bundle's own shape. Consumers read the written artifact and trust it; they don't re-validate.
	validateSite(bundle, label);

	return bundle;
}
