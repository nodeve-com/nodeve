// Organization files → chint/foxess shape: `title` → `content.en.title`,
// `identity.url` → `node.url`, slug = filename; the derived `identity.code` is
// dropped (minted from the permalink, never authored). Leading `#` comments are
// carried through verbatim. Historical record of the reshape.
//
//   node migrate/organization-node-block.ts
import { readFileSync } from 'node:fs';
import { abs, readYaml, write, yamlNames, type Doc } from '../src/io.ts';
import { dumpYaml } from '../src/yaml-style.ts';

// the pre-reshape organization shape this script reads in
type OrgDoc = { title?: { en?: string }; identity?: { url?: string }; node?: unknown };

/** leading `#` comment block of a file, verbatim */
function leadComment(path: string): string {
	const lines: string[] = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (line.startsWith('#')) lines.push(line);
		else break;
	}
	return lines.length ? lines.join('\n') + '\n' : '';
}

for (const f of yamlNames(abs('data/organization'))) {
	const path = abs(`data/organization/${f}`);
	const doc = readYaml(path) as OrgDoc;
	if (doc.node) {
		console.log(`skip organization/${f} (already reshaped)`);
		continue;
	}
	const out: Doc = { content: { en: { title: doc.title?.en } } };
	const node: Doc = {};
	if (doc.identity?.url !== undefined) node.url = doc.identity.url;
	node.slug = f.replace(/\.yaml$/, '');
	out.node = node;
	write(path, leadComment(path) + dumpYaml(out));
	console.log(`migrated organization/${f}`);
}
