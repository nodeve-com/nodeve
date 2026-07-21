// Two slug authorities exist on purpose: schema-land derives from the slug
// SLOT's pattern; everything else imports @nodeve/text isSlug. This stitches
// them together — drift here means one of them changed alone.
import { SLUG_PATTERN } from '@nodeve/text/slugify';
import { expect, it } from 'vitest';
import { slotByName } from './model.ts';

it('the slug slot pattern IS @nodeve/text SLUG_PATTERN', () => {
	expect(slotByName.slug.pattern).toBe(SLUG_PATTERN.source);
});
