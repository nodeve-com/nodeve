// Shared walk plumbing + the register-map lowering: authored data/ row access,
// column validation against schema slots, and the structured measurand ref →
// interval-node resolver both gates and registers use.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'yaml';
import { atRoot, classByName, fkTable, seg, SLUG } from './model.ts';

export type Doc = Record<string, unknown>;
export const isMap = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);
export const die = (trail: string, msg: string): never => {
	throw new Error(`${trail}: ${msg}`);
};

const loadDir = (dir: string): Record<string, Doc> =>
	Object.fromEntries(
		readdirSync(atRoot(`data/${dir}`))
			.filter((f) => f.endsWith('.yaml'))
			.sort()
			.map((f) => [
				basename(f, '.yaml'),
				parse(readFileSync(atRoot(`data/${dir}/${f}`), 'utf8')) as Doc,
			]),
	);

/** an authored doc — one file, or a directory whose children merge at load:
 * maps deep-merge, lists concatenate, a scalar authored twice is a collision.
 * The directory name is the slug, exactly as a filename would be. */
export function loadDoc(path: string): Doc {
	if (!statSync(path).isDirectory()) return parse(readFileSync(path, 'utf8')) as Doc;
	const merged: Doc = {};
	for (const f of readdirSync(path)
		.filter((f) => f.endsWith('.yaml'))
		.sort())
		mergeDoc(merged, parse(readFileSync(`${path}/${f}`, 'utf8')) as Doc, f);
	return merged;
}

function mergeDoc(into: Doc, add: Doc, trail: string) {
	for (const [k, v] of Object.entries(add)) {
		const prev = into[k];
		if (prev === undefined) into[k] = v;
		else if (isMap(prev) && isMap(v)) mergeDoc(prev, v, `${trail}.${k}`);
		else if (Array.isArray(prev) && Array.isArray(v)) into[k] = [...prev, ...v];
		else die(`${trail}.${k}`, 'authored in two files');
	}
}

export const featureTypeBySlug = loadDir('feature_type');
export const partSetBySlug = loadDir('part_set');
export const deviceTypeBySlug = loadDir('device_type');

/** columns of one authored map, validated against the class's slots */
export function columns(className: string, value: unknown, trail: string): Doc {
	if (!isMap(value)) die(trail, 'expected a map of columns');
	const allowed = classByName[className]?.slots ?? [];
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => {
			if (!allowed.includes(k)) die(`${trail}.${k}`, `not a ${className} slot`);
			return [k, v];
		}),
	);
}

/** a keyed level's value: FK slots expand their bare-slug key to a CURIE */
export const expandKey = (slot: string, v: string): string => {
	const table = fkTable(slot);
	return table ? `node:${seg(table)}/${v}` : v;
};

/** in-doc references that resolve against SIBLING rows, not the catalog:
 * product.manufacturer stays a bare slug; service NICs must exist above */
export function siblingRefs(at: { slug: string; node: string }, model: Doc, doc: Doc) {
	const product = model.product;
	if (isMap(product) && typeof product.manufacturer === 'string') {
		if (!SLUG.test(product.manufacturer))
			die(`${at.slug}.product.manufacturer`, 'expected a bare slug');
		product.manufacturer = `node:manufacturer/${product.manufacturer}`;
	}
	for (const svc of (model.services as Doc[]) ?? []) {
		const nic = svc.network_interface;
		if (typeof nic !== 'string' || !isMap((doc.network_interface as Doc)?.[nic]))
			die(
				`${at.slug}.service_binding.${svc.slug}.network_interface`,
				`no network_interface ${nic}`,
			);
		svc.network_interface = `${at.node}/${nic}`;
	}
}

/** what the resolver needs from the walk in flight */
export type WalkState = {
	node: string;
	intervals: Set<string>;
	measurable: Set<string>;
	mint(path: string): string;
};

export type PendingGate = { gate: Doc; ref: Doc; trail: string };

/** structured measurand ref → the referenced interval's node path */
export function intervalRef(
	walk: WalkState,
	ref: Doc,
	opts: { trail: string; named: boolean },
): string {
	const { trail } = opts;
	const { feature, part, quantity, interval, ...rest } = ref;
	if (Object.keys(rest).length) die(trail, `unexpected keys ${Object.keys(rest)}`);
	if (!isMap(feature) || typeof feature.type !== 'string' || typeof feature.role !== 'string')
		die(trail, 'feature must be { type, role }');
	if (typeof quantity !== 'string') die(trail, 'quantity must be a slug');
	const p = part === undefined ? '_' : String(part);
	const base = `${walk.node}/${feature.type}/${feature.role}`;
	if (interval !== undefined || opts.named)
		return named(`${base}/${p}/${quantity}`, interval, { walk, trail });
	// interval absent = the one measurable channel of (feature, part, quantity);
	// the `*` default row applies only when the exact part carries none
	const at = (prefix: string) => [...walk.measurable].filter((n) => n.startsWith(prefix));
	const exact = at(`${base}/${p}/${quantity}/`);
	const hit = exact.length ? exact : at(`${base}/*/${quantity}/`);
	if (hit.length !== 1)
		die(trail, `${hit.length} measurable intervals for ${base}/${p}/${quantity} — need exactly 1`);
	return hit[0];
}

/** exact part first, then the `*` default row */
function named(stem: string, interval: unknown, ctx: { walk: WalkState; trail: string }): string {
	if (typeof interval !== 'string') die(ctx.trail, 'interval must be a slug');
	const starred = stem.replace(/\/[^/]+\/([^/]+)$/, `/*/$1`);
	const hit = [`${stem}/${interval}`, `${starred}/${interval}`].find((n) =>
		ctx.walk.intervals.has(n),
	);
	return hit ?? die(ctx.trail, `no interval at ${stem}/${interval}`);
}

/** the decode contract — its own row (shared per family), registers under it */
export function registerMap(walk: WalkState, body: unknown, trail: string): Doc {
	if (!isMap(body)) die(trail, 'expected a map');
	const { slug, constraint_range, register, ...scalars } = body;
	if (typeof slug !== 'string' || !SLUG.test(slug)) die(`${trail}.slug`, 'must be a slug');
	const mNode = walk.mint(`node:register-map/${slug}`);
	const map: Doc = { node: mNode, slug, ...columns('RegisterMap', scalars, trail) };
	if (constraint_range !== undefined)
		map.constraint_ranges = list(constraint_range, `${trail}.constraint_range`).map((r, i) => {
			const cols = columns('RegisterRange', r, `${trail}.constraint_range[${i}]`);
			return { node: walk.mint(`${mNode}/${cols.range_type}-${cols.start}`), ...cols };
		});
	if (register !== undefined)
		map.registers = list(register, `${trail}.register`).map((r, i) =>
			registerRow({ walk, mNode }, r, `${trail}.register[${i}]`),
		);
	return map;
}

const list = (v: unknown, trail: string): unknown[] =>
	Array.isArray(v) ? v : die(trail, 'expected a list');

/** one register → its interval FK + the instance-picking part */
function registerRow(at: { walk: WalkState; mNode: string }, row: unknown, trail: string): Doc {
	if (!isMap(row)) die(trail, 'expected a map');
	const { target, ...cols } = row;
	if (!isMap(target)) die(`${trail}.target`, 'expected a measurand ref');
	return {
		...columns('ModbusRegister', cols, trail),
		// derived last — authored node/part/interval must never override these
		node: at.walk.mint(`${at.mNode}/${cols.address}`),
		part: target.part === undefined ? '_' : String(target.part),
		interval: intervalRef(at.walk, target, { trail: `${trail}.target`, named: false }),
	};
}
