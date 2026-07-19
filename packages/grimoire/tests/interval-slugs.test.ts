// Interval slug creation (kit/interval-slugs.ts), case-tabled so every circumstance is legible.
// An interval's `identity.slug` is its addressable handle. Authors rarely spell it — it de-sugars
// from the band's identity axes. Three concerns, one per describe:
//   1. autoSlug — which axes compose the handle, and when a row has none (no slug).
//   2. interval_kind — the 2-way classifier: `measurable` authored, else derives `behavioural`.
//   3. validateIntervalSlugs — the slug-is-a-handle-not-a-classifier gate + the zone-needs-a-slug rule.

import { describe, expect, test } from 'vitest';
import { autoSlug, desugarIntervalSlugs, validateIntervalSlugs } from '../kit/interval-slugs.ts';

// Desugar one row in isolation, return its resolved { slug, kind }. `row` is the interval_item shape
// (`{ interval, identity?, condition? }`); a bare band is wrapped as `{ interval: band }`.
function resolve(row: Record<string, unknown>): { slug?: string; kind?: string } {
	const r = 'interval' in row ? row : { interval: row };
	const entry = { f: { feature_spec: { combined: { q: { intervals: [r] } } } } };
	desugarIntervalSlugs(entry, 'fx');
	const out = entry.f.feature_spec.combined.q.intervals[0] as {
		identity?: { slug?: string };
		interval: { interval_kind?: string };
	};
	return { slug: out.identity?.slug, kind: out.interval.interval_kind };
}

describe('autoSlug — which axes compose the handle (rating names only as a last resort)', () => {
	// [band (or full row), expected slug, why]. undefined = not auto-addressable (no handle).
	const cases: Array<[Record<string, unknown>, string | undefined, string]> = [
		[{ rating: 'continuous' }, 'continuous', 'rating tier alone → it names the band (last resort)'],
		[{ zone: 'mppt' }, 'mppt', 'zone name alone'],
		[{ rating: 'continuous', zone: 'mppt' }, 'mppt', 'zone names it → rating does NOT compound in'],
		[
			{ rating: 'continuous', zone: 'mppt', severity: 'notice' },
			'mppt_notice',
			'zone + severity name it → rating stays out',
		],
		[
			{ rating: 'continuous', severity: 'notice' },
			'notice',
			'severity names it → rating stays out',
		],
		[
			{ rating: 'continuous', severity: 'nominal' },
			'continuous',
			'severity: nominal keys nothing → rating is the sole namer',
		],
		[{ value: 12 }, 'nominal', 'bounds-free bare value → the `nominal` fallback'],
		[
			{ zone: 'mpp', value: 40 },
			'mpp',
			'a zone point (zone + exact value) is a zone, not a bare nominal',
		],
		[
			{ value: 20, trigger_on: 'below' },
			undefined,
			'value + trigger_on is a stateful setpoint, NOT a nameplate → no fallback',
		],
		[
			{ interval_kind: 'measurable', min: 0, max: 5 },
			undefined,
			'a bare measurable span has no axis → no handle',
		],
		[
			{ flow_direction: 'out', period: 'daily' },
			'out_daily',
			'a measurable channel keys on flow_direction + period',
		],
		[
			{ rating: 'continuous', flow_direction: 'out' },
			'out',
			'a channel axis names it → rating stays out',
		],
		[
			{
				interval: { rating: 'continuous' },
				condition: [{ setting: 'grid_region', equals: 'eu_230v' }],
			},
			'continuous_eu_230v',
			'each gating condition suffixes the handle so sibling variants disambiguate',
		],
	];
	test.each(cases)('%o → %s', (band, expected) => {
		const row = 'interval' in band ? band : { interval: band };
		expect(autoSlug(row)).toBe(expected);
	});
});

