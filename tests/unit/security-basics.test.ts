import { describe, expect, it } from "vitest";
import { readConfig } from "../../src/lib/config";
import { buildCsp, securityHeaders } from "../../src/lib/security/headers";
import { isSameOriginRequest, readJsonBody } from "../../src/lib/security/origin";
import { isAccessProtectedPath, isBlockedCommentWrite } from "../../src/lib/security/paths";
import { containsHtml, countLinks, looksLikeUrl, normalizeMultiline, normalizeSingleLine } from "../../src/lib/security/text";

describe("protected paths (production Access gate)", () => {
	it("protects the CMS and the newsroom, including tricky spellings", () => {
		for (const path of ["/_emdash", "/_emdash/admin", "/_emdash/api/admin/users", "/_emdash/api/setup", "/_EMDASH/admin", "//_emdash/admin", "/%5Femdash/admin", "/newsroom", "/newsroom/inbox/1"]) {
			expect(isAccessProtectedPath(path, "GET"), path).toBe(true);
		}
	});
	it("leaves public pages and public media reads open", () => {
		for (const path of ["/", "/news", "/articles/x", "/api/comments", "/newsroomx", "/_emdashy"]) {
			expect(isAccessProtectedPath(path, "GET"), path).toBe(false);
		}
		expect(isAccessProtectedPath("/_emdash/api/media/file/01ABC.jpg", "GET")).toBe(false);
		expect(isAccessProtectedPath("/_emdash/api/media/file/01ABC.jpg", "DELETE")).toBe(true);
		expect(isAccessProtectedPath("/_emdash/api/media/file/../admin", "GET")).toBe(true);
	});
	it("blocks writes to EmDash's own public comment API only", () => {
		expect(isBlockedCommentWrite("/_emdash/api/comments/posts/1", "POST")).toBe(true);
		expect(isBlockedCommentWrite("/_emdash/api/comments/posts/1/reactions", "POST")).toBe(true);
		expect(isBlockedCommentWrite("/_emdash/api/comments/posts/1", "GET")).toBe(false);
	});
});

describe("security headers", () => {
	const html = new Response("<p>x</p>", { headers: { "Content-Type": "text/html" } });
	it("CSP forbids inline scripts, plugins, framing and foreign forms", () => {
		const csp = buildCsp({ beacon: false, upgradeInsecure: true });
		const script = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
		expect(script).not.toContain("'unsafe-inline'");
		expect(script).not.toContain("'unsafe-eval'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("form-action 'self'");
		expect(csp).toContain("https://challenges.cloudflare.com");
		expect(csp).toContain("upgrade-insecure-requests");
	});
	it("adds HSTS only for production HTTPS, CSP only off /_emdash", () => {
		const prod = securityHeaders(html, { pathname: "/", https: true, production: true, beacon: false });
		expect(prod["Strict-Transport-Security"]).toContain("max-age=31536000");
		expect(prod["Content-Security-Policy"]).toBeDefined();
		const dev = securityHeaders(html, { pathname: "/", https: false, production: false, beacon: false });
		expect(dev["Strict-Transport-Security"]).toBeUndefined();
		const cms = securityHeaders(html, { pathname: "/_emdash/admin", https: true, production: true, beacon: false });
		expect(cms["Content-Security-Policy"]).toBeUndefined();
		expect(cms["X-Content-Type-Options"]).toBe("nosniff");
	});
	it("never lets the newsroom or APIs be cached or indexed", () => {
		const nr = securityHeaders(html, { pathname: "/newsroom/inbox", https: true, production: true, beacon: false });
		expect(nr["Cache-Control"]).toBe("private, no-store");
		expect(nr["X-Robots-Tag"]).toContain("noindex");
	});
});

describe("origin and body checks", () => {
	it("accepts only same-origin requests", () => {
		const origin = "https://arabsstartups.com";
		expect(isSameOriginRequest(new Request(origin, { method: "POST", headers: { Origin: origin } }), origin)).toBe(true);
		expect(isSameOriginRequest(new Request(origin, { method: "POST", headers: { Origin: "https://evil.com" } }), origin)).toBe(false);
		expect(isSameOriginRequest(new Request(origin, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } }), origin)).toBe(true);
		expect(isSameOriginRequest(new Request(origin, { method: "POST" }), origin)).toBe(false);
	});
	it("caps body size and requires JSON", async () => {
		const ok = await readJsonBody(new Request("https://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' }), 100);
		expect(ok).toEqual({ ok: true, value: { a: 1 } });
		const big = await readJsonBody(new Request("https://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: "x".repeat(200) }) }), 100);
		expect(big).toMatchObject({ ok: false, status: 413 });
		const form = await readJsonBody(new Request("https://x", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }), 100);
		expect(form).toMatchObject({ ok: false, status: 415 });
		const broken = await readJsonBody(new Request("https://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" }), 100);
		expect(broken).toMatchObject({ ok: false, status: 400 });
	});
});

describe("text hygiene", () => {
	it("strips control and bidi-override characters", () => {
		expect(normalizeMultiline("مرحبا\u202Egnp.exe\u0007\r\n\n\n\nشكرًا")).toBe("مرحباgnp.exe\n\nشكرًا");
		expect(normalizeSingleLine("  سارة\u200B   أحمد \n")).toBe("سارة أحمد");
	});
	it("detects HTML, links and URL-like names", () => {
		expect(containsHtml("<img src=x onerror=alert(1)>")).toBe(true);
		expect(containsHtml("3 < 5 and 7 > 2")).toBe(false);
		expect(countLinks("http://a.com and https://b.com and www.c.com")).toBe(3);
		expect(looksLikeUrl("cheap-pills.com")).toBe(true);
		expect(looksLikeUrl("سارة")).toBe(false);
	});
});

describe("config", () => {
	it("parses lists and numbers defensively", () => {
		const config = readConfig({ TURNSTILE_ALLOWED_HOSTNAMES: " ArabsStartups.com , www.arabsstartups.com ,", INQUIRY_RETENTION_DAYS: "abc" });
		expect(config.turnstileAllowedHostnames).toEqual(["arabsstartups.com", "www.arabsstartups.com"]);
		expect(config.inquiryRetentionDays).toBe(365);
		expect(readConfig({}).turnstileSecret).toBe("");
	});
});
