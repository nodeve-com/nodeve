// Seal an archetype's composition into the concrete, validatable schema. Atoms and base/
// intermediate archetypes are authored UNSEALED (no `additionalProperties`) so they stay
// composable via `Type.Composite` (a `dehumidifier` mixes in the `appliance` base, etc.). The
// concrete archetype a catalog leaf validates against must reject unknown keys, so the loader
// seals it ONCE here: re-wrap the composition with `additionalProperties:false`. This is the only
// place the seal happens — see concepts/README.md "the sealing rule".

import { type TObject, type TSchema, Type } from '@sinclair/typebox';

/** Wrap an (unsealed) archetype schema as a sealed concrete schema (`additionalProperties:false`). */
export const seal = (schema: TSchema): TObject => Type.Composite([schema as TObject], { additionalProperties: false });
