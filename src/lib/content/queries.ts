/**
 * Content queries for public pages, on top of EmDash's query API.
 * Only published content is ever returned to visitors.
 */
import { getEmDashCollection, getEmDashEntry, getTermsForEntries } from "emdash";
import type { Locale } from "../../i18n";

export const CATEGORY = {
	news: "news",
	stories: "founder-stories",
} as const;

/** Loose view of an EmDash entry: fields come from the seed schema. */
export interface EntryLike {
	id: string;
	data: Record<string, unknown> & {
		id: string;
		slug?: string | null;
		locale?: string;
		title?: string;
		excerpt?: string;
		publishedAt?: Date | null;
		updatedAt?: Date;
		byline?: { displayName?: string | null } | null;
		bylines?: Array<{ byline?: { displayName?: string | null } | null; roleLabel?: string | null }>;
		terms?: Record<string, Array<{ slug: string; label: string }>>;
	};
}

export interface CardData {
	id: string;
	slug: string;
	title: string;
	excerpt: string;
	categorySlug: string | null;
	categoryLabel: string | null;
	contentLabel: string;
	author: string | null;
	date: Date | null;
	sample: boolean;
	image: unknown;
	locale: string;
}

export function entrySlug(entry: EntryLike): string {
	const slug = entry.data.slug ?? entry.id;
	return String(slug).replace(/^en\//, "");
}

export function authorOf(entry: EntryLike): string | null {
	const names = (entry.data.bylines ?? [])
		.map((credit) => credit.byline?.displayName)
		.filter((name): name is string => !!name);
	if (names.length > 0) return names.join("، ");
	return entry.data.byline?.displayName ?? null;
}

export function toCard(entry: EntryLike, category?: { slug: string; label: string } | null): CardData {
	const data = entry.data;
	return {
		id: data.id,
		slug: entrySlug(entry),
		title: String(data.title ?? ""),
		excerpt: String(data.excerpt ?? ""),
		categorySlug: category?.slug ?? null,
		categoryLabel: category?.label ?? null,
		contentLabel: String(data.content_label ?? "news"),
		author: authorOf(entry),
		date: (data.publishedAt as Date | null | undefined) ?? null,
		sample: data.sample_content === true,
		image: data.featured_image ?? null,
		locale: String(data.locale ?? "ar"),
	};
}

async function withCategories(entries: EntryLike[], locale: Locale): Promise<CardData[]> {
	if (entries.length === 0) return [];
	const terms = await getTermsForEntries(
		"posts",
		entries.map((entry) => entry.data.id),
		"category",
		{ locale },
	);
	return entries.map((entry) => {
		const first = terms.get(entry.data.id)?.[0];
		return toCard(entry, first ? { slug: first.slug, label: first.label } : null);
	});
}

export async function listPosts(
	locale: Locale,
	options: { limit?: number; cursor?: string; category?: string; tag?: string } = {},
): Promise<{ cards: CardData[]; nextCursor?: string }> {
	const where: Record<string, string> = {};
	if (options.category) where.category = options.category;
	if (options.tag) where.tag = options.tag;
	const result = await getEmDashCollection("posts", {
		status: "published",
		locale,
		limit: options.limit ?? 12,
		...(options.cursor ? { cursor: options.cursor } : {}),
		...(Object.keys(where).length ? { where } : {}),
		orderBy: { published_at: "desc" },
	});
	if (result.error) throw result.error;
	return {
		cards: await withCategories(result.entries as unknown as EntryLike[], locale),
		nextCursor: result.nextCursor,
	};
}

export async function listEpisodes(
	locale: Locale,
	options: { limit?: number; type?: string; cursor?: string } = {},
): Promise<{ entries: EntryLike[]; nextCursor?: string }> {
	const result = await getEmDashCollection("episodes", {
		status: "published",
		locale,
		limit: options.limit ?? 12,
		...(options.cursor ? { cursor: options.cursor } : {}),
		...(options.type ? { where: { episode_type: options.type } } : {}),
		orderBy: { published_at: "desc" },
	});
	if (result.error) throw result.error;
	return { entries: result.entries as unknown as EntryLike[], nextCursor: result.nextCursor };
}

/** Channels with no published content are never shown (content brief §4). */
export async function hasEpisodes(locale: Locale): Promise<boolean> {
	try {
		const { entries } = await listEpisodes(locale, { limit: 1 });
		return entries.length > 0;
	} catch {
		return false;
	}
}

/**
 * One entry by slug. Drafts are returned ONLY for EmDash's signed preview
 * requests (editor "Preview" button); everyone else gets published content.
 */
export async function getEntry(
	collection: "posts" | "pages" | "episodes",
	slug: string,
	locale: Locale,
): Promise<{ entry: EntryLike; isPreview: boolean } | null> {
	const { entry, error, isPreview } = await getEmDashEntry(collection, slug, { locale });
	if (error) throw error;
	if (!entry) return null;
	const data = (entry as unknown as EntryLike).data;
	if (!isPreview && data.status && data.status !== "published") return null;
	return { entry: entry as unknown as EntryLike, isPreview: !!isPreview };
}
