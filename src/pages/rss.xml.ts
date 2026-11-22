/**
 * RSS 2.0 feed of the 20 newest published Arabic articles (values XML-escaped).
 * People who click "RSS" in the footer land on /feed, which explains the feed;
 * this URL is for feed reader apps.
 */
import type { APIRoute } from "astro";
import { listPosts } from "../lib/content/queries";

export const prerender = false;

function xml(value: string): string {
	return value
		// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters; strip them
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export const GET: APIRoute = async ({ site, url }) => {
	const origin = (site ?? new URL(url.origin)).origin;
	let cards;
	try {
		({ cards } = await listPosts("ar", { limit: 20 }));
	} catch (error) {
		console.error("[rss] could not read posts:", error instanceof Error ? error.message : error);
		return new Response("Feed temporarily unavailable", {
			status: 503,
			headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" },
		});
	}
	const items = cards
		.map((card) => {
			const link = `${origin}/articles/${encodeURIComponent(card.slug)}`;
			return [
				"<item>",
				`<title>${xml(card.title)}</title>`,
				`<link>${xml(link)}</link>`,
				`<guid isPermaLink="true">${xml(link)}</guid>`,
				card.date ? `<pubDate>${new Date(card.date).toUTCString()}</pubDate>` : "",
				card.author ? `<dc:creator>${xml(card.author)}</dc:creator>` : "",
				card.categoryLabel ? `<category>${xml(card.categoryLabel)}</category>` : "",
				`<description>${xml(card.excerpt)}</description>`,
				"</item>",
			].join("");
		})
		.join("");
	const newest = cards.find((card) => card.date)?.date;
	const lastBuild = newest ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : "";
	const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Arabs Startups</title><link>${xml(origin)}</link><atom:link href="${xml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml"/><description>${xml("أخبار الشركات الناشئة وقصص المؤسّسين وريادة الأعمال — من سوريا إلى المنطقة العربية.")}</description><language>ar</language>${lastBuild}${items}</channel></rss>`;
	return new Response(body, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=600",
		},
	});
};
