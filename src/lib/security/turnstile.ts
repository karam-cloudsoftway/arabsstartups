/**
 * Server-side Cloudflare Turnstile verification.
 *
 * A browser-only check is worthless: every submission is verified here with
 * Siteverify. Fails closed — no secret, no token, a failed check, a network
 * error or a timeout all reject the submission.
 *
 * Strict mode (production): when allowed hostnames are configured, the token
 * must have been issued for one of them AND for the expected action.
 * Cloudflare's public test keys report hostname "example.com" and no action,
 * so local development runs with an empty hostname list.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileAction = "comment" | "contact";

export interface TurnstileCheck {
	token: unknown;
	secret: string;
	expectedAction: TurnstileAction;
	allowedHostnames: string[];
	remoteIp?: string | null;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

export type TurnstileOutcome = { ok: true } | { ok: false; reason: string };

interface SiteverifyResponse {
	success?: boolean;
	hostname?: string;
	action?: string;
	"error-codes"?: string[];
}

export async function verifyTurnstile(check: TurnstileCheck): Promise<TurnstileOutcome> {
	if (!check.secret) return { ok: false, reason: "not-configured" };
	const token = typeof check.token === "string" ? check.token.trim() : "";
	if (!token) return { ok: false, reason: "missing-token" };
	if (token.length > 2048) return { ok: false, reason: "bad-token" };

	const form = new URLSearchParams();
	form.set("secret", check.secret);
	form.set("response", token);
	if (check.remoteIp) form.set("remoteip", check.remoteIp);

	let data: SiteverifyResponse;
	try {
		const response = await (check.fetchImpl ?? fetch)(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form,
			signal: AbortSignal.timeout(check.timeoutMs ?? 8000),
		});
		if (!response.ok) return { ok: false, reason: `http-${response.status}` };
		data = (await response.json()) as SiteverifyResponse;
	} catch {
		return { ok: false, reason: "network" };
	}

	if (data.success !== true) {
		const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].join(",") : "";
		return { ok: false, reason: codes || "rejected" };
	}

	const strict = check.allowedHostnames.length > 0;
	if (strict) {
		const hostname = (data.hostname ?? "").toLowerCase();
		if (!check.allowedHostnames.includes(hostname)) return { ok: false, reason: "hostname" };
		if (data.action !== check.expectedAction) return { ok: false, reason: "action" };
	} else if (data.action && data.action !== check.expectedAction) {
		return { ok: false, reason: "action" };
	}

	return { ok: true };
}
