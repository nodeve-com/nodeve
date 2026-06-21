import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slugify.ts';

describe('slugify', () => {
	it('lowercases and hyphenates words', () => {
		expect(slugify('Hello World')).toBe('hello-world');
	});

	it('expands ampersands to "and"', () => {
		expect(slugify('Breastfeeding & Lactation')).toBe('breastfeeding-and-lactation');
	});

	it('strips non-alphanumeric characters', () => {
		expect(slugify("What's New in Pumping")).toBe('whats-new-in-pumping');
	});
	it('does not double-hyphenate', () => {
		expect(slugify('What counts as "deletion" — does it include backups?')).toBe(
			'what-counts-as-deletion-does-it-include-backups',
		);
	});
	it('collapses multiple hyphens', () => {
		expect(slugify('Hello   World!  Test')).toBe('hello-world-test');
	});

	it('trims leading and trailing hyphens', () => {
		expect(slugify('  --leading--')).toBe('leading');
	});

	it('handles curly quotes', () => {
		expect(slugify('\u2018curly\u2019 quotes')).toBe('curly-quotes');
	});

	it('returns empty string for empty input', () => {
		expect(slugify('')).toBe('');
	});

	it('handles already-kebab input', () => {
		expect(slugify('already-kebab')).toBe('already-kebab');
	});

	it('preserves hex prefix separated by space', () => {
		expect(slugify('5ff8c690 image-asset')).toBe('5ff8c690-image-asset');
	});

	it('splits camelCase within mixed tokens', () => {
		expect(slugify('3b3d44 userPhoto')).toBe('3b3d44-user-photo');
	});

	it('keeps digits attached to preceding letters', () => {
		expect(slugify('iphone15 pro review')).toBe('iphone15-pro-review');
	});

	// "5Tips" is NOT expanded to "5-tips" — digit-letter boundaries are preserved
	// to keep hex hashes and product names intact. Callers should add a space
	// (e.g., "5 Tips For Pumping") before passing to slugify.
	it('does not split digit-letter boundaries', () => {
		expect(slugify('5Tips For Pumping')).toBe('5tips-for-pumping');
	});

	// Dots are not dropped like apostrophes — they fall through to the
	// non-alphanumeric catch-all and become word-separating hyphens.
	it('treats dots as separators', () => {
		expect(slugify('v1.2.3')).toBe('v1-2-3');
	});

	it('expands @ to "at" when mid-string', () => {
		expect(slugify('Pumping @ Work')).toBe('pumping-at-work');
	});

	it('strips leading @', () => {
		expect(slugify('@pumpspotting')).toBe('pumpspotting');
	});

	it('strips trailing @', () => {
		expect(slugify('hello@')).toBe('hello');
	});

	it('transliterates accented characters', () => {
		expect(slugify('café Latte')).toBe('cafe-latte');
	});

	it('transliterates currency symbols', () => {
		expect(slugify('100€ deal')).toBe('100-euro-deal');
	});

	it('transliterates cyrillic', () => {
		expect(slugify('Москва')).toBe('moskva');
	});
});

describe('uniqueSlug', () => {
	it('returns the slugified input on first use', () => {
		const seen = new Set<string>();
		expect(uniqueSlug('Hello World', 'abc123', seen)).toBe('hello-world');
	});

	it('records the result in the seen set', () => {
		const seen = new Set<string>();
		uniqueSlug('Hello World', 'abc123', seen);
		expect(seen.has('hello-world')).toBe(true);
	});

	it('appends suffix on collision', () => {
		const seen = new Set<string>(['hello-world']);
		expect(uniqueSlug('Hello World', 'abc123', seen)).toBe('hello-world-abc123');
	});

	it('appends suffix repeatedly until unique', () => {
		const seen = new Set<string>(['hello-world', 'hello-world-abc123']);
		expect(uniqueSlug('Hello World', 'abc123', seen)).toBe('hello-world-abc123-abc123');
	});

	it('uses fallback prefix with suffix when input slugifies to empty', () => {
		const seen = new Set<string>();
		expect(uniqueSlug('—', 'abc123', seen, 'corp')).toBe('corp-abc123');
	});

	it('defaults fallback prefix to "item"', () => {
		const seen = new Set<string>();
		expect(uniqueSlug('—', 'abc123', seen)).toBe('item-abc123');
	});

	it('handles fallback collision by appending suffix again', () => {
		const seen = new Set<string>(['corp-abc123']);
		expect(uniqueSlug('—', 'abc123', seen, 'corp')).toBe('corp-abc123-abc123');
	});

	it('produces deterministic output across an input batch', () => {
		const seen = new Set<string>();
		const slugs = [
			uniqueSlug('Hello World', 'aaa', seen),
			uniqueSlug('Hello World', 'bbb', seen),
			uniqueSlug('Hello World', 'ccc', seen),
		];
		expect(slugs).toEqual(['hello-world', 'hello-world-bbb', 'hello-world-ccc']);
	});
});
