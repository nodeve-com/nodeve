// The trail walk is deterministic (acceptance: snapshot-tested); the snapshot
// IS the normalized FoxESS fixture — review a diff here like a compiler diff.
import { expect, it } from 'vitest';
import { atRoot } from './model.ts';
import { normalizeDevice } from './tree.ts';

it('normalizes the FoxESS fixture deterministically', () => {
	const paths: string[] = [];
	// a DIRECTORY entry — its children merge at load, its name is the slug
	const model = normalizeDevice(atRoot('data/device_model/foxess-h3-ps10sh'), (p) => paths.push(p));
	expect(model).toMatchSnapshot();
	expect(paths).toMatchSnapshot('minted paths');
	expect(new Set(paths).size).toBe(paths.length); // no duplicate coordinates
});
