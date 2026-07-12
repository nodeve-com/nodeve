// ONE-SHOT migration (docs/reference-model.md stage 2): registries stop being an enumeration and
// become a catalog Class. Moves enumeration/registry/*.yaml → catalog/registries/*.yaml as `registry`
// entries (minting identity.code, adding registry_publication.published_by, relocating iri_template out
// of identity into the surviving feature), adds the publishing `organization` entries, creates the
// `posix` registry (fixes the dangling unix_socket ref), and flips every crosswalk row's `registry:`
// key to the `registry_id:` FK (renaming the 3 body-clashing registries). Idempotent-ish: re-running
// after the enumeration dir is gone is a no-op for the move. Kept as the auditable record of the cut.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shortCode } from '@nodeve/encoding/short-code';
import { parse as parseYaml } from 'yaml';

const CONCEPTS = join(import.meta.dir, '../concepts');
const ENUM_REGISTRY = join(CONCEPTS, 'enumeration/registry');
const CATALOG_REGISTRIES = join(CONCEPTS, 'catalog/registries');
const CATALOG_ORGS = join(CONCEPTS, 'catalog/organizations');

// registry slug (as authored under enumeration/registry) → publishing organization slug.
const PUBLISHED_BY: Record<string, string> = {
	ashrae_34: 'ashrae', brick: 'brickschema', cim: 'iec',
	ha_device_class: 'home_assistant', ha_state_class: 'home_assistant',
	iana_iftype: 'iana', iana_protocol: 'iana', iana_uri_scheme: 'iana',
	iec_60381: 'iec', iec_60445: 'iec', iec_61850: 'iec',
	iso_11898: 'iso', iso_80000: 'iso', jedec: 'jedec', modbus_org: 'modbus_organization',
	prometheus: 'cncf', qudt_quantity_kind: 'qudt', saref4grid: 'etsi',
	seas: 'w3c', skos: 'w3c', sosa: 'w3c', ssn: 'w3c', ssn_system: 'w3c',
	sunspec: 'sunspec_alliance', tia: 'tia', usb_if: 'usb_if',
	ve_direct: 'victron', vim: 'bipm', wgs84_geo: 'w3c', wikidata: 'wikimedia',
};

// The 3 registries whose slug clashed with their publishing body — renamed so the body keeps the
// plain organization slug (the victron→ve_direct precedent). Old registry slug → new registry slug.
const REGISTRY_RENAME: Record<string, string> = {
	jedec: 'jedec_standard', tia: 'tia_standard', usb_if: 'usb_class',
};

// New organization entries (the standards bodies + vendors that publish the registries above).
const NEW_ORGS: Record<string, { title: string; url: string }> = {
	qudt: { title: 'QUDT.org', url: 'http://qudt.org/' },
	iso: { title: 'International Organization for Standardization', url: 'https://www.iso.org/' },
	iec: { title: 'International Electrotechnical Commission', url: 'https://www.iec.ch/' },
	iana: { title: 'Internet Assigned Numbers Authority', url: 'https://www.iana.org/' },
	w3c: { title: 'World Wide Web Consortium (W3C)', url: 'https://www.w3.org/' },
	home_assistant: { title: 'Home Assistant', url: 'https://www.home-assistant.io/' },
	ashrae: { title: 'ASHRAE', url: 'https://www.ashrae.org/' },
	brickschema: { title: 'Brick Schema', url: 'https://brickschema.org/' },
	jedec: { title: 'JEDEC Solid State Technology Association', url: 'https://www.jedec.org/' },
	cncf: { title: 'Cloud Native Computing Foundation', url: 'https://www.cncf.io/' },
	sunspec_alliance: { title: 'SunSpec Alliance', url: 'https://sunspec.org/' },
	tia: { title: 'Telecommunications Industry Association', url: 'https://tiaonline.org/' },
	usb_if: { title: 'USB Implementers Forum', url: 'https://www.usb.org/' },
	modbus_organization: { title: 'Modbus Organization', url: 'https://www.modbus.org/' },
	etsi: { title: 'ETSI', url: 'https://www.etsi.org/' },
	bipm: { title: 'Bureau International des Poids et Mesures (BIPM/JCGM)', url: 'https://www.bipm.org/' },
	wikimedia: { title: 'Wikimedia Foundation', url: 'https://www.wikimedia.org/' },
	open_group: { title: 'The Open Group', url: 'https://www.opengroup.org/' },
};

const yamlStr = (s: string): string => (/^[A-Za-z][\w .()/-]*$/.test(s) ? s : JSON.stringify(s));

