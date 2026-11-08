import { defineConfig, devices } from "@playwright/test";

/**
 * Tests against the PRODUCTION build served locally by workerd
 * (`astro preview`): real CSP, origin Access gate, no dev helpers.
 * No Cloudflare Access audience is configured locally, so every protected
 * path must fail closed.
 * Stop `npm run dev` first: this suite never reuses a running server, so it
 * cannot pass by accident against the development build.
 */
export default defineConfig({
	testDir: "tests/prod",
	forbidOnly: !!process.env.CI,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	use: { baseURL: "http://localhost:4321", ...devices["Desktop Chrome"], locale: "ar" },
	webServer: {
		command: "npm run build && node node_modules/astro/bin/astro.mjs preview",
		url: "http://localhost:4321/healthz",
		reuseExistingServer: false,
		timeout: 600_000,
	},
});
