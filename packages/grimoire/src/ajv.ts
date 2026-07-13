// THE Ajv instance — one init, one settings surface, shared by kit/validate-docs.ts,
// src/validate-site.ts, and tests. strict:false because x-env-var etc. are annotations,
// not keywords; allErrors so gates report every failure at once.

import { Ajv } from 'ajv';

export const ajv = new Ajv({ strict: false, allErrors: true });
