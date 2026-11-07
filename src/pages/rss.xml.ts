/** RSS feed of the 20 newest published Arabic articles (values XML-escaped). */
import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";
import { entrySlug, type EntryLike } from "../lib/content/queries";

export const prerender = false;

function xml(value: string): string {
	return value
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export const GET: APIRoute = async ({ site, url }) => {
	const origin = (site ?? new URL(url.origin)).origin;
	const { entries } = await getEmDashCollection("posts", {
		status: "published",
		locale: "ar",
		limit: 20,
		orderBy: { published_at: "desc" },
	});
	const items = (entries as unknown as EntryLike[])
		.map((entry) => {
			const link = `${origin}/articles/${encodeURIComponent(entrySlug(entry))}`;
			const date = entry.data.publishedAt ? new Date(entry.data.publishedAt).toUTCString() : "";
			return [
				"<item>",
				`<title>${xml(String(entry.data.title ?? ""))}</title>`,
				`<link>${xml(link)}</link>`,
				`<guid isPermaLink="true">${xml(link)}</guid>`,
				date ? `<pubDate>${date}</pubDate>` : "",
				`<description>${xml(String(entry.data.excerpt ?? ""))}</description>`,
				"</item>",
			].join("");
		})
		.join("");
	const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Arabs Startups</title><link>${xml(origin)}</link><atom:link href="${xml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml"/><description>${xml("أخبار الشركات الناشئة وقصص المؤسّسين وريادة الأعمال — من سوريا إلى المنطقة العربية.")}</description><language>ar</language>${items}</channel></rss>`;
	return new Response(body, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=600",
		},
	});
};
