// The nested device walk (docs/authoring.md#the-normalizer): descend slug keys, lift
// `$`, expand facets, resolve structured refs. Vocabularies come from data/ rows
// and the schema, never hardcoded: part keys → the feature's part_set members or
// count; quantity keys → its quantity_binding rows; facet keys → classes by
// sql_table. Every error carries its key trail.
import { basename, dirname } from 'node:path';
import { slugify } from '@nodeve/text/slugify';
import { classByName, classByTable, keysOf, ownerSlotFor, slotByName, SLUG } from './model.ts';
import {
	coRow,
	columns,
	vocabRow,
	nodeTypeBySlug,
	checkRole,
	die,
	expandKey,
	featureRolesOf,
	featureTypeBySlug,
	isMap,
	loadDoc,
	partSetBySlug,
	measurandLink,
	registerMap,
	siblingRefs,
	type Doc,
	type WalkState,
} from './registers.ts';
import { ValueContracts } from './values.ts';
import { quantity, type FeatureCtx } from './intervals.ts';

class DeviceWalk implements WalkState {
	readonly node: string;
	readonly slug: string;
	readonly intervals = new Set<string>();
	readonly measurable = new Set<string>();
	private readonly doc: Doc;
	private readonly addPath: (p: string) => void;
	readonly values: ValueContracts;
	private readonly model: Doc;
	private readonly rootSlot: string;
	private readonly nodeTypeSlug: string;
	private readonly featureRoles: Map<string, string>; // socket contract: role → feature_type
	private registerMapDoc?: Doc; // the one non-owned ref — the shared family register map

	// The path IS the identity: `<table>/<path_root value>/<slug>` mirrors the
	// permalink the walk mints. So the root — which kind of thing this is — is the
	// DIRECTORY above the entry, never a key inside it; two node types may then
	// carry the same slug (a site's inventory item and the adapter that reads it)
	// without colliding in the tree, and nothing restates its own position.
	constructor(file: string, addPath: (p: string) => void) {
		this.addPath = addPath;
		const dt = basename(dirname(file));
		const table = basename(dirname(dirname(file)));
		const className = classByTable[table] ?? die(file, `no class has sql_table ${table}`);
		const rootSlot = (classByName[className] ?? die(file, `no class ${className}`)).annotations
			?.path_root;
		if (!rootSlot) die(file, `${className} has no path_root annotation`);
		this.rootSlot = rootSlot;
		this.slug = basename(file, '.yaml');
		if (!SLUG.test(this.slug)) die(file, 'filename is not a slug');
		if (!SLUG.test(dt)) die(file, `parent directory ${dt} is not a slug`);
		if (!nodeTypeBySlug[dt]) die(`${dt}/${this.slug}`, `unknown ${rootSlot} ${dt}`);
		this.doc = loadDoc(file);
		this.nodeTypeSlug = dt;
		this.featureRoles = featureRolesOf(dt); // the socket contract, off facet:
		this.node = this.mint(`node:${dt}/${this.slug}`);
		this.values = new ValueContracts(this.node, (p) => this.mint(p));
		// facet rows keyed by sql_table (or `contents`), scattered to top-level row-sets; identity on the node row
		this.model = {};
	}

	mint(path: string): string {
		this.addPath(path.replace(/^node:/, ''));
		return path;
	}

