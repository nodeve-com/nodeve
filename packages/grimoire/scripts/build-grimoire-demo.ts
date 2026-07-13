// One-off: bake a flat archetype -> feature -> prop tree for the svelte demo.
// Reads the generated data trees (default exports) and emits plain JSON.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const genArch = join(here, '..', 'src', 'generated', 'archetypes');

const en = (v: any): string | undefined =>
	v && typeof v === 'object' ? v.en ?? Object.values(v)[0] as string : undefined;

// A feature entry's own props: keys under its `.prop`, with title/desc where present.
function propsOf(featureData: any) {
	const bag = featureData?.prop;
	if (!bag || typeof bag !== 'object') return [];
	return Object.entries(bag).map(([name, v]: [string, any]) => ({
		name,
		title: en(v?.title),
		description: en(v?.description),
		unit: v?.measurand?.siUnit,
	}));
}

const archetypes: any[] = [];
for (const file of readdirSync(genArch).filter((f) => f.endsWith('.ts')).sort()) {
	const slug = file.replace(/\.ts$/, '');
	const mod = await import(join(genArch, file));
	const data = mod.default;
	if (!data || typeof data !== 'object') continue;
	const title = en(data.title);
	const description = en(data.description);
	const propBag = data.prop && typeof data.prop === 'object' ? data.prop : {};
	const features = Object.entries(propBag).map(([name, fd]: [string, any]) => ({
		name,
		title: en(fd?.title),
		description: en(fd?.description),
		props: propsOf(fd),
	}));
	archetypes.push({ slug, title: title ?? slug, description, features });
}

archetypes.sort((a, b) => a.title.localeCompare(b.title));
process.stdout.write(JSON.stringify({ archetypes }, null, 2));
