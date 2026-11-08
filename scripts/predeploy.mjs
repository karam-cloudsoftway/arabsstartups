#!/usr/bin/env node
/**
 * Pre-deploy safety check. Run after `CLOUDFLARE_ENV=<env> astro build`.
 *  - removes dist/server/.dev.vars (local secrets copied by the build)
 *  - refuses to deploy the local-dev config, placeholder values or test keys
 * Usage: node scripts/predeploy.mjs <staging|production>
 */
import { existsSync, readFileSync, rmSync } from "node:fs";

const target = process.argv[2];
const EXPECTED = { staging: "arabsstartups-staging", production: "arabsstartups" };
const fail = (message) => {
	console.error(`\n✖ predeploy: ${message}\n`);
	process.exit(1);
};

if (!EXPECTED[target]) fail("pass the target environment: staging or production");

const devVars = new URL("../dist/server/.dev.vars", import.meta.url);
if (existsSync(devVars)) {
	rmSync(devVars);
	console.log("• removed dist/server/.dev.vars (local secrets never ship)");
}

const configUrl = new URL("../dist/server/wrangler.json", import.meta.url);
if (!existsSync(configUrl)) fail("dist/server/wrangler.json not found — build first");
const config = JSON.parse(readFileSync(configUrl, "utf8"));

if (config.name !== EXPECTED[target]) {
	fail(`built for "${config.name}", expected "${EXPECTED[target]}". Build with CLOUDFLARE_ENV=${target}.`);
}

const vars = config.vars ?? {};
const problems = [];
// Without an explicit id, wrangler may create a brand-new EMPTY database on deploy.
for (const db of config.d1_databases ?? []) {
	if (!db.database_id) problems.push(`D1 binding ${db.binding} has no database_id (RUNBOOK §1)`);
}
if (config.preview_urls !== false) problems.push("preview_urls must be false (one public address per environment)");
for (const [name, value] of Object.entries(vars)) {
	if (String(value).includes("CHANGE-ME")) problems.push(`${name} still contains CHANGE-ME`);
}
const siteKey = String(vars.PUBLIC_TURNSTILE_SITE_KEY ?? "");
if (!siteKey) problems.push("PUBLIC_TURNSTILE_SITE_KEY is empty");
if (/^[123]x0{20}/.test(siteKey)) problems.push("PUBLIC_TURNSTILE_SITE_KEY is a Cloudflare TEST key");
if (!String(vars.TURNSTILE_ALLOWED_HOSTNAMES ?? "").trim()) {
	problems.push("TURNSTILE_ALLOWED_HOSTNAMES is empty (strict Turnstile checks would be off)");
}
if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(String(vars.CF_ACCESS_TEAM_DOMAIN ?? ""))) {
	problems.push("CF_ACCESS_TEAM_DOMAIN is not a valid <team>.cloudflareaccess.com domain");
}
if (!String(vars.EMDASH_SITE_URL ?? "").startsWith("https://")) problems.push("EMDASH_SITE_URL must be https://");

if (problems.length > 0) fail(`fix wrangler.jsonc env.${target}:\n  - ${problems.join("\n  - ")}`);

console.log(`✔ predeploy: ${config.name} looks ready.`);
console.log(
	"  Required secrets (wrangler secret put <NAME> --env " +
		target +
		"): EMDASH_ENCRYPTION_KEY, CF_ACCESS_AUDIENCE, TURNSTILE_SECRET_KEY, RESEND_API_KEY (optional)",
);
