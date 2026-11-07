/**
 * Security headers for every response, and a strict Content Security Policy
 * for public HTML pages. EmDash sets its own CSP on /_emdash routes.
 */

export const EMBED_FRAME_HOSTS = [
	"https://www.youtube-nocookie.com",
	"https://open.spotify.com",
	"https://www.linkedin.com",
	"https://player.vimeo.com",
	"https://embed.podcasts.apple.com",
	"https://w.soundcloud.com",
];

const TURNSTILE = "https://challenges.cloudflare.com";

export interface CspOptions {
	beacon: boolean;
	upgradeInsecure: boolean;
}

export function buildCsp(options: CspOptions): string {
	const script = ["'self'", TURNSTILE];
	const connect = ["'self'"];
	if (options.beacon) {
		script.push("https://static.cloudflareinsights.com");
		connect.push("https://cloudflareinsights.com");
	}
	const directives = [
		"default-src 'self'",
		`script-src ${script.join(" ")}`,
		// Inline style attributes are used by responsive images; no inline scripts are allowed.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self'",
		`connect-src ${connect.join(" ")}`,
		`frame-src ${[TURNSTILE, ...EMBED_FRAME_HOSTS].join(" ")}`,
		"media-src 'self' https:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"manifest-src 'self'",
		"worker-src 'self'",
	];
	if (options.upgradeInsecure) directives.push("upgrade-insecure-requests");
	return directives.join("; ");
}

export interface HeaderContext {
	pathname: string;
	https: boolean;
	production: boolean;
	beacon: boolean;
}

function isEmDashPath(pathname: string): boolean {
	return pathname === "/_emdash" || pathname.startsWith("/_emdash/");
}

export function securityHeaders(response: Response, context: HeaderContext): Record<string, string> {
	const headers: Record<string, string> = {
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy":
			"accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
		"Cross-Origin-Opener-Policy": "same-origin",
	};
	if (context.production && context.https) {
		// Enable `preload` only after the domain is verified on HTTPS (plan §9).
		headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
	}
	const type = response.headers.get("Content-Type") ?? "";
	const isHtml = type.toLowerCase().includes("text/html");
	if (isHtml && !isEmDashPath(context.pathname)) {
		headers["X-Frame-Options"] = "DENY";
		if (context.production && !response.headers.has("Content-Security-Policy")) {
			headers["Content-Security-Policy"] = buildCsp({
				beacon: context.beacon,
				upgradeInsecure: context.https,
			});
		}
	}
	if (context.pathname.startsWith("/newsroom") || context.pathname.startsWith("/api/")) {
		headers["Cache-Control"] = "private, no-store";
		headers["X-Robots-Tag"] = "noindex, nofollow";
	}
	return headers;
}

/** Returns a response carrying the headers (copies it when headers are immutable). */
export function withSecurityHeaders(response: Response, context: HeaderContext): Response {
	const extra = securityHeaders(response, context);
	try {
		for (const [name, value] of Object.entries(extra)) response.headers.set(name, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		for (const [name, value] of Object.entries(extra)) copy.headers.set(name, value);
		return copy;
	}
}
