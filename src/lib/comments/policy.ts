/** Validation for public comments (plain text only, moderated before display). */
import { z } from "zod";
import {
	canonicalEmail,
	containsHtml,
	countLinks,
	looksLikeUrl,
	normalizeMultiline,
	normalizeSingleLine,
} from "../security/text";

export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MAX_LINKS = 2;
export const STAFF_TEAM_NAME = "فريق تحرير Arabs Startups";

const id = z.string().regex(/^[0-9A-Za-z_-]{6,64}$/);

export const commentSchema = z
	.object({
		contentId: id,
		// The form always sends the hidden field; "" means "not a reply".
		parentId: z.preprocess((value) => (value === "" ? null : value), id.nullable().optional()),
		authorName: z
			.string()
			.transform(normalizeSingleLine)
			.pipe(z.string().min(2).max(60))
			.refine((value) => !looksLikeUrl(value), "name_has_url"),
		authorEmail: z.string().transform(canonicalEmail).pipe(z.email().max(254)),
		body: z
			.string()
			.transform(normalizeMultiline)
			.pipe(z.string().min(3).max(COMMENT_MAX_LENGTH)),
		locale: z.enum(["ar", "en"]).default("ar"),
		turnstileToken: z.string().max(2048).optional(),
		/** Honeypot. */
		url: z.string().max(500).optional(),
	})
	.superRefine((value, ctx) => {
		if (containsHtml(value.body)) {
			ctx.addIssue({ code: "custom", path: ["body"], message: "no_html" });
		}
		if (countLinks(value.body) > COMMENT_MAX_LINKS) {
			ctx.addIssue({ code: "custom", path: ["body"], message: "too_many_links" });
		}
	});

export type CommentInput = z.infer<typeof commentSchema>;

export const staffReplySchema = z.object({
	commentId: id,
	body: z
		.string()
		.transform(normalizeMultiline)
		.pipe(z.string().min(2).max(COMMENT_MAX_LENGTH))
		.refine((value) => !containsHtml(value), "no_html"),
	identity: z.enum(["team", "self"]).default("team"),
});
