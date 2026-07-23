// prefixes: registry ROWS → CURIE map. A prefix IS a registry slug and its
// expansion IS that row's node.url — the ONE source. Both the writer
// (bin/prefixes.ts) and the drift gate (bin/check-prefixes.ts) derive here, so
// neither carries its own copy of the rule.
import { abs, readYaml, yamlNames } from './io.ts';

export function derivePrefixes(): Record<string, string> {
	const reg: Record<string, string> = {};
	for (const name of yamlNames(abs('data/registry'))) {
		const url = readYaml<{ node?: { url?: string } }>(abs(`data/registry/${name}`)).node?.url;
		if (url) reg[name.replace(/\.yaml$/, '')] = url;
	}
	return Object.fromEntries(Object.entries(reg).sort());
}
