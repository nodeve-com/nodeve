// The `enums:` verb of the def language (kit/resolve.ts applies it): one field per named
// enumeration, valued by that enumeration's member (literal) stems. Pure — def in, fields out.

import { type Obj, asList, enumerationMembers } from '../src/concept-sources.ts';
import { isPlainObject } from 'remeda';

/** A def's `enums:` list as `{ <enumeration>: field }` entries. A bare slug takes every member;
 *  a `{ <enumeration>: [ids] }` entry NARROWS to a validated subset (a stale id fails the build) —
 *  the same filter `parts:` applies, never a re-authored member list. The field is keyed by the
 *  enumeration name in both forms. */
export function enumFields(enums: unknown, stack: string[]): Obj {
	if (enums === undefined) return {};
	if (!Array.isArray(enums)) {
		throw new Error(`grimoire compile: \`enums:\` must be an array (via ${stack.join(' → ')})`);
	}
	const out: Obj = {};
	for (const entry of enums as unknown[]) {
		if (typeof entry === 'string') {
			out[entry] = { schema: { type: 'string', enum: enumerationMembers(entry) } };
			continue;
		}
		if (!isPlainObject(entry)) {
			throw new Error(`grimoire compile: \`enums:\` entries are a bare slug or a { <enumeration>: [ids] } filter — got ${JSON.stringify(entry)} (via ${stack.join(' → ')})`);
		}
		for (const [enumeration, idsRaw] of Object.entries(entry)) {
			const members = enumerationMembers(enumeration);
			const ids = asList(idsRaw, `enums.${enumeration}`, stack);
			const stale = ids.filter((id) => !members.includes(id));
			if (stale.length > 0) {
				throw new Error(`grimoire compile: enums filter on "${enumeration}" names non-members of enumeration/${enumeration}/: ${stale.join(', ')} (via ${stack.join(' → ')})`);
			}
			out[enumeration] = { schema: { type: 'string', enum: ids } };
		}
	}
	return out;
}
