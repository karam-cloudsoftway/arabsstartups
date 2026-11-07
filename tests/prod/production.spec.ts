import { expect, test } from "@playwright/test";

const PROTECTED = [
	"/_emdash",
	"/_emdash/admin",
	"/_emdash/admin/setup",
	"/_emdash/api/setup/status",
	"/_emdash/api/admin/users",
	"/_emdash/api/admin/comments",
	"/_emdash/api/auth/dev-bypass",
	"/_emdash/api/setup/dev-bypass",
	"/_emdash/api/content/posts",
	"/newsroom",
	"/newsroom/inbox",
	"/newsroom/export.csv",
	"/%5Femdash/admin",
];

test("every CMS and newsroom path fails closed without a valid Access token", async ({ request }) => {
	for (const path of PROTECTED) {
		expect((await request.get(path)).status(), path).toBe(403);
	}
	const forged =
		"eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJlbWFpbCI6Im93bmVyQGFyYWJzc3RhcnR1cHMuY29tIn0.c2ln";
	expect((await request.get("/_emdash/admin", { headers: { "Cf-Access-Jwt-Assertion": forged } })).status()).toBe(403);
	expect((await request.get("/newsroom", { headers: { Cookie: `CF_Authorization=${forged}` } })).status()).toBe(403);
	expect(
		(
			await request.post("/_emdash/api/setup", {
				headers: { "X-EmDash-Request": "1", Origin: "http://localhost:4321" },
				data: { title: "hijack", includeContent: false },
			})
		).status(),
	).toBe(403);
});

test("development helpers do not exist in the production build", async ({ request }) => {
	expect((await request.get("/dev/login?role=admin")).status()).toBe(404);
});

test("public media stays reachable (EmDash still refuses private keys)", async ({ request }) => {
	expect((await request.get("/_emdash/api/media/file/missing.jpg")).status()).toBe(404);
	expect((await request.get("/_emdash/api/media/file/backups%2Fsite.json")).status()).toBe(404);
});

test("public pages send strict security headers", async ({ request }) => {
	const response = await request.get("/");
	const headers = response.headers();
	expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
	expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
	expect(headers["x-frame-options"]).toBe("DENY");
	expect(headers["x-content-type-options"]).toBe("nosniff");
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("pages render with no CSP violations or script errors, and the comment form works", async ({ page }) => {
	const problems: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") problems.push(message.text());
	});
	page.on("pageerror", (error) => problems.push(error.message));

	for (const path of ["/", "/news", "/about", "/en", "/contact"]) {
		await page.goto(path, { waitUntil: "load" });
		await page.waitForTimeout(1000); // let late CSP reports surface
	}

	// Only our own API (never Cloudflare's Turnstile requests).
	await page.route("http://localhost:4321/api/**", (route) =>
		route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": "198.51.100.77" } }),
	);
	await page.goto("/articles/how-to-send-us-your-story");
	await page.fill("#c-name", "اختبار الإنتاج");
	await page.fill("#c-email", `prod${Date.now()}@example.com`);
	await page.fill("#c-body", "تعليق من اختبار نسخة الإنتاج.");
	await expect
		.poll(() => page.locator('form.comment-form input[name="cf-turnstile-response"]').inputValue().catch(() => ""), { timeout: 30_000 })
		.not.toBe("");
	await page.locator("form.comment-form button[type=submit]").click();
	await expect(page.locator("form.comment-form [data-form-status]")).toHaveText(/بانتظار المراجعة/);

	// Violations of OUR policy. (Cloudflare's own Turnstile frames log an
	// X-Frame-Options notice about challenges.cloudflare.com — not our header.)
	const csp = problems.filter(
		(text) => /Content Security Policy|Refused to/i.test(text) && !text.includes("challenges.cloudflare.com"),
	);
	expect(csp, csp.join("\n")).toEqual([]);
	expect(problems.filter((text) => !/challenges\.cloudflare\.com|turnstile|private access token/i.test(text))).toEqual([]);
});
