import { isPlainObject, isString, mapValues } from 'remeda';

/**
 * Postgres jsonb rejects strings containing unpaired UTF-16 surrogates with
 * SQLSTATE `22P02` ("Unicode low surrogate must follow a high surrogate").
 * JS strings are UTF-16, so a source that emits half of a surrogate pair
 * (e.g. an HTML numeric character reference like `&#55357;` without its
 * companion) survives parsing and only fails at the DB boundary. These
 * helpers replace any lone surrogate with U+FFFD so the value is valid
 * Unicode and safe to send to jsonb. Pairs are passed through untouched.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function replaceLoneSurrogates(value: string): string {
	return value.replace(LONE_SURROGATE, '�');
}

/**
 * Apply `replaceLoneSurrogates` to every string nested under arrays and
 * plain objects. Non-plain objects (Date, Map, etc.) and other leaves are
 * passed through untouched — the DB driver handles their serialization.
 * Call once at the jsonb write boundary; do not sprinkle through pipelines.
 */
export function replaceLoneSurrogatesDeep<T>(value: T): T {
	if (isString(value)) return replaceLoneSurrogates(value) as T;
	if (Array.isArray(value)) return value.map(replaceLoneSurrogatesDeep) as T;
	if (isPlainObject(value)) return mapValues(value, replaceLoneSurrogatesDeep) as T;
	return value;
}
