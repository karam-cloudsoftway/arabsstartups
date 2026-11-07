/** Shared loaders for locale route pairs (Arabic and /en). */
import { decodeSlug, getTranslations } from "emdash";
import { localePath, type Locale } from "../../i18n";
import { entrySlug, getEntry, type EntryLike } from "./queries";

export type LoadResult =
	| { kind: "ok"; entry: EntryLike; isPreview: boolean; alternate: string | false }
	| { kind: "redirect"; location: string }
	| { kind: "not-found" };

/**
 * Loads a published entry for a locale. When the English page has no English
 * translation, EmDash falls back to Arabic — we redirect to the Arabic URL
 * instead, so one URL owns each piece of content.
 */
export async function loadLocalized(
	collection: "posts" | "pages" | "episodes",
	rawSlug: string | undefined,
	locale: Locale,
	pathFor: (slug: string) => string,
): Promise<LoadResult> {
	const slug = decodeSlug(rawSlug ?? "");
	if (!slug || slug.length > 200) return { kind: "not-found" };
	let found = await getEntry(collection, slug, locale);
	// English URL for Arabic-only content: send readers to the Arabic URL.
	if (!found && locale === "en") found = await getEntry(collection, slug, "ar");
	if (!found) return { kind: "not-found" };
	const entryLocale = String(found.entry.data.locale ?? "ar");
	if (entryLocale !== locale) {
		return { kind: "redirect", location: localePath(entryLocale as Locale, pathFor(entrySlug(found.entry))) };
	}

	let alternate: string | false = false;
	try {
		const { translations } = await getTranslations(collection, found.entry.data.id);
		const other = translations.find(
			(translation) => translation.locale !== locale && translation.status === "published" && translation.slug,
		);
		if (other?.slug) alternate = localePath(other.locale as Locale, pathFor(other.slug));
	} catch {
		alternate = false;
	}
	return { kind: "ok", entry: found.entry, isPreview: found.isPreview, alternate };
}
