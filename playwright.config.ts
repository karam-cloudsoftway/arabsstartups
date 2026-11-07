import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the local site (`astro dev`, Turnstile test keys,
 * local D1/R2). One worker: tests share one database and its rate limits.
 */
export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: false,
	workers: 1,
	// Form tests use Cloudflare's live Turnstile service (test keys); allow one
	// retry for network hiccups. A real defect fails both attempts.
	retries: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
	globalSetup: "./tests/e2e/global-setup.ts",
	use: {
		baseURL: "http://localhost:4321",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		locale: "ar",
	},
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
	],
	webServer: {
		command: "node node_modules/astro/bin/astro.mjs dev",
		url: "http://localhost:4321/healthz",
		reuseExistingServer: true,
		timeout: 180_000,
	},
});
