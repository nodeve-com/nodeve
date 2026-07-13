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
	raw_name?: string;
	address?: number;
};
type Decode = { feature_id?: string; state?: string; fault?: string };
type Body = Record<string, unknown>;
type Spec = { combined?: Body; part?: Record<string, Body>; instances?: Body[] } & Body;

/** The offered quantity_kinds of a feature body — its own keys minus the structural riders. */
const kindsOf = (body: Body | undefined): Set<string> =>
	new Set(Object.keys(body ?? {}).filter((k) => !NON_KIND.has(k)));

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
		const fail = (entry: string, msg: string): void => failLine(`${entry}: ${msg}`);

		for (const file of readdirSync(ARTIFACTS_CATALOG_DIR).filter((f) => f.endsWith('.json'))) {
			const entry = JSON.parse(readFileSync(join(ARTIFACTS_CATALOG_DIR, file), 'utf8')) as Record<
				string,
				unknown
			>;
			const modbus = entry.modbus as
				| { modbus_registers?: Reg[]; modbus_decodes?: Decode[] }
				| undefined;
			if (!modbus) continue; // no register map — nothing to resolve

			const slug = (entry.identity as { slug?: string })?.slug ?? file.replace(/\.json$/, '');
			const archetype = (entry.identity as { archetype?: string })?.archetype;
			// Feature slots = every top-level key whose value carries a baked `feature_spec`.
			const specByFeature = new Map<string, Spec>();
			for (const [key, value] of Object.entries(entry)) {
				const spec = (value as { feature_spec?: Spec })?.feature_spec;
				if (spec && typeof spec === 'object') specByFeature.set(key, spec);
			}
			// A repeated feature's instance count — the ordinal bound.
			const countOf = (feature: string): number => {
				const cs = (entry[feature] as { concept_settings?: { count?: number } })?.concept_settings;
				return specByFeature.get(feature)?.instances?.length ?? cs?.count ?? 0;
			};

			for (const reg of modbus.modbus_registers ?? []) {
				const at = `register @${reg.address ?? '?'}`;
				const { feature_id, part_id, ordinal, quantity_kind, raw_name } = reg;
				if (!feature_id && raw_name) continue; // RAW / unlinked value — nothing to resolve
				if (!feature_id) {
					fail(slug, `${at} links nothing (no feature_id, no raw_name)`);
					continue;
				}
				if (raw_name) fail(slug, `${at} is both linked (${feature_id}) and raw (${raw_name})`);
				const spec = specByFeature.get(feature_id);
				if (!spec) {
					fail(
						slug,
						`${at} feature_id '${feature_id}' is not a feature slot (slots: ${[...specByFeature.keys()].join(', ') || 'none'})`,
					);
					continue;
				}
				// Resolve the offered menu by cardinality: part → instance → combined.
				let menu: Set<string>;
				let where: string;
				if (part_id != null) {
					const body = spec.part?.[part_id];
					if (!body) {
						fail(
							slug,
							`${at} part_id '${part_id}' is not a part of '${feature_id}' (parts: ${Object.keys(spec.part ?? {}).join(', ') || 'none'})`,
						);
						continue;
					}
					menu = kindsOf(body);
					where = `${feature_id}.${part_id}`;
				} else if (ordinal != null) {
					const count = countOf(feature_id);
					if (ordinal < 1 || ordinal > count) {
						fail(slug, `${at} ordinal ${ordinal} out of range 1..${count} on '${feature_id}'`);
						continue;
					}
					menu = kindsOf(spec.instances?.[ordinal - 1]);
					where = `${feature_id}[${ordinal}]`;
				} else {
					menu = kindsOf(spec.combined ?? spec);
					where = `${feature_id}.combined`;
				}
				if (!quantity_kind) {
					fail(slug, `${at} on '${feature_id}' has no quantity_kind`);
				} else if (menu.size > 0 && !menu.has(quantity_kind)) {
					fail(
						slug,
						`${at} kind '${quantity_kind}' is not offered by '${where}' (offers: ${[...menu].join(', ')})`,
					);
				}
			}

			for (const dec of modbus.modbus_decodes ?? []) {
				const label = dec.state ?? dec.fault ?? '?';
				// A decode is a whole-device categorical: its feature is a real slot OR the archetype root.
				if (dec.feature_id && dec.feature_id !== archetype && !specByFeature.has(dec.feature_id)) {
					fail(
						slug,
						`decode '${label}' feature_id '${dec.feature_id}' is not a feature slot or the archetype root '${archetype}'`,
					);
				}
			}
		}

		return '✓ grimoire register/decode links all resolve against the baked feature tree';
	},
);
