#!/usr/bin/env node
/**
 * Post-deploy smoke test: the live site answers, sends its security headers,
 * and every private area stays closed to someone who is not signed in.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                 # URL from the build just deployed
 *   node scripts/smoke-test.mjs https://arabsstartups.com
 *
 * Without an argument the URL is vars.EMDASH_SITE_URL from dist/server/wrangler.json.
 * A site that is entirely behind Cloudflare Access (the pre-launch lock,
 * RUNBOOK §4) passes when every path sends visitors to the Access sign-in page.
 * Exits 1 when any check fails. In GitHub Actions it also writes the results to
 * the job summary and sets the `site_url` output.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

function siteUrl() {
	if (process.argv[2]) return process.argv[2];
	const config = new URL("../dist/server/wrangler.json", import.meta.url);
	if (!existsSync(config)) return "";
	return String(JSON.parse(readFileSync(config, "utf8")).vars?.EMDASH_SITE_URL ?? "");
}

const base = siteUrl().replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+$/.test(base)) {
	console.error(`✖ smoke test: no usable site URL (got "${base}"). Pass one, or build first.`);
	process.exit(1);
}
const https = base.startsWith("https://");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
	const response = await fetch(base + path, {
		redirect: "manual",
		headers: { "User-Agent": "arabsstartups-smoke-test", Accept: "text/html,application/json" },
		signal: AbortSignal.timeout(20_000),
	});
	await response.body?.cancel();
	return response;
}

/** Redirect to the Cloudflare Access sign-in page. */
function toAccessSignIn(response) {
	const location = response.headers.get("location") ?? "";
	return response.status >= 300 && response.status < 400 && /\.cloudflareaccess\.com\//.test(location);
}

/** A private path is closed when it answers 401/403 or sends the visitor to sign in. */
function closed(response) {
	return response.status === 401 || response.status === 403 || toAccessSignIn(response);
}

function describe(response) {
	const location = response.headers.get("location");
	const challenge = response.headers.get("cf-mitigated");
	return `${response.status}${location ? ` → ${new URL(location, base).host}` : ""}${challenge ? ` (cf-mitigated: ${challenge})` : ""}`;
}

const securityHeaders = (r) => {
	const csp = r.headers.get("content-security-policy") ?? "";
	return (
		csp.includes("frame-ancestors 'none'") &&
		r.headers.get("x-content-type-options") === "nosniff" &&
		(!https || (r.headers.get("strict-transport-security") ?? "").includes("max-age="))
	);
};

const PRIVATE_PATHS = [
	{ name: "CMS admin is closed", path: "/_emdash/admin" },
	{ name: "CMS API is closed", path: "/_emdash/api/admin/users" },
	{ name: "Dev setup bypass is closed", path: "/_emdash/api/setup/dev-bypass" },
	{ name: "Newsroom is closed", path: "/newsroom" },
];

async function run(check) {
	let outcome = "no answer";
	let ok = false;
	const attempts = (check.retries ?? 1) + 1;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await get(check.path);
			outcome = describe(response);
			ok = check.pass(response);
		} catch (error) {
			outcome = error instanceof Error ? error.message : String(error);
		}
		if (ok || attempt === attempts) break;
		await sleep(5_000);
	}
	console.log(`${ok ? "✔" : "✖"} ${check.name.padEnd(38)} ${check.path.padEnd(32)} ${outcome}`);
	return { ...check, ok, outcome };
}

// A new version can take a few seconds to reach every location.
let wholeSitePrivate = false;
const health = await run({
	name: "Health check answers",
	path: "/healthz",
	retries: 6,
	pass: (r) => {
		wholeSitePrivate = toAccessSignIn(r);
		return r.status === 200 || wholeSitePrivate;
	},
});

const checks = wholeSitePrivate
	? [
			{ name: "Home page needs sign-in", path: "/", pass: toAccessSignIn },
			...PRIVATE_PATHS.map((c) => ({ ...c, pass: toAccessSignIn })),
			{ name: "Dev login needs sign-in", path: "/dev/login?role=admin", pass: toAccessSignIn },
		]
	: [
			{
				name: "Home page loads with security headers",
				path: "/",
				pass: (r) => r.status >= 200 && r.status < 400 && securityHeaders(r),
			},
			...PRIVATE_PATHS.map((c) => ({ ...c, pass: closed })),
			{ name: "Dev login does not exist", path: "/dev/login?role=admin", pass: (r) => r.status === 404 },
		];

if (wholeSitePrivate) console.log("  The whole site is behind Cloudflare Access: every path must ask for sign-in.");
const results = [health];
for (const check of checks) results.push(await run(check));

const failed = results.filter((result) => !result.ok);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `site_url=${base}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
	const rows = results.map((r) => `| ${r.ok ? "✅" : "❌"} | ${r.name} | \`${r.path}\` | ${r.outcome} |`);
	const mode = wholeSitePrivate ? "whole site behind Cloudflare Access" : "public site, private areas closed";
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		[`### Smoke test: ${base} (${mode})`, "", "| | Check | Path | Answer |", "|---|---|---|---|", ...rows, ""].join("\n"),
	);
}

if (failed.length > 0) {
	if (failed.some((r) => r.outcome.includes("cf-mitigated"))) {
		console.error("  Cloudflare challenged the test itself (bot protection). See docs/CI_CD.md → Troubleshooting.");
	}
	console.error(`\n✖ smoke test: ${failed.length} of ${results.length} checks failed for ${base}`);
	process.exit(1);
}
console.log(`\n✔ smoke test: all ${results.length} checks passed for ${base}`);
