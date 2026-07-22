// Band desugar: an authored valued-range band — absolute (tolerance) or
// relative (margin/fraction) family, symmetric or asymmetric — expands into
// fixed min/max around value. Storage holds only min/max/value; the band
// spelling is authoring sugar. Exported for any dynamic valued-range payload,
// not just the trail walk.
import { die, type Doc } from './registers.ts';

// one edge spec: sign toward its bound + candidate [authored key, absolute?]
// keys (relative bands scale by value, absolute ones don't)
type Edge = { sign: 1 | -1; keys: Array<[string, boolean]> };
const LOWER: Edge = {
	sign: -1,
	keys: [
		['tolerance', true],
		['tolerance_lower', true],
		['margin', false],
		['margin_lower', false],
		['fraction_lower', false],
	],
};
const UPPER: Edge = {
	sign: 1,
	keys: [
		['tolerance', true],
		['tolerance_upper', true],
		['margin', false],
		['margin_upper', false],
		['fraction_upper', false],
	],
};
const BAND_KEYS = new Set([...LOWER.keys, ...UPPER.keys].map(([k]) => k));

function edge(payload: Doc, { sign, keys }: Edge, trail: string) {
	const stated = keys.filter(([k]) => payload[k] !== undefined);
	if (!stated.length) return undefined;
	if (stated.length > 1)
		die(trail, `one band per edge — got ${stated.map(([k]) => k).join(' + ')}`);
	const [[key, absolute]] = stated;
	const band = payload[key];
	if (typeof band !== 'number' || band < 0) die(trail, `${key}: expected a non-negative number`);
	const value = payload.value;
	if (typeof value !== 'number') die(trail, `${key} needs a numeric value to band around`);
	return value + sign * (absolute ? band : value * band);
}

/** valued-range payload → same payload with bands expanded to min/max */
export function bandToMinMax(payload: Doc, trail: string): Doc {
	const min = edge(payload, LOWER, trail);
	const max = edge(payload, UPPER, trail);
	if (min === undefined && max === undefined) return payload;
	if (
		(min !== undefined && payload.min !== undefined) ||
		(max !== undefined && payload.max !== undefined)
	)
		die(trail, 'a band and an explicit bound on the same edge conflict');
	const rest = Object.fromEntries(Object.entries(payload).filter(([k]) => !BAND_KEYS.has(k)));
	return { ...rest, ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
}
