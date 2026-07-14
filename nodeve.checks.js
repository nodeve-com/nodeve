// nodeve's own check config — dogfoods @nodeve/checks. We have no apps/, so the
// doc budget guards the READMEs and the source gates scan packages/.
// helper-collisions runs against the committed `.nodeve/lib-names.json` (remeda +
// date-fns exports) — regen with `nodeve-build-lib-names` after a bump so a local
// fn can't quietly reinvent a blessed-lib function.

// grimoire's generated/ is machine output — never hand-maintained, so the name/size/clone
// gates (whose remedy is "extract & import" / "split responsibilities") don't apply. Excluded
// from every file-scanning check via the shared `ignore` glob.
const GENERATED = 'packages/grimoire/src/generated/**';

export default {
	docTokens: {
		globs: ['README.md', 'packages/*/README.md'],
	},
	clones: {
		ignore: [GENERATED],
	},
	inlineDupes: {
		ignore: [GENERATED],
		// False positives: independent grimoire codegen/guard scripts that coincidentally share a
		// generic local name for DIFFERENT logic — a per-script dir `walk`, a result `render`/`tally`,
		// a findings accumulator (`violations`/`dups`), a script `main`, a `STRUCTURAL` keyword set
		// (ref-hoist vs TypeBox), a trivial `isConcept` membership test (type-guard vs boolean). Plus
		// `CATALOG_DIR`: the concepts-tree dir is single-sourced in kit/concept-sources.ts; these two
		// are the generated-tree (`generated/catalog`) twins the guards read. No shared behavior to extract.
		allowlist: [],
	},
	fileSize: {
		ignore: [GENERATED],
		// generate.ts is one cohesive codegen orchestrator (DATA-first bake, one responsibility
		// that runs long); the emit helpers already live in kit/.
		overrides: [{ glob: 'packages/grimoire/kit/generate.ts', tiers: { fail: { maxLines: 400 } } }],
	},
	pluralArrays: {
		// `parts` is a single SensorIdParts bag, not a list — the local mirrors its type name, and
		// scopedSensorId/sensorId take the same `parts: SensorIdParts` param. Renaming reads worse.
		allowlist: ['packages/grimoire/src/bake-site.ts::parts'],
	},
	helperCollisions: {
		libs: ['remeda', 'date-fns', 'remeda-humps'],
	},
	requireDeps: {
		deps: ['remeda', 'date-fns', 'remeda-humps'],
	},
};
