// gen-json-schema flattens `is_a` away, so the emitted document cannot say which
// base class a stencil specializes. Stamp the link back on, read off the
// projected LinkML. Why it belongs IN the artifact rather than a side file, and
// where the key is spelled: src/stencil.ts.
import { abs, readYaml } from '../src/io.ts';
import { readStencil, setStencilBase, writeStencil } from '../src/stencil.ts';

type ProjectedClasses = Record<string, { is_a?: string }>;

const stencilClasses = readYaml<{ classes?: ProjectedClasses }>(
	abs('gen/nodeve-projected.yaml'),
).classes;
const stamped = readStencil();

const linked = Object.entries(stencilClasses ?? {}).flatMap(([name, { is_a }]) => {
	const def = stamped.$defs[name];
	return is_a && def ? [[def, is_a] as const] : [];
});
for (const [def, base] of linked) setStencilBase(def, base);

writeStencil(stamped);
console.log(`${linked.length} stencil classes linked to their base in gen/catalog.schema.json`);
