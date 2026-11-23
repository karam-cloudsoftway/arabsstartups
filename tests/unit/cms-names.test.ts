import { describe, expect, it } from "vitest";
import seed from "../../seed/seed.json";
import { COLLECTIONS, FIELD_LABELS, OPTIONS } from "../../scripts/cms-names.mjs";
import { CONTENT_TYPES, EDITORIAL_STATUSES, contentTypeKey, editorialStatusKey, episodeTypeKey } from "../../src/lib/content/options";
import { NOT_APPROVED_REASON, editorialDecision } from "../../src/plugins/editorial-gate";

describe("CMS dropdown values", () => {
	it("map readable bilingual values and old codes to the same key", () => {
		expect(contentTypeKey(CONTENT_TYPES.press_release)).toBe("press_release");
		expect(contentTypeKey("press_release")).toBe("press_release");
		expect(contentTypeKey("nonsense")).toBe("news");
		expect(contentTypeKey(undefined)).toBe("news");
		expect(episodeTypeKey("بودكاست · Podcast")).toBe("podcast");
		expect(editorialStatusKey(EDITORIAL_STATUSES.in_review)).toBe("in_review");
		expect(editorialStatusKey("")).toBeNull();
		expect(editorialStatusKey("approved-ish")).toBeNull();
	});
});

describe("CMS names", () => {
	const collections = seed.collections as Array<{ slug: string; label: string; fields: Array<{ slug: string; label: string; validation?: { options?: string[] } }> }>;
	it("every list and field name carries Arabic and English", () => {
		for (const collection of collections) {
			expect(collection.label, collection.slug).toContain(" · ");
			for (const field of collection.fields) expect(field.label, `${collection.slug}.${field.slug}`).toContain(" · ");
		}
	});
	it("the seed matches the shared names file", () => {
		for (const collection of collections) {
			expect(collection.label).toBe(COLLECTIONS[collection.slug as keyof typeof COLLECTIONS].label);
			const labels = FIELD_LABELS[collection.slug as keyof typeof FIELD_LABELS] as Record<string, string>;
			for (const field of collection.fields) expect(field.label).toBe(labels[field.slug]);
		}
		const posts = collections.find((collection) => collection.slug === "posts");
		expect(posts?.fields.find((field) => field.slug === "content_label")?.validation?.options).toEqual(Object.values(OPTIONS.contentType));
	});
	it("content badges never reuse a Section name", () => {
		const sections = ["الأخبار", "قصص المؤسّسين", "رأي", "News", "Opinion"];
		for (const label of Object.values(CONTENT_TYPES)) {
			for (const part of label.split(" · ")) expect(sections).not.toContain(part);
		}
	});
});

describe("editorial gate", () => {
	it("blocks publishing an article that is not approved", () => {
		expect(editorialDecision({ collection: "posts", content: { data: { editorial_status: EDITORIAL_STATUSES.writing } } })).toEqual({ cancel: true, reason: NOT_APPROVED_REASON });
		expect(editorialDecision({ collection: "posts", content: { data: {} } })).toEqual({ cancel: true, reason: NOT_APPROVED_REASON });
	});
	it("allows approved articles, and never blocks pages or episodes", () => {
		expect(editorialDecision({ collection: "posts", content: { data: { editorial_status: EDITORIAL_STATUSES.approved } } })).toBeUndefined();
		expect(editorialDecision({ collection: "posts", content: { data: { editorial_status: "approved" } } })).toBeUndefined();
		expect(editorialDecision({ collection: "pages", content: { data: {} } })).toBeUndefined();
	});
	it("keeps the reason within the CMS limit", () => {
		expect(NOT_APPROVED_REASON.length).toBeLessThan(500);
	});
});
