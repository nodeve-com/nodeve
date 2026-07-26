// Shared walk plumbing + the register-map lowering: authored data/ row access,
// column validation against schema slots, and the structured measurand ref →
// interval-node resolver both gates and registers use.
import { basename } from 'node:path';
import { abs, isDir, readYaml, yamlNames, type Doc } from '../src/io.ts';
import { expandValuedRange } from '../src/valued-range-expand.ts';
import type { ValuedRange } from '../gen/schema.ts';
import { classByName, expandFk, fkTable, seg, SLUG } from './model.ts';
import type { ValueContracts } from './values.ts';

export type { Doc };
export const isMap = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);
// FK slots whose value is an IN-DOC sibling, not a global-vocab row: columns()
// leaves them bare for siblingRefs to resolve against the device's own rows.
const SIBLING_FK = new Set(['network_interface']);
// function declaration, NOT an arrow const: control-flow narrowing after
// `if (!guard) die(...)` only fires for never-returning function declarations.
export function die(trail: string, msg: string): never {
	throw new Error(`${trail}: ${msg}`);
}

const loadDir = (dir: string): Record<string, Doc> =>
	Object.fromEntries(
		yamlNames(abs(`data/${dir}`)).map((f) => [
			basename(f, '.yaml'),
			readYaml(abs(`data/${dir}/${f}`)) as Doc,
		]),
	);

/** an authored doc — one file, or a directory whose children merge at load:
 * maps deep-merge, lists concatenate, a scalar authored twice is a collision.
 * The directory name is the slug, exactly as a filename would be. */
export function loadDoc(path: string): Doc {
	if (!isDir(path)) return readYaml(path) as Doc;
	const merged: Doc = {};
	for (const f of yamlNames(path)) mergeDoc(merged, readYaml(`${path}/${f}`) as Doc, f);
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
export const nodeTypeBySlug = loadDir('node_type');

/** a node_type's socket contract: role → the feature_type slug each
 * feature_of_interest relation binds, read off its facet: map. */
export function featureRolesOf(dt: string): Map<string, string> {
	const roleMap = new Map<string, string>();
	const facetMap = (nodeTypeBySlug[dt] as Doc)?.facet;
	if (isMap(facetMap))
		for (const [relation, spec] of Object.entries(facetMap)) {
			const s = isMap(spec) ? spec : {};
			if (((s.facet as string) ?? relation) === 'feature_of_interest')
				roleMap.set(relation, String(s.feature_type ?? ''));
		}
	return roleMap;
}

/** enforce an authored feature role against the socket contract (when declared) */
export function checkRole(o: {
	roleMap: Map<string, string>;
	dt: string;
	role: string;
	ftSlug: string;
	at: string;
}) {
	const { roleMap, dt, role, ftSlug, at } = o;
	if (!roleMap.size) return;
	if (!roleMap.has(role))
		die(at, `undeclared role ${role} on ${dt}; declared: [${[...roleMap.keys()]}]`);
	const want = roleMap.get(role);
	if (want && want !== ftSlug) die(at, `role ${role} binds feature_type ${want}, not ${ftSlug}`);
}

/** columns of one authored map, validated against the class's slots */
export function columns(className: string, value: unknown, trail: string): Doc {
	if (!isMap(value)) die(trail, 'expected a map of columns');
	const allowed = classByName[className]?.slots ?? [];
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => {
			if (!allowed.includes(k)) die(`${trail}.${k}`, `not a ${className} slot`);
			// global-vocab FK slots expand a bare slug to a CURIE (product.organization,
			// refrigeration.refrigerant); a plain scalar/enum passes through. IN-DOC
			// sibling FKs (service_binding.network_interface → an authored NIC) stay
			// bare — siblingRefs resolves them against the device's own rows.
			return [k, SIBLING_FK.has(k) ? v : expandFk(k, v, `${trail}.${k}`)];
		}),
	);
}

/** an `inlined` FK's co-row — a width facet sharing its owner's node (the
 * Product-on-SubjectNode trick). Class-agnostic: the only named class is
 * ValuedRange, which owns the margin/tolerance sugar its columns expand from. */
export function coRow(cls: string, at: { node: string; trail: string }, cols: unknown): Doc {
	if (!isMap(cols)) die(at.trail, 'expected a map of columns');
	const expanded =
		cls === 'ValuedRange' ? expandValuedRange(cols as unknown as ValuedRange, at.trail) : cols;
	return { node: at.node, ...columns(cls, expanded, at.trail) };
}

/** one vocabulary row — a slug-keyed child whose whole content is its identity
 * and its authored position (DomainMember, PartSetMember) */
export function vocabRow(
	mint: (p: string) => string,
	at: { owner: string; ordinal: number; trail: string },
	slug: unknown,
): Doc {
	if (typeof slug !== 'string' || !SLUG.test(slug)) die(at.trail, 'not a slug');
	return { node: mint(`${at.owner}/${slug}`), ordinal: at.ordinal };
}

/** a keyed level's value: FK slots expand their bare-slug key to a CURIE */
export const expandKey = (slot: string, v: string): string => {
	const table = fkTable(slot);
	return table ? `node:${seg(table)}/${v}` : v;
};

/** in-doc references that resolve against SIBLING rows, not the catalog: a NIC
 * name is local to the node that owns the interface. Any row-set may carry one
 * (a service binding, an address binding, an adapter's ingest) — the owner is
 * the row's `device` when it names one (an adapter dials the METERED node's
 * interfaces, not its own), else this doc. A local name must exist above; a
 * device's is another document's, so the FK gate at load is what checks it.
 * (FK columns like product.organization expand generically in columns(); only
 * in-doc sibling links live here.) */
