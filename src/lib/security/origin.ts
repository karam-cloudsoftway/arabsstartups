/**
 * Same-origin check for state-changing requests (CSRF defence).
 *
 * Browsers send `Origin` on every POST. When it is missing we accept only an
 * explicit `Sec-Fetch-Site: same-origin`. Anything else fails closed.
 */
export function isSameOriginRequest(request: Request, expectedOrigin: string): boolean {
	const origin = request.headers.get("Origin");
	if (origin) return origin === expectedOrigin;
	return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

/** Read a JSON body with a hard size cap (bytes), without trusting Content-Length. */
export async function readJsonBody(
	request: Request,
	maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
	const type = request.headers.get("Content-Type") ?? "";
	if (!type.toLowerCase().startsWith("application/json")) {
		return { ok: false, status: 415, error: "unsupported_media_type" };
	}
	const declared = Number(request.headers.get("Content-Length") ?? "0");
	if (Number.isFinite(declared) && declared > maxBytes) {
		return { ok: false, status: 413, error: "payload_too_large" };
	}
	let text: string;
	try {
		text = await request.text();
	} catch {
		return { ok: false, status: 400, error: "unreadable_body" };
	}
	if (new TextEncoder().encode(text).length > maxBytes) {
		return { ok: false, status: 413, error: "payload_too_large" };
	}
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false, status: 400, error: "invalid_json" };
	}
}
