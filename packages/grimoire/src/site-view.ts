// The site-bundle reader — THE consumer-facing SDK over a baked `site.generated.json`. ha-config
// and the esphome codegen don't re-implement the site_adapter → site_catalog → device →
// `catalog_patch` chain each time they need a sensor's `slug`; they `openSite(bundle)` and ask.
//
// Authored bundle blocks stay in their SNAKE wire shape — no reshape; consumers that want
// camelCase parse a block separately. The resolved DEVICE grain (loadDevice + catalog_patch)
// is the camel generated-TS catalog; measurand-tree owns that grammar for both sides.
//
// The two indirections this untangles:
//   • catalog_item — an adapter (or anything) names its metered thing by `{archetype_id, slug}`. The
//     ref resolves EITHER to a site_catalog entry (the site-local indirection: `<device
//     archetype>/<entry slug>`) or, failing that, straight to a grimoire device.
//   • catalog_patch — the site_catalog entry carries the sparse slug patch `generate-site` baked;
//     merged onto the loaded grimoire device it puts each measurand column's `slug` in place.

import { type CatalogDevice, loadDevice } from './catalog.ts';
import { isPlainObject } from 'remeda';
import { type MeasurandCell, type Obj, measurandCells, specSlug, specSlugQualified } from './measurand-tree.ts';

/** A baked site bundle, as read from `site.generated.json` (snake_case, pre-validated by the bake). */
export type SiteBundle = Record<string, unknown>;

/** One flattened sensor: its deterministic ids — SCOPED `slug` (device-local; a producer that already
 *  namespaces under its node/topic emits this) + QUALIFIED `slugQualified` (instance-prefixed, globally
 *  unique; HA's entity id) — where it sits in the device tree, and the merged measurand column node. */
export interface SiteSensor extends MeasurandCell {
	slug: string;
	slugQualified: string;
}

/** A resolved metered thing: the grimoire device, the site's sparse slug patch (empty for a direct
 *  grimoire ref), and the two merged into the device tree with `slug`s in place. */
export interface ResolvedDevice {
	device: CatalogDevice;
	patch: Obj;
	merged: CatalogDevice;
	/** Whether the ref went through a site_catalog entry (and so carries slugs). */
	siteLocal: boolean;
}

const asObj = (v: unknown): Obj => (isPlainObject(v) ? v : {});
// Named identityOf (not identity) — extracts an identity object, unlike remeda.identity.
const identityOf = (v: unknown): { archetype_id?: string; slug?: string } => asObj(v) as never;
/** A wire `catalog_item` ref, as authored in a site bundle (snake — this reader never reshapes). */
export type CatalogItemRef = { archetype_id: string; slug: string };
const refKey = ({ archetype_id, slug }: CatalogItemRef): string => `${archetype_id}/${slug}`;

// The `identity.slug` handle of an array element, or undefined for a positionally-keyed one.
const slugKey = (el: unknown): string | undefined => (isPlainObject(el) && isPlainObject(el.identity) ? ((el.identity as Obj).slug as string | undefined) : undefined);

// Overlay the sparse patch onto the device tree. Not remeda.mergeDeep: that REPLACES arrays, but a
// patch array is sparse and must merge element-wise onto the device's. Two array shapes coexist:
//   • IDENTITY-KEYED — every base element carries `identity.slug` (network_interfaces NICs). Match
//     patch elements to base by slug, so a site's authored [eth0, wlan0] overlays a device's
//     [wlan0, eth0] onto the RIGHT NIC (an index merge would swap the mac_addresses). A patch element
//     whose slug isn't on the device is APPENDED (the site adds a NIC the datasheet doesn't list).
//   • POSITIONAL — measurand `instances` (ordinal-keyed, no identity): merge by index.
// The patch only ever ADDS leaves; objects recurse, leaves overlay.
function overlayPatch(base: unknown, patch: unknown): unknown {
	if (Array.isArray(base) && Array.isArray(patch)) {
		if (base.length > 0 && base.every((el) => slugKey(el) !== undefined)) {
			const merged = base.map((el) => {
				const p = patch.find((pe) => slugKey(pe) === slugKey(el));
				return p === undefined ? el : overlayPatch(el, p);
			});
			for (const p of patch) if (!base.some((el) => slugKey(el) === slugKey(p))) merged.push(p);
			return merged;
		}
		return base.map((el, i) => overlayPatch(el, patch[i]));
	}
	if (isPlainObject(base) && isPlainObject(patch)) {
		const out: Obj = { ...base };
		for (const [k, v] of Object.entries(patch)) out[k] = overlayPatch(base[k], v);
		return out;
	}
	return patch === undefined ? base : patch;
}

