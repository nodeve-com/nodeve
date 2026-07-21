// The nested device walk (docs/authoring-storage-handoff.md): descend slug
// keys, lift `$`, expand facets, assign ordinal, resolve structured refs.
// Vocabularies come from data/ rows and the schema — never hardcoded:
//   part keys      → the feature's part_set members (data/part_set) or count
//   quantity keys  → the feature type's quantity_binding rows
//   roles          → the device type's socket_binding rows
//   facet keys     → classes by sql_table; columns validated against slots
// Every trail key is stringified as read; every error carries its key trail.
import { basename, dirname } from 'node:path';
import { classByName, classByTable, keysOf, slotByName, SLUG } from './model.ts';
import {
	columns,
	deviceTypeBySlug,
	die,
	expandKey,
	featureTypeBySlug,
	intervalRef,
	isMap,
	loadDoc,
	partSetBySlug,
	registerMap,
	siblingRefs,
	type Doc,
	type PendingGate,
	type WalkState,
} from './registers.ts';

/** one authored feature in flight — trail, vocabularies, accumulated rows */
type FeatureCtx = {
	trail: string;
	ftSlug: string;
	fNode: string;
	kinds: Set<string>;
	members?: string[];
	count?: number;
	feature: Doc;
	list: { parts: Doc[]; intervals: Doc[]; specifications: Doc[]; measurements: Doc[] };
};

class DeviceWalk implements WalkState {
	readonly node: string;
	readonly slug: string;
	readonly intervals = new Set<string>();
	readonly measurable = new Set<string>();
	private readonly doc: Doc;
	private readonly sockets: Record<string, Doc>;
	private readonly addPath: (p: string) => void;
	private readonly pendingGates: PendingGate[] = [];
	private readonly model: Doc;
	private readonly rootSlot: string;

	constructor(file: string, addPath: (p: string) => void) {
		this.addPath = addPath;
		const table = basename(dirname(file));
		const className = classByTable[table] ?? die(file, `no class has sql_table ${table}`);
		const rootSlot = classByName[className].annotations?.path_root;
		if (!rootSlot) die(file, `${className} has no path_root annotation`);
		this.rootSlot = rootSlot;
		this.slug = basename(file, '.yaml');
		if (!SLUG.test(this.slug)) die(file, 'filename is not a slug');
		this.doc = loadDoc(file);
		const dt = this.doc[rootSlot];
		if (typeof dt !== 'string' || !SLUG.test(dt)) die(`${this.slug}.${rootSlot}`, 'must be a slug');
		this.sockets = (deviceTypeBySlug[dt]?.socket_binding ??
			die(this.slug, `unknown device_type ${dt}`)) as Record<string, Doc>;
		this.node = this.mint(`node:${dt}/${this.slug}`);
		this.model = { node: this.node, slug: this.slug, [rootSlot]: `node:device-type/${dt}` };
	}

	mint(path: string): string {
		this.addPath(path.replace(/^node:/, ''));
		return path;
	}

	walk(): Doc {
		let featureBlock: Doc = {};
		let registerBlock: unknown;
		for (const [key, value] of Object.entries(this.doc)) {
			const cls = classByTable[key];
			if (cls === 'FeatureOfInterest')
				featureBlock = isMap(value) ? value : die(`${this.slug}.${key}`, 'expected feature types');
			else if (cls === 'RegisterMap') registerBlock = value;
			else this.plainKey(key, value);
		}
		siblingRefs({ slug: this.slug, node: this.node }, this.model, this.doc);
		for (const [ftSlug, roleMap] of Object.entries(featureBlock))
			this.featureType(String(ftSlug), roleMap);
		if (registerBlock !== undefined)
			this.model.register_map = registerMap(this, registerBlock, `${this.slug}.register_map`);
		for (const g of this.pendingGates)
			g.gate.gated_by = intervalRef(this, g.ref, { trail: g.trail, named: true });
		return this.model;
	}

	/** any other top-level key — a child table by sql_table (keyed rows, or a
	 * keyless 1:1 co-row), never a name the walk knows */
	private plainKey(key: string, value: unknown) {
		const trail = `${this.slug}.${key}`;
		if (key === this.rootSlot) return; // already lifted in the constructor
		const cls = classByTable[key];
		if (cls) {
			const owner = (classByName.DeviceModel.slots ?? []).find((s) => slotByName[s]?.range === cls);
			if (!owner) die(trail, `DeviceModel has no slot ranging ${cls}`);
			this.model[owner!] = keysOf(cls).length
				? this.childRows(cls, value, trail)
				: { node: this.node, ...columns(cls, value, trail) };
		} else if (key === 'setting' || key === 'decode')
			console.warn(`SKIP ${trail}: no schema yet — block dropped from catalog`);
		else die(trail, 'unrecognized authored key');
	}

