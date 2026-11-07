/**
 * Outer middleware — runs BEFORE every EmDash middleware (setup, auth).
 *
 * 1. Production: no request reaches /_emdash or /newsroom without a valid
 *    Cloudflare Access JWT for our Access application. This is checked at
 *    the origin even though the edge already enforces Access, so a
 *    misconfigured edge policy, a bypassed route or an unfinished setup
 *    wizard cannot expose the CMS. Public media files stay readable.
 * 2. One public write path for comments: our validated gateway (/api/comments).
 *    EmDash's own public comment POST is closed in every environment.
 * 3. Dev-only helpers never answer in production.
 * 4. Security headers on every response.
 */
import { defineMiddleware } from "astro:middleware";
import { getConfig } from "../lib/config";
import {
	AccessVerificationError,
	extractAccessJwt,
	verifyAccessJwt,
} from "../lib/security/access-jwt";
import { withSecurityHeaders } from "../lib/security/headers";
import { isAccessProtectedPath, isBlockedCommentWrite } from "../lib/security/paths";

function plain(status: number, body: string): Response {
	return new Response(body, {
		status,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "private, no-store",
		},
	});
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;
	const method = request.method.toUpperCase();
	const production = !import.meta.env.DEV;
	const config = getConfig();

	// (2) Single, validated write path for visitor comments.
	if (isBlockedCommentWrite(url.pathname, method)) {
		return withSecurityHeaders(
			new Response(JSON.stringify({ success: false, error: { code: "USE_SITE_FORM" } }), {
				status: 403,
				headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
			}),
			{ pathname: url.pathname, https: url.protocol === "https:", production, beacon: false },
		);
	}

	// (3) Development helpers are invisible in production builds.
	if (production && (url.pathname === "/dev" || url.pathname.startsWith("/dev/"))) {
		return plain(404, "Not found");
	}

	// (1) Origin-side Cloudflare Access gate.
	if (production && isAccessProtectedPath(url.pathname, method)) {
		try {
			const identity = await verifyAccessJwt(extractAccessJwt(request), {
				teamDomain: config.accessTeamDomain,
				audience: config.accessAudience,
			});
			context.locals.accessIdentity = identity;
		} catch (error) {
			const code = error instanceof AccessVerificationError ? error.code : "error";
			console.warn(`[access-gate] denied ${method} ${url.pathname} (${code})`);
			return withSecurityHeaders(plain(403, "Access denied. Sign in through Cloudflare Access."), {
				pathname: url.pathname,
				https: url.protocol === "https:",
				production,
				beacon: false,
			});
		}
	}

	const response = await next();
	return withSecurityHeaders(response, {
		pathname: url.pathname,
		https: url.protocol === "https:",
		production,
		beacon: !!config.beaconToken,
	});
});