/** Open a baked site bundle for reading. Indexes its site_catalog + site_adapter once; every lookup
 *  below reads those indexes. */
export function openSite(bundle: SiteBundle) {
	const catalog = (Array.isArray(bundle.site_catalog) ? bundle.site_catalog : []) as Obj[];
	const adapters = (Array.isArray(bundle.site_adapter) ? bundle.site_adapter : []) as Obj[];

	// site_catalog is referenced as `<its device's archetype>/<its own slug>` — the same key
	// `generate-site` validates against (the device archetype is what a catalog_item names, the slug
	// is the site-local one). Build that lookup once.
	const bySiteRef = new Map<string, Obj>();
	for (const entry of catalog) {
		const item = identityOf(asObj(entry.inventory).catalog_item);
		bySiteRef.set(`${item.archetype_id}/${identityOf(entry.identity).slug}`, entry);
	}
	const byAdapterSlug = new Map<string, Obj>(adapters.map((a) => [identityOf(a.identity).slug as string, a]));

	/** Resolve a `catalog_item` ref to its device, the site's slug patch, and the two merged. A ref
	 *  that matches a site_catalog entry resolves through it (carrying baked slugs); one
	 *  that doesn't loads the grimoire device directly (no patch, no slugs). Throws (via `loadDevice`)
	 *  on a dangling ref, naming the bad ref + the valid set. */
	function resolve(ref: CatalogItemRef): ResolvedDevice {
		const entry = bySiteRef.get(refKey(ref));
		if (entry) {
			const inventory = asObj(entry.inventory);
			const item = identityOf(inventory.catalog_item);
			const device = loadDevice({ archetypeId: item.archetype_id as string, slug: item.slug as string });
			const patch = asObj(inventory.catalog_patch);
			return { device, patch, merged: overlayPatch(device, patch) as CatalogDevice, siteLocal: true };
		}
		const device = loadDevice({ archetypeId: ref.archetype_id, slug: ref.slug });
		return { device, patch: {}, merged: device, siteLocal: false };
	}

	/** Every sensor of a resolved metered thing — the flat, slug-bearing list a generator iterates.
	 *  Throws if a column lacks a slug (a metered device reached other than through a site_catalog
	 *  entry has no baked ids — route it through one). */
	function sensors(ref: CatalogItemRef): SiteSensor[] {
		const { merged, siteLocal } = resolve(ref);
		return measurandCells(merged).map((cell) => {
			const slug = specSlug(cell.node);
			const slugQualified = specSlugQualified(cell.node);
			if (typeof slug !== 'string' || typeof slugQualified !== 'string')
				throw new Error(
					`no slug for ${refKey(ref)} ${cell.feature}.${cell.partId ?? cell.ordinal ?? 'combined'}.${cell.quantityKind}` +
						(siteLocal ? '' : ' (ref does not resolve to a site_catalog entry — give the metered device one)'),
				);
			return { ...cell, slug, slugQualified };
		});
	}

	return {
		bundle,
		/** The site's adapters, in bundle order (raw snake entries). */
		adapters,
		/** One adapter by its `identity.slug`, or throw. */
		adapter(slug: string): Obj {
			const a = byAdapterSlug.get(slug);
			if (!a) throw new Error(`no site_adapter "${slug}" (have: ${[...byAdapterSlug.keys()].sort().join(', ')})`);
			return a;
		},
		resolve,
		sensors,
		/** The sensors an adapter meters — `sensors(adapter.ingest.catalog_item)`. */
		adapterSensors(adapter: Obj): SiteSensor[] {
			const ref = identityOf(asObj(adapter.ingest).catalog_item);
			if (!ref.archetype_id || !ref.slug) throw new Error(`site_adapter "${identityOf(adapter.identity).slug}" has no ingest.catalog_item`);
			return sensors(ref as CatalogItemRef);
		},
	};
}

export type SiteView = ReturnType<typeof openSite>;
