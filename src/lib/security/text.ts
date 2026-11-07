/**
 * Text hygiene for visitor input (comments, contact messages, names).
 *
 * Everything is stored and rendered as plain text. These helpers normalise
 * input and expose the signals our policies use (links, HTML, spoofing).
 */

// C0/C1 control characters except tab and newline.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Bidi embeddings/overrides can visually reorder text (spoofing). Isolates and
// LRM/RLM marks stay: Arabic writers legitimately use them.
const BIDI_OVERRIDE_RE = /[\u202A-\u202E]/g;
// Zero-width characters, removed from single-line fields such as names.
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const MANY_BLANK_LINES_RE = /\n{3,}/g;
const TRAILING_SPACE_RE = /[ \t]+\n/g;
const LINK_RE = /\bhttps?:\/\/|\bwww\./gi;
const HTML_RE = /<\s*\/?\s*[a-z!][^>]*>/i;
const URLISH_RE = /\bhttps?:\/\/|\bwww\.|\.(?:com|net|org|io|xyz|ru|info|top)\b/i;
const WHITESPACE_RE = /\s+/g;

/** Multi-line text: comments and messages. */
export function normalizeMultiline(input: string): string {
	return input
		.normalize("NFC")
		.replace(/\r\n?/g, "\n")
		.replace(CONTROL_RE, "")
		.replace(BIDI_OVERRIDE_RE, "")
		.replace(TRAILING_SPACE_RE, "\n")
		.replace(MANY_BLANK_LINES_RE, "\n\n")
		.trim();
}

/** Single-line text: names, subjects, organisations. */
export function normalizeSingleLine(input: string): string {
	return input
		.normalize("NFC")
		.replace(CONTROL_RE, " ")
		.replace(BIDI_OVERRIDE_RE, "")
		.replace(ZERO_WIDTH_RE, "")
		.replace(WHITESPACE_RE, " ")
		.trim();
}

export function countLinks(input: string): number {
	return input.match(LINK_RE)?.length ?? 0;
}

export function containsHtml(input: string): boolean {
	return HTML_RE.test(input);
}

export function looksLikeUrl(input: string): boolean {
	return URLISH_RE.test(input);
}

/** Lower-case, trimmed email used for comparisons and hashing. */
export function canonicalEmail(input: string): string {
	return input.trim().toLowerCase();
}
