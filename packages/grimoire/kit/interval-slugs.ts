import { type Obj } from '../src/concept-sources.ts';
import { isPlainObject } from 'remeda';

/** Interval slug de-sugar + uniqueness. An interval's `identity.slug` is its addressable ID
 *  (a `condition.interval_item` names `{feature, property, interval}`; downstream sensors point at
 *  bands the same way); authored YAML rarely spells it — an unslugged row de-sugars from its
 *  `rating` axis. De-sugar runs FIRST so two bare rows sharing a rating collide and force explicit
 *  slugs — which guard-interval-slugs then requires to be defined vocabulary (a `rating`
 *  member, another enum member, an interval_item target, or a titled band), never free prose. A
 *  rating-less row (mode-only I-V points) stays unslugged. Mutates the resolved entry in place;
 *  runs AFTER resolveRepeatedFeatures so the filled part/instance rows are covered too. */
export function desugarIntervalSlugs(node: unknown, at: string): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => desugarIntervalSlugs(v, `${at}[${i}]`));
		return;
	}
	if (!isPlainObject(node)) return;
	for (const [k, v] of Object.entries(node)) {
		if (k === 'intervals' && Array.isArray(v)) slugIntervalRows(v, `${at}.intervals`);
		else desugarIntervalSlugs(v, `${at}.${k}`);
	}
}

/** The gating tokens of a row's `condition` list — each setting's `equals` value or interval_item
 *  target, in order. They suffix the auto-slug so sibling rows sharing a tier but differing by
 *  condition disambiguate themselves (nominal_eu_230v_50hz, continuous_intermittent). */
function conditionSuffix(row: Obj): string {
	const conds = Array.isArray(row.condition) ? row.condition : [];
	const toks: string[] = [];
	for (const c of conds) {
		if (!isPlainObject(c)) continue;
		if (typeof c.equals === 'string')
			toks.push(c.equals); // { setting, equals: <member> }
		else if (typeof c.test_condition === 'string')
			toks.push(c.test_condition); // { test_condition }
		else {
			const item = c.interval_item;
			if (isPlainObject(item) && typeof item.interval === 'string') toks.push(item.interval);
		}
	}
	return toks.join('_');
}

/** The auto-slug for a row: its tier (or `zone` kind), the measurable channel's flow_direction/period
 *  axes, `mode`, and condition tokens — or undefined when the row is not auto-addressable (an
 *  unclassified band with no axis: the single undirected/lifetime measurable channel). Shared by the
 *  de-sugar and the slug-classifier check so both agree on what a legitimate auto-slug is. */
export function autoSlug(row: Obj): string | undefined {
	const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
	// Compose the handle from the band's identity axes, in order: its base classifier (rating tier,
	// else `nominal` for a bounds-free nameplate value — a derived tier, not an enum member, so it
	// never collides with the nominal property; else `zone`); then a measurable channel's
	// flow_direction + period (energy: out / out_daily / in / in_daily / daily); then `mode`, then each
	// gating condition. Enough to disambiguate every sibling that differs on any axis. A measurable band
	// with no axis at all (the one undirected/lifetime channel) has no auto-slug.
	const tokens: string[] = [];
	if (typeof band.rating === 'string') tokens.push(band.rating);
	else if (band.nominal !== undefined && band.min === undefined && band.max === undefined)
		tokens.push('nominal');
	else if (band.interval_kind === 'zone') tokens.push('zone');
	if (typeof band.flow_direction === 'string') tokens.push(band.flow_direction);
	if (typeof band.period === 'string') tokens.push(band.period);
	if (typeof band.mode === 'string') tokens.push(band.mode);
	const suffix = conditionSuffix(row);
	if (suffix) tokens.push(suffix);
	return tokens.length > 0 ? tokens.join('_') : undefined;
}

