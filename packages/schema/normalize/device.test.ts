// Determinism guard for the trail walk — NOT a correctness oracle. FoxESS is a
// half-migrated, actively-developed fixture; the snapshot pins its CURRENT
// normalized output only to catch unintended walk drift. Expect frequent, legit
// updates as FoxESS grows — on a real edit, `-u` then review the diff like a
// compiler diff. A matching snapshot means "no accidental drift", never "correct".
import { expect, it } from 'vitest';
import { abs } from '../src/io.ts';
import { normalizeDevice } from './tree.ts';

it('normalizes the FoxESS fixture deterministically', () => {
	const paths: string[] = [];
	// a DIRECTORY entry — its children merge at load, its name is the slug
	const model = normalizeDevice(abs('data/subject_node/inverter/foxess-h3-ps10sh'), (p) =>
		paths.push(p),
	);
	expect(model).toMatchSnapshot();
	expect(paths).toMatchSnapshot('minted paths');
	expect(new Set(paths).size).toBe(paths.length); // no duplicate coordinates
});
