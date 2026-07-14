// One-off: bake a flat archetype -> feature -> prop tree for the svelte demo.
// Reads the generated data trees (default exports) and emits plain JSON.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isPlainObject } from 'remeda';

const here = dirname(fileURLToPath(import.meta.url));
const genArch = join(here, '..', 'src', 'generated', 'archetypes');

type DemoEntry = {
	name: string;
	title?: string;
	description?: string;
	unit?: unknown;
	props?: DemoEntry[];
};
type DemoArchetype = {
	slug: string;
	title: string;
	description?: string;
	features: DemoEntry[];
};

const en = (value: unknown): string | undefined => {
	if (!isPlainObject(value)) return undefined;
	const translated = value.en ?? Object.values(value)[0];
	return typeof translated === 'string' ? translated : undefined;
};

// A feature entry's own props: keys under its `.prop`, with title/desc where present.
function propsOf(featureData: unknown): DemoEntry[] {
	const bag = isPlainObject(featureData) ? featureData.prop : undefined;
	if (!isPlainObject(bag)) return [];
	return Object.entries(bag).map(([name, value]) => ({
		name,
		title: en(isPlainObject(value) ? value.title : undefined),
		description: en(isPlainObject(value) ? value.description : undefined),
		unit:
			isPlainObject(value) && isPlainObject(value.measurand) ? value.measurand.siUnit : undefined,
	}));
}

const archetypes: DemoArchetype[] = [];
for (const file of readdirSync(genArch)
	.filter((f) => f.endsWith('.ts'))
	.sort()) {
	const slug = file.replace(/\.ts$/, '');
	const mod = await import(join(genArch, file));
	const data = mod.default;
	if (!isPlainObject(data)) continue;
	const title = en(data.title);
	const description = en(data.description);
	const propBag = isPlainObject(data.prop) ? data.prop : {};
	const features = Object.entries(propBag).map(([name, feature]) => ({
		name,
		title: en(isPlainObject(feature) ? feature.title : undefined),
		description: en(isPlainObject(feature) ? feature.description : undefined),
		props: propsOf(feature),
	}));
	archetypes.push({ slug, title: title ?? slug, description, features });
}

archetypes.sort((a, b) => a.title.localeCompare(b.title));
process.stdout.write(JSON.stringify({ archetypes }, null, 2));
