// Runtime vocab surface (browser-safe: no fs/yaml — reads the baked generated/enumeration dicts).
// A vocab member's identity + crosswalk refs are authored once per file under
// concepts/enumeration/<name>/*.yaml; `pnpm generate` bakes each enumeration into
// generated/enumeration/<name>.ts (beside its <name>.json member data), and this module projects
// the uniform accessors every consumer shares (`ACCUMULATION.crosswalk(code, 'ha_state_class')`,
// `quantityKindCrosswalk('active_power', 'ha_device_class')`).

import accumulationTerms from './generated/enumeration/accumulation.ts';
import quantityKinds from './generated/enumeration/quantity_kind.ts';

/** A crosswalk to an external registry's term (refs.yaml — registry_id + term + match closeness).
 *  `registryId` is an FK to a `registry` catalog entry (docs/reference-model.md). */
export interface TermRef {
	readonly registryId: string;
	readonly term: string;
	readonly match?: string;
}

/** One vocab member / quantity kind, as baked from its YAML file (camelCase, `code` = file stem).
 *  Deep-readonly so the `as const` generated dicts satisfy it verbatim. */
export interface Term {
	readonly code: string;
	readonly title?: Readonly<Record<string, string>>;
	readonly description?: Readonly<Record<string, string>>;
	readonly refs?: readonly TermRef[];
	readonly accumulation?: string;
	readonly broader?: string;
}

export interface Vocab<Name extends string, Code extends string> {
	readonly enumeration: Name;
	readonly codes: readonly Code[];
	/** Wire `code` → member. The generated dicts key camelCase (TS surface); this re-keys by each
	 *  member's `code`, the wire spelling runtime lookups arrive in. */
	readonly dict: Record<Code, Term>;
	/** Resolve a member's crosswalk to an external `registry` → that registry's term, or
	 *  `undefined` when the member has no ref to it. The single, uniform projection of an
	 *  agnostic code onto a borrowed vocabulary — never re-spelled per enumeration. */
	crosswalk(code: Code, registry: string): string | undefined;
}

/** The member-code union of a vocab (`VocabCode<typeof ACCUMULATION>` = `'instantaneous' | …`). */
export type VocabCode<V> = V extends Vocab<string, infer Code> ? Code : never;

function makeVocab<const Name extends string, const T extends Record<string, Term>>(
	enumeration: Name,
	generated: T,
): Vocab<Name, T[keyof T]['code']> {
	type Code = T[keyof T]['code'];
	const dict = Object.fromEntries(Object.values(generated).map((t) => [t.code, t])) as Record<
		Code,
		Term
	>;
	return {
		enumeration,
		codes: Object.keys(dict) as Code[],
		dict,
		crosswalk: (code, registry) => dict[code]?.refs?.find((r) => r.registryId === registry)?.term,
	};
}

/** How a numeric reading behaves over time (instantaneous | cumulative | cumulative_monotonic) —
 *  HA projects it to state_class, Prometheus to a metric type, both via `.crosswalk`. */
export const ACCUMULATION = makeVocab('accumulation', accumulationTerms);

/** Kinds of quantity a reading measures (active_power, voltage, temperature…). Codes are dynamic —
 *  they arrive from register maps at runtime, so the dict isn't `as const` and `Code` is `string`. */
export const QUANTITY_KIND = makeVocab('quantity_kind', quantityKinds);
