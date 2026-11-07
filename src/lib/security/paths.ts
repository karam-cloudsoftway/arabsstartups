/** Which paths require a verified Cloudflare Access identity in production. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
	return SAFE_METHODS.has(method.toUpperCase());
}

export function isAccessProtectedPath(pathname: string, method: string): boolean {
	let path: string;
	try {
		path = decodeURIComponent(pathname).toLowerCase();
	} catch {
		return true; // undecodable paths are treated as protected
	}
	path = path.replace(/\/{2,}/g, "/");
	const emdash = path === "/_emdash" || path.startsWith("/_emdash/");
	const newsroom = path === "/newsroom" || path.startsWith("/newsroom/");
	if (!emdash && !newsroom) return false;
	// Uploaded editorial media is public; EmDash refuses backup/private keys on this route.
	if (path.startsWith("/_emdash/api/media/file/") && !path.includes("..") && isSafeMethod(method)) {
		return false;
	}
	return true;
}

/** EmDash's own public comment endpoints may only be read; writes go through /api/comments. */
export function isBlockedCommentWrite(pathname: string, method: string): boolean {
	let path: string;
	try {
		path = decodeURIComponent(pathname).toLowerCase().replace(/\/{2,}/g, "/");
	} catch {
		return true;
	}
	return path.startsWith("/_emdash/api/comments/") && !isSafeMethod(method);
}
