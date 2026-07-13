// Guard: no grimoire feature re-declares another feature's prop GROUP.
//
// A feature's `prop:` map is a set of vocab-code citations — identity lives in vocab/, not the
// feature — so the SAME single prop name may appear in many features (two files both citing `voltage` is
// fine). What a feature must not do is re-list a GROUP: two features sharing ≥2 own-declared props are
// restating a shape that travels together, i.e. a smaller atom both should `compose:` instead. Props
// pulled in via `compose:` are already shared-by-composition and never counted here — only each
// file's own `prop:` keys are compared. This guard walks concepts/features (recursively), collects
// each file's declared props, and fails on any pair sharing 2+ of them.
//
// A pair that legitimately shares a group (a deliberate, documented exception) goes in ALLOW below
// with a WHY. Run standalone any time: `node scripts/guard-feature-dupes.ts`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { FEATURES_DIR } from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

// Unordered `a|b` file-pair keys accepted despite sharing a prop group, each with the reason the
// overlap is not extractable duplication.
const ALLOW = new Set<string>([
	// catalog_item is the REFERENCE shape — it cites the same (archetype, slug) pair identity
	// DECLARES on an entry; declaration vs reference of one key, not a shape to extract.
	'catalog_item.yaml|identity.yaml',
	// Both bind a catalog entry (catalog_ref) and carry their OWN slug (link name / adapter name)
	// — the pair co-occurs by role, it never travels as one shape.
	'device_binding.yaml|site_adapter.yaml',
]);

/** Every `.yaml` under a dir, recursively, as paths relative to FEATURES_DIR. */
function featureFiles(dir: string): string[] {
	return readdirSync(dir)
		.flatMap((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) return featureFiles(path);
			return path.endsWith('.yaml') ? [relative(FEATURES_DIR, path)] : [];
		})
		.sort();
}

type FeatureDoc = { prop?: unknown; concept_settings?: { compose?: unknown } } | null;
const readDoc = (rel: string): FeatureDoc =>
	parseYaml(readFileSync(join(FEATURES_DIR, rel), 'utf8')) as FeatureDoc;
const ownPropKeys = (doc: FeatureDoc): string[] =>
	doc?.prop && typeof doc.prop === 'object' && !Array.isArray(doc.prop)
		? Object.keys(doc.prop)
		: [];

// slug (file stem) → path, for resolving `concept_settings.compose` targets to their prop shape.
const byStem = new Map<string, string>(
	featureFiles(FEATURES_DIR).map((rel) => [rel.split('/').pop()!.slice(0, -'.yaml'.length), rel]),
);

/** Prop names a feature's `concept_settings.compose` pulls in (recursively) — shared BY COMPOSITION,
 *  so an own `prop:` entry that merely refines one of these is an overlay, not a re-declaration. */
function composedProps(doc: FeatureDoc, seen = new Set<string>()): Set<string> {
	const out = new Set<string>();
	const raw = doc?.concept_settings?.compose;
	const slugs =
		typeof raw === 'string'
			? [raw]
			: Array.isArray(raw)
				? raw.filter((s): s is string => typeof s === 'string')
				: [];
	for (const slug of slugs) {
		const rel = byStem.get(slug);
		if (!rel || seen.has(rel)) continue;
		seen.add(rel);
		const target = readDoc(rel);
		for (const k of ownPropKeys(target)) out.add(k);
		for (const k of composedProps(target, seen)) out.add(k);
	}
	return out;
}

/** The prop names one feature declares in its OWN `prop:` map — compose-provided props excluded
 *  (those are shared by composition and refining them is an overlay, not a re-declaration). */
function declaredProps(rel: string): Set<string> {
	const doc = readDoc(rel);
	const inherited = composedProps(doc);
	return new Set(ownPropKeys(doc).filter((k) => !inherited.has(k)));
}

runGuard(
	{
		header: () =>
			`\n✖ grimoire feature pair(s) re-declaring a prop GROUP (≥2 own-declared props):\n`,
		hint: `
A single shared prop is a vocab citation and fine; a shared group of 2+ props is a shape that travels
together. Extract those props into a smaller feature and have both files \`compose:\` it instead of
re-listing them. If a pair genuinely shares a group by coincidence, add its \`a|b\` key (files sorted)
to ALLOW in packages/grimoire/scripts/guard-feature-dupes.ts with a WHY.
`,
	},
	(fail) => {
		const props = featureFiles(FEATURES_DIR).map((f) => [f, declaredProps(f)] as const);
		for (let i = 0; i < props.length; i++) {
			for (let j = i + 1; j < props.length; j++) {
				const [a, aKeys] = props[i]!;
				const [b, bKeys] = props[j]!;
				if (ALLOW.has([a, b].sort().join('|'))) continue;
				const shared = [...aKeys].filter((k) => bKeys.has(k)).sort();
				if (shared.length >= 2) fail(`${a} + ${b}  —  { ${shared.join(', ')} }`);
			}
		}
		return '';
	},
);
