// nodeve's own check config — dogfoods @nodeve/checks. We have no apps/, so the
// doc budget guards the READMEs and the source gates scan packages/.
// helper-collisions runs against the committed `.nodeve/lib-names.json` (remeda +
// date-fns exports) — regen with `nodeve-build-lib-names` after a bump so a local
// fn can't quietly reinvent a blessed-lib function.

// Legacy package: frozen while schema replaces it.
const GRIMOIRE = 'packages/grimoire/**';

export default {
	docTokens: {
		globs: ['README.md', 'packages/*/README.md'],
		ignore: [GRIMOIRE],
	},
	reshape: {
		ignore: [GRIMOIRE],
	},
	pluralArrays: {
		ignore: [GRIMOIRE],
		allowlist: [],
	},
	clones: {
		ignore: [GRIMOIRE],
	},
	inlineDupes: {
		ignore: [GRIMOIRE],
		// nodeve is library-only (no route files), so an exported name in 2+ modules is a second
		// source of truth just like a private one — flag both. Also covers type/interface decls.
		includeExported: true,
		// False positives: independent grimoire codegen/guard scripts that coincidentally share a
		// generic local name for DIFFERENT logic — a per-script dir `walk`, a result `render`/`tally`,
		// a findings accumulator (`violations`/`dups`), a script `main`, a `STRUCTURAL` keyword set
		// (ref-hoist vs TypeBox), a trivial `isConcept` membership test (type-guard vs boolean). Plus
		// `CATALOG_DIR`: the concepts-tree dir is single-sourced in kit/concept-sources.ts; these two
		// are the generated-tree (`generated/catalog`) twins the guards read. No shared behavior to extract.
		allowlist: [],
	},
	fileSize: {
		globs: ['apps/*.ts', 'packages/*.ts', 'packages/schema/*.yaml'],
		ignore: [GRIMOIRE],
		warn: { maxLines: 225 },
		fail: { maxLines: 300 },
		overrides: [],
	},
	helperCollisions: {
		libs: ['remeda', 'date-fns', 'remeda-humps'],
	},
	requireDeps: {
		deps: ['remeda', 'date-fns', 'remeda-humps'],
	},
};
