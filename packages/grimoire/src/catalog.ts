// Catalog loader: THE one way JS/TS reads the baked catalog. Resolve a device by the same reference
// a site's `catalog_item` names — its identity, `archetype` + slug (README "Using the catalog":
// identity is the stable reference; the tree path is filing).
//
// Serverless-safe: catalog/index.ts composes the per-slug entry modules, pure code with no fs read
// and no JSON import, so `loadDevice` bundles into a serverless build. The per-entry <slug>.json
// grain is the same data for a reader that reads JSON instead of importing.

import { catalogEntries } from './generated/catalog/index.ts';
import type { Modbus } from './generated/archetypes/modbus.ts';
import type { ModbusRegisters } from './generated/features/modbus_registers.ts';
import type { CatalogItem } from './generated/property/catalog_item.ts';

/** A device's stable reference — the generated `catalog_item` (`{archetypeId, slug}`), narrowed so both
 *  are present (a resolved identity, unlike the authorable optional-field concept). */
export type CatalogIdentity = Required<CatalogItem>;

/** One baked catalog entry (camelCase keys, as emitted — the snake wire shape is the .json twin).
 *  Identity is guaranteed; the archetype body varies by archetype — access its `modbus` etc. by key. */
export interface CatalogDevice {
	identity: CatalogIdentity & { code?: string };
	[key: string]: unknown;
}

const refOf = ({ archetypeId, slug }: CatalogIdentity): string => `${archetypeId}/${slug}`;

// Index every entry once, keyed by `archetypeId/slug`.
const index = new Map<string, CatalogDevice>(
	(catalogEntries as readonly CatalogDevice[]).map((d) => [refOf(d.identity), d]),
);

/** Every baked device's identity — the valid `catalog_item` reference targets. */
export const listDevices = (): CatalogIdentity[] =>
	[...index.values()].map((d) => ({ archetypeId: d.identity.archetypeId, slug: d.identity.slug }));

/** The catalog device an identity-shaped ref names, or throw naming the bad ref + the valid set. */
export function loadDevice(identity: CatalogIdentity): CatalogDevice {
	const device = index.get(refOf(identity));
	if (!device)
		throw new Error(
			`no grimoire catalog device \`${refOf(identity)}\` ` +
				`(have: ${listDevices().map(refOf).sort().join(', ')})`,
		);
	return device;
}

/** One decoded register of a modbus device — the generated `modbus_registers` row verbatim (numeric
 *  decode ⊕ its `interval_item` pointer: `featureId`/`propertyId`/`intervalId`…, absent for an unlinked
 *  discovery row). Never re-spelled here; the concept owns the shape. */
export type ModbusRegister = ModbusRegisters[number];

/** The modbus medium of a device, or throw if the device exposes none (a spec-only device — no `modbus`
 *  block, e.g. a `pv_module`). The generated `Modbus` guarantees `modbusRegisters` (the concept marks it
 *  required — a modbus medium IS its register map), so no narrowing is needed here. */
export function modbusMediumOf(device: CatalogDevice): Modbus {
	const modbus = device.modbus as Modbus | undefined;
	if (!modbus)
		throw new Error(`catalog device \`${refOf(device.identity)}\` has no modbus medium`);
	return modbus;
}
