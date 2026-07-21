// Two slug authorities exist on purpose: schema-land derives from the slug
// SLOT's pattern; everything else imports @nodeve/text isSlug. This stitches
// them together — drift here means one of them changed alone.
import { readFileSync } from 'node:fs';
import { SLUG_PATTERN } from '@nodeve/text/slugify';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('the slug slot pattern IS @nodeve/text SLUG_PATTERN', () => {
	const slots = parse(
		readFileSync(new URL('../linkml/nodeve-slots.yaml', import.meta.url), 'utf8'),
	).slots;
	expect(slots.slug.pattern).toBe(SLUG_PATTERN.source);
});
