// Authored-yaml format gate. Routes each file to its SEMANTIC passes — linkml
// schema files sort (src/format-schema.ts), data files canonicalize
// (src/format-data.ts) — then re-serializes through io.dumpYaml, which owns the
// content-agnostic collection style (so a generated file gets it too). Load +
// parse live in io.loadDocs; this file is just the harness: route, diff, write.
// `--check` exits 1 on drift; default writes.
import { glob, loadDocs, write } from '../src/io.ts';
import { dumpYaml } from '../src/yaml-style.ts';
import { formatSchema } from '../src/format-schema.ts';
import { formatData } from '../src/format-data.ts';
import type { Document } from 'yaml';

// linkml schema files take the sort passes; authored data yaml takes the
// canonicalize. Both re-serialize through io.dumpYaml — prettier ignores all yaml.
const passBy = new Map<string, (doc: Document) => void>([
	...glob('linkml/*.yaml').map((f) => [f, formatSchema] as const),
	...glob('data/**/*.yaml').map((f) => [f, formatData] as const),
]);

const outputs: Array<[string, string, string]> = [...loadDocs([...passBy.keys()])].map(
	([file, { source, doc }]) => {
		if (doc.errors.length) {
			console.error(doc.errors.map((e) => e.message).join('\n'));
			process.exit(2);
		}
		passBy.get(file)!(doc);
		return [file, source, dumpYaml(doc)];
	},
);

const dirty = outputs.filter(([, before, after]) => before !== after);
if (!dirty.length) process.exit(0);
if (process.argv.includes('--check')) {
	for (const [file] of dirty)
		console.error(`${file} not formatted — run: node packages/schema/bin/format.ts`);
	process.exit(1);
}
for (const [file, , after] of dirty) {
	write(file, after);
	console.log(`formatted ${file}`);
}
