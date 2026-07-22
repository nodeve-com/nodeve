// Resolver check: does each registry's iri_template actually resolve?
// One live request per REGISTRY (not per ref) — a template is either right or
// wrong for all 1196 of its terms. Network-dependent, so this is NOT in the
// precommit gate; run it when registry rows change.
// `--all` samples three terms per registry instead of one.
// Authored docs enter as NORMALIZED rows, same as every other consumer.
import { abs, yamlNames } from '../src/io.ts';
import { normalize } from '../normalize/catalog.ts';

const rowsOf = (table: string) =>
	yamlNames(abs(`data/${table}`)).flatMap((f) => normalize(abs(`data/${table}/${f}`)));

const sampleCount = process.argv.includes('--all') ? 3 : 1;

const registryByNode = new Map(
	rowsOf('registry')
		.filter((r) => r.slug)
		.map((r) => [r.node as string, r]),
);
// sample real terms from the data, not invented ones — a template can be right
// and still 404 on a term the registry never had
const termsByRegistry = new Map<string, string[]>();
for (const row of rowsOf('quantity_kind')) {
	if (row.$slot !== 'refs') continue;
	const seen = termsByRegistry.get(row.registry as string) ?? [];
	if (seen.length < sampleCount)
		termsByRegistry.set(row.registry as string, [...seen, row.term as string]);
}

const responses = await Promise.all(
	[...termsByRegistry].flatMap(([registryNode, terms]) => {
		const reg = registryByNode.get(registryNode);
		if (!reg?.iri_template) return [];
		return terms.map(async (term) => {
			const url = (reg.iri_template as string).replace('{id}', encodeURIComponent(term));
			try {
				// some vocab hosts reject HEAD; fall back to a ranged GET
				let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
				if (res.status === 405 || res.status === 501)
					res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
				return { slug: reg.slug as string, url, status: res.status, ok: res.ok };
			} catch (e) {
				return { slug: reg.slug as string, url, status: (e as Error).message, ok: false };
			}
		});
	}),
);

const dead = responses.filter((r) => !r.ok);
for (const r of responses.sort((a, b) => a.slug.localeCompare(b.slug)))
	console.log(`${r.ok ? 'ok  ' : 'DEAD'} ${r.status}\t${r.url}`);

// a template nothing references is untested, not passing — say so rather than
// let the count imply coverage it does not have
const untested = [...registryByNode.values()]
	.filter((r) => r.iri_template && !termsByRegistry.has(r.node as string))
	.map((r) => r.slug);
if (untested.length)
	console.log(`\nUNTESTED (template, no refs to sample): ${untested.join(', ')}`);

console.log(`${responses.length - dead.length}/${responses.length} sampled refs resolve`);
if (dead.length) process.exit(1);
