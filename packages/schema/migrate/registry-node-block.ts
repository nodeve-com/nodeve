// Registry files → chint/foxess shape: node-level fields move under a `node:`
// block that flattens onto the root row; `content` stays. The homepage `url` is
// dropped and the resolver `iri_template` is promoted to `url` (the sole link a
// registry needs is the one that resolves a term). Historical record of the
// reshape — registry files were the last to carry these as bare top-level keys.
//
//   node migrate/registry-node-block.ts
import { abs, readYaml, write, yamlNames, type Doc } from '../src/io.ts';
import { dumpYaml } from '../src/yaml-style.ts';

for (const f of yamlNames(abs('data/registry'))) {
	const path = abs(`data/registry/${f}`);
	const doc = readYaml(path) as Doc;
	if (doc.node) {
		console.log(`skip registry/${f} (already reshaped)`);
		continue;
	}
	const node: Doc = {};
	// the resolver template promoted to a plain namespace base: drop the `{id}`
	// placeholder and any suffix, keeping the trailing `/` or `#` delimiter
	if (doc.iri_template !== undefined) node.url = String(doc.iri_template).replace(/\{id\}.*$/, '');
	node.slug = f.replace(/\.yaml$/, '');

	const out: Doc = {};
	if (doc.content !== undefined) out.content = doc.content;
	out.node = node;
	write(path, dumpYaml(out));
	console.log(`migrated registry/${f}`);
}
