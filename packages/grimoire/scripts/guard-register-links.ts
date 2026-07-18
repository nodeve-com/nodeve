// Guard: every catalog modbus register/decode LINK resolves against the entry's baked feature tree.
//
// A register links a decoded value to a measurand by `(feature_id, part_id | ordinal, quantity_kind)`
// (concepts/features/modbus_link.yaml); a decode links a categorical to a feature by `feature_id`.
// The link is a POINTER — it defines nothing. The SOURCE OF TRUTH for what a device offers is the
// BAKED `feature_spec` on the entry (generated/catalog/<slug>.json): the feature slots it fills and,
// per slot, the `combined` / `part` / `instances` bodies whose keys are the offered quantity_kinds.
// This guard rejects a link that points at a feature slot, part, ordinal, or kind the baked tree
// doesn't back — the drift that let a register name a feature/part/kind coined from a datasheet
// string, never reconciled to the schema.
//
//   • feature_id is a real feature slot of the entry (a top-level key carrying `feature_spec`),
//     or the archetype root — the latter only for a whole-device decode (categorical), never a
//     register (numeric);
//   • a register fills feature_id + quantity_kind XOR is RAW (raw_name only, unlinked);
//   • part_id resolves to a key of `feature_spec.part`; ordinal to `feature_spec.instances[n-1]`
//     (1-based, within count); a bare register (neither) resolves against `feature_spec.combined`;
//   • quantity_kind is a key of the resolved body (the offered menu).
//
// Runs against the generated catalog — the same JSON every consumer reads. Run standalone:
// `node scripts/guard-register-links.ts`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS_CATALOG_DIR } from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

// Keys that ride a feature body alongside its quantity_kinds — never a kind themselves. A menu's
// remaining keys ARE the offered kinds.
const NON_KIND = new Set(['identity', 'concept_settings', 'intervals', 'condition']);

type Reg = {
	feature_id?: string;
	part_id?: string;
	ordinal?: number;
	quantity_kind?: string;
	interval_id?: string; // channel selector — the measurable interval's slug (validated in kit/validate-conditions)
	raw_name?: string;
	address?: number;
};
type Decode = { feature_id?: string; state?: string; fault?: string };
type Body = Record<string, unknown>;
type Spec = { combined?: Body; part?: Record<string, Body>; instances?: Body[] } & Body;

/** The offered quantity_kinds of a feature body — its own keys minus the structural riders. */
const kindsOf = (body: Body | undefined): Set<string> =>
	new Set(Object.keys(body ?? {}).filter((k) => !NON_KIND.has(k)));

function featureSpecs(entry: Record<string, unknown>): Map<string, Spec> {
	const specByKey = new Map<string, Spec>();
	for (const [key, value] of Object.entries(entry)) {
		const spec = (value as { feature_spec?: Spec })?.feature_spec;
		if (spec && typeof spec === 'object') specByKey.set(key, spec);
	}
	return specByKey;
}

function registerMenu(
	reg: Reg,
	spec: Spec,
	count: number,
): { menu?: Set<string>; where?: string; error?: string } {
	const { feature_id, part_id, ordinal } = reg;
	if (part_id != null) {
		const body = spec.part?.[part_id];
		return body
			? { menu: kindsOf(body), where: `${feature_id}.${part_id}` }
			: {
					error: `part_id '${part_id}' is not a part of '${feature_id}' (parts: ${Object.keys(spec.part ?? {}).join(', ') || 'none'})`,
				};
	}
	if (ordinal != null)
		return ordinal < 1 || ordinal > count
			? { error: `ordinal ${ordinal} out of range 1..${count} on '${feature_id}'` }
			: { menu: kindsOf(spec.instances?.[ordinal - 1]), where: `${feature_id}[${ordinal}]` };
	return { menu: kindsOf(spec.combined ?? spec), where: `${feature_id}.combined` };
}

function checkRegister(options: {
	reg: Reg;
	slug: string;
	specs: Map<string, Spec>;
	countOf: (feature: string) => number;
	fail: (entry: string, message: string) => void;
}): void {
	const { reg, slug, specs, countOf, fail } = options;
	const at = `register @${reg.address ?? '?'}`;
	if (!reg.feature_id && reg.raw_name) return;
	if (!reg.feature_id) return fail(slug, `${at} links nothing (no feature_id, no raw_name)`);
	if (reg.raw_name)
		fail(slug, `${at} is both linked (${reg.feature_id}) and raw (${reg.raw_name})`);
	const spec = specs.get(reg.feature_id);
	if (!spec)
		return fail(
			slug,
			`${at} feature_id '${reg.feature_id}' is not a feature slot (slots: ${[...specs.keys()].join(', ') || 'none'})`,
		);
	const result = registerMenu(reg, spec, countOf(reg.feature_id));
	if (result.error) return fail(slug, `${at} ${result.error}`);
	// The column is the bare `quantity_kind` (features/measurand_link.yaml); flow_direction/period
	// narrow it to one measurable interval of that column (validated against interval axes elsewhere).
	const col = reg.quantity_kind;
	if (!col) fail(slug, `${at} on '${reg.feature_id}' has no quantity_kind`);
	else if (result.menu!.size > 0 && !result.menu!.has(col))
		fail(
			slug,
			`${at} column '${col}' is not offered by '${result.where}' (offers: ${[...result.menu!].join(', ')})`,
		);
}

function checkEntry(file: string, failLine: (line: string) => void): void {
	const entry = JSON.parse(readFileSync(join(ARTIFACTS_CATALOG_DIR, file), 'utf8')) as Record<
		string,
		unknown
	>;
	const modbus = entry.modbus as
		{ modbus_registers?: Reg[]; modbus_decodes?: Decode[] } | undefined;
	if (!modbus) return;
	const slug = (entry.identity as { slug?: string })?.slug ?? file.replace(/\.json$/, '');
	const archetype = (entry.identity as { archetype_id?: string })?.archetype_id;
	const specs = featureSpecs(entry);
	const fail = (name: string, message: string) => failLine(`${name}: ${message}`);
	const countOf = (feature: string) => {
		const settings = (entry[feature] as { concept_settings?: { count?: number } })
			?.concept_settings;
		return specs.get(feature)?.instances?.length ?? settings?.count ?? 0;
	};
	for (const reg of modbus.modbus_registers ?? [])
		checkRegister({ reg, slug, specs, countOf, fail });
	for (const decode of modbus.modbus_decodes ?? []) {
		const label = decode.state ?? decode.fault ?? '?';
		if (decode.feature_id && decode.feature_id !== archetype && !specs.has(decode.feature_id))
			fail(
				slug,
				`decode '${label}' feature_id '${decode.feature_id}' is not a feature slot or the archetype root '${archetype}'`,
			);
	}
}

runGuard(
	{
		header: (count) =>
			`\n✖ ${count} grimoire register/decode link(s) do not resolve against the baked feature tree:\n`,
		hint: `
A link's (feature_id, part_id | ordinal, quantity_kind) is a POINTER; the baked \`feature_spec\` on
the catalog entry is the source of truth for what the device offers. Fix the LINK to name a real
feature slot + part/ordinal + offered kind — do NOT coin a code to match a datasheet string.
`,
	},
	(failLine) => {
		for (const file of readdirSync(ARTIFACTS_CATALOG_DIR).filter((name) => name.endsWith('.json')))
			checkEntry(file, failLine);

		return '✓ grimoire register/decode links all resolve against the baked feature tree';
	},
);