function slugIntervalRows(rows: unknown[], at: string): void {
	const seen = new Map<string, number>();
	rows.forEach((row, i) => {
		if (!isPlainObject(row)) return;
		const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
		// interval_kind: rating is DERIVED from a rating tier OR a bounds-free `nominal` (a nameplate
		// value IS a rating); never authored. measurable / zone are authored on interval_kind directly.
		if (
			band.interval_kind === undefined &&
			(typeof band.rating === 'string' ||
				(band.nominal !== undefined && band.min === undefined && band.max === undefined))
		)
			band.interval_kind = 'rating';
		const identity = isPlainObject(row.identity) ? (row.identity as Obj) : {};
		let slug = identity.slug;
		if (slug === undefined) {
			const auto = autoSlug(row);
			if (auto === undefined) return; // measurable / unclassified — not a reference handle
			slug = auto;
			row.identity = { ...identity, slug };
		}
		const prior = seen.get(String(slug));
		if (prior !== undefined)
			throw new Error(
				`grimoire catalog: interval slug "${String(slug)}" duplicated at ${at}[${prior}] and ${at}[${i}] — disambiguate via a distinct condition or author identity.slug`,
			);
		seen.set(String(slug), i);
	});
}

type BandSlug = { slug?: string; auto?: string; titled: boolean; kind?: string; at: string };
type BandAcc = { bands: BandSlug[]; targets: Set<string> };

/** One walk of a resolved entry: every interval row (slug, its auto-slug, titled, interval_kind)
 *  plus every interval_item.interval target. */
function collectBandSlugs(node: unknown, at: string, acc: BandAcc): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => collectBandSlugs(v, `${at}[${i}]`, acc));
		return;
	}
	if (!isPlainObject(node)) return;
	const item = node.interval_item;
	if (isPlainObject(item) && typeof item.interval === 'string') acc.targets.add(item.interval);
	if (Array.isArray(node.intervals))
		node.intervals.forEach((row, i) => {
			if (!isPlainObject(row)) return;
			const band = isPlainObject(row.interval) ? (row.interval as Obj) : row;
			const identity = isPlainObject(row.identity) ? (row.identity as Obj) : {};
			acc.bands.push({
				slug: typeof identity.slug === 'string' ? identity.slug : undefined,
				auto: autoSlug(row),
				titled: isPlainObject(row.title),
				kind: typeof band.interval_kind === 'string' ? band.interval_kind : undefined,
				at: `${at}.intervals[${i}]`,
			});
		});
	for (const [k, v] of Object.entries(node)) collectBandSlugs(v, at ? `${at}.${k}` : k, acc);
}

/** Parse-time slug-classifier gate — runs AFTER desugar (moved here from the former standalone
 *  scripts/guard-interval-slugs.ts). An interval's `identity.slug` is a REFERENCE HANDLE, never a
 *  classifier. Legitimate only when it is the row's OWN auto-slug (tier/kind + condition tokens), a
 *  referenced interval_item target, or a titled band. A hand-typed classifier (`peak`,
 *  `rated_continuous`) is none of these — model it as an axis. A zone MUST carry a slug and be
 *  referenced (a slugless zone is unreachable, an unreferenced one a dead anchor). */
export function validateIntervalSlugs(entry: Record<string, unknown>, path: string): void {
	const bands: BandSlug[] = [];
	const targets = new Set<string>();
	collectBandSlugs(entry, '', { bands, targets });
	const fails: string[] = [];
	for (const b of bands) {
		const referenced = b.slug !== undefined && targets.has(b.slug);
		if (b.kind === 'zone') {
			if (b.slug === undefined)
				fails.push(`${b.at}: zone band without identity.slug — unreachable`);
			else if (!referenced)
				fails.push(`${b.at}: zone "${b.slug}" has no inbound interval_item — dead anchor`);
			continue;
		}
		if (b.slug !== undefined && b.slug !== b.auto && !referenced && !b.titled)
			fails.push(
				`${b.at}: slug "${b.slug}" is a classifier — not its auto-slug, unreferenced, untitled; move its meaning onto an axis`,
			);
	}
	if (fails.length > 0)
		throw new Error(
			`grimoire catalog ${path}: ${fails.length} classifier slug(s) / broken zone(s):\n  ${fails.join('\n  ')}`,
		);
}
