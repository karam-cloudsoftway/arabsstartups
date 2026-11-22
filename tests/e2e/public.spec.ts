import { expect, test } from "@playwright/test";
import { CMS_HEADERS, createPost, loginAs, uid } from "./helpers";

test.describe("public site", () => {
	test("home page is Arabic, right-to-left, with the brand and lean navigation", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "ar");
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
		await expect(page.locator("h1")).toHaveText("القصص والأشخاص والأفكار التي تصنع ريادة الأعمال العربية.");
		await expect(page.locator(".site-header .as-logo")).toContainText("arabs/startups");
		const nav = page.getByRole("navigation", { name: "التنقل الرئيسي" });
		for (const label of ["الرئيسية", "الأخبار", "قصص المؤسّسين", "من نحن", "اتصل بنا"]) {
			await expect(nav.getByRole("link", { name: label })).toBeVisible();
		}
		await expect(page.locator(".card").first()).toBeVisible();
		// Sample content is clearly labelled.
		await expect(page.locator(".badge-warn").first()).toHaveText("نموذج تحريري");
		await expect(page.locator("h1")).toHaveCount(1);
	});

	test("no horizontal scrolling on this viewport", async ({ page }) => {
		for (const path of ["/", "/news", "/articles/introducing-arabs-startups", "/contact"]) {
			await page.goto(path);
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
			expect(overflow, path).toBeLessThanOrEqual(1);
		}
	});

	test("article shows byline, dates, share links and a moderated comment form", async ({ page }) => {
		await page.goto("/articles/introducing-arabs-startups");
		await expect(page.locator("h1")).toHaveText("نبدأ من هنا: ما هي Arabs Startups؟");
		await expect(page.locator(".meta")).toContainText("فريق تحرير Arabs Startups");
		await expect(page.locator(".meta time").first()).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
		await expect(page.locator(".share a", { hasText: "LinkedIn" })).toHaveAttribute("href", /linkedin\.com/);
		await expect(page.locator("form.comment-form")).toBeVisible();
		await expect(page.locator("#c-email-help")).toHaveText("لا يُنشر بريدك أبدًا.");
		await expect(page.locator(".cf-turnstile")).toHaveCount(1);
	});

	test("SEO: canonical, Open Graph, JSON-LD, hreflang, RSS and sitemap", async ({ page, request }) => {
		await page.goto("/articles/introducing-arabs-startups");
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/articles\/introducing-arabs-startups$/);
		await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
		await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
		const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
		expect(JSON.parse(jsonLd ?? "{}")).toBeTruthy();
		const rss = await request.get("/rss.xml");
		expect(rss.headers()["content-type"]).toContain("application/rss+xml");
		expect(await rss.text()).toContain("<language>ar</language>");
		expect((await request.get("/sitemap.xml")).status()).toBe(200);
	});

	test("English edition is left-to-right and links back to Arabic", async ({ page }) => {
		await page.goto("/en");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
		await expect(page.locator("h1")).toHaveText("The stories, people, and ideas shaping Arab entrepreneurship.");
		await page.locator(".lang-link").click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	});

	test("English URL of Arabic-only content redirects to the Arabic article", async ({ page }) => {
		await page.goto("/en/articles/why-founder-stories-matter");
		await expect(page).toHaveURL(/\/articles\/why-founder-stories-matter$/);
	});

	test("policy pages exist in both languages", async ({ page }) => {
		for (const path of ["/about", "/privacy", "/terms", "/editorial-policy", "/corrections", "/disclosure", "/comment-policy", "/submit-news", "/en/about", "/en/privacy"]) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(200);
		}
	});

	test("missing pages return a real 404 in the right language", async ({ page }) => {
		expect((await page.goto("/no-such-page"))?.status()).toBe(404);
		await expect(page.locator("h1")).toHaveText("الصفحة غير موجودة");
		expect((await page.goto("/en/no-such-page"))?.status()).toBe(404);
		await expect(page.locator("h1")).toHaveText("Page not found");
	});

	test("search finds published articles", async ({ page }) => {
		await page.goto("/search?q=" + encodeURIComponent("المؤسّسين"));
		await expect(page.locator(".results li").first()).toBeVisible();
	});

	test("empty channels stay hidden", async ({ page }) => {
		await page.goto("/");
		const episodesLinks = await page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link", { name: "ندوات وبودكاست" }).count();
		const published = await page.request.get("/episodes");
		const hasEpisodes = (await published.text()).includes('class="card"');
		expect(episodesLinks > 0).toBe(hasEpisodes);
	});

	test("header, footer, contact and comment links never lead to a 404", async ({ page }) => {
		const hrefs = new Set<string>();
		for (const [path, selector] of [
			["/", ".site-header a, .site-footer a"],
			["/en", ".site-header a, .site-footer a"],
			["/contact", "main a"],
			["/articles/introducing-arabs-startups", ".comment-form a"],
		] as const) {
			await page.goto(path);
			for (const href of await page.locator(selector).evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) {
				if (href.startsWith("/")) hrefs.add(href);
			}
		}
		expect(hrefs.size).toBeGreaterThan(5);
		for (const href of hrefs) {
			expect((await page.request.get(href)).status(), href).toBe(200);
		}
	});

	test("a published article with no section still shows on the home page", async ({ browser }) => {
		const editorCtx = await browser.newContext();
		await loginAs(editorCtx, "editor");
		const slug = uid("nosection-");
		const title = `بلا قسم ${slug}`;
		const post = await createPost(editorCtx.request, { title, slug, publish: true, category: null });
		expect(post.publishStatus).toBe(200);
		try {
			const anonymous = await browser.newContext();
			const home = await anonymous.newPage();
			await home.goto("/");
			await expect(home.locator(".card", { hasText: title })).toBeVisible();
			await anonymous.close();
		} finally {
			await editorCtx.request.post(`/_emdash/api/content/posts/${post.id}/unpublish`, { headers: CMS_HEADERS, data: {} });
			await editorCtx.close();
		}
	});
});
