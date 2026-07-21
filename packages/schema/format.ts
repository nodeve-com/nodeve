// LinkML schema formatter: sort + desugar passes over a comment-preserving
// yaml Document. `--check` exits 1 on drift (gate mode); default writes.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDocument, isMap, isSeq, Document, type Node, type Pair, type Scalar, type YAMLMap } from 'yaml'

const FILE = fileURLToPath(new URL('linkml/nodeve-slots.yaml', import.meta.url))
// every authored row — one file per thing, sharded by class. nodes.yaml is the
// mint ledger, not an entry, so it stays out.
const EXAMPLES = globSync('data/*/*.yaml', {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
}).map((p) => fileURLToPath(new URL(p, import.meta.url)))
const NODES = fileURLToPath(new URL('data/nodes.yaml', import.meta.url))

type MapPair = Pair<Scalar<string>, YAMLMap>

const keyOf = (p: MapPair) => p.key.value

function mapAt(doc: Document, path: string[]): YAMLMap | undefined {
  const node = doc.getIn(path)
  return isMap(node) ? (node as YAMLMap) : undefined
}

// ─── passes ──────────────────────────────────────────────────────────────────

/** enums sort alpha. permissible_values stay authored — order is often semantic
 * (Severity best→fatal). */
function sortEnums(doc: Document) {
  const enums = mapAt(doc, ['enums'])
  enums?.items.sort((a, b) => keyOf(a as MapPair).localeCompare(keyOf(b as MapPair)))
}

/** slots sort: scalar-valued alpha, then object-valued (range is a class) alpha.
 * The object-group banner comment is re-anchored to whichever key lands first. */
function sortSlots(doc: Document) {
  const slots = mapAt(doc, ['slots'])
  if (!slots) return
  const enumNames = new Set(mapAt(doc, ['enums'])?.items.map((p) => keyOf(p as MapPair)))
  const isObjectValued = (p: MapPair) => {
    const range = p.value?.get('range')
    return typeof range === 'string' && /^[A-Z]/.test(range) && !enumNames.has(range)
  }

  // detach the group banner so it doesn't ride an arbitrary key through the sort
  const banner = slots.items
    .map((p) => (p as MapPair).key)
    .find((k) => k.commentBefore?.includes('object-valued slots'))
  const bannerText = banner?.commentBefore
  if (banner) delete banner.commentBefore

  slots.items.sort((a, b) => {
    const [pa, pb] = [a as MapPair, b as MapPair]
    return (
      Number(isObjectValued(pa)) - Number(isObjectValued(pb)) ||
      keyOf(pa).localeCompare(keyOf(pb))
    )
  })

  const firstObject = slots.items.find((p) => isObjectValued(p as MapPair)) as MapPair | undefined
  if (bannerText && firstObject) firstObject.key.commentBefore = bannerText
}

/** desugar: camel annotation is mechanical from the snake key — authors omit it,
 * the formatter injects it. */
function injectCamel(doc: Document) {
  const slots = mapAt(doc, ['slots'])
  if (!slots) return
  for (const item of slots.items) {
    const p = item as MapPair
    const name = keyOf(p)
    if (!name.includes('_')) continue
    if (p.value?.hasIn(['annotations', 'camel'])) continue
    const camel = name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    p.value.set('annotations', doc.createNode({ camel: camel }, { flow: true }))
  }
}

/** desugar: part_scope follows the spec's interval part — present = member,
 * NULL = combined. Only `default` (the fallback band) is ever hand-authored. */
function injectPartScope(node: Node | null) {
  if (isSeq(node)) {
    for (const item of node.items) injectPartScope(item as Node)
    return
  }
  if (!isMap(node)) return
  const specs = node.get('specifications')
  const intervals = node.get('intervals')
  if (isSeq(specs) && isSeq(intervals)) {
    // specs are width extensions — they share their interval's node row
    const partOf = new Map<unknown, unknown>()
    for (const i of intervals.items) if (isMap(i)) partOf.set(i.get('node'), i.get('part'))
    for (const s of specs.items) {
      if (!isMap(s) || s.has('part_scope')) continue
      s.set('part_scope', partOf.get(s.get('node')) == null ? 'combined' : 'member')
    }
  }
  for (const p of node.items) injectPartScope(p.value as Node)
}

