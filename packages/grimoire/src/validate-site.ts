// Site bundle validator: the ONE schema check over a RESOLVED site bundle — the cascade-merged,
// slug-filled object `generate-site.ts` assembles before writing `site.generated.json`. Run once,
// at bake; consumers then read the committed bundle and trust it, no second validation.
//
// Every bundle key IS a concept slug (`building`, `site_adapter`); its value is one instance or an
// array of them. So the schema check is purely: resolve the schema from the key, then array-or-not
// decides one check or many. Cross-field invariants are structural too — authored as draft-07
// if/then/else in the concept's own `schema:` slot (e.g. site_adapter's tap-window rule), so the
// single schema check below catches them; nothing here special-cases a concept.

import { type ValidateFunction } from 'ajv';
import { camelizeInstance, snakePath } from '@nodeve/schema-case';
import { ajv } from './ajv.ts';
import { conceptSchema } from './generated/index.ts';

type Concept = keyof typeof conceptSchema;

// ajv, not TypeBox Value.Check: a concept schema's cross-field invariants are authored as draft-07
// if/then/else in its `schema:` slot, which TypeBox Value.Check silently ignores but ajv enforces
// (the same engine kit/validate-docs.ts gates docs with — src/ajv.ts, the ONE instance). The
// baked schema is camelCase, so each snake block renames (mapping-driven, BEFORE validation —
// src/parse.ts's edge) and error paths map back to the snake source the author wrote.
const checkByConcept = new Map<Concept, ValidateFunction>();
const checkerFor = (concept: Concept): ValidateFunction =>
  checkByConcept.get(concept) ?? checkByConcept.set(concept, ajv.compile(conceptSchema[concept])).get(concept)!;

export const isConcept = (key: string): key is Concept => key in conceptSchema;
const slugOf = (item: unknown): string | undefined =>
  item && typeof item === 'object' ? (item as { identity?: { slug?: string } }).identity?.slug : undefined;

/** Check one block against a concept schema; return its aggregated errors (empty when it conforms). */
function checkBlock(concept: Concept, data: unknown, label: string): string[] {
  const schema = conceptSchema[concept];
  const check = checkerFor(concept);
  if (check(camelizeInstance(schema, data))) return [];
  return [
    `${label} (against \`${concept}\`):`,
    ...(check.errors ?? []).map((e) => `  ${snakePath(schema, e.instancePath) || '/'}: ${e.message}`),
  ];
}

/** Validate a resolved site bundle against the grimoire concept schemas. Throws an aggregated error
 *  naming every non-conforming block; returns silently when it all validates. */
export function validateSite(bundle: Record<string, unknown>, siteLabel: string): void {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    if (!isConcept(key)) {
      errors.push(`${siteLabel}/${key}: no grimoire concept named \`${key}\``);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => errors.push(...checkBlock(key, item, `${siteLabel}/${key}[${slugOf(item) ?? i}]`)));
    } else {
      errors.push(...checkBlock(key, value, `${siteLabel}/${key}`));
    }
  }
  if (errors.length > 0) throw new Error(`Invalid site bundle:\n${errors.join('\n')}`);
}