export function siblingRefs(at: { slug: string; node: string }, model: Doc, doc: Doc) {
	for (const [table, rows] of Object.entries(model))
		for (const row of Array.isArray(rows) ? rows : [rows]) {
			if (!isMap(row)) continue;
			const nic = row.network_interface;
			if (typeof nic !== 'string') continue;
			const owner = typeof row.device === 'string' ? row.device : at.node;
			if (owner === at.node && !isMap((doc.network_interface as Doc)?.[nic]))
				die(`${at.slug}.${table}.${nic}`, `no network_interface ${nic}`);
			row.network_interface = `${owner}/${nic}`;
		}
}

/** what the resolver needs from the walk in flight */
export type WalkState = {
	node: string;
	intervals: Set<string>;
	measurable: Set<string>;
	mint(path: string): string;
	values: ValueContracts;
};

/** structured measurand ref → the referenced interval's node path */
export function intervalRef(walk: WalkState, ref: Doc, trail: string): string {
	const { feature, part, quantity, interval, ...rest } = ref;
	if (Object.keys(rest).length) die(trail, `unexpected keys ${Object.keys(rest)}`);
	if (!isMap(feature) || typeof feature.type !== 'string' || typeof feature.role !== 'string')
		die(trail, 'feature must be { type, role }');
	if (typeof quantity !== 'string') die(trail, 'quantity must be a slug');
	const p = part === undefined ? '_' : String(part);
	const base = `${walk.node}/${feature.type}/${feature.role}`;
	if (interval !== undefined) return named(`${base}/${p}/${quantity}`, interval, { walk, trail });
	// interval absent = the one measurable channel of (feature, part, quantity);
	// the `*` default row applies only when the exact part carries none
	const at = (prefix: string) => [...walk.measurable].filter((n) => n.startsWith(prefix));
	const exact = at(`${base}/${p}/${quantity}/`);
	const hit = exact.length ? exact : at(`${base}/*/${quantity}/`);
	if (hit.length !== 1)
		die(trail, `${hit.length} measurable intervals for ${base}/${p}/${quantity} — need exactly 1`);
	return hit[0]!;
}

/** the `target:` sugar every measurand-reading facet shares (register, VE.Direct
 * field): decomposed feature/part/quantity coordinates → the derived interval FK
 * + the instance-picking part. The one seam that assembles an FK from axes. */
export function measurandLink(walk: WalkState, target: unknown, trail: string): Doc {
	if (!isMap(target)) die(trail, 'expected a measurand ref');
	return {
		part: target.part === undefined ? '_' : String(target.part),
		interval: intervalRef(walk, target, trail),
	};
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
	const map: Doc = { node: mNode, ...columns('RegisterMap', scalars, trail) };
	if (constraint_range !== undefined)
		map.constraint_ranges = list(constraint_range, `${trail}.constraint_range`).map((r, i) => {
			const cols = columns('RegisterRange', r, `${trail}.constraint_range[${i}]`);
			return { node: walk.mint(`${mNode}/${seg(String(cols.range_type))}-${cols.start}`), ...cols };
		});
	if (register !== undefined)
		map.registers = list(register, `${trail}.register`).map((r, i) =>
			registerRow({ walk, mNode }, r, `${trail}.register[${i}]`),
		);
	return map;
}

const list = (v: unknown, trail: string): unknown[] =>
	Array.isArray(v) ? v : die(trail, 'expected a list');

/** one register → its target FK: an interval (quantitative, + the
 * instance-picking part) or a channel (categorical, + its bit flags) */
function registerRow(at: { walk: WalkState; mNode: string }, row: unknown, trail: string): Doc {
	if (!isMap(row)) die(trail, 'expected a map');
	const { target, flag, ...cols } = row;
	if (!isMap(target)) die(`${trail}.target`, 'expected a measurand ref');
	for (const k of ['node', 'part', 'interval', 'channel', 'flags'])
		if (k in cols) die(`${trail}.${k}`, 'derived — author target/flag instead');
	const base: Doc = {
		...columns('ModbusRegister', cols, trail),
		node: at.walk.mint(`${at.mNode}/${cols.address}`),
	};
	if ('channel' in target) return channelRow(at.walk, { base, target, flag }, trail);
	if (flag !== undefined) die(`${trail}.flag`, 'flags need a channel target');
	Object.assign(base, measurandLink(at.walk, target, `${trail}.target`));
	return base;
}

/** a categorical register — channel FK + the word's identified bits */
function channelRow(
	walk: WalkState,
	row: { base: Doc; target: Doc; flag: unknown },
	trail: string,
): Doc {
	const { base } = row;
	const { channel, ...rest } = row.target;
	if (Object.keys(rest).length) die(`${trail}.target`, `unexpected keys ${Object.keys(rest)}`);
	if (typeof channel !== 'string') die(`${trail}.target.channel`, 'expected a channel slug');
	base.channel = walk.values.channelNode(channel, `${trail}.target.channel`);
	if (row.flag !== undefined)
		base.flags = list(row.flag, `${trail}.flag`).flatMap((label, bit) =>
			label === null
				? []
				: [
						{
							node: walk.mint(`${base.node}/${bit}`),
							bit,
							member: walk.values.channelMember(channel, String(label), `${trail}.flag[${bit}]`),
						},
					],
		);
	return base;
}