	/** keyed child map → rows under this model's node; the key slot and the
	 * `about` backref both come off the schema */
	private childRows(cls: string, value: unknown, trail: string): Doc[] {
		if (!isMap(value)) die(trail, 'expected a keyed map');
		const [keySlot] = keysOf(cls);
		const about = classByName[cls].slots?.includes('about');
		return Object.entries(value).map(([k, v]) => ({
			node: this.mint(`${this.node}/${k}`),
			...(about ? { about: this.node } : {}),
			[keySlot]: expandKey(keySlot, String(k)),
			...columns(cls, v, `${trail}.${k}`),
		}));
	}

	/** one feature type's role map — each role row lands in its bound_as slot */
	private featureType(ftSlug: string, roleMap: unknown) {
		if (!isMap(roleMap)) die(`${this.slug}.feature_of_interest.${ftSlug}`, 'expected role keys');
		const boundAs = featureTypeBySlug[ftSlug]?.bound_as;
		if (typeof boundAs !== 'string')
			die(`${this.slug}.feature_of_interest.${ftSlug}`, 'feature_type has no bound_as');
		for (const [role, body] of Object.entries(roleMap))
			((this.model[boundAs] ??= []) as Doc[]).push(this.feature(ftSlug, String(role), body));
	}

	private feature(ftSlug: string, role: string, body: unknown): Doc {
		const trail = `${this.slug}.feature_of_interest.${ftSlug}.${role}`;
		const ft = featureTypeBySlug[ftSlug] ?? die(trail, `unknown feature_type ${ftSlug}`);
		const socket = this.sockets[role] ?? die(trail, `role ${role} is not a socket`);
		if (socket.feature_type !== ftSlug)
			die(trail, `socket ${role} takes ${socket.feature_type}, not ${ftSlug}`);
		if (!isMap(body)) die(trail, 'expected part keys');
		const fNode = this.mint(`${this.node}/${ftSlug}/${role}`);
		// the two authored levels bind the slots keyed_by lists, in order
		const [ftSlot, roleSlot] = keysOf('FeatureOfInterest');
		const ctx: FeatureCtx = {
			trail,
			ftSlug,
			fNode,
			kinds: new Set(Object.keys((ft.quantity_binding as Doc) ?? {})),
			feature: { node: fNode, [ftSlot]: expandKey(ftSlot, ftSlug), [roleSlot]: role },
			list: { parts: [], intervals: [], specifications: [], measurements: [] },
		};
		if (body.$ !== undefined) this.featureOwn(ctx, body.$);
		for (const [raw, value] of Object.entries(body))
			if (raw !== '$') this.part(ctx, String(raw), value);
		for (const [k, v] of Object.entries(ctx.list)) if (v.length) ctx.feature[k] = v;
		return ctx.feature;
	}

	/** `$` — the feature row's own columns (part_set XOR count) */
	private featureOwn(ctx: FeatureCtx, own: unknown) {
		if (!isMap(own)) die(`${ctx.trail}.$`, 'expected a map of columns');
		for (const [k, v] of Object.entries(own)) {
			if (k === 'part_set') this.partSet(ctx, v);
			else if (k === 'count') this.partCount(ctx, v);
			else die(`${ctx.trail}.$.${k}`, 'not a feature column');
		}
		if (ctx.members && ctx.count !== undefined)
			die(`${ctx.trail}.$`, 'part_set and count are exclusive');
	}

	private partSet(ctx: FeatureCtx, v: unknown) {
		const set =
			(typeof v === 'string' && partSetBySlug[v]) ||
			die(`${ctx.trail}.$.part_set`, `unknown part_set ${v}`);
		if (set.feature_type !== ctx.ftSlug)
			die(`${ctx.trail}.$.part_set`, `${v} belongs to ${set.feature_type}, not ${ctx.ftSlug}`);
		ctx.members = Object.keys((set.part_set_member as Doc) ?? {});
		ctx.feature.part_set = `node:part-set/${v}`;
	}

	private partCount(ctx: FeatureCtx, v: unknown) {
		if (!Number.isInteger(v) || (v as number) < 1)
			die(`${ctx.trail}.$.count`, 'expected a positive integer');
		ctx.count = v as number;
		ctx.feature.count = v;
	}

	/** one part key — `_`, `*`, a member slug, or 1…count */
	private part(ctx: FeatureCtx, part: string, value: unknown) {
		if (part !== '_' && part !== '*') this.partRow(ctx, part);
		else if (part === '*' && !ctx.members && ctx.count === undefined)
			die(`${ctx.trail}.*`, 'a default needs parts to apply to');
		if (!isMap(value)) die(`${ctx.trail}.${part}`, 'expected quantity keys');
		for (const [qk, bandMap] of Object.entries(value)) {
			const quantity = String(qk);
			if (!ctx.kinds.has(quantity))
				die(`${ctx.trail}.${part}.${quantity}`, `not an admissible quantity of ${ctx.ftSlug}`);
			this.quantity(ctx, { part, quantity }, bandMap);
		}
	}

