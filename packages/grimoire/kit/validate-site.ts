// Site bundle validator: the ONE schema check over a RESOLVED site bundle — the cascade-merged,
// slug-filled object `generate-site.ts` assembles before writing `site.generated.json`. Run once,
// at bake; consumers then read the committed bundle and trust it, no second validation.
//
// Every bundle key IS a concept slug (`building`, `site_adapter`); its value is one instance or an
// array of them. So the schema check is purely: resolve the schema from the key, then array-or-not
// decides one check or many. A concept may also carry a cross-field invariant a JSON Schema can't
// express (until the emitter transcribes discriminated unions) — those live in `crossFieldErrors`,
// run here over the same resolved bundle so every consumer inherits them for free.

import { Value } from '@sinclair/typebox/value';
import { conceptSchemas } from '../generated/index.ts';

type Concept = keyof typeof conceptSchemas;

const isConcept = (key: string): key is Concept => key in conceptSchemas;
const slugOf = (item: unknown): string | undefined =>
  item && typeof item === 'object' ? (item as { identity?: { slug?: string } }).identity?.slug : undefined;

/** Check one block against a concept schema; return its aggregated errors (empty when it conforms). */
function checkBlock(concept: Concept, data: unknown, label: string): string[] {
  if (Value.Check(conceptSchemas[concept], data)) return [];
  return [
    `${label} (against \`${concept}\`):`,
    ...[...Value.Errors(conceptSchemas[concept], data)].map((e) => `  ${e.path || '/'}: ${e.message}`),
  ];
}

/** Per-concept cross-field invariants the schema can't yet express (snake_case, over the resolved
 *  block). Empty when the concept has none or the block conforms.
 *
 *  `site_adapter`: the `modbus_tap_window` block travels with — and only with — a modbus_tap
 *  adapter. (A discriminated union on `ingest_kind` would make this structural; the emitter can't
 *  transcribe one yet, so it's enforced here.) */
function crossFieldErrors(concept: Concept, data: unknown, label: string): string[] {
  if (concept !== 'site_adapter' || !data || typeof data !== 'object') return [];
  const adapter = data as { ingest?: { ingest_kind?: string }; modbus_tap_window?: unknown };
  const isTap = adapter.ingest?.ingest_kind === 'modbus_tap';
  const hasWindows = adapter.modbus_tap_window !== undefined;
  if (isTap === hasWindows) return [];
  return [`${label}: \`modbus_tap_window\` windows must be present iff ingest_kind is modbus_tap`];
}

/** Both checks for one block: schema shape, then any cross-field invariant. */
const checkAll = (concept: Concept, data: unknown, label: string): string[] => [
  ...checkBlock(concept, data, label),
  ...crossFieldErrors(concept, data, label),
];

/** Validate a resolved site bundle against the grimoire concept schemas. Throws an aggregated error
 *  naming every non-conforming block; returns silently when it all validates. */
export function validateSite(bundle: Record<string, unknown>, siteLabel: string): void {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    if (!isConcept(key)) {
      errors.push(`${siteLabel}/${key}: no grimoire concept named \`${key}\``);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => errors.push(...checkAll(key, item, `${siteLabel}/${key}[${slugOf(item) ?? i}]`)));
    } else {
      errors.push(...checkAll(key, value, `${siteLabel}/${key}`));
    }
  }
  if (errors.length > 0) throw new Error(`Invalid site bundle:\n${errors.join('\n')}`);
}
