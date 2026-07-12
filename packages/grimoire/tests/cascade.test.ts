// The identity slug is the ONE slug definition — `identity.slug` when authored, else the file stem
// verbatim (the tree path is filing only). The stem is NOT transformed: a non-slug stem stays
// non-slug so its entry's schema (slug.yaml pattern) rejects it. See `effectiveSlug` in kit/cascade.ts.

import { describe, expect, it } from 'vitest';
import { effectiveSlug } from '../kit/cascade.ts';

describe('effectiveSlug', () => {
  it('prefers an authored identity.slug over the stem', () => {
    expect(effectiveSlug('foxess/h3/ps-10.0-sh', { slug: 'foxess_h3_ps10sh' })).toBe('foxess_h3_ps10sh');
  });

  it('falls back to the file stem, verbatim', () => {
    expect(effectiveSlug('catalog/grid_inverter', {})).toBe('grid_inverter');
    expect(effectiveSlug('foxess/h3/ps-10.0-sh', {})).toBe('ps-10.0-sh');
  });
});
