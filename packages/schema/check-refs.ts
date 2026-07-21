// Resolver check: does each registry's iri_template actually resolve?
// One live request per REGISTRY (not per ref) — a template is either right or
// wrong for all 1196 of its terms. Network-dependent, so this is NOT in the
// precommit gate; run it when registry rows change.
// `--all` samples three terms per registry instead of one.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const load = (d: string) =>
  readdirSync(at(d))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(at(d + f), 'utf8')))

const sampleCount = process.argv.includes('--all') ? 3 : 1

const registries = new Map(load('data/registry/').map((r) => [r.node, r]))
// sample real terms from the data, not invented ones — a template can be right
// and still 404 on a term the registry never had
const samples = new Map<string, string[]>()
for (const k of load('data/quantity_kind/'))
  for (const ref of k.refs ?? []) {
    const seen = samples.get(ref.registry) ?? []
    if (seen.length < sampleCount) samples.set(ref.registry, [...seen, ref.term])
  }

const results = await Promise.all(
  [...samples].flatMap(([registryNode, terms]) => {
    const reg = registries.get(registryNode)
    if (!reg?.iri_template) return []
    return terms.map(async (term) => {
      const url = reg.iri_template.replace('{id}', encodeURIComponent(term))
      try {
        // some vocab hosts reject HEAD; fall back to a ranged GET
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
        if (res.status === 405 || res.status === 501)
          res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
        return { slug: reg.slug, url, status: res.status, ok: res.ok }
      } catch (e) {
        return { slug: reg.slug, url, status: (e as Error).message, ok: false }
      }
    })
  }),
)

const dead = results.filter((r) => !r.ok)
for (const r of results.sort((a, b) => a.slug.localeCompare(b.slug)))
  console.log(`${r.ok ? 'ok  ' : 'DEAD'} ${r.status}\t${r.url}`)

// a template nothing references is untested, not passing — say so rather than
// let the count imply coverage it does not have
const untested = [...registries.values()]
  .filter((r) => r.iri_template && !samples.has(r.node))
  .map((r) => r.slug)
if (untested.length) console.log(`\nUNTESTED (template, no refs to sample): ${untested.join(', ')}`)

console.log(`${results.length - dead.length}/${results.length} sampled refs resolve`)
if (dead.length) process.exit(1)
