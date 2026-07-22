// Accept a ValuedRange, add min/max IF it can be derived from an authored band
// around value — absolute (tolerance) or relative (margin), symmetric or
// asymmetric. Add-only: a bound already present or a value-only range is left
// untouched. The band spelling is authoring sugar; min/max are what storage
// reads. `fraction_*` sugar is already margin_* by here (format.ts desugars it).
import { die } from '../normalize/registers.ts';
import type { ValuedRange } from '../gen/schema.ts';

// band math: authored magnitude → offset magnitude from value.
const tolerance = (_value: number, band: number) => band; // absolute, unscaled
const margin = (value: number, band: number) => value * band; // relative to value

type Band = (value: number, band: number) => number;
// one edge: sign toward its bound + candidate [schema band field, math] pairs
type Edge = { sign: 1 | -1; keys: Array<[keyof ValuedRange, Band]> };
const LOWER: Edge = {
	sign: -1,
	keys: [
		['tolerance', tolerance],
		['tolerance_lower', tolerance],
		['margin', margin],
		['margin_lower', margin],
	],
};
const UPPER: Edge = {
	sign: 1,
	keys: [
		['tolerance', tolerance],
		['tolerance_upper', tolerance],
		['margin', margin],
		['margin_upper', margin],
	],
};

/** the bound for one edge from its authored band, or undefined if none stated.
 * value is the already-validated numeric range.value */
function edge(range: ValuedRange, { sign, keys }: Edge, trail: string) {
	const stated = keys.filter(([k]) => range[k] !== undefined);
	if (!stated.length) return undefined;
	if (stated.length > 1)
		die(trail, `one band per edge — got ${stated.map(([k]) => k).join(' + ')}`);
	const [key, math] = stated[0]!;
	const band = range[key];
	if (typeof band !== 'number' || band < 0) die(trail, `${key}: expected a non-negative number`);
	const value = range.value as number;
	return value + sign * math(value, band);
}

/** ValuedRange → same range with min/max added where a band derives them */
export function expandValuedRange(range: ValuedRange, trail: string): ValuedRange {
	const { value, min, max } = range;
	if (typeof value !== 'number') return range; // no centre to band around
	if (min !== undefined && max !== undefined) return range; // already bounded both edges
	const nextMin = min === undefined ? edge(range, LOWER, trail) : undefined;
	const nextMax = max === undefined ? edge(range, UPPER, trail) : undefined;
	if (nextMin === undefined && nextMax === undefined) return range;
	return {
		...range,
		...(nextMin !== undefined && { min: nextMin }),
		...(nextMax !== undefined && { max: nextMax }),
	};
}
