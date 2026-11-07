/** SHA-256 helpers (Web Crypto — works in Workers and Node). */

export async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pseudonymous identifier for rate limiting and duplicate detection.
 * The salt is a server-side secret, so the raw IP/email cannot be recovered
 * or matched across sites.
 */
export async function hashIdentifier(kind: string, value: string, salt: string): Promise<string> {
	return sha256Hex(`${kind}:${salt}:${value}`);
}

export function randomToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return btoa(String.fromCharCode(...buf))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}
