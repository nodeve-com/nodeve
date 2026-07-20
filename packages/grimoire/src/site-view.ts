// The site-bundle reader — THE consumer-facing SDK over a baked `site.generated.json`. ha-config
// and the esphome codegen don't re-implement the site_adapter → site_catalog → device →
// `catalog_patch` chain each time they need a sensor's `slug`; they `openSite(bundle)` and ask.
//
// The bundle on disk is SNAKE (the desugared wire twin); this reader camelizes each authored block
// at its edge — the SAME snake→camel rename `parseConcept` runs, mapping-driven off the concept's
// `x-key-map` — so everything this SDK hands back is camelCase, like the generated-TS device grain.
// measurand-tree owns the shared measurand grammar for both sides.
//
// The two indirections this untangles:
//   • catalogItem — an adapter (or anything) names its metered thing by `{archetypeId, slug}`. The
//     ref resolves EITHER to a site_catalog entry (the site-local indirection: `<device
//     archetype>/<entry slug>`) or, failing that, straight to a grimoire device.
//   • catalogPatch — the site_catalog entry carries the sparse slug patch `generate-site` baked;
//     merged onto the loaded grimoire device it puts each measurand column's `slug` in place.

import { type CatalogDevice, type CatalogIdentity, type ModbusRegister, loadDevice } from './catalog.ts';
import { camelizeInstance } from '@nodeve/schema-case';
import { isPlainObject } from 'remeda';
import { type ConceptTypes, conceptSchema } from './generated/index.ts';
import { overlayPatch } from './overlay.ts';
import {
	type MeasurandCell,
	type Obj,
	measurandCells,
	measurandKey,
	patchFromWire,
	specSlugQualified,
} from './measurand-tree.ts';

/** A baked site bundle, as read from `site.generated.json` (snake_case wire twin — this reader
 *  camelizes each block it consumes at the edge). */
export type SiteBundle = Record<string, unknown>;

type SiteCatalogEntry = ConceptTypes['siteCatalog'];
type SiteAdapter = ConceptTypes['siteAdapter'];

/** Camelize one authored bundle block against its concept schema — the `parseConcept` snake→camel
 *  edge, minus re-validation (the bake already validated). A free-form leaf (`catalogPatch`) rides
 *  through snake, camelized separately by `patchFromWire` at overlay. */
const camelizeBlock = <K extends keyof ConceptTypes>(concept: K, data: unknown): ConceptTypes[K] =>
	camelizeInstance(conceptSchema[concept], data) as ConceptTypes[K];

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
/** A `catalogItem` ref — camel `{archetypeId, slug}`, the same identity a device loads by. */
export type CatalogItemRef = CatalogIdentity;
const refKey = ({ archetypeId, slug }: CatalogItemRef): string => `${archetypeId}/${slug}`;

function siteIndexes(bundle: SiteBundle) {
	const catalog = (Array.isArray(bundle.site_catalog) ? bundle.site_catalog : []).map((e) =>
		camelizeBlock('siteCatalog', e),
	);
	const adapters = (Array.isArray(bundle.site_adapter) ? bundle.site_adapter : []).map((a) =>
		camelizeBlock('siteAdapter', a),
	);
	const bySiteRef = new Map<string, SiteCatalogEntry>();
	for (const entry of catalog)
		bySiteRef.set(`${entry.inventory?.catalogItem?.archetypeId}/${entry.identity?.slug}`, entry);
	const byAdapterSlug = new Map(adapters.map((a) => [a.identity?.slug as string, a]));
	return { adapters, bySiteRef, byAdapterSlug };
}

function resolveDevice(bySiteRef: Map<string, SiteCatalogEntry>, ref: CatalogItemRef): ResolvedDevice {
	const entry = bySiteRef.get(refKey(ref));
	if (!entry) {
		const device = loadDevice(ref);
		return { device, patch: {}, merged: device, siteLocal: false };
	}
	const item = entry.inventory?.catalogItem;
	const device = loadDevice({ archetypeId: item?.archetypeId as string, slug: item?.slug as string });
	// catalogPatch rode through as a free-form snake leaf (its shape is the device's, no schema knows
	// it); camelize it to the device grain before overlaying — the merged tree, and so this whole SDK,
	// is camel end to end.
	const patch = patchFromWire(asObj(entry.inventory?.catalogPatch));
	return { device, patch, merged: overlayPatch(device, patch) as CatalogDevice, siteLocal: true };
}

