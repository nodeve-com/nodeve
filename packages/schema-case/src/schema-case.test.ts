import { describe, expect, it } from 'vitest';
import { camelizeInstance, camelizeSchema, snakePath } from './index.ts';

type Node = { [key: string]: Node; [key: number]: Node };

// The real shape that motivated this package: grimoire's site_adapter — camel props beside an
// authored draft-07 cross-field rule (if/then/else) whose NAMES must move and VALUES must not.
const adapter = {
	type: 'object',
	properties: {
		ingest: {
			type: 'object',
			properties: { ingest_kind: { type: 'string', enum: ['modbus_tap', 'master'] } },
			required: ['ingest_kind'],
		},
		modbus_tap_window: {
			type: 'array',
			items: { type: 'object', properties: { window_name: { type: 'string' } } },
		},
	},
	allOf: [
		{
			if: {
				required: ['ingest'],
				properties: {
					ingest: {
						properties: { ingest_kind: { const: 'modbus_tap' } },
						required: ['ingest_kind'],
					},
				},
			},
			then: { required: ['modbus_tap_window'] },
			else: { properties: { modbus_tap_window: false } },
		},
	],
} as const;

describe('camelizeSchema', () => {
	const camel = camelizeSchema(adapter) as Node;

	it('renames property keys and stamps x-key-map, at every depth', () => {
		expect(Object.keys(camel.properties)).toEqual(['ingest', 'modbusTapWindow']);
		expect(camel['x-key-map']).toEqual({ modbus_tap_window: 'modbusTapWindow' });
		expect(camel.properties.ingest['x-key-map']).toEqual({ ingest_kind: 'ingestKind' });
		expect(camel.properties.modbusTapWindow.items.properties.windowName).toBeDefined();
	});

	it('renames names inside combinator subschemas (if/then/else), leaving values alone', () => {
		const rule = camel.allOf[0];
		expect(rule.if.properties.ingest.properties.ingestKind.const).toBe('modbus_tap'); // value untouched
		expect(rule.if.properties.ingest.required).toEqual(['ingestKind']);
		expect(rule.then.required).toEqual(['modbusTapWindow']);
		expect(rule.else.properties.modbusTapWindow).toBe(false); // boolean subschema survives
	});

	it('never touches enum/const/default/pattern values or non-name keys', () => {
		expect(camel.properties.ingest.properties.ingestKind.enum).toEqual(['modbus_tap', 'master']);
		const s = camelizeSchema({
			type: 'object',
			properties: { the_field: { type: 'string', default: 'a_b', pattern: '^a_b$' } },
			patternProperties: { '^x_': { type: 'object', properties: { deep_key: {} } } },
			$defs: { some_def: { type: 'object', properties: { def_key: {} } } },
		}) as Node;
		expect(s.properties.theField.default).toBe('a_b');
		expect(s.properties.theField.pattern).toBe('^a_b$');
		expect(Object.keys(s.patternProperties)).toEqual(['^x_']); // regex keys stay
		expect(s.patternProperties['^x_'].properties.deepKey).toBeDefined(); // values recurse
		expect(Object.keys(s.$defs)).toEqual(['some_def']); // def names stay
		expect(s.$defs.some_def.properties.defKey).toBeDefined();
	});

	it('renames dependencies keys and name-list members', () => {
		const s = camelizeSchema({
			type: 'object',
			dependencies: { a_b: ['c_d'], e_f: { required: ['g_h'] } },
		}) as Node;
		expect(s.dependencies).toEqual({ aB: ['cD'], eF: { required: ['gH'] } });
	});

	it('does not mutate its input', () => {
		const before = JSON.stringify(adapter);
		camelizeSchema(adapter);
		expect(JSON.stringify(adapter)).toBe(before);
	});
});

describe('camelizeInstance', () => {
	const camel = camelizeSchema(adapter);

	it('renames only declared keys, recursively', () => {
		const out = camelizeInstance(camel, {
			ingest: { ingest_kind: 'modbus_tap' },
			modbus_tap_window: [{ window_name: 'telemetry' }],
		}) as Node;
		expect(out).toEqual({
			ingest: { ingestKind: 'modbus_tap' },
			modbusTapWindow: [{ windowName: 'telemetry' }],
		});
	});

	it('leaves undeclared and data-bearing keys untouched', () => {
		const recordSchema = camelizeSchema({
			type: 'object',
			properties: {
				by_slug: {
					type: 'object',
					additionalProperties: { type: 'object', properties: { some_field: {} } },
				},
			},
		});
		const out = camelizeInstance(recordSchema, {
			by_slug: { my_device_slug: { some_field: 1 } },
			unknown_key: true,
		}) as Node;
		expect(out.bySlug.my_device_slug.someField).toBe(1); // record key (data) stays snake
		expect(out.unknown_key).toBe(true); // undeclared passes through for validation to name
	});
});

describe('snakePath', () => {
	it('maps a camel error path back to its snake source', () => {
		const camel = camelizeSchema(adapter);
		expect(snakePath(camel, '/ingest/ingestKind')).toBe('/ingest/ingest_kind');
		expect(snakePath(camel, '/modbusTapWindow/0/windowName')).toBe(
			'/modbus_tap_window/0/window_name',
		);
		expect(snakePath(camel, '')).toBe('');
	});
});
