// LinkML schema formatter: sort + desugar passes over a comment-preserving
// yaml Document. `--check` exits 1 on drift (gate mode); default writes.
import { readFileSync, writeFileSync, globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDocument, isMap, isSeq, type Node, type Pair, type Scalar, type YAMLMap } from 'yaml'

const FILE = fileURLToPath(new URL('linkml/nodeve-slots.yaml', import.meta.url))
// every authored row — one file per thing, sharded by class
const EXAMPLES = globSync('data/*/*.yaml', {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
}).map((p) => fileURLToPath(new URL(p, import.meta.url)))

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

/** Content is an addressable child: its own node identifies it; `about`
 * always points to the node of the row containing the authored contents. */
function injectContentAbout(node: Node | null) {
  if (isSeq(node)) {
    for (const item of node.items) injectContentAbout(item as Node)
    return
  }
  if (!isMap(node)) return
  const owner = node.get('node')
  const contents = node.get('contents')
  if (typeof owner === 'string' && isSeq(contents)) {
    for (const content of contents.items) if (isMap(content)) content.set('about', owner)
  }
  for (const pair of node.items) injectContentAbout(pair.value as Node)
}

const curieTail = (value: unknown) =>
  typeof value === 'string' ? value.replace(/^node:/, '').split('/').at(-1) : undefined

/** Stamp the model → feature → part → interval identity trail. Facets share
 * their interval/model node; references follow rewritten identities. */
function stampModelNodes(node: Node | null) {
  if (!isMap(node) || typeof node.get('device_type') !== 'string' || typeof node.get('slug') !== 'string') return
  const root = `node:${curieTail(node.get('device_type'))}/${node.get('slug')}`
  const rewrites = new Map<string, string>()
  const stamp = (row: YAMLMap, value: string) => {
    const old = row.get('node')
    if (typeof old === 'string') rewrites.set(old, value)
    row.set('node', value)
  }
  stamp(node, root)
  const product = node.get('product')
  if (isMap(product)) stamp(product, root)

  const features: YAMLMap[] = []
  for (const pair of node.items) {
    if (!isSeq(pair.value)) continue
    for (const item of pair.value.items) if (isMap(item) && typeof item.get('role') === 'string') features.push(item)
  }
  const intervalRows = new Map<string, YAMLMap>()
  const intervalFacets = new Map<string, YAMLMap[]>()
  for (const feature of features) {
    const featureType = curieTail(feature.get('feature_type'))
    if (!featureType) throw new Error(`${feature.get('role')}: feature has no feature_type`)
    const featureNode = `${root}/${featureType}/${feature.get('role')}`
    stamp(feature, featureNode)
    const parts = feature.get('parts')
    if (isSeq(parts)) for (const part of parts.items) if (isMap(part)) stamp(part, `${featureNode}/${part.get('slug')}`)
    const intervals = feature.get('intervals')
    if (isSeq(intervals)) for (const interval of intervals.items) {
      if (!isMap(interval) || typeof interval.get('node') !== 'string') continue
      intervalRows.set(interval.get('node') as string, interval)
    }
    for (const key of ['specifications', 'measurements']) {
      const facets = feature.get(key)
      if (!isSeq(facets)) continue
      for (const facet of facets.items) {
        if (!isMap(facet) || typeof facet.get('node') !== 'string') continue
        const id = facet.get('node') as string
        intervalFacets.set(id, [...(intervalFacets.get(id) ?? []), facet])
      }
    }
  }

  const derivedSlug = (id: string, stack = new Set<string>()): string | undefined => {
    const interval = intervalRows.get(id)
    if (!interval) return curieTail(id)
    if (typeof interval.get('slug') === 'string') return interval.get('slug') as string
    if (stack.has(id)) throw new Error(`${id}: cyclic interval gate`)
    stack.add(id)
    const facets = intervalFacets.get(id) ?? []
    const spec = facets.find((row) => row.has('rating') || row.has('zone') || row.has('severity'))
    const measurement = facets.find((row) => row.has('flow_direction') || row.has('period'))
    const tokens: string[] = []
    const range = interval.get('valued_range')
    if (spec?.has('zone')) tokens.push(spec.get('zone') as string)
    else if (isMap(range) && range.has('value') && !range.has('min') && !range.has('max')) tokens.push('nominal')
    if (spec?.has('severity') && spec.get('severity') !== 'nominal') tokens.push(spec.get('severity') as string)
    if (measurement?.has('flow_direction')) tokens.push(measurement.get('flow_direction') as string)
    if (measurement?.has('period')) tokens.push(measurement.get('period') as string)
    if (!tokens.length && spec?.has('rating')) tokens.push(spec.get('rating') as string)
    const conditions = spec?.get('conditions')
    if (isSeq(conditions)) for (const condition of conditions.items) {
      if (!isMap(condition)) continue
      if (typeof condition.get('equals') === 'string') tokens.push(condition.get('equals') as string)
      else if (typeof condition.get('gated_by') === 'string') tokens.push(derivedSlug(condition.get('gated_by') as string, stack)!)
    }
    stack.delete(id)
    return tokens.length ? tokens.join('_') : undefined
  }

  for (const feature of features) {
    const featureNode = feature.get('node') as string
    const intervals = feature.get('intervals')
    if (!isSeq(intervals)) continue
    for (const interval of intervals.items) {
      if (!isMap(interval)) continue
      const old = interval.get('node')
      const slug = typeof old === 'string' ? derivedSlug(old) : undefined
      if (!slug) throw new Error(`${old}: interval has no derivable slug`)
      interval.set('slug', slug)
      const part = interval.get('part')
      const partSlug = typeof part === 'string' ? curieTail(rewrites.get(part) ?? part) : '_'
      const quantity = curieTail(interval.get('quantity_kind'))
      const value = `${featureNode}/${partSlug}/${quantity}/${slug}`
      stamp(interval, value)
      const range = interval.get('valued_range')
      if (isMap(range)) stamp(range, value)
      for (const facet of intervalFacets.get(old as string) ?? []) stamp(facet, value)
    }
  }

  const rewriteRefs = (value: Node | null) => {
    if (isSeq(value)) for (const item of value.items) rewriteRefs(item as Node)
    else if (isMap(value)) for (const pair of value.items) {
      const raw = typeof pair.value === 'string' ? pair.value : isScalarString(pair.value) ? pair.value.value : undefined
      if (pair.key && (pair.key as Scalar).value !== 'node' && raw !== undefined) {
        const replacement = rewrites.get(raw)
        if (replacement) pair.value = replacement as never
      } else rewriteRefs(pair.value as Node)
    }
  }
  rewriteRefs(node)
}

function isScalarString(node: Node | null): node is Scalar<string> {
  return typeof node === 'object' && node !== null && 'value' in node && typeof (node as Scalar).value === 'string'
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
for (const ex of exampleDocs.values()) {
  stampModelNodes(ex.contents)
  injectPartScope(ex.contents)
  injectContentAbout(ex.contents)
}

const outputs: Array<[string, string, string]> = [
  [FILE, src, doc.toString({ lineWidth: 0 })],
  ...[...exampleDocs].map(
    ([f, d]) => [f, exampleSrc.get(f)!, d.toString({ lineWidth: 0 })] as [string, string, string],
  ),
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