function sensorsFor(bySiteRef: Map<string, SiteCatalogEntry>, ref: CatalogItemRef): SiteSensor[] {
	const { merged, siteLocal } = resolveDevice(bySiteRef, ref);
	// The instance prefix the bake qualified ids with is the site_catalog entry's own slug.
	const instance = bySiteRef.get(refKey(ref))?.identity?.slug ?? '';
	return measurandCells(merged).map((cell) => {
		// The bake stamps only the QUALIFIED id; the SCOPED (device-local) slug is it minus the
		// `<instance>_` prefix — not stored twice. `cell.interval` (from specSlug) stays the raw
		// channel handle, never the sensor id.
		const slugQualified = specSlugQualified(cell.node);
		if (typeof slugQualified !== 'string')
			throw new Error(
				`no slug for ${refKey(ref)} ${cell.featureId}.${cell.partId ?? cell.ordinal ?? 'combined'}.${cell.propertyId}` +
					(siteLocal
						? ''
						: ' (ref does not resolve to a site_catalog entry — give the metered device one)'),
			);
		const prefix = `${instance}_`;
		const slug = slugQualified.startsWith(prefix)
			? slugQualified.slice(prefix.length)
			: slugQualified;
		return { ...cell, slug, slugQualified };
	});
}

/** One modbus register paired with the baked sensor it reads (undefined for an unlinked register
 *  — no `interval_item`). */
export interface LinkedRegister {
	register: ModbusRegister;
	sensor?: SiteSensor;
}

/** Join a device's modbus registers to the baked sensors they read — the register→channel link done
 *  ONCE here, by the shared measurand coordinate, so a downstream register generator reads
 *  `sensor.slug` and never re-spells the coordinate. A register with no `interval_item` (an unlinked
 *  discovery/decode word) carries no sensor. Register and sensor are two projections of the ONE
 *  `interval_item` pointer (`featureId`/`propertyId`/`intervalId`…), so `measurandKey` reads the same
 *  fields off both. */
export function linkRegisters(
	registers: ModbusRegister[],
	sensors: SiteSensor[],
): LinkedRegister[] {
	const byCoord = new Map(sensors.map((s) => [measurandKey(s), s]));
	return registers.map((register) => ({
		register,
		// The register carries the `interval_item` pointer (modbus_registers composes measurand_link),
		// so that pointer's fields ARE the join key — no re-spell.
		sensor: register.intervalItem?.propertyId
			? byCoord.get(measurandKey(register.intervalItem))
			: undefined,
	}));
}

/** Open a baked site bundle for reading. Indexes its site_catalog + site_adapter once; every lookup
 *  below reads those indexes. */
export function openSite(bundle: SiteBundle) {
	// site_catalog is referenced as `<its device's archetype>/<its own slug>` — the same key
	// `generate-site` validates against (the device archetype is what a catalog_item names, the slug
	// is the site-local one). Build that lookup once.
	const { adapters, bySiteRef, byAdapterSlug } = siteIndexes(bundle);

	/** Resolve a `catalog_item` ref to its device, the site's slug patch, and the two merged. A ref
	 *  that matches a site_catalog entry resolves through it (carrying baked slugs); one
	 *  that doesn't loads the grimoire device directly (no patch, no slugs). Throws (via `loadDevice`)
	 *  on a dangling ref, naming the bad ref + the valid set. */
	function resolve(ref: CatalogItemRef): ResolvedDevice {
		return resolveDevice(bySiteRef, ref);
	}

	/** Every sensor of a resolved metered thing — the flat, slug-bearing list a generator iterates.
	 *  Throws if a column lacks a slug (a metered device reached other than through a site_catalog
	 *  entry has no baked ids — route it through one). */
	function sensors(ref: CatalogItemRef): SiteSensor[] {
		return sensorsFor(bySiteRef, ref);
	}

	return {
		bundle,
		/** The site's adapters, in bundle order (camelCased). */
		adapters,
		/** One adapter by its `identity.slug`, or throw. */
		adapter(slug: string): SiteAdapter {
			const a = byAdapterSlug.get(slug);
			if (!a)
				throw new Error(
					`no site_adapter "${slug}" (have: ${[...byAdapterSlug.keys()].sort().join(', ')})`,
				);
			return a;
		},
		resolve,
		sensors,
		/** The sensors an adapter meters — `sensors(adapter.ingest.catalogItem)`. */
		adapterSensors(adapter: SiteAdapter): SiteSensor[] {
			const ref = adapter.ingest?.catalogItem;
			if (!ref?.archetypeId || !ref.slug)
				throw new Error(`site_adapter "${adapter.identity?.slug}" has no ingest.catalog_item`);
			return sensors(ref as CatalogItemRef);
		},
	};
}

export type SiteView = ReturnType<typeof openSite>;
