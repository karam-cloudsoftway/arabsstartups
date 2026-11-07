/** Server-side validation for the public contact form. */
import { z } from "zod";
import {
	canonicalEmail,
	containsHtml,
	countLinks,
	looksLikeUrl,
	normalizeMultiline,
	normalizeSingleLine,
} from "../security/text";

export const INQUIRY_CATEGORIES = [
	"general",
	"news_tip",
	"founder_story",
	"event",
	"media_partnership",
	"correction",
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export const INQUIRY_STATUSES = ["new", "in_progress", "responded", "closed", "spam"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

const singleLine = (min: number, max: number) =>
	z
		.string()
		.transform(normalizeSingleLine)
		.pipe(z.string().min(min).max(max));

const optionalSingleLine = (max: number) =>
	z
		.string()
		.optional()
		.transform((value) => (value ? normalizeSingleLine(value) : ""))
		.pipe(z.string().max(max));

export const contactSchema = z
	.object({
		name: singleLine(2, 100).refine((value) => !looksLikeUrl(value), "name_has_url"),
		email: z
			.string()
			.transform(canonicalEmail)
			.pipe(z.email().max(254)),
		category: z.enum(INQUIRY_CATEGORIES),
		subject: singleLine(3, 150),
		message: z
			.string()
			.transform(normalizeMultiline)
			.pipe(z.string().min(10).max(5000)),
		organization: optionalSingleLine(150),
		orgWebsite: z
			.string()
			.optional()
			.transform((value) => (value ? value.trim() : ""))
			.refine((value) => value === "" || isHttpUrl(value), "bad_url")
			.pipe(z.string().max(300)),
		locale: z.enum(["ar", "en"]).default("ar"),
		turnstileToken: z.string().max(2048).optional(),
		/** Honeypot — hidden from people; bots fill it. */
		url: z.string().max(500).optional(),
	})
	.superRefine((value, ctx) => {
		if (containsHtml(value.message) || containsHtml(value.subject)) {
			ctx.addIssue({ code: "custom", path: ["message"], message: "no_html" });
		}
		if (countLinks(value.message) > 3) {
			ctx.addIssue({ code: "custom", path: ["message"], message: "too_many_links" });
		}
	});

export type ContactInput = z.infer<typeof contactSchema>;

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname;
	} catch {
		return false;
	}
}

/** Collapses zod issues into stable field → code pairs for the client. */
export function issuesToFields(error: z.ZodError): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? "form");
		if (fields[key]) continue;
		fields[key] =
			issue.code === "custom"
				? issue.message
				: issue.code === "too_small"
					? "too_short"
					: issue.code === "too_big"
						? "too_long"
						: "invalid";
	}
	return fields;
}
