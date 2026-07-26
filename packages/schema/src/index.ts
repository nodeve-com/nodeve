// The published surface: authored docs → rows, rows → SQLite. A consumer
// normalizes its own tree, concatenates the rows with the shipped
// `gen/catalog.json`, and loads the union — FKs resolve across both because
// `buildDatabase` defers enforcement to a closing foreign_key_check.
// The shipped artifacts (DDL, rows, JSON Schema) resolve off the exports map.
export { buildCatalog } from '../normalize/catalog.ts';
export { normalize, normalizeDoc, type Row } from '../normalize/normalize.ts';
export { normalizeDevice, type DeviceResult } from '../normalize/tree.ts';
export {
	buildDatabase,
	foreignKeyCheck,
	inserts,
	load,
	type Bundle,
	type TableRow,
} from './load.ts';
