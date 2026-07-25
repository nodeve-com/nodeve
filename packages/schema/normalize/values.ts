// Categorical value contracts (linkml/values.yaml): the setting + channel
// lowering. Settings mint member rows from the authored `member` list; channel
// members accrete from register flag labels, so channel rows finalize after
// the register map lowers. Gates FK both halves — typos die here.
import { SLUG } from './model.ts';
import { columns, die, isMap, vocabRow, type Doc } from './registers.ts';

type ChannelState = { row: Doc; empty?: string; members: Map<string, Doc> };

export class ValueContracts {
	private readonly channels = new Map<string, ChannelState>();

	private readonly node: string;
	private readonly mint: (path: string) => string;

	constructor(node: string, mint: (path: string) => string) {
		this.node = node;
		this.mint = mint;
	}

	/** `channel:` — categorical observables of the device root; members arrive
	 * later, minted from the register flags that feed the channel */
	channelBlock(value: unknown, trail: string) {
		if (!isMap(value)) die(trail, 'expected channel slugs');
		for (const [slug, body] of Object.entries(value)) {
			const t = `${trail}.${slug}`;
			if (!SLUG.test(slug)) die(t, 'not a slug');
			if (!isMap(body)) die(t, 'expected a map of columns');
			const { empty, ...cols } = body;
			if (empty !== undefined && typeof empty !== 'string') die(`${t}.empty`, 'expected a slug');
			this.channels.set(slug, {
				row: { node: this.mint(`${this.node}/${slug}`), ...columns('Channel', cols, t) },
				empty,
				members: new Map(),
			});
		}
	}

	channelNode(slug: string, trail: string): string {
		return (this.channels.get(slug) ?? die(trail, `unknown channel ${slug}`)).row.node as string;
	}

	channelMember(channel: string, label: string, trail: string): string {
		const c = this.channels.get(channel) ?? die(trail, `unknown channel ${channel}`);
		let m = c.members.get(label);
		if (!m) {
			m = vocabRow(
				(p) => this.mint(p),
				{ owner: c.row.node as string, ordinal: c.members.size + 1, trail },
				label,
			);
			c.members.set(label, m);
		}
		return m.node as string;
	}

	/** one condition row — both authored forms are coordinates; the FK paths
	 * assemble verbatim, and integrity is the database's FK check (ddl.py dump) */
	gate(at: { node: string; trail: string }, ref: unknown): Doc {
		if (!isMap(ref)) die(at.trail, 'expected a condition map');
		const gate: Doc = { node: at.node };
		// Only the FK-path forms need code: they assemble a node path from
		// decomposed coordinates, which the schema can't express. Every other
		// authored key is a plain Condition column — routed through columns(),
		// validated against the class's slots. A new scalar axis needs NO branch.
		if ('setting' in ref) {
			const { setting, equals, ...rest } = ref;
			gate.setting = `${this.node}/${setting}`;
			gate.equals = `${gate.setting}/${equals}`;
			return Object.assign(gate, columns('Condition', rest, at.trail));
		}
		if ('feature' in ref) {
			const { feature, part, quantity, interval, ...rest } = ref;
			if (!isMap(feature)) die(at.trail, 'feature must be { type, role }');
			gate.interval = `${this.node}/${feature.type}/${feature.role}/${part ?? '_'}/${quantity}/${interval}`;
			return Object.assign(gate, columns('Condition', rest, at.trail));
		}
		return Object.assign(gate, columns('Condition', ref, at.trail));
	}

	/** members accrete while registers lower — the empty member joins last */
	channelRows(trail: string): Doc[] | undefined {
		if (!this.channels.size) return undefined;
		return [...this.channels.entries()].map(([slug, c]) => {
			if (c.empty !== undefined)
				c.row.empty = this.channelMember(slug, c.empty, `${trail}.${slug}.empty`);
			c.row.members = [...c.members.values()];
			return c.row;
		});
	}
}
