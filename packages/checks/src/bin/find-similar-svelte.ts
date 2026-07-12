#!/usr/bin/env bun
/**
 * Finds structurally similar Svelte components that could potentially be consolidated.
 *
 * Usage: bun scripts/find-similar-components.ts [directory] [threshold]
 *   directory: Path to scan (default: src/lib/components)
 *   threshold: Similarity threshold 0-1 (default: 0.7)
 *
 * Example: bun scripts/find-similar-components.ts src/lib/components/ui 0.8
 */

import { Glob } from 'bun'

const DEFAULT_DIR = 'src/lib'
const DEFAULT_THRESHOLD = 0.6

interface ComponentInfo {
	path: string
	templateTokens: string[]
	scriptTokens: string[]
	propsInterface: string | null
}

/** Extract the template (HTML) portion from a Svelte file */
function extractTemplate(source: string): string {
	return source
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.trim()
}

/** Extract the script portion from a Svelte file */
function extractScript(source: string): string {
	const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
	return match?.[1]?.trim() ?? ''
}

/** Extract props interface for comparison */
function extractPropsInterface(script: string): string | null {
	const match = script.match(/interface\s+Props\s*\{[\s\S]*?\}/i)
	return match?.[0] ?? null
}

/** Tokenize HTML template, normalizing text content and attributes */
function tokenizeTemplate(template: string): string[] {
	const tokens: string[] = []

	// Extract structural elements: tags, attributes (names only), structure
	const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g
	let match

	while ((match = tagPattern.exec(template)) !== null) {
		const fullTag = match[0]
		const tagName = match[1].toLowerCase()
		const isClosing = fullTag.startsWith('</')

		if (isClosing) {
			tokens.push(`</${tagName}>`)
		} else {
			// Extract attribute names (not values) for structural comparison
			const attrNames = extractAttributeNames(fullTag)
			tokens.push(`<${tagName}:${attrNames.join(',')}`)
		}
	}

	return tokens
}

/** Extract attribute names from a tag string */
function extractAttributeNames(tag: string): string[] {
	const attrs: string[] = []
	// Match attribute names (handles various formats)
	const attrPattern = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=|\/?>|$)/g
	let match

	while ((match = attrPattern.exec(tag)) !== null) {
		attrs.push(match[1].toLowerCase())
	}

	return attrs.sort()
}

