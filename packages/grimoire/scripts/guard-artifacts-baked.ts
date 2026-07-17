// Guard: every generated TS module has an artifacts/ JSON twin — a TS export is a VIEW of baked
// data, never the only copy (the display-policy mistake: data reachable only through the module
// surface strands every non-TS reader). src/generated/<layer>/<name>.ts ↔ artifacts/<layer>/
// <name>.json (index.ts aggregates exempt — compositions of the per-name files); display-policy.ts
// ↔ display-policy.json; concepts/parts/ sources ↔ artifacts/parts/. Run standalone:
// `node scripts/guard-artifacts-baked.ts` (after `pnpm generate`).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS_DIR, GENERATED_DIR, layerIndex } from '../src/concept-sources.ts';
import { runGuard } from './guard-report.ts';

runGuard(
	{
		header: (count) => `\n✖ ${count} generated TS module(s) lack their artifacts/ JSON twin:\n`,
		hint: `
A TS emit is a view; the artifacts/ JSON is the copy every non-TS reader gets. Fix kit/generate.ts
to bake the JSON beside the module — never ship data only through the TS surface.
`,
	},
	(fail) => {
		// source label → its required artifacts/-relative JSON twin, collected flat then checked once.
		const twins: Array<{ source: string; json: string }> = [
			{ source: 'src/generated/display-policy.ts', json: 'display-policy.json' },
		];
		for (const layer of readdirSync(GENERATED_DIR)) {
			if (!statSync(join(GENERATED_DIR, layer)).isDirectory()) continue;
			for (const file of readdirSync(join(GENERATED_DIR, layer)))
				if (file.endsWith('.ts') && file !== 'index.ts')
					twins.push({
						source: `src/generated/${layer}/${file}`,
						json: join(layer, `${file.slice(0, -'.ts'.length)}.json`),
					});
		}
		for (const name of layerIndex('parts').keys())
			twins.push({ source: `concepts/parts/${name}.yaml`, json: join('parts', `${name}.json`) });
		for (const twin of twins)
			if (!existsSync(join(ARTIFACTS_DIR, twin.json)))
				fail(`${twin.source} → no artifacts/${twin.json}`);
		return '✓ grimoire generated modules all have artifacts/ JSON twins';
	},
);
