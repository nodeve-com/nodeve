import { describe, expect, test } from 'vitest';
import { abs } from '../src/io.ts';
import { buildCatalog } from './catalog.ts';

const counts = (bundle: Record<string, unknown[]>) =>
	Object.fromEntries(Object.entries(bundle).map(([slot, rows]) => [slot, rows.length]));

describe('buildCatalog', () => {
	// the walk keeps module-level accumulators; a downstream consumer walks its
	// own tree right after this one, so a second pass must not inherit the first
	test('a second walk in the same process repeats the first', () => {
		const first = counts(buildCatalog(abs('data'), { schemaRows: true }));
		expect(counts(buildCatalog(abs('data'), { schemaRows: true }))).toEqual(first);
	});

	// schema-projected row-sets are identical in every tree, so only the schema's
	// own package emits them — else a downstream bundle collides on the PK
	test('schemaRows off drops the projected row-sets, keeps the authored ones', () => {
		const bundle = buildCatalog(abs('data'));
		expect(bundle.properties).toEqual([]);
		expect(bundle.organizations?.length).toBeGreaterThan(0);
	});
});
