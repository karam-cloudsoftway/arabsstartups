import { defineConfig, devices } from "@playwright/test";

/**
 * Tests against the PRODUCTION build served locally by workerd
 * (`astro preview`): real CSP, origin Access gate, no dev helpers.
 * No Cloudflare Access audience is configured locally, so every protected
 * path must fail closed.
 */
export default defineConfig({
	testDir: "tests/prod",
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	use: { baseURL: "http://localhost:4321", ...devices["Desktop Chrome"], locale: "ar" },
	webServer: {
		command: "npm run build && node node_modules/astro/bin/astro.mjs preview",
		url: "http://localhost:4321/healthz",
		reuseExistingServer: true,
		timeout: 600_000,
	},
});