	walk(): DeviceResult {
		let featureBlock: Doc = {};
		let registerBlock: unknown;
		// facets whose class carries an `interval` slot read a measurand — their
		// `target:` sugar resolves against the intervals the feature walk populates,
		// so they wait for it. Schema-driven, not a per-class branch.
		const deferred: [string, unknown][] = [];
		for (const [key, value] of Object.entries(this.doc)) {
			const cls = classByTable[key];
			if (cls === 'FeatureOfInterest')
				featureBlock = isMap(value) ? value : die(`${this.slug}.${key}`, 'expected feature types');
			else if (cls === 'RegisterMap') registerBlock = value;
			else if (cls && classByName[cls]?.slots?.includes('interval')) deferred.push([key, value]);
			else this.plainKey(key, value);
		}
		siblingRefs({ slug: this.slug, node: this.node }, this.model, this.doc);
		for (const [ftSlug, roleMap] of Object.entries(featureBlock))
			this.featureType(String(ftSlug), roleMap);
		if (registerBlock !== undefined)
			this.registerMapDoc = registerMap(this, registerBlock, `${this.slug}.register_map`);
		for (const [key, value] of deferred) this.plainKey(key, value);
		const channels = this.values.channelRows(`${this.slug}.channel`);
		if (channels) this.model.channel = channels;
		return { node: this.node, model: this.model, registerMap: this.registerMapDoc };
	}

	/** any other top-level key — a child table by sql_table (keyed rows, or keyless 1:1 co-row) */
	private plainKey(key: string, value: unknown) {
		const trail = `${this.slug}.${key}`;
		if (key === this.rootSlot) die(trail, `${key} is the parent directory, not a key`);
		const cls = classByTable[key];
		if (cls === 'Channel') this.values.channelBlock(value, trail);
		else if (cls) {
			// Content (about-attached) buckets under its global slot; every other under its sql_table
			const dest = ownerSlotFor('SubjectNode', cls) ?? key;
			this.model[dest] = keysOf(cls).length
				? this.childRows(cls, value, { trail })
				: { node: this.node, ...columns(cls, value, trail) };
		} else die(trail, 'unrecognized authored key');
	}

	/** keyed child map → rows under `parent` (default this node); keySlot + `about`
	 * off the schema. The map key is the raw id column; its node segment is
	 * slugified (idempotent for keys already slugs, kebabs a wire label like V /
	 * SER#). A measurand-reading child (its class carries an `interval` slot)
	 * expands the shared `target:` sugar to interval + part. */
	childRows(cls: string, value: unknown, at: { trail: string; parent?: string }): Doc[] {
		if (!isMap(value)) die(at.trail, 'expected a keyed map');
		const parent = at.parent ?? this.node;
		const [keySlot] = keysOf(cls) as [string, ...string[]];
		const about = classByName[cls]?.slots?.includes('about');
		const hasKey = classByName[cls]?.slots?.includes(keySlot);
		const reads = classByName[cls]?.slots?.includes('interval');
		return Object.entries(value).map(([k, raw]) => {
			const trail = `${at.trail}.${k}`;
			if (!isMap(raw)) die(trail, 'expected a map of columns');
			const { target, ...cols } = raw;
			if (target !== undefined && !reads) die(`${trail}.target`, `${cls} reads no measurand`);
			const node = this.mint(`${parent}/${slugify(k)}`);
			return {
				node,
				...(about ? { about: parent } : {}),
				...(hasKey ? { [keySlot]: expandKey(keySlot, String(k)) } : {}),
				...this.nested(cls, { node, trail }, cols),
				...(target !== undefined ? measurandLink(this, target, `${trail}.target`) : {}),
			};
		});
	}

	/** the authored shapes a column can't hold, both read off the SLOT — never a
	 * per-class branch: an `inlined` FK is a co-row sharing this node (a width
	 * facet like valued_range); an `inlined_as_list` FK to a slug-keyed class is
	 * a vocabulary, minted from the authored list, ordinal from position. */
	private nested(cls: string, row: { node: string; trail: string }, cols: Doc): Doc {
		const allowed = classByName[cls]?.slots ?? [];
		const out: Doc = {};
		const plain: Doc = {};
		for (const [k, v] of Object.entries(cols)) {
			const slot = slotByName[k];
			const range = slot?.range ?? '';
			const trail = `${row.trail}.${k}`;
			if (!slot?.inlined && !slot?.inlined_as_list) plain[k] = v;
			else if (!allowed.includes(k)) die(trail, `not a ${cls} slot`);
			else if (!slot.inlined_as_list) out[k] = coRow(range, { node: row.node, trail }, v);
			else if (!keysOf(range).length) die(trail, `${range} rows are not authored here`);
			else if (!Array.isArray(v) || !v.length) die(trail, 'expected a list of slugs');
			else
				out[k] = v.map((slug, i) =>
					vocabRow(
						(p) => this.mint(p),
						{ owner: row.node, ordinal: i + 1, trail: `${trail}[${i}]` },
						slug,
					),
				);
		}
		return { ...out, ...columns(cls, plain, row.trail) };
	}

