import { expect, test } from "@playwright/test";
import { CMS_HEADERS, createPost, loginAs, uid } from "./helpers";

test.describe("access control (plan §7.5)", () => {
	test("anonymous visitors cannot reach the newsroom or privileged CMS APIs", async ({ request }) => {
		for (const path of ["/newsroom", "/newsroom/inbox", "/newsroom/comments", "/newsroom/audit", "/newsroom/export.csv"]) {
			expect((await request.get(path)).status(), path).toBe(401);
		}
		for (const path of ["/_emdash/api/admin/comments", "/_emdash/api/admin/users", "/_emdash/api/content/posts?status=draft"]) {
			expect([401, 403], path).toContain((await request.get(path)).status());
		}
	});

	test("role rules: contributors write drafts only; authors cannot read the inbox; editors publish", async ({ browser }) => {
		const contributorCtx = await browser.newContext();
		await loginAs(contributorCtx, "contributor");
		const contributor = contributorCtx.request;
		const draftSlug = uid("draft-");
		const draft = await createPost(contributor, { title: `مسودة ${draftSlug}`, slug: draftSlug, publish: true });
		expect(draft.status).toBe(201);
		expect(draft.publishStatus).toBe(403); // cannot publish
		expect((await contributor.get("/newsroom/inbox")).status()).toBe(403);

		// Drafts are never public.
		const anonymous = await browser.newContext();
		expect((await anonymous.request.get(`/articles/${draftSlug}`)).status()).toBe(404);

		const authorCtx = await browser.newContext();
		await loginAs(authorCtx, "author");
		expect((await authorCtx.request.get("/newsroom/inbox")).status()).toBe(403);
		expect((await authorCtx.request.get("/newsroom/comments")).status()).toBe(403);

		const editorCtx = await browser.newContext();
		await loginAs(editorCtx, "editor");
		const slug = uid("pub-");
		const published = await createPost(editorCtx.request, { title: `منشور ${slug}`, slug, publish: true });
		expect(published.publishStatus).toBe(200);
		expect((await anonymous.request.get(`/articles/${slug}`)).status()).toBe(200);

		// Editors can also revert (unpublish) — the page disappears again.
		const unpublish = await editorCtx.request.post(`/_emdash/api/content/posts/${published.id}/unpublish`, { headers: CMS_HEADERS, data: {} });
		expect(unpublish.status()).toBe(200);
		expect((await anonymous.request.get(`/articles/${slug}`)).status()).toBe(404);

		for (const context of [contributorCtx, anonymous, authorCtx, editorCtx]) await context.close();
	});

	test("disabling a staff account ends access immediately, including open sessions", async ({ browser }) => {
		const leaverName = uid("leaver");
		const leaverCtx = await browser.newContext();
		await loginAs(leaverCtx, "editor", leaverName);
		expect((await leaverCtx.request.get("/newsroom/inbox")).status()).toBe(200);

		// An admin disables the account in the CMS (the documented removal step).
		const adminCtx = await browser.newContext();
		await loginAs(adminCtx, "admin");
		const audit = await adminCtx.newPage();
		await audit.goto("/newsroom/audit"); // staff snapshot (the cron does this every 5 minutes)
		await audit.close();
		const users = await adminCtx.request.get("/_emdash/api/admin/users?limit=100", { headers: CMS_HEADERS });
		expect(users.status()).toBe(200);
		const list = (await users.json()).data;
		const items = (list.items ?? list.users ?? list) as Array<{ id: string; email: string }>;
		const leaver = items.find((user) => user.email.startsWith(leaverName));
		expect(leaver).toBeTruthy();
		const disabled = await adminCtx.request.post(`/_emdash/api/admin/users/${leaver?.id}/disable`, { headers: CMS_HEADERS, data: {} });
		expect(disabled.status()).toBe(200);

		// The leaver's still-open session is refused on the next request
		// (EmDash drops a disabled user's session identity, so this is 401 or 403).
		expect([401, 403]).toContain((await leaverCtx.request.get("/newsroom/inbox")).status());
		expect([401, 403]).toContain((await leaverCtx.request.get("/_emdash/api/admin/comments", { headers: CMS_HEADERS })).status());

		// The change is recorded in the audit trail.
		const admin = await adminCtx.newPage();
		await admin.goto("/newsroom/audit");
		await expect(admin.locator("tr", { hasText: "تعطيل حساب" }).first()).toBeVisible();

		await leaverCtx.close();
		await adminCtx.close();
	});

	test("only admins see the team and audit pages", async ({ browser }) => {
		const editorCtx = await browser.newContext();
		await loginAs(editorCtx, "editor");
		expect((await editorCtx.request.get("/newsroom/team")).status()).toBe(403);
		expect((await editorCtx.request.get("/newsroom/audit")).status()).toBe(403);
		const adminCtx = await browser.newContext();
		await loginAs(adminCtx, "admin");
		const team = await adminCtx.newPage();
		await team.goto("/newsroom/team");
		await expect(team.locator("h2", { hasText: "إضافة عضو (خطوتان)" })).toBeVisible();
		await editorCtx.close();
		await adminCtx.close();
	});
});
