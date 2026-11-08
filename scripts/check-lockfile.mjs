#!/usr/bin/env node
/**
 * Supply-chain check for package-lock.json (runs in CI before anything else).
 * Every installed package must:
 *   - come from the public npm registry over HTTPS (no git URLs, tarball links
 *     or other hosts slipped into a pull request), and
 *   - carry a sha512 integrity hash, so `npm ci` can verify what it downloads.
 * Usage: node scripts/check-lockfile.mjs
 */
import { readFileSync } from "node:fs";

const REGISTRY = "https://registry.npmjs.org/";
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

const problems = [];
if (lock.lockfileVersion !== 3) problems.push(`lockfileVersion is ${lock.lockfileVersion}, expected 3`);

let checked = 0;
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
	if (path === "") continue; // the project itself
	if (entry.inBundle) continue; // shipped inside a parent tarball that is itself verified
	if (entry.link) {
		problems.push(`${path}: is a local link`);
		continue;
	}
	checked += 1;
	if (typeof entry.resolved !== "string" || !entry.resolved.startsWith(REGISTRY)) {
		problems.push(`${path}: resolved from ${entry.resolved ?? "(nowhere)"}`);
	}
	if (typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-")) {
		problems.push(`${path}: missing sha512 integrity`);
	}
}

if (problems.length > 0) {
	console.error(`✖ package-lock.json failed ${problems.length} check(s):\n  - ${problems.join("\n  - ")}`);
	process.exit(1);
}
console.log(`✔ package-lock.json: ${checked} packages, all from ${REGISTRY} with sha512 integrity.`);
