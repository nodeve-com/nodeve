// Catalog loader: THE one way JS/TS reads the baked catalog. Resolve a device by the same reference
// a site's `catalog_item` names — its identity, `archetype` + slug (README "Using the catalog":
// identity is the stable reference; the tree path is filing).
//
// Serverless-safe: catalog/index.ts composes the per-slug entry modules, pure code with no fs read
// and no JSON import, so `loadDevice` bundles into a serverless build. The per-entry <slug>.json
// grain is the same data for a reader that reads JSON instead of importing.

import { catalogEntries } from './generated/catalog/index.ts';

/** A device's stable reference — archetype + slug, exactly as a site `catalog_item` names it. */
export interface CatalogIdentity {
	archetype: string;
	slug: string;
}

/** One baked catalog entry (camelCase keys, as emitted — the snake wire shape is the .json twin).
 *  Identity is guaranteed; the archetype body varies by archetype — access its `modbus` etc. by key. */
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

/** One decoded register of a modbus device (camelCase, as emitted): its address + wire type/scale,
 *  and EITHER a measurand link (`featureId` + `quantityKind`, optional `partId`/`ordinal`) OR a bare
 *  `rawName` when still unattributed. `unit`/`decimals` present only when authored. */
export interface ModbusRegister {
	address: number;
	type: string;
	scale?: number;
	unit?: string;
	decimals?: number;
	featureId?: string;
	partId?: string;
	ordinal?: number;
	quantityKind?: string;
	rawName?: string;
	[key: string]: unknown;
}

/** A device's modbus medium — the register map + how the bus is talked to (`serialPort`,
 *  `serialWire`, `modbusLink`), exactly as emitted. The one accessor a gateway/codegen reads to
 *  decode this device (README "Using the catalog"). */
export interface ModbusMedium {
	modbusRegisters: ModbusRegister[];
	serialPort?: { baudRate?: number; [key: string]: unknown };
	serialWire?: Record<string, unknown>;
	modbusLink?: Record<string, unknown>;
	[key: string]: unknown;
}

/** The modbus medium of a device, or throw if it exposes none (a spec-only catalog entry). */
export function modbusMediumOf(device: CatalogDevice): ModbusMedium {
	const modbus = device.modbus as ModbusMedium | undefined;
	if (!modbus?.modbusRegisters)
		throw new Error(`catalog device \`${refOf(device.identity)}\` has no modbus register map`);
	return modbus;
}
