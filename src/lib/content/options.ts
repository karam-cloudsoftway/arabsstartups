/**
 * CMS dropdown values <-> the keys the site uses.
 *
 * EmDash shows a select option exactly as it is stored, so the stored value
 * is the readable bilingual text from cms-options.json. Old short codes
 * ("news", "in_review", …) are still understood, so rows saved before the
 * rename keep working.
 */
import options from "./cms-options.json" with { type: "json" };

export const CONTENT_TYPES = options.contentType;
export const EDITORIAL_STATUSES = options.editorialStatus;
export const EPISODE_TYPES = options.episodeType;

export type ContentType = keyof typeof CONTENT_TYPES;
export type EditorialStatus = keyof typeof EDITORIAL_STATUSES;
export type EpisodeType = keyof typeof EPISODE_TYPES;

function keyOf<K extends string>(map: Record<K, string>, value: unknown, fallback: K): K {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return fallback;
	if (Object.hasOwn(map, text)) return text as K;
	const found = (Object.keys(map) as K[]).find((key) => map[key] === text);
	return found ?? fallback;
}

export const contentTypeKey = (value: unknown): ContentType => keyOf(CONTENT_TYPES, value, "news");
export const editorialStatusKey = (value: unknown): EditorialStatus | null => {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return null;
	const key = keyOf(EDITORIAL_STATUSES, text, "writing");
	return Object.hasOwn(EDITORIAL_STATUSES, text) || EDITORIAL_STATUSES[key] === text ? key : null;
};
export const episodeTypeKey = (value: unknown): EpisodeType => keyOf(EPISODE_TYPES, value, "webinar");

/** Content types the site flags with a badge (not plain reporting). */
export const FLAGGED_CONTENT_TYPES: readonly ContentType[] = ["opinion", "partner", "sponsored", "press_release"];
