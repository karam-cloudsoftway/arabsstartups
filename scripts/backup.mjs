#!/usr/bin/env node
/**
 * Off-site database backup: export D1 to SQL and upload it to the PRIVATE
 * backups bucket.   node scripts/backup.mjs production
 * Requires `wrangler login` (or CLOUDFLARE_API_TOKEN with D1 + R2 rights).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const DATABASES = { production: "arabsstartups-prod" };
const BUCKET = "arabsstartups-backups";
const target = process.argv[2];
if (!DATABASES[target]) {
	console.error("usage: node scripts/backup.mjs production");
	process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `backups/${DATABASES[target]}-${stamp}.sql`;
mkdirSync("backups", { recursive: true });

const run = (args) => execFileSync("npx", ["wrangler", ...args], { stdio: "inherit" });
run(["d1", "export", DATABASES[target], "--remote", `--output=${file}`]);
run(["r2", "object", "put", `${BUCKET}/${file}`, `--file=${file}`, "--remote"]);
console.log(`backup stored: r2://${BUCKET}/${file}`);