/** Tokenize script for structural comparison */
function tokenizeScript(script: string): string[] {
	// Normalize and tokenize: remove string literals, normalize whitespace
	const normalized = script
		.replace(/'[^']*'/g, "'STR'")
		.replace(/"[^"]*"/g, '"STR"')
		.replace(/`[^`]*`/g, '`STR`')
		.replace(/\s+/g, ' ')
		.trim()

	// Split into tokens (simple word/symbol boundary)
	return normalized.split(/\s+/).filter(Boolean)
}

/** Calculate Jaccard similarity between two token arrays */
function jaccardSimilarity(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) return 1
	if (a.length === 0 || b.length === 0) return 0

	const setA = new Set(a)
	const setB = new Set(b)

	let intersection = 0
	for (const item of setA) {
		if (setB.has(item)) intersection++
	}

	const union = setA.size + setB.size - intersection
	return union === 0 ? 0 : intersection / union
}

/** Calculate n-gram similarity for better sequence matching */
function ngramSimilarity(a: string[], b: string[], n: number = 3): number {
	const getNgrams = (tokens: string[]): Set<string> => {
		const ngrams = new Set<string>()
		for (let i = 0; i <= tokens.length - n; i++) {
			ngrams.add(tokens.slice(i, i + n).join('|'))
		}
		return ngrams
	}

	const ngramsA = getNgrams(a)
	const ngramsB = getNgrams(b)

	if (ngramsA.size === 0 && ngramsB.size === 0) return 1
	if (ngramsA.size === 0 || ngramsB.size === 0) return 0

	let intersection = 0
	for (const ng of ngramsA) {
		if (ngramsB.has(ng)) intersection++
	}

	const union = ngramsA.size + ngramsB.size - intersection
	return union === 0 ? 0 : intersection / union
}

/** Combined similarity score */
function calculateSimilarity(a: ComponentInfo, b: ComponentInfo): number {
	// Template similarity (weighted higher - structure matters most)
	const templateJaccard = jaccardSimilarity(a.templateTokens, b.templateTokens)
	const templateNgram = ngramSimilarity(a.templateTokens, b.templateTokens)
	const templateScore = templateJaccard * 0.4 + templateNgram * 0.6

	// Script similarity
	const scriptJaccard = jaccardSimilarity(a.scriptTokens, b.scriptTokens)
	const scriptNgram = ngramSimilarity(a.scriptTokens, b.scriptTokens)
	const scriptScore = scriptJaccard * 0.4 + scriptNgram * 0.6

	// Props interface exact match bonus
	const propsBonus =
		a.propsInterface && b.propsInterface && a.propsInterface === b.propsInterface ? 0.1 : 0

	// Combined score: template matters more than script
	return Math.min(1, templateScore * 0.6 + scriptScore * 0.3 + propsBonus)
}

/** Analyze a single Svelte file */
async function analyzeComponent(filePath: string): Promise<ComponentInfo | null> {
	try {
		const source = await Bun.file(filePath).text()
		const template = extractTemplate(source)
		const script = extractScript(source)

		return {
			path: filePath,
			templateTokens: tokenizeTemplate(template),
			scriptTokens: tokenizeScript(script),
			propsInterface: extractPropsInterface(script)
		}
	} catch (error) {
		console.error(`Failed to analyze ${filePath}:`, error)
		return null
	}
}

/** Find all similar component pairs */
async function findSimilarComponents(
	directory: string,
	threshold: number
): Promise<Array<{ fileA: string; fileB: string; similarity: number }>> {
	const glob = new Glob('**/*.svelte')
	const files: string[] = []

	for await (const file of glob.scan(directory)) {
		files.push(`${directory}/${file}`)
	}

	console.log(`Scanning ${files.length} Svelte components in ${directory}...\n`)

	// Analyze all components
	const components: ComponentInfo[] = []
	for (const file of files) {
		const info = await analyzeComponent(file)
		if (info && info.templateTokens.length > 0) {
			components.push(info)
		}
	}

	// Compare all pairs
	const similarPairs: Array<{ fileA: string; fileB: string; similarity: number }> = []

	for (let i = 0; i < components.length; i++) {
		for (let j = i + 1; j < components.length; j++) {
			const similarity = calculateSimilarity(components[i], components[j])
			if (similarity >= threshold) {
				similarPairs.push({
					fileA: components[i].path,
					fileB: components[j].path,
					similarity
				})
			}
		}
	}

	// Sort by similarity descending
	similarPairs.sort((a, b) => b.similarity - a.similarity)

	return similarPairs
}

/** Format path for display */
function shortPath(fullPath: string): string {
	return fullPath.replace(process.cwd() + '/', '')
}

/** Main entry point */
async function main() {
	const args = process.argv.slice(2)
	const directory = args[0] || DEFAULT_DIR
	const threshold = parseFloat(args[1]) || DEFAULT_THRESHOLD

	console.log('╭─────────────────────────────────────────────────────────╮')
	console.log('│         Svelte Component Similarity Detector           │')
	console.log('╰─────────────────────────────────────────────────────────╯')
	console.log()

	const pairs = await findSimilarComponents(directory, threshold)

	if (pairs.length === 0) {
		console.log(`✓ No similar components found above ${(threshold * 100).toFixed(0)}% threshold`)
		return
	}

	console.log(`Found ${pairs.length} similar component pair(s):\n`)

	for (const pair of pairs) {
		const pct = (pair.similarity * 100).toFixed(1)
		console.log(`┌─ ${pct}% similar ─────────────────────────────`)
		console.log(`│  ${shortPath(pair.fileA)}`)
		console.log(`│  ${shortPath(pair.fileB)}`)
		console.log(`└────────────────────────────────────────────────`)
		console.log()
	}

	console.log('Consider reviewing these pairs for potential consolidation.')
}

main().catch(console.error)
