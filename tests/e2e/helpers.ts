import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export const BASE = "http://localhost:4321";
export const CMS_HEADERS = { "X-EmDash-Request": "1", Origin: BASE, "Content-Type": "application/json" };

export function uid(prefix = "t"): string {
	return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Signs this browser context in as a local test staff member (dev only). */
export async function loginAs(context: BrowserContext, role: "contributor" | "author" | "editor" | "admin", as?: string): Promise<void> {
	const page = await context.newPage();
	const params = new URLSearchParams({ role, next: "/newsroom", ...(as ? { as } : {}) });
	await page.goto(`/dev/login?${params.toString()}`);
	await page.close();
}

export async function postId(page: Page, slug: string): Promise<string> {
	await page.goto(`/articles/${slug}`);
	const id = await page.locator('input[name="contentId"]').getAttribute("value");
	expect(id).toBeTruthy();
	return id as string;
}

/** Create (and optionally publish) a post through EmDash's own content API. */
export async function createPost(
	request: APIRequestContext,
	options: { title: string; slug: string; publish: boolean },
): Promise<{ id: string; status: number; publishStatus?: number }> {
	const created = await request.post("/_emdash/api/content/posts", {
		headers: CMS_HEADERS,
		data: {
			slug: options.slug,
			data: {
				title: options.title,
				excerpt: "ملخص اختبار",
				content_label: "news",
				content: [{ _type: "block", _key: "a", style: "normal", markDefs: [], children: [{ _type: "span", _key: "b", text: "نص اختبار.", marks: [] }] }],
			},
			taxonomies: { category: ["news"] },
		},
	});
	const body = await created.json().catch(() => ({}));
	const id = body?.data?.item?.id ?? body?.data?.id ?? "";
	if (!options.publish || !created.ok()) return { id, status: created.status() };
	const published = await request.post(`/_emdash/api/content/posts/${id}/publish`, { headers: CMS_HEADERS, data: {} });
	return { id, status: created.status(), publishStatus: published.status() };
}

/** A fresh documentation-range IP (RFC 5737), so each test has its own rate-limit bucket. */
export function testIp(): string {
	return `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
}

/**
 * Locally there is no Cloudflare edge, so CF-Connecting-IP is absent and every
 * request would share one rate-limit bucket. In production Cloudflare sets this
 * header itself and clients cannot spoof it.
 */
export async function useClientIp(page: Page, ip = testIp()): Promise<string> {
	await page.route(`${BASE}/api/**`, async (route) => {
		await route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } });
	});
	return ip;
}

export async function submitTurnstileForm(page: Page, form: string): Promise<void> {
	// Cloudflare's always-pass TEST sitekey issues a dummy token after the widget loads.
	await expect
		.poll(async () => page.locator(`${form} input[name="cf-turnstile-response"]`).inputValue().catch(() => ""), {
			timeout: 30_000,
		})
		.not.toBe("");
	await page.locator(`${form} button[type="submit"]`).click();
}
