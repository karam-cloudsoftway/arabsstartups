/**
 * The one HTML email layout, in the site's "Slash" brand: white card on a
 * light grey page, ink text, the arabs/startups wordmark with the indigo
 * slash, a slash-tag eyebrow, square 2px corners and one indigo button.
 *
 * Email clients ignore stylesheets and most modern CSS, so the layout uses
 * tables and inline styles only, with no images, scripts or web fonts.
 * Direction comes from the `dir` attribute; a side-specific border is picked
 * from the locale because logical properties are not supported in email.
 *
 * Every piece of text is HTML-escaped here. Callers pass plain text only.
 * Every email is also sent as plain text (see send.ts).
 */

export type EmailLocale = "ar" | "en";

export interface EmailBlock {
	kind: "text" | "muted" | "quote";
	text: string;
}

export interface EmailContent {
	locale: EmailLocale;
	/** Hidden preview line shown by inbox apps next to the subject. */
	preheader: string;
	/** Small slash-tag above the heading, e.g. "تنبيه". */
	eyebrow: string;
	heading: string;
	blocks: EmailBlock[];
	/** Optional label/value rows, e.g. the message type. */
	facts?: Array<{ label: string; value: string }>;
	/** One primary button. Only fixed https links built by our own code. */
	button?: { label: string; href: string };
	/** Small print at the bottom of the card. */
	footnote?: string;
	/** Site origin, for the wordmark link. */
	origin: string;
}

const C = {
	page: "#f4f4f7",
	card: "#ffffff",
	ink: "#000012",
	muted: "#4a4a55",
	border: "#e4e4ea",
	accent: "#4b3bff",
	onAccent: "#ffffff",
	quoteBg: "#f4f4f7",
};
const FONT_AR = "'IBM Plex Sans Arabic', Tahoma, 'Segoe UI', Arial, sans-serif";
const FONT_LATIN = "'Inter Tight', 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** Escaped text with line breaks kept. */
function lines(value: string): string {
	return escapeHtml(value.trim()).replace(/\r?\n/g, "<br>");
}

function safeHref(href: string): string | null {
	try {
		const url = new URL(href);
		return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost") ? url.href : null;
	} catch {
		return null;
	}
}

export function renderEmailHtml(content: EmailContent): string {
	const rtl = content.locale === "ar";
	const dir = rtl ? "rtl" : "ltr";
	const align = rtl ? "right" : "left";
	const startBorder = rtl ? "border-right" : "border-left";
	const font = rtl ? FONT_AR : FONT_LATIN;
	const origin = safeHref(content.origin) ?? "https://arabsstartups.com";
	const button = content.button ? safeHref(content.button.href) : null;

	const blocks = content.blocks
		.map((block) => {
			if (block.kind === "quote") {
				return `<tr><td style="padding:0 0 20px 0;"><div style="background:${C.quoteBg};${startBorder}:3px solid ${C.accent};padding:14px 16px;font-size:14px;line-height:1.7;color:${C.muted};">${lines(block.text)}</div></td></tr>`;
			}
			const color = block.kind === "muted" ? C.muted : C.ink;
			const size = block.kind === "muted" ? 14 : 16;
			return `<tr><td style="padding:0 0 16px 0;font-size:${size}px;line-height:1.75;color:${color};">${lines(block.text)}</td></tr>`;
		})
		.join("");

	const facts = content.facts?.length
		? `<tr><td style="padding:4px 0 20px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${C.border};">${content.facts
				.map(
					(fact) =>
						`<tr><td style="padding:10px 0;border-bottom:1px solid ${C.border};font-size:13px;color:${C.muted};width:96px;white-space:nowrap;">${escapeHtml(fact.label)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.border};font-size:14px;font-weight:600;color:${C.ink};">${escapeHtml(fact.value)}</td></tr>`,
				)
				.join("")}</table></td></tr>`
		: "";

	const cta =
		button && content.button
			? `<tr><td style="padding:8px 0 24px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.accent};border-radius:2px;"><a href="${escapeHtml(button)}" style="display:inline-block;padding:13px 26px;font-family:${font};font-size:15px;font-weight:700;color:${C.onAccent};text-decoration:none;">${escapeHtml(content.button.label)}</a></td></tr></table></td></tr>`
			: "";

	const footnote = content.footnote
		? `<tr><td style="padding:16px 0 0 0;border-top:1px solid ${C.border};font-size:12px;line-height:1.7;color:${C.muted};">${lines(content.footnote)}</td></tr>`
		: "";

	const tagline = rtl
		? "منصّة إعلامية مستقلّة تغطّي الشركات الناشئة وروّاد الأعمال."
		: "An independent media platform covering startups and founders.";

	return `<!doctype html>
<html lang="${content.locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-top:4px solid ${C.accent};border-radius:2px;font-family:${font};text-align:${align};">
<tr><td style="padding:24px 32px;border-bottom:1px solid ${C.border};">
<a href="${escapeHtml(origin)}" dir="ltr" style="font-family:${FONT_LATIN};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${C.ink};text-decoration:none;">arabs<span style="color:${C.accent};">/</span>startups</a>
</td></tr>
<tr><td style="padding:32px 32px 16px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 8px 0;font-size:13px;font-weight:700;color:${C.muted};"><span style="color:${C.accent};">/</span> ${escapeHtml(content.eyebrow)}</td></tr>
<tr><td style="padding:0 0 20px 0;font-size:24px;line-height:1.35;font-weight:700;color:${C.ink};">${escapeHtml(content.heading)}</td></tr>
${blocks}${facts}${cta}${footnote}
</table>
</td></tr>
<tr><td style="padding:20px 32px;background:${C.page};border-top:1px solid ${C.border};font-size:12px;line-height:1.7;color:${C.muted};">
${escapeHtml(tagline)}<br><a href="${escapeHtml(origin)}" dir="ltr" style="color:${C.muted};text-decoration:underline;">${escapeHtml(new URL(origin).host)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
