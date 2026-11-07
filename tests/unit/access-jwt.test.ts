import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
	AccessVerificationError,
	extractAccessJwt,
	isFreshAuthentication,
	isValidTeamDomain,
	verifyAccessJwt,
} from "../../src/lib/security/access-jwt";

const TEAM = "arabsstartups.cloudflareaccess.com";
const AUD = "aud-tag-123";
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let getKey: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256", { extractable: true });
	privateKey = pair.privateKey;
	otherKey = (await generateKeyPair("RS256")).privateKey;
	const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
	getKey = createLocalJWKSet({ keys: [jwk] });
});

async function token(overrides: { aud?: string; iss?: string; email?: string | null; exp?: string; key?: CryptoKey; iat?: number } = {}) {
	const payload: Record<string, unknown> = {};
	if (overrides.email !== null) payload.email = overrides.email ?? "Owner@ArabsStartups.com";
	const jwt = new SignJWT(payload)
		.setProtectedHeader({ alg: "RS256", kid: "k1" })
		.setSubject("user-sub-1")
		.setIssuer(overrides.iss ?? `https://${TEAM}`)
		.setAudience(overrides.aud ?? AUD)
		.setIssuedAt(overrides.iat)
		.setExpirationTime(overrides.exp ?? "1h");
	return jwt.sign(overrides.key ?? privateKey);
}

async function code(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
		return "ok";
	} catch (error) {
		return error instanceof AccessVerificationError ? error.code : "other";
	}
}

describe("verifyAccessJwt", () => {
	it("accepts a valid token and normalises the email", async () => {
		const identity = await verifyAccessJwt(await token(), { teamDomain: TEAM, audience: AUD, getKey });
		expect(identity.email).toBe("owner@arabsstartups.com");
		expect(identity.subject).toBe("user-sub-1");
		expect(identity.expiresAt).toBeGreaterThan(identity.issuedAt);
	});

	it("rejects a token for another Access application (audience)", async () => {
		expect(await code(verifyAccessJwt(await token({ aud: "someone-else" }), { teamDomain: TEAM, audience: AUD, getKey }))).toBe("invalid-token");
	});

	it("rejects a token from another team (issuer)", async () => {
		expect(await code(verifyAccessJwt(await token({ iss: "https://evil.cloudflareaccess.com" }), { teamDomain: TEAM, audience: AUD, getKey }))).toBe("invalid-token");
	});

	it("rejects an expired token", async () => {
		const expired = await token({ iat: Math.floor(Date.now() / 1000) - 7200, exp: "-1h" });
		expect(await code(verifyAccessJwt(expired, { teamDomain: TEAM, audience: AUD, getKey }))).toBe("invalid-token");
	});

	it("rejects a token signed by an unknown key", async () => {
		expect(await code(verifyAccessJwt(await token({ key: otherKey }), { teamDomain: TEAM, audience: AUD, getKey }))).toBe("invalid-token");
	});

	it("rejects an unsigned (alg=none) token", async () => {
		const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
		const body = Buffer.from(
			JSON.stringify({ email: "x@y.com", sub: "s", aud: AUD, iss: `https://${TEAM}`, iat: 1, exp: 9_999_999_999 }),
		).toString("base64url");
		expect(await code(verifyAccessJwt(`${header}.${body}.`, { teamDomain: TEAM, audience: AUD, getKey }))).not.toBe("ok");
	});

	it("rejects a token without an email claim", async () => {
		expect(await code(verifyAccessJwt(await token({ email: null }), { teamDomain: TEAM, audience: AUD, getKey }))).toBe("no-email");
	});

	it("fails closed on missing or malformed input and bad configuration", async () => {
		expect(await code(verifyAccessJwt(null, { teamDomain: TEAM, audience: AUD, getKey }))).toBe("missing-token");
		expect(await code(verifyAccessJwt("not-a-jwt", { teamDomain: TEAM, audience: AUD, getKey }))).toBe("malformed-token");
		expect(await code(verifyAccessJwt(await token(), { teamDomain: TEAM, audience: "", getKey }))).toBe("no-audience");
		expect(await code(verifyAccessJwt(await token(), { teamDomain: "evil.com", audience: AUD, getKey }))).toBe("bad-team-domain");
	});
});

describe("extractAccessJwt", () => {
	it("prefers the Access header and falls back to the cookie", () => {
		expect(extractAccessJwt(new Request("https://x", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } }))).toBe("a.b.c");
		expect(extractAccessJwt(new Request("https://x", { headers: { Cookie: "theme=dark; CF_Authorization=d.e.f; x=1" } }))).toBe("d.e.f");
		expect(extractAccessJwt(new Request("https://x"))).toBeNull();
	});
});

describe("isFreshAuthentication / isValidTeamDomain", () => {
	it("requires a sign-in within the last 15 minutes", () => {
		const now = 1_800_000_000;
		expect(isFreshAuthentication({ issuedAt: now - 60 }, now)).toBe(true);
		expect(isFreshAuthentication({ issuedAt: now - 16 * 60 }, now)).toBe(false);
	});
	it("only accepts <team>.cloudflareaccess.com", () => {
		expect(isValidTeamDomain(TEAM)).toBe(true);
		expect(isValidTeamDomain("cloudflareaccess.com.evil.io")).toBe(false);
		expect(isValidTeamDomain("a.b.cloudflareaccess.com")).toBe(false);
	});
});