// ─── node minting ────────────────────────────────────────────────────────────
// slug_qualified (ancestor slug trail) is the permalink PK; code = Crockford
// base32 of sha1(slug_qualified)'s last 5 bytes (40 bits = 8 chars) — a url
// shortener over the PK, nothing more.
// Hashes the CURIE, never a url: the domain is a deployment fact, and folding
// it in meant moving domains silently invalidated every code.
// Mint-once: rows already in nodes.yaml are frozen — renames never re-derive.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function codeOf(slugQualified: string): string {
  const tail = createHash('sha1').update(slugQualified).digest().subarray(-5)
  let bits = 0n
  for (const b of tail) bits = (bits << 8n) | BigInt(b)
  let out = ''
  for (let i = 7; i >= 0; i--) out += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)]
  return out
}

/** every map carrying a slug names a thing; its path is the ancestor slug trail */
function collectPaths(node: Node | null, trail: string[], out: string[]) {
  if (isMap(node)) {
    const slug = node.get('slug')
    const next = typeof slug === 'string' ? [...trail, slug] : trail
    if (typeof slug === 'string') out.push(next.join('/'))
    for (const p of node.items) collectPaths(p.value as Node, next, out)
  } else if (isSeq(node)) {
    for (const item of node.items) collectPaths(item as Node, trail, out)
  }
}

function mintNodes(): string {
  const doc = existsSync(NODES) ? parseDocument(readFileSync(NODES, 'utf8')) : new Document([])
  const rows = (doc.contents ?? doc.createNode([])) as unknown as { items: YAMLMap[] }
  const frozen = new Set(rows.items.map((r) => r.get('slug_qualified')))
  const paths: string[] = []
  for (const [file, { contents }] of exampleDocs) {
    // permalink root = the doc's device_type, last segment (node:device-type/inverter
    // → inverter). Definition docs carry no device_type — their own node CURIE
    // already names the layer (node:feature-type/ac-phase → feature-type).
    const designator = isMap(contents) ? contents.get('device_type') ?? contents.get('node') : undefined
    if (typeof designator !== 'string') throw new Error(`${file}: no device_type or node designator`)
    const segments = designator.replace(/^node:/, '').split('/')
    const root = contents.has('device_type') ? segments.at(-1)! : segments[0]
    collectPaths(contents, [root], paths)
  }
  for (const path of paths.sort()) {
    const slugQualified = `node:${path}`
    if (frozen.has(slugQualified)) continue
    rows.items.push(
      doc.createNode({ slug_qualified: slugQualified, code: codeOf(slugQualified) }, { flow: true }) as unknown as YAMLMap,
    )
  }
  doc.contents = rows as never
  if (!doc.commentBefore)
    doc.commentBefore =
      ' Node rows minted by format.ts — APPEND-ONLY. slug_qualified = permalink PK,\n code = sha1(slug_qualified) tail as Crockford base32 — a url shortener over the PK.\n Renaming a slug mints a NEW row only if the old one is deleted by hand; minted facts never re-derive.'
  return doc.toString({ lineWidth: 0 })
}

// ─── cli ─────────────────────────────────────────────────────────────────────

const src = readFileSync(FILE, 'utf8')
const doc = parseDocument(src)
if (doc.errors.length) {
  console.error(doc.errors.map((e) => e.message).join('\n'))
  process.exit(2)
}

sortEnums(doc)
sortSlots(doc)
injectCamel(doc)

const exampleSrc = new Map(EXAMPLES.map((f) => [f, readFileSync(f, 'utf8')]))
const exampleDocs = new Map([...exampleSrc].map(([f, s]) => [f, parseDocument(s)]))
for (const ex of exampleDocs.values()) injectPartScope(ex.contents)

const outputs: Array<[string, string, string]> = [
  [FILE, src, doc.toString({ lineWidth: 0 })],
  ...[...exampleDocs].map(
    ([f, d]) => [f, exampleSrc.get(f)!, d.toString({ lineWidth: 0 })] as [string, string, string],
  ),
  [NODES, existsSync(NODES) ? readFileSync(NODES, 'utf8') : '', mintNodes()],
]
const dirty = outputs.filter(([, before, after]) => before !== after)
if (!dirty.length) process.exit(0)
if (process.argv.includes('--check')) {
  for (const [file] of dirty) console.error(`${file} not formatted — run: node packages/schema/format.ts`)
  process.exit(1)
}
for (const [file, , after] of dirty) {
  writeFileSync(file, after)
  console.log(`formatted ${file}`)
}
