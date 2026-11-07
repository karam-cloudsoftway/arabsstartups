/**
 * Cloudflare Access JWT verification (origin-side defense in depth).
 *
 * Cloudflare Access sends a signed JWT on every request to a protected path,
 * in the `Cf-Access-Jwt-Assertion` header (and the `CF_Authorization`
 * cookie). We verify the signature against the team's public keys, plus the
 * issuer, audience and expiry. A request without a valid token for OUR Access
 * application never reaches a protected route, even if the edge policy were
 * misconfigured.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessIdentity {
	email: string;
	subject: string;
	/** Issued-at, seconds since epoch — when the person last signed in. */
	issuedAt: number;
	expiresAt: number;
}

export interface AccessVerifyOptions {
	teamDomain: string;
	audience: string;
	/** Injected in tests; defaults to the team's remote JWKS. */
	getKey?: JWTVerifyGetKey;
	currentDate?: Date;
}

export class AccessVerificationError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = "AccessVerificationError";
	}
}

const TEAM_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const COOKIE_RE = /(?:^|;\s*)CF_Authorization=([^;]+)/;
const JWT_SHAPE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_JWT_LENGTH = 8192;

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

export function isValidTeamDomain(teamDomain: string): boolean {
	return TEAM_DOMAIN_RE.test(teamDomain);
}

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
	let jwks = jwksByTeam.get(teamDomain);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
			timeoutDuration: 5000,
			cooldownDuration: 30_000,
		});
		jwksByTeam.set(teamDomain, jwks);
	}
	return jwks;
}

/** Header first (set by Access on every proxied request), then the cookie. */
export function extractAccessJwt(request: Request): string | null {
	const header = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
	if (header) return header;
	const cookie = request.headers.get("Cookie") ?? "";
	const match = COOKIE_RE.exec(cookie);
	return match?.[1]?.trim() || null;
}

export async function verifyAccessJwt(
	token: string | null,
	options: AccessVerifyOptions,
): Promise<AccessIdentity> {
	if (!isValidTeamDomain(options.teamDomain)) throw new AccessVerificationError("bad-team-domain");
	if (!options.audience) throw new AccessVerificationError("no-audience");
	if (!token) throw new AccessVerificationError("missing-token");
	if (token.length > MAX_JWT_LENGTH || !JWT_SHAPE_RE.test(token)) {
		throw new AccessVerificationError("malformed-token");
	}

	let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
	try {
		const result = await jwtVerify(token, options.getKey ?? remoteJwks(options.teamDomain), {
			issuer: `https://${options.teamDomain}`,
			audience: options.audience,
			algorithms: ["RS256"],
			clockTolerance: 30,
			currentDate: options.currentDate,
		});
		payload = result.payload;
	} catch {
		throw new AccessVerificationError("invalid-token");
	}

	const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
	if (!email.includes("@") || email.length > 254) throw new AccessVerificationError("no-email");
	if (typeof payload.sub !== "string" || !payload.sub) throw new AccessVerificationError("no-subject");
	if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
		throw new AccessVerificationError("no-times");
	}

	return { email, subject: payload.sub, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** High-impact actions (export, new admin) require a recent sign-in. */
export function isFreshAuthentication(
	identity: Pick<AccessIdentity, "issuedAt">,
	nowSeconds: number,
	maxAgeSeconds = 15 * 60,
): boolean {
	const age = nowSeconds - identity.issuedAt;
	return age >= -60 && age <= maxAgeSeconds;
}
