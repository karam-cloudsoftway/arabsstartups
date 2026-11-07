import { expect, test } from "@playwright/test";
import { CMS_HEADERS, loginAs, uid } from "./helpers";

test("a published episode appears with an allow-listed, privacy-friendly player", async ({ browser, page }) => {
	const adminCtx = await browser.newContext();
	await loginAs(adminCtx, "admin");
	const slug = uid("ep-");
	const created = await adminCtx.request.post("/_emdash/api/content/episodes", {
		headers: CMS_HEADERS,
		data: {
			slug,
			data: {
				title: `حلقة تجريبية ${slug}`,
				excerpt: "حلقة لاختبار المشغّل.",
				episode_type: "webinar",
				guests: "ضيف بموافقته",
				media_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			},
		},
	});
	expect(created.status()).toBe(201);
	const id = (await created.json()).data.item.id as string;
	expect((await adminCtx.request.post(`/_emdash/api/content/episodes/${id}/publish`, { headers: CMS_HEADERS, data: {} })).status()).toBe(200);

	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "ندوات وبودكاست" })).toBeVisible();

	await page.goto(`/episodes/${slug}`);
	await expect(page.locator("h1")).toContainText("حلقة تجريبية");
	await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
	await expect(page.locator("iframe")).toHaveAttribute("sandbox", /allow-scripts/);

	expect((await page.request.get("/webinars", { maxRedirects: 0 })).status()).toBe(301);
	await adminCtx.close();
});
