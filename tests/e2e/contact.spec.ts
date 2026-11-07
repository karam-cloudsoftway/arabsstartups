import { expect, test } from "@playwright/test";
import { loginAs, submitTurnstileForm, uid, useClientIp } from "./helpers";

test.describe("contact form → private newsroom inbox", () => {
	test("submission, triage, internal note, email reply, export and delete", async ({ page, browser }) => {
		const marker = uid("m");
		const subject = `خبر إطلاق منصة ${marker}`;

		// Visitor sends a news tip.
		await useClientIp(page);
		await page.goto("/contact?type=news_tip");
		await expect(page.locator("#f-category")).toHaveValue("news_tip");
		await page.fill("#f-name", "رائد أعمال");
		await page.fill("#f-email", `${marker}@example.com`);
		await page.fill("#f-subject", subject);
		await page.fill("#f-message", `نطلق منصتنا الأسبوع المقبل. ${marker}`);
		await page.fill("#f-site", "https://example.com");
		await submitTurnstileForm(page, "form.contact-form");
		await expect(page.locator("form.contact-form [data-form-status]")).toHaveText(/وصلتنا رسالتك/);

		// Editor triages it.
		const editorContext = await browser.newContext();
		await loginAs(editorContext, "editor");
		const editor = await editorContext.newPage();
		await editor.goto("/newsroom/inbox");
		const row = editor.locator("tr", { hasText: subject });
		await expect(row).toHaveClass(/unread/);
		await row.getByRole("link", { name: subject }).click();
		await expect(editor.locator('[data-testid="inquiry-message"]')).toContainText(marker);

		await editor.selectOption("#status", "in_progress");
		await editor.getByRole("button", { name: "تحديث الحالة" }).click();
		await expect(editor.locator(".flash")).toHaveText("تم تحديث الحالة.");

		await editor.fill("#note-body", "داخلي: نتحقّق من المصدر");
		await editor.getByRole("button", { name: "حفظ الملاحظة" }).click();
		await expect(editor.locator(".thread li", { hasText: "داخلي: نتحقّق من المصدر" })).toBeVisible();

		await editor.fill("#reply-body", "شكرًا لتواصلك، سنراجع الخبر.");
		await editor.getByRole("button", { name: "إرسال الردّ" }).click();
		await expect(editor.locator(".flash")).toHaveText("أُرسل الردّ وسُجّل.");
		await expect(editor.locator(".kv")).toContainText("تمّ الردّ");

		// Editors may not export or delete.
		const exportAsEditor = await editor.request.get("/newsroom/export.csv");
		expect(exportAsEditor.status()).toBe(403);
		await expect(editor.getByRole("button", { name: "حذف" })).toHaveCount(0);
		await editorContext.close();

		// Admin exports (formula-safe CSV) and deletes on request.
		const adminContext = await browser.newContext();
		await loginAs(adminContext, "admin");
		const admin = await adminContext.newPage();
		const csv = await admin.request.get(`/newsroom/export.csv?status=all&q=${encodeURIComponent(marker)}`);
		expect(csv.status()).toBe(200);
		expect(csv.headers()["content-disposition"]).toContain("attachment");
		const text = await csv.text();
		expect(text).toContain(subject);
		expect(text).not.toContain("داخلي: نتحقّق من المصدر"); // internal notes are never exported

		await admin.goto("/newsroom/inbox?status=all&q=" + encodeURIComponent(marker));
		await admin.locator("tr", { hasText: subject }).getByRole("link").click();
		await admin.check('input[name="confirm"]');
		await admin.getByRole("button", { name: "حذف" }).click();
		await expect(admin.locator(".flash")).toHaveText("حُذفت الرسالة نهائيًا.");
		await expect(admin.locator("tr", { hasText: subject })).toHaveCount(0);

		// Everything above is in the audit trail.
		await admin.goto("/newsroom/audit");
		for (const label of ["رسالة واردة", "تغيير حالة رسالة", "ملاحظة داخلية", "ردّ بالبريد", "تصدير الرسائل", "حذف رسالة"]) {
			await expect(admin.locator("td", { hasText: label }).first()).toBeVisible();
		}
		await adminContext.close();
	});

	test("form shows field errors from server validation", async ({ page }) => {
		await useClientIp(page);
		await page.goto("/contact");
		await page.fill("#f-name", "ab");
		await page.fill("#f-email", "not-an-email");
		await page.fill("#f-subject", "hi");
		await page.fill("#f-message", "<b>short</b>");
		await submitTurnstileForm(page, "form.contact-form");
		await expect(page.locator("form.contact-form [data-form-status]")).toHaveText("راجع الحقول المظلّلة وحاول مرة أخرى.");
		await expect(page.locator("#f-email")).toHaveAttribute("aria-invalid", "true");
	});
});