// A registry catalog entry, as source YAML (comment header preserved, resolver in the feature).
function registryEntry(slug: string, comment: string, title: unknown, url: unknown, iriTemplate: unknown): string {
	const pub = PUBLISHED_BY[slug];
	if (!pub) throw new Error(`no published_by for registry ${slug}`);
	const titleBlock = typeof title === 'object' && title
		? Object.entries(title as Record<string, string>).map(([k, v]) => `  ${k}: ${yamlStr(v)}`).join('\n')
		: `  en: ${yamlStr(String(title))}`;
	const lines = [comment.trimEnd(), 'title:', titleBlock, 'identity:', `  slug: ${slug}`, `  code: ${shortCode(slug)}`];
	if (typeof url === 'string') lines.push(`  url: ${url}`);
	lines.push('registry_publication:', `  published_by: ${pub}`);
	if (typeof iriTemplate === 'string') lines.push(`  iri_template: ${yamlStr(iriTemplate)}`);
	return lines.filter(Boolean).join('\n') + '\n';
}

// 1. Move each enumeration/registry member → catalog/registries entry.
if (existsSync(ENUM_REGISTRY)) {
	mkdirSync(CATALOG_REGISTRIES, { recursive: true });
	writeFileSync(join(CATALOG_REGISTRIES, '_defaults.yaml'),
		'# Registry catalog entries — external Classes a crosswalk points into (ref.registry_id FKs here).\n' +
		'# Each carries its resolver + publisher via registry_publication. Single archetype for the subtree.\narchetype: registry\n');
	for (const f of readdirSync(ENUM_REGISTRY)) {
		if (!f.endsWith('.yaml') || f === '_defaults.yaml') continue;
		const raw = readFileSync(join(ENUM_REGISTRY, f), 'utf8');
		const doc = (parseYaml(raw) ?? {}) as Record<string, unknown>;
		const oldSlug = f.slice(0, -5);
		const slug = REGISTRY_RENAME[oldSlug] ?? oldSlug;
		const identity = (doc.identity ?? {}) as Record<string, unknown>;
		const comment = raw.split('\n').filter((l) => l.trimStart().startsWith('#')).join('\n');
		// published_by map is keyed by the OLD slug; alias renamed ones so registryEntry finds it.
		if (REGISTRY_RENAME[oldSlug]) PUBLISHED_BY[slug] = PUBLISHED_BY[oldSlug] ?? '';
		writeFileSync(join(CATALOG_REGISTRIES, `${slug}.yaml`),
			registryEntry(slug, comment, doc.title, identity.url, identity.iri_template));
	}
	rmSync(ENUM_REGISTRY, { recursive: true, force: true });
	console.log('moved registry enumeration → catalog/registries');
}

// 2. posix — new registry (the dangling unix_socket AF_UNIX ref); a bare-token document authority.
PUBLISHED_BY.posix = 'open_group';
writeFileSync(join(CATALOG_REGISTRIES, 'posix.yaml'), registryEntry(
	'posix',
	'# POSIX (IEEE Std 1003.1 / The Open Group Base Specifications). No iri_template: a document authority;\n' +
		'# `term` is a bare token, e.g. AF_UNIX (the Unix-domain socket address family).',
	{ en: 'POSIX (IEEE Std 1003.1)', pt: 'POSIX (IEEE Std 1003.1)' },
	'https://pubs.opengroup.org/onlinepubs/9699919799/',
	undefined,
));

// 3. Publishing organizations.
for (const [slug, { title, url }] of Object.entries(NEW_ORGS)) {
	writeFileSync(join(CATALOG_ORGS, `${slug}.yaml`),
		`title: { en: ${yamlStr(title)} }\nidentity:\n  slug: ${slug}\n  code: ${shortCode(slug)}\n  url: ${url}\n`);
}
console.log(`wrote ${Object.keys(NEW_ORGS).length} organization entries + posix registry`);

// 4. Flip every crosswalk row: `registry:` key → `registry_id:` FK, and rename the 3 clashing values.
function rewriteRefs(dir: string): number {
	let n = 0;
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) { n += rewriteRefs(p); continue; }
		if (!e.name.endsWith('.yaml')) continue;
		const before = readFileSync(p, 'utf8');
		let after = before.replace(/(?<![\w])registry:(\s)/g, 'registry_id:$1');
		for (const [oldV, newV] of Object.entries(REGISTRY_RENAME))
			after = after.replace(new RegExp(`(registry_id:\\s*'?)${oldV}\\b`, 'g'), `$1${newV}`);
		if (after !== before) { writeFileSync(p, after); n++; }
	}
	return n;
}
console.log(`rewrote refs in ${rewriteRefs(CONCEPTS)} files`);
