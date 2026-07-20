// The identity slug is the ONE slug definition — `identity.slug` when authored, else the file stem
// verbatim (the tree path is filing only). The stem is NOT transformed: a non-slug stem stays
// non-slug so its entry's schema (slug.yaml pattern) rejects it. scribe stamps it at conversion
// time (`stampIdentity` in src/scribe/identity.ts) — only for docs that already declare an identity.

import { describe, expect, it } from 'vitest';
import { stampIdentity } from '../src/scribe/index.ts';

describe('scribe stampIdentity', () => {
  it('prefers an authored identity.slug over the stem', () => {
    expect(stampIdentity({ identity: { slug: 'foxess_h3_ps10sh' } }, 'ps-10.0-sh').identity).toEqual({
      slug: 'foxess_h3_ps10sh',
    });
  });

  it('falls back to the file stem, verbatim', () => {
    expect(stampIdentity({ identity: {} }, 'grid_inverter').identity).toEqual({ slug: 'grid_inverter' });
    expect(stampIdentity({ identity: {} }, 'ps-10.0-sh').identity).toEqual({ slug: 'ps-10.0-sh' });
  });

  it('leaves a doc with no identity block untouched (a singleton is not an identified thing)', () => {
    expect(stampIdentity({ title: { en: 'x' } }, 'anything')).toEqual({ title: { en: 'x' } });
  });
});