describe('interval_kind — the 2-way classifier', () => {
	// [band, expected kind, why]. `measurable` is authored; everything else derives `behavioural`.
	const cases: Array<[Record<string, unknown>, string, string]> = [
		[{ rating: 'continuous' }, 'behavioural', 'a rating tier is a behaviour band'],
		[{ zone: 'mppt' }, 'behavioural', 'a zone region is a behaviour band'],
		[
			{ rating: 'continuous', zone: 'mppt' },
			'behavioural',
			'co-occurring rating + zone is still ONE behaviour band',
		],
		[{ value: 12 }, 'behavioural', 'a bare nameplate value is a behaviour band'],
		[
			{ value: 20, trigger_on: 'below' },
			'behavioural',
			'trigger_on is a statefulness axis, not a kind',
		],
		[
			{ interval_kind: 'measurable', min: 0, max: 5 },
			'measurable',
			'authored measurable is preserved (never re-derived)',
		],
		[
			{ interval_kind: 'behavioural', min: 0, max: 5 },
			'behavioural',
			'authored behavioural is preserved',
		],
	];
	test.each(cases)('%o → interval_kind: %s', (band, kind) => {
		expect(resolve(band).kind).toBe(kind);
	});

	test('a naked value desugars to severity: nominal (the nameplate contract)', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: { q: { intervals: [{ interval: { value: 220 } as Record<string, unknown> }] } },
				},
			},
		};
		desugarIntervalSlugs(entry, 'fx');
		const band = entry.f.feature_spec.combined.q.intervals[0].interval;
		expect(band.severity).toBe('nominal'); // filled in
		expect(resolve({ value: 220 })).toEqual({ slug: 'nominal', kind: 'behavioural' });
	});

	test('a value already carrying rating/zone/bounds is NOT touched (not naked)', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						q: {
							intervals: [
								{
									interval: { rating: 'continuous', value: 480, min: 60 } as Record<
										string,
										unknown
									>,
								},
							],
						},
					},
				},
			},
		};
		desugarIntervalSlugs(entry, 'fx');
		expect(entry.f.feature_spec.combined.q.intervals[0].interval.severity).toBeUndefined();
	});

	test('a bare measurable span stays unslugged (no handle) yet is a real kind', () => {
		expect(resolve({ interval_kind: 'measurable', min: 0, max: 5 })).toEqual({
			slug: undefined,
			kind: 'measurable',
		});
	});
});

describe('collision — two rows resolving to the same handle throw', () => {
	test('duplicate auto-slug is a hard error naming the slug', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						q: {
							intervals: [
								{ interval: { rating: 'continuous' } },
								{ interval: { rating: 'continuous' } },
							],
						},
					},
				},
			},
		};
		expect(() => desugarIntervalSlugs(entry, 'fx')).toThrow(/"continuous" duplicated/);
	});

	test('the same slug on SIBLING intervals lists is fine — uniqueness is per-list', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						voltage: { intervals: [{ interval: { rating: 'continuous' } }] },
						current: { intervals: [{ interval: { rating: 'continuous' } }] },
					},
				},
			},
		};
		expect(() => desugarIntervalSlugs(entry, 'fx')).not.toThrow();
	});

	test('two mppt bands are kept distinct by zone + severity (no rating needed)', () => {
		const entry = {
			f: {
				feature_spec: {
					combined: {
						q: {
							intervals: [
								{
									interval: {
										rating: 'continuous',
										zone: 'mppt',
										severity: 'notice',
										min: 120,
										max: 950,
									},
								},
								{
									interval: {
										rating: 'continuous',
										zone: 'mppt',
										severity: 'nominal',
										min: 175,
										max: 850,
									},
								},
							],
						},
					},
				},
			},
		};
		expect(() => desugarIntervalSlugs(entry, 'fx')).not.toThrow();
		const rows = entry.f.feature_spec.combined.q.intervals as Array<{
			identity?: { slug?: string };
		}>;
		expect(rows.map((r) => r.identity?.slug)).toEqual(['mppt_notice', 'mppt']);
	});
});

describe('validateIntervalSlugs — a slug is a reference handle, never a classifier', () => {
	// Wrap intervals into a minimal entry the collector walks.
	const entryOf = (intervals: unknown[], extra: Record<string, unknown> = {}) => ({
		f: { feature_spec: { combined: { q: { intervals }, ...extra } } },
	});

	test('a zone band with no slug is rejected — unnameable, produces no sensor', () => {
		const entry = entryOf([{ interval: { zone: 'mppt', min: 120, max: 950 } }]); // NB: not desugared → no auto-slug filled
		expect(() => validateIntervalSlugs(entry, 'fx')).toThrow(/zone band without identity.slug/);
	});

	test('an authored slug that is NOT the row auto-slug (a hand-typed classifier) is rejected', () => {
		const entry = entryOf([{ identity: { slug: 'peak' }, interval: { rating: 'continuous' } }]); // auto = continuous ≠ peak
		expect(() => validateIntervalSlugs(entry, 'fx')).toThrow(/is a classifier/);
	});

	test('a titled band licenses any slug (an intentional named band)', () => {
		const entry = entryOf([
			{ identity: { slug: 'peak' }, title: { en: 'Peak' }, interval: { rating: 'continuous' } },
		]);
		expect(() => validateIntervalSlugs(entry, 'fx')).not.toThrow();
	});

	test('a slug referenced by an interval_item target is licensed', () => {
		const entry = entryOf([{ identity: { slug: 'peak' }, interval: { rating: 'continuous' } }], {
			derate: {
				intervals: [
					{
						condition: [{ interval_item: { interval: 'peak' } }],
						interval: { rating: 'survival' },
					},
				],
			},
		});
		expect(() => validateIntervalSlugs(entry, 'fx')).not.toThrow();
	});

	test('a slug that IS the row auto-slug passes (redundant but harmless)', () => {
		const entry = entryOf([
			{ identity: { slug: 'continuous' }, interval: { rating: 'continuous' } },
		]);
		expect(() => validateIntervalSlugs(entry, 'fx')).not.toThrow();
	});
});
