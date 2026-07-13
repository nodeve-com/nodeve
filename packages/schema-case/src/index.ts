// @nodeve/schema-case — one job: casing projections of a snake_case JSON Schema. `camelizeSchema`
// produces the camelCase sibling schema (stamping the `x-key-map` stored alias); the instance
// helpers rename data and reverse paths off that map.

export { KEY_MAP, camelizeSchema } from './camelize-schema.ts';
export { camelizeInstance, snakeKeyByCamel, snakePath } from './instance.ts';
