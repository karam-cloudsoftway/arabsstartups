import { describe, expect, it, vi } from "vitest";
import { SITEVERIFY_URL, verifyTurnstile } from "../../src/lib/security/turnstile";

function fakeFetch(body: unknown, status = 200) {
	return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const base = { token: "tok", secret: "sec", expectedAction: "comment" as const, allowedHostnames: [] as string[] };

describe("verifyTurnstile", () => {
	it("fails closed without a secret or token", async () => {
		expect(await verifyTurnstile({ ...base, secret: "" })).toEqual({ ok: false, reason: "not-configured" });
		expect(await verifyTurnstile({ ...base, token: "" })).toEqual({ ok: false, reason: "missing-token" });
		expect(await verifyTurnstile({ ...base, token: 42 })).toEqual({ ok: false, reason: "missing-token" });
	});

	it("posts secret, token and IP to Siteverify", async () => {
		const fetchImpl = fakeFetch({ success: true, hostname: "example.com" });
		const result = await verifyTurnstile({ ...base, remoteIp: "203.0.113.9", fetchImpl });
		expect(result.ok).toBe(true);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(SITEVERIFY_URL);
		const sent = new URLSearchParams(String(init.body));
		expect(sent.get("secret")).toBe("sec");
		expect(sent.get("response")).toBe("tok");
		expect(sent.get("remoteip")).toBe("203.0.113.9");
	});

	it("rejects a failed verification", async () => {
		const result = await verifyTurnstile({ ...base, fetchImpl: fakeFetch({ success: false, "error-codes": ["timeout-or-duplicate"] }) });
		expect(result).toEqual({ ok: false, reason: "timeout-or-duplicate" });
	});

	it("strict mode requires the right hostname AND action", async () => {
		const strict = { ...base, allowedHostnames: ["arabsstartups.com"] };
		expect((await verifyTurnstile({ ...strict, fetchImpl: fakeFetch({ success: true, hostname: "arabsstartups.com", action: "comment" }) })).ok).toBe(true);
		expect(await verifyTurnstile({ ...strict, fetchImpl: fakeFetch({ success: true, hostname: "evil.com", action: "comment" }) })).toEqual({ ok: false, reason: "hostname" });
		expect(await verifyTurnstile({ ...strict, fetchImpl: fakeFetch({ success: true, hostname: "arabsstartups.com" }) })).toEqual({ ok: false, reason: "action" });
		expect(await verifyTurnstile({ ...strict, fetchImpl: fakeFetch({ success: true, hostname: "arabsstartups.com", action: "contact" }) })).toEqual({ ok: false, reason: "action" });
	});

	it("non-strict mode still rejects a token minted for another form", async () => {
		expect(await verifyTurnstile({ ...base, fetchImpl: fakeFetch({ success: true, action: "contact" }) })).toEqual({ ok: false, reason: "action" });
	});

	it("fails closed on network errors and non-200 answers", async () => {
		const broken = vi.fn(async () => {
			throw new Error("boom");
		});
		expect(await verifyTurnstile({ ...base, fetchImpl: broken as unknown as typeof fetch })).toEqual({ ok: false, reason: "network" });
		expect(await verifyTurnstile({ ...base, fetchImpl: fakeFetch({}, 500) })).toEqual({ ok: false, reason: "http-500" });
	});
});
