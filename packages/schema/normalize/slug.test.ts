// Two slug authorities exist on purpose: schema-land derives from the slug
// SLOT's pattern; everything else imports @nodeve/text isSlug. This stitches
// them together — drift here means one of them changed alone.
import { SLUG_PATTERN } from '@nodeve/text/slugify';
import { describe, expect, it } from 'vitest';
import { slotByName } from './model.ts';
import { components, earns } from './slug.ts';

it('the slug slot pattern IS @nodeve/text SLUG_PATTERN', () => {
	expect(slotByName.slug.pattern).toBe(SLUG_PATTERN.source);
});

describe('components — the words a slug may draw on', () => {
	it('reads set discriminators in schema order, kebab, facets before measurement', () => {
		expect(
			components({
				specification: { node: 'n', rating: 'short_term', zone: 'mppt', severity: 'notice' },
			}),
		).toEqual(['mppt', 'short-term', 'notice']);
	});

	it('skips band shape — duration, trigger_on, resolution say nothing about WHICH band', () => {
		expect(components({ specification: { node: 'n', rating: 'survival', duration: 30 } })).toEqual([
			'survival',
		]);
		expect(components({ measurement: { node: 'n', resolution: 0.01 } })).toEqual([]);
	});

	it('takes the leaf of an assembled FK path, and recurses into conditions', () => {
		expect(
			components({
				specification: {
					node: 'n',
					severity: 'nominal',
					conditions: [{ node: 'c', equals: 'node:inverter/x/grid-region/eu-230v-50hz' }],
				},
			}),
		).toEqual(['nominal', 'eu-230v-50hz']);
	});
});

describe('earns — the slug names an ordered subsequence', () => {
	const words = ['mppt', 'continuous', 'nominal'];

	it('accepts any ordered subsequence, whole or partial', () => {
		for (const slug of ['mppt', 'nominal', 'mppt-nominal', 'mppt-continuous-nominal'])
			expect(earns(slug, words)).toBe(true);
	});

	it('rejects invented words, reordering, and repeats', () => {
		for (const slug of ['rated', 'nominal-mppt', 'mppt-mppt'])
			expect(earns(slug, words)).toBe(false);
	});

	it('spans a hyphenated word rather than splitting it', () => {
		expect(earns('nominal-br-220v-60hz', ['nominal', 'br-220v-60hz'])).toBe(true);
		expect(earns('nominal-br', ['nominal', 'br-220v-60hz'])).toBe(false);
	});

	it('pairs `_` with nothing set, exclusively both ways', () => {
		expect(earns('_', [])).toBe(true);
		expect(earns('_', ['nominal'])).toBe(false);
		expect(earns('measured', [])).toBe(false);
	});
});