	private partRow(ctx: FeatureCtx, part: string) {
		if (!SLUG.test(part)) die(`${ctx.trail}.${part}`, 'not a slug or marker');
		if (ctx.members) {
			if (!ctx.members.includes(part))
				die(`${ctx.trail}.${part}`, `not in part_set [${ctx.members}]`);
		} else if (ctx.count !== undefined) {
			const n = Number(part);
			if (!Number.isInteger(n) || n < 1 || n > ctx.count)
				die(`${ctx.trail}.${part}`, `outside count 1…${ctx.count}`);
		} else die(`${ctx.trail}.${part}`, 'feature has no part_set or count');
		ctx.list.parts.push({
			node: this.mint(`${ctx.fNode}/${part}`),
			slug: part,
			ordinal: ctx.list.parts.length + 1,
		});
	}

	private quantity(ctx: FeatureCtx, at: { part: string; quantity: string }, bandMap: unknown) {
		if (!isMap(bandMap)) die(`${ctx.trail}.${at.part}.${at.quantity}`, 'expected interval slugs');
		for (const [raw, payload] of Object.entries(bandMap))
			this.interval(ctx, { ...at, islug: String(raw) }, payload);
	}

	private interval(
		ctx: FeatureCtx,
		at: { part: string; quantity: string; islug: string },
		payload: unknown,
	) {
		const trail = `${ctx.trail}.${at.part}.${at.quantity}.${at.islug}`;
		if (at.islug !== '_' && !SLUG.test(at.islug)) die(trail, 'not a slug or _');
		const iNode = `${ctx.fNode}/${at.part}/${at.quantity}/${at.islug}`;
		if (this.intervals.has(iNode)) die(trail, 'duplicate coordinate');
		this.intervals.add(iNode);
		this.mint(iNode);
		// three stacked levels → the three keyed_by slots, in order
		const [partSlot, qkSlot, slugSlot] = keysOf('Interval');
		const row: Doc = {
			node: iNode,
			[partSlot]: at.part,
			[qkSlot]: expandKey(qkSlot, at.quantity),
			[slugSlot]: at.islug,
		};
		if (!isMap(payload)) die(trail, 'expected facet keys');
		for (const [facet, cols] of Object.entries(payload))
			this.facet(ctx, { row, facet, trail: `${trail}.${facet}` }, cols);
		ctx.list.intervals.push(row);
	}

	/** a named facet key — a co-row sharing the interval's node */
	private facet(ctx: FeatureCtx, at: { row: Doc; facet: string; trail: string }, cols: unknown) {
		const cls = classByTable[at.facet] ?? die(at.trail, 'not a facet');
		const iNode = at.row.node as string;
		if (at.facet === 'valued_range')
			at.row.valued_range = { node: iNode, ...columns(cls, cols, at.trail) };
		else if (at.facet === 'measurement') {
			ctx.list.measurements.push({ node: iNode, ...columns(cls, cols, at.trail) });
			this.measurable.add(iNode);
		} else if (at.facet === 'specification')
			ctx.list.specifications.push(this.specification(iNode, cols, at.trail));
		else die(at.trail, `${cls} is not an interval facet`);
	}

	/** specification facet — `gated_by` lowers to a Condition row */
	private specification(iNode: string, payload: unknown, trail: string): Doc {
		if (!isMap(payload)) die(trail, 'expected a map of columns');
		const { gated_by, ...cols } = payload;
		const row: Doc = { node: iNode, ...columns('Specification', cols, trail) };
		if (gated_by !== undefined) row.conditions = [this.gate(iNode, gated_by, `${trail}.gated_by`)];
		return row;
	}

	private gate(iNode: string, ref: unknown, trail: string): Doc {
		if (!isMap(ref)) die(trail, 'expected a gate map');
		const gate: Doc = { node: this.mint(`${iNode}/gate`) };
		if ('setting' in ref) {
			const { setting, equals, ...rest } = ref;
			if (Object.keys(rest).length) die(trail, `unexpected keys ${Object.keys(rest)}`);
			gate.setting_key = setting;
			gate.equals = equals;
			// gates resolve AFTER the whole tree — a derate may point at a feature
			// that is walked later (ac-phase → environment)
		} else this.pendingGates.push({ gate, ref, trail });
		return gate;
	}
}

export function normalizeDevice(file: string, addPath: (p: string) => void): Doc {
	return new DeviceWalk(file, addPath).walk();
}
