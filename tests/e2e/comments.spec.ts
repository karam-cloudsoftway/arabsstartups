import { expect, test } from "@playwright/test";
import { BASE, loginAs, postId, submitTurnstileForm, testIp, uid, useClientIp } from "./helpers";

const SLUG = "questions-we-ask-every-founder";

test.describe("comments: visitor → moderation → editorial reply", () => {
	test("full lifecycle with privacy and staff badge", async ({ page, browser }) => {
		const marker = uid("c");
		const body = `سؤال مهم من قارئ ${marker}`;
		const email = `${marker}@example.com`;

		// 1. A visitor comments. Nothing is published yet.
		await useClientIp(page);
		await page.goto(`/articles/${SLUG}`);
		await page.fill("#c-name", "قارئة مهتمة");
		await page.fill("#c-email", email);
		await page.fill("#c-body", body);
		await submitTurnstileForm(page, "form.comment-form");
		await expect(page.locator("form.comment-form [data-form-status]")).toHaveText(/بانتظار المراجعة/);
		await page.reload();
		await expect(page.getByText(body)).toHaveCount(0);

		// 2. An editor approves it in the newsroom.
		const editorContext = await browser.newContext();
		await loginAs(editorContext, "editor");
		const editor = await editorContext.newPage();
		await editor.goto("/newsroom/comments?status=pending");
		const item = editor.locator("li", { hasText: marker });
		await expect(item).toBeVisible();
		await item.getByRole("button", { name: "موافقة ونشر" }).click();
		await expect(editor.locator(".flash")).toHaveText("تم تحديث حالة التعليق.");

		// 3. The approved comment is public; the commenter's email is not.
		await page.reload();
		await expect(page.getByText(body)).toBeVisible();
		expect(await page.content()).not.toContain(email);

		// 4. The editor replies publicly as the Editorial Team.
		await editor.goto("/newsroom/comments?status=approved");
		const approved = editor.locator("li", { hasText: marker });
		const reply = `شكرًا لسؤالك ${marker}`;
		await approved.locator("textarea").fill(reply);
		await approved.locator("select").selectOption("team");
		await approved.getByRole("button", { name: "نشر الردّ" }).click();
		await expect(editor.locator(".flash")).toHaveText("نُشر ردّ فريق التحرير.");

		await page.reload();
		const replyItem = page.locator("li.reply", { hasText: reply });
		await expect(replyItem).toBeVisible();
		await expect(replyItem.locator(".badge-accent")).toHaveText("فريق التحرير");
		await expect(replyItem.locator(".comment-author")).toHaveText("فريق تحرير Arabs Startups");
		await editorContext.close();
	});

	test("visitors can reply to an approved comment (held for review)", async ({ page }) => {
		await useClientIp(page);
		await page.goto(`/articles/${SLUG}`);
		const replyButton = page.locator("[data-reply-to]").first();
		test.skip((await replyButton.count()) === 0, "needs an approved comment from the previous test");
		await replyButton.click();
		await expect(page.locator("[data-reply-banner]")).toBeVisible();
		const marker = uid("r");
		await page.fill("#c-name", "قارئ آخر");
		await page.fill("#c-email", `${marker}@example.com`);
		await page.fill("#c-body", `ردّ زائر ${marker}`);
		await submitTurnstileForm(page, "form.comment-form");
		await expect(page.locator("form.comment-form [data-form-status]")).toHaveText(/بانتظار المراجعة/);
		await page.reload();
		await expect(page.getByText(`ردّ زائر ${marker}`)).toHaveCount(0);
	});

	test("server-side checks cannot be skipped by calling the API directly", async ({ page, request }) => {
		const id = await postId(page, SLUG);
		const good = { contentId: id, authorName: "Bot", authorEmail: `${uid()}@example.com`, body: "direct api call", locale: "ar" };
		const headers = { Origin: BASE, "Content-Type": "application/json", "CF-Connecting-IP": testIp() };

		const noToken = await request.post("/api/comments", { headers, data: good });
		expect(noToken.status()).toBe(403);
		expect((await noToken.json()).error).toBe("turnstile");

		const crossSite = await request.post("/api/comments", { headers: { ...headers, Origin: "https://evil.example" }, data: good });
		expect(crossSite.status()).toBe(403);

		const html = await request.post("/api/comments", { headers, data: { ...good, body: "<script>alert(1)</script>", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" } });
		expect(html.status()).toBe(400);

		const emdashRoute = await request.post(`/_emdash/api/comments/posts/${id}`, { headers: { ...headers, "X-EmDash-Request": "1" }, data: good });
		expect(emdashRoute.status()).toBe(403);

		const big = await request.post("/api/comments", { headers, data: { ...good, body: "ا".repeat(9000) } });
		expect(big.status()).toBe(413);
	});

	test("per-email rate limit stops floods", async ({ page, request }) => {
		const id = await postId(page, SLUG);
		const email = `${uid("flood")}@example.com`;
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const response = await request.post("/api/comments", {
				// A different IP each time: only the per-EMAIL limit can stop this flood.
				headers: { Origin: BASE, "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${10 + i}` },
				data: { contentId: id, authorName: "Flood", authorEmail: email, body: `رسالة رقم ${i} ${uid()}`, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" },
			});
			statuses.push(response.status());
		}
		expect(statuses.slice(0, 5).every((status) => status === 201)).toBe(true);
		expect(statuses[5]).toBe(429);
	});
});
