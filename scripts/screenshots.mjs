#!/usr/bin/env node
/**
 * Visual QA: capture key pages at desktop and mobile widths.
 *   node scripts/screenshots.mjs [outDir]   (server must be running on :4321)
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const out = process.argv[2] ?? "test-results/screenshots";
mkdirSync(out, { recursive: true });
const base = "http://localhost:4321";
const pages = [
	["home", "/"],
	["article", "/articles/introducing-arabs-startups"],
	["news", "/news"],
	["contact", "/contact"],
	["about", "/about"],
	["en-home", "/en"],
	["404", "/nope"],
];

const browser = await chromium.launch();
for (const [label, viewport] of [
	["desktop", { viewport: { width: 1366, height: 900 } }],
	["mobile", devices["Pixel 7"]],
]) {
	const context = await browser.newContext({ ...viewport, colorScheme: "light" });
	const page = await context.newPage();
	for (const [name, path] of pages) {
		await page.goto(base + path, { waitUntil: "load" });
		await page.waitForTimeout(800);
		await page.screenshot({ path: `${out}/${label}-${name}.png`, fullPage: label === "mobile" ? false : true });
	}
	await context.close();
}
const dark = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: "dark" });
const darkPage = await dark.newPage();
await darkPage.goto(`${base}/`, { waitUntil: "load" });
await darkPage.waitForTimeout(800);
await darkPage.screenshot({ path: `${out}/desktop-home-dark.png` });
await browser.close();
console.log(`screenshots written to ${out}`);
