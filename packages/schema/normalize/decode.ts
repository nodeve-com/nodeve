// The decode lowering (linkml/decode.yaml): a device's service binding names a
// decode dictionary (`pdu_catalog`) and binds its keys to that device's
// intervals. The catalog is NOT the device's — it is read from data/pdu_catalog,
// so the quantity a key reads comes off the field definition and the device
// states only the feature. registers.ts holds the modbus twin until its cut
// lands on these same tables.
import { slugify } from '@nodeve/text/slugify';
import { seg } from './model.ts';
import { die, isMap, loadDir, measurandLink, type Doc, type WalkState } from './registers.ts';

const PDU_CATALOG = 'pdu_catalog';
const catalogBySlug = loadDir(PDU_CATALOG);

/** a catalog's fields, by wire key — the publisher's rows, keyed as the wire spells them */
function fieldsOf(catalog: unknown, trail: string): { slug: string; fields: Doc } {
	if (typeof catalog !== 'string') die(trail, `a mapping needs a ${PDU_CATALOG} on its binding`);
	const slug = catalog.replace(`node:${seg(PDU_CATALOG)}/`, '');
	const doc = catalogBySlug[slug] ?? die(trail, `unknown ${PDU_CATALOG} ${slug}`);
	const fields = doc.pdu_field;
	if (!isMap(fields)) die(trail, `${PDU_CATALOG} ${slug} declares no fields`);
	return { slug, fields };
}

/** the walk, as this lowering needs it: interval resolution plus the keyed-child
 * builder every device facet is built by */
type BindingHost = WalkState & {
	childRows(cls: string, value: unknown, at: { trail: string; parent?: string }): Doc[];
};

/** the surfaces a node offers — a service dialed over IP, a link opened on a
 * wire; both name a dictionary, so both lower here. `mapping:` is the one
 * authored key that is not a column — it binds a KEY of that dictionary to an
 * interval of THIS device, so it waits for the feature walk. */
export function bindings(
	host: BindingHost,
	cls: string,
	at: { block: unknown; trail: string },
): Doc[] {
	const { block, trail } = at;
	if (!isMap(block)) die(trail, 'expected a keyed map');
	const blockBySlug = new Map<string, unknown>();
	const bare = Object.fromEntries(
		Object.entries(block).map(([slug, body]) => {
			if (!isMap(body)) die(`${trail}.${slug}`, 'expected a map of columns');
			const { mapping, ...cols } = body;
			if (mapping !== undefined) blockBySlug.set(slug, mapping);
			return [slug, cols];
		}),
	);
	const rows = host.childRows(cls, bare, { trail });
	Object.keys(bare).forEach((slug, i) => {
		const authored = blockBySlug.get(slug);
		const row = rows[i]!;
		if (authored !== undefined)
			row.mappings = pointMappings(
				host,
				{ node: row.node as string, catalog: row.pdu_catalog, trail: `${trail}.${slug}.mapping` },
				authored,
			);
	});
	return rows;
}

/** one binding's `mapping:` block → its PointMapping rows. The authored value is
 * a measurand ref MINUS the quantity: `V` reads a voltage on every device the
 * catalog serves, so the field states the quantity and the device the port. */
function pointMappings(
	walk: WalkState,
	binding: { node: string; catalog: unknown; trail: string },
	block: unknown,
): Doc[] {
	const { trail } = binding;
	if (!isMap(block)) die(trail, 'expected a map keyed by wire key');
	const { slug, fields } = fieldsOf(binding.catalog, trail);
	return Object.entries(block).map(([key, ref]) => {
		const at = `${trail}.${key}`;
		const field = fields[key];
		if (!isMap(field)) die(at, `${slug} has no field ${key}`);
		if (!isMap(ref)) die(at, 'expected a feature ref');
		if ('quantity' in ref) die(at, `quantity rides the field — ${slug}.${key} states it`);
		const quantity = field.quantity_kind ?? die(at, `field ${key} has no quantity_kind to bind`);
		return {
			node: walk.mint(`${binding.node}/${slugify(key)}`),
			field: `node:${seg(PDU_CATALOG)}/${slug}/${slugify(key)}`,
			...measurandLink(walk, { ...ref, quantity }, at),
		};
	});
}
