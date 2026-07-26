// Shape gate over the normalized rows — the portable twin of `linkml-validate`,
// which it replaces. No python: gen-json-schema projects the STENCIL
// (gen/nodeve-projected.yaml, itself derived from the policy rows) to draft
// 2019-09, imports resolved into one self-contained document, and ajv checks
// gen/catalog.json against it.
//
// Two passes, because the stencil constrains more than the bundle shape:
//
//   1. bundle — every row-set against the base classes: types, requiredness,
//      enums, patterns, cardinality, no stray columns.
//   2. stencil — each row against the class its OWN discriminator selects. A
//      stencil class pins a slot to a const (`feature_type` = ac-phase,
//      `node_type` = inverter) and narrows what may hang off it (which quantity
//      kinds an ac-phase interval may carry). The pins live IN the artifact, so
//      dispatch reads them off it — no class-name mapping restated here.
//
// This gate runs the SHIPPED artifact, not a private code path, so a downstream
// repo validating its own rows exercises exactly what passed here. Referential
// integrity is still the FK check at load; cross-row rules are owned checks.
import { Ajv2019 } from 'ajv/dist/2019.js';
import formats from 'ajv-formats';
import { abs, exists, read } from '../src/io.ts';
import { readStencil, stencilBase, STENCIL_SCHEMA } from '../src/stencil.ts';

// ajv-formats is CJS with `module.exports` AND `.default` set to the same
// function; NodeNext types the default import as the namespace, so reach through
// the one that satisfies both the compiler and the runtime.
const addFormats = formats.default;

type Json = Record<string, unknown>;

const ROWS = abs('gen/catalog.json');
const ROOT = 'catalog';

for (const path of [STENCIL_SCHEMA, ROWS])
	if (!exists(path)) {
		console.error(`missing ${path} — run: pnpm build`);
		process.exit(1);
	}

// strict:false — linkml stamps `metamodel_version`/`version` alongside the
// keywords, which are annotations, not vocabulary. allErrors so one run reports
// every bad row rather than the first. ajv ships no formats, so `format: uri`
// (Node.url) would be silently ignored without addFormats — a shipped schema
// must not declare a constraint its shipped validator drops.
// verbose so an error carries the offending `data` — the collapsed anyOf line
// below names the value that was rejected, not just the legal set.
const ajv = addFormats(new Ajv2019({ strict: false, allErrors: true, verbose: true }));
const stencilDoc = readStencil();
const rows = JSON.parse(read(ROWS)) as Record<string, Json[]>;
ajv.addSchema(stencilDoc, ROOT);

const at = (ref: string) => ajv.getSchema(`${ROOT}${ref}`)!;

/** every stencil class: the base it specializes, and the slot/value pairs that
 * select it. A class with no pinned slot is a plain base class — nothing
 * dispatches to it. Both facts come off the artifact, never restated here. */
const stencils = Object.entries(stencilDoc.$defs)
	.map(([name, def]) => ({
		name,
		base: stencilBase(def),
		pins: Object.entries(def.properties ?? {}).flatMap(([slot, spec]) =>
			spec.const === undefined ? [] : [[slot, spec.const] as const],
		),
	}))
	.filter(({ base, pins }) => base && pins.length > 0);

/** a row-set's base class, off the Catalog root — `feature_of_interests` →
 * `FeatureOfInterest`. A stencil governs a row-set only if it specializes that
 * base: `feature_type` also sits on PartSet, so the pin alone is ambiguous. */
const baseOf = (set: string): string | undefined => {
	const slot = stencilDoc.properties[set];
	return (slot?.items?.$ref ?? slot?.$ref)?.replace('#/$defs/', '');
};

const problems: string[] = [];

/** One line per bad path. A closed quantity set is `anyOf: [{const}, …]`, so
 * allErrors reports one failure per member plus the anyOf itself — a dozen lines
 * saying one thing. Collapse those to the path, the value, and the legal set. */
const report = (where: string, errors: typeof ajv.errors) => {
	const byPath = new Map<string, NonNullable<typeof ajv.errors>>();
	for (const error of errors ?? [])
		byPath.set(error.instancePath, [...(byPath.get(error.instancePath) ?? []), error]);

	for (const [path, group] of byPath) {
		const anyOf = group.find(({ keyword }) => keyword === 'anyOf');
		if (anyOf) {
			const allowed = group.flatMap(({ params }) =>
				'allowedValue' in params ? [String(params.allowedValue)] : [],
			);
			problems.push(
				`${where}${path}: ${JSON.stringify(anyOf.data)} is not one of ${allowed.join(', ')}`,
			);
			continue;
		}
		for (const { message, params } of group)
			problems.push(`${where}${path}: ${message} ${JSON.stringify(params)}`);
	}
};

const bundle = at('');
if (!bundle(rows)) report('', bundle.errors);

let checked = 0;
for (const [set, rowSet] of Object.entries(rows)) {
	const governing = stencils.filter(({ base }) => base === baseOf(set));
	if (!governing.length) continue;
	rowSet.forEach((row, i) => {
		for (const { name, pins } of governing) {
			if (!pins.every(([slot, value]) => row[slot] === value)) continue;
			checked++;
			const validate = at(`#/$defs/${name}`);
			if (!validate(row)) report(`/${set}/${i} [${name}]`, validate.errors);
		}
	});
}

if (problems.length) {
	for (const problem of problems.slice(0, 20)) console.error(problem);
	if (problems.length > 20) console.error(`… ${problems.length - 20} more`);
	console.error(`\n${problems.length} shape error(s) in gen/catalog.json`);
	process.exit(1);
}

const rowCount = Object.values(rows).reduce((n, set) => n + set.length, 0);
console.log(
	`ok catalog: ${rowCount} rows across ${Object.keys(rows).length} row-sets match the schema` +
		` (${checked} also checked against ${stencils.length} stencil classes)`,
);
