/** Loaders for list pages shared by the Arabic and English routes. */
import { decodeSlug, getTerm } from "emdash";
import { localePath, t, type Locale } from "../../i18n";
import { CATEGORY, listPosts, type CardData } from "./queries";

export interface ListingData {
	tag: string;
	title: string;
	description: string;
	cards: CardData[];
	nextCursor?: string;
	firstPage: boolean;
	basePath: string;
}

function cursorFrom(url: URL): string | undefined {
	const cursor = url.searchParams.get("cursor");
	return cursor && cursor.length <= 500 ? cursor : undefined;
}

export async function loadSection(section: "news" | "stories", locale: Locale, url: URL): Promise<ListingData> {
	const dict = t(locale);
	const cursor = cursorFrom(url);
	const { cards, nextCursor } = await listPosts(locale, {
		limit: 12,
		cursor,
		category: section === "news" ? CATEGORY.news : CATEGORY.stories,
	});
	return {
		tag: section === "news" ? dict.nav.news : dict.nav.stories,
		title: section === "news" ? dict.listing.newsTitle : dict.listing.storiesTitle,
		description: section === "news" ? dict.listing.newsDesc : dict.listing.storiesDesc,
		cards,
		nextCursor,
		firstPage: !cursor,
		basePath: localePath(locale, section === "news" ? "/news" : "/stories"),
	};
}

export async function loadTaxonomy(
	taxonomy: "category" | "tag",
	rawSlug: string | undefined,
	locale: Locale,
	url: URL,
): Promise<ListingData | null> {
	const slug = decodeSlug(rawSlug ?? "");
	if (!slug || slug.length > 120) return null;
	const term = await getTerm(taxonomy, slug, { includeCounts: false, locale });
	if (!term) return null;
	const cursor = cursorFrom(url);
	const { cards, nextCursor } = await listPosts(locale, {
		limit: 12,
		cursor,
		...(taxonomy === "category" ? { category: term.slug } : { tag: term.slug }),
	});
	const dict = t(locale);
	return {
		tag: taxonomy === "category" ? dict.nav.news : dict.listing.tagTitle,
		title: term.label,
		description: taxonomy === "category" ? (term.description ?? dict.listing.newsDesc) : `${dict.listing.tagTitle}: ${term.label}`,
		cards,
		nextCursor,
		firstPage: !cursor,
		basePath: localePath(locale, `/${taxonomy}/${term.slug}`),
	};
}
