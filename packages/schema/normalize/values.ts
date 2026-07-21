// Categorical value contracts (linkml/values.yaml): the setting + channel
// lowering. Settings mint member rows from the authored `member` list; channel
// members accrete from register flag labels, so channel rows finalize after
// the register map lowers. Gates FK both halves — typos die here.
import { SLUG } from './model.ts';
import { columns, die, isMap, type Doc } from './registers.ts';

type ChannelState = { row: Doc; empty?: string; members: Map<string, Doc> };

export class ValueContracts {
	private readonly settings = new Map<string, Set<string>>();
	private readonly channels = new Map<string, ChannelState>();

	private readonly node: string;
	private readonly mint: (path: string) => string;

	constructor(node: string, mint: (path: string) => string) {
		this.node = node;
		this.mint = mint;
	}

	/** `setting:` — commissioning knobs; `member` list mints the vocabulary rows */
	settingRows(value: unknown, trail: string): Doc[] {
		if (!isMap(value)) die(trail, 'expected setting slugs');
		return Object.entries(value).map(([slug, body]) => {
			const t = `${trail}.${slug}`;
			if (!SLUG.test(slug)) die(t, 'not a slug');
			if (!isMap(body)) die(t, 'expected a map of columns');
			const { member, ...cols } = body;
			if (!Array.isArray(member) || !member.length) die(`${t}.member`, 'expected member slugs');
			const sNode = this.mint(`${this.node}/${slug}`);
			const members = member.map((m, i) =>
				this.memberRow(m, { owner: sNode, ordinal: i + 1, trail: `${t}.member[${i}]` }),
			);
			this.settings.set(slug, new Set(members.map((m) => m.slug as string)));
			return { node: sNode, slug, ...columns('Setting', cols, t), members };
		});
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
				row: { node: this.mint(`${this.node}/${slug}`), slug, ...columns('Channel', cols, t) },
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
			m = this.memberRow(label, {
				owner: c.row.node as string,
				ordinal: c.members.size + 1,
				trail,
			});
			c.members.set(label, m);
		}
		return m.node as string;
	}

	/** a `{setting, equals}` gate → its two FK halves, both membership-checked */
	settingGate(setting: unknown, equals: unknown, trail: string): Doc {
		const members = this.settings.get(String(setting)) ?? die(trail, `unknown setting ${setting}`);
		if (typeof equals !== 'string' || !members.has(equals))
			die(trail, `${equals} is not a member of ${setting}`);
		return { setting: `${this.node}/${setting}`, equals: `${this.node}/${setting}/${equals}` };
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

	private memberRow(slug: unknown, at: { owner: string; ordinal: number; trail: string }): Doc {
		if (typeof slug !== 'string' || !SLUG.test(slug)) die(at.trail, 'not a slug');
		return { node: this.mint(`${at.owner}/${slug}`), slug, ordinal: at.ordinal };
	}
}
