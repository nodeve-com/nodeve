// Catalog loader: THE one way JS/TS reads the baked catalog. Resolve a device by the same reference
// a site's `catalog_item` names — its identity, `archetype` + slug (README "Using the catalog":
// identity is the stable reference; the tree path is filing).
//
// Serverless-safe: catalog/index.ts composes the per-slug entry modules, pure code with no fs read
// and no JSON import, so `loadDevice` bundles into a serverless build. The per-entry <slug>.json
// grain is the same data for a reader that reads JSON instead of importing.

import { catalogEntries } from '../generated/catalog/index.ts';

/** A device's stable reference — archetype + slug, exactly as a site `catalog_item` names it. */
export interface CatalogIdentity {
	archetype: string;
	slug: string;
}

/** One baked catalog entry (snake_case, as emitted). Identity is guaranteed; the archetype body
 *  varies by archetype — access its `modbus` etc. by key, or camelCase at your parse edge. */
export interface CatalogDevice {
	identity: CatalogIdentity & { code?: string };
	[key: string]: unknown;
}

const refOf = ({ archetype, slug }: CatalogIdentity): string => `${archetype}/${slug}`;

// Index every entry once, keyed by `archetype/slug`.
const index = new Map<string, CatalogDevice>(
	(catalogEntries as readonly CatalogDevice[]).map((d) => [refOf(d.identity), d]),
);

/** Every baked device's identity — the valid `catalog_item` reference targets. */
export const listDevices = (): CatalogIdentity[] =>
	[...index.values()].map((d) => ({ archetype: d.identity.archetype, slug: d.identity.slug }));

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

/** One decoded register of a modbus device (snake, as emitted): its address + wire type/scale, and
 *  EITHER a measurand link (`feature_id` + `quantity_kind`, optional `part_id`/`ordinal`) OR a bare
 *  `raw_name` when still unattributed. `unit`/`decimals` present only when authored. */
export interface ModbusRegister {
	address: number;
	type: string;
	scale?: number;
	unit?: string;
	decimals?: number;
	feature_id?: string;
	part_id?: string;
	ordinal?: number;
	quantity_kind?: string;
	raw_name?: string;
	[key: string]: unknown;
}

/** A device's modbus medium — the register map + how the bus is talked to (`serial_port`,
 *  `serial_wire`, `modbus_link`), exactly as emitted. The one accessor a gateway/codegen reads to
 *  decode this device (README "Using the catalog"). */
export interface ModbusMedium {
	modbus_registers: ModbusRegister[];
	serial_port?: { baud_rate?: number; [key: string]: unknown };
	serial_wire?: Record<string, unknown>;
	modbus_link?: Record<string, unknown>;
	[key: string]: unknown;
}

/** The modbus medium of a device, or throw if it exposes none (a spec-only catalog entry). */
export function modbusMediumOf(device: CatalogDevice): ModbusMedium {
	const modbus = device.modbus as ModbusMedium | undefined;
	if (!modbus?.modbus_registers)
		throw new Error(`catalog device \`${refOf(device.identity)}\` has no modbus register map`);
	return modbus;
}