	/** one feature type's role map → rows in the ONE feature_of_interest set; feature_type + role discriminate */
	private featureType(ftSlug: string, roleMap: unknown) {
		const at = `${this.slug}.feature_of_interest.${ftSlug}`;
		if (!isMap(roleMap)) die(at, 'expected role keys');
		if (!featureTypeBySlug[ftSlug]) die(at, `unknown feature_type ${ftSlug}`);
		const rows = (this.model.feature_of_interest ??= []) as Doc[];
		for (const [role, body] of Object.entries(roleMap)) {
			checkRole({
				roleMap: this.featureRoles,
				dt: this.nodeTypeSlug,
				role: String(role),
				ftSlug,
				at: `${at}.${role}`,
			});
			rows.push(this.feature(ftSlug, String(role), body));
		}
	}

	private feature(ftSlug: string, role: string, body: unknown): Doc {
		const trail = `${this.slug}.feature_of_interest.${ftSlug}.${role}`;
		const ft = featureTypeBySlug[ftSlug] ?? die(trail, `unknown feature_type ${ftSlug}`);
		if (!isMap(body)) die(trail, 'expected part keys');
		const fNode = this.mint(`${this.node}/${ftSlug}/${role}`);
		// the two authored levels bind the slots keyed_by lists, in order
		const [ftSlot, roleSlot] = keysOf('FeatureOfInterest') as [string, string];
		const ctx: FeatureCtx = {
			trail,
			ftSlug,
			fNode,
			kinds: new Set(Object.keys((ft.quantity_binding as Doc) ?? {})),
			feature: { node: fNode, [ftSlot]: expandKey(ftSlot, ftSlug), [roleSlot]: role },
			list: { intervals: [], specifications: [], measurements: [], filters: [] },
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
		if (part !== '_' && part !== '*') this.checkPart(ctx, part);
		else if (part === '*' && !ctx.members && ctx.count === undefined)
			die(`${ctx.trail}.*`, 'a default needs parts to apply to');
		if (!isMap(value)) die(`${ctx.trail}.${part}`, 'expected quantity keys');
		for (const [qk, bandMap] of Object.entries(value)) {
			const kind = String(qk);
			if (!ctx.kinds.has(kind))
				die(`${ctx.trail}.${part}.${kind}`, `not an admissible quantity of ${ctx.ftSlug}`);
			quantity({ host: this, ctx }, { part, quantity: kind }, bandMap);
		}
	}

	// a part key is a pure discriminator on Interval — validated against the
	// feature's part_set members or count, never materialized as its own row
	private checkPart(ctx: FeatureCtx, part: string) {
		if (!SLUG.test(part)) die(`${ctx.trail}.${part}`, 'not a slug or marker');
		if (ctx.members) {
			if (!ctx.members.includes(part))
				die(`${ctx.trail}.${part}`, `not in part_set [${ctx.members}]`);
		} else if (ctx.count !== undefined) {
			const n = Number(part);
			if (!Number.isInteger(n) || n < 1 || n > ctx.count)
				die(`${ctx.trail}.${part}`, `outside count 1…${ctx.count}`);
		} else die(`${ctx.trail}.${part}`, 'feature has no part_set or count');
	}
}

/** a walked device: node id, facet rows keyed by sql_table (+ `contents`), and
 * the shared register map it references (undefined when it composes none) */
export type DeviceResult = { node: string; model: Doc; registerMap?: Doc };

export function normalizeDevice(file: string, addPath: (p: string) => void): DeviceResult {
	return new DeviceWalk(file, addPath).walk();
}
