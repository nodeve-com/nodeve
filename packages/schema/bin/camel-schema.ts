// The camelCase sibling of the shipped JSON Schema. snake_case stays the wire
// contract; TS consumers code camelCase and validate against this document.
// @nodeve/schema-case owns the grammar — which positions hold property NAMES
// versus values — and stamps `x-key-map` per renamed node, so an instance
// renames BY THE MAP, never by a runtime string transform.
//
// Runs LAST in project:jsonschema, after stencil-link.ts, so `x-stencil-of`
// rides across. Class names under `$defs` and `$ref` targets are untouched, so
// both siblings dispatch on the same names.
import { camelizeSchema } from '@nodeve/schema-case';
import { CAMEL_SCHEMA, readStencil, writeStencil } from '../src/stencil.ts';

writeStencil(camelizeSchema(readStencil()), CAMEL_SCHEMA);
console.log('camel sibling written to gen/catalog.camel.schema.json');
