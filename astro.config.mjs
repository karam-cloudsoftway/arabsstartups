// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import auditLog from "@emdash-cms/plugin-audit-log";
import { access, d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

// Non-secret, config-time values, read from the build environment only (never
// from .env, so local development values cannot leak into a production build).
// Secrets are read at runtime from Worker secrets, never at build time.
const SITE_URL = process.env.SITE_URL || "https://arabsstartups.com";
// Cloudflare Zero Trust team domain, e.g. "arabsstartups.cloudflareaccess.com".
const ACCESS_TEAM_DOMAIN =
	process.env.CF_ACCESS_TEAM_DOMAIN || "arabsstartups.cloudflareaccess.com";

export default defineConfig({
	site: SITE_URL,
	output: "server",
	adapter: cloudflare(),
	trailingSlash: "ignore",
	// Arabic is the default locale and is NOT prefixed (/news). English lives
	// under /en. EmDash requires the default locale to stay unprefixed.
	i18n: {
		defaultLocale: "ar",
		locales: ["ar", "en"],
		routing: { prefixDefaultLocale: false },
		// No automatic fallback: an English URL without an English version
		// redirects explicitly to its Arabic URL (src/lib/content/routes.ts),
		// and a missing page is a real 404 in its own language.
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	build: {
		// External stylesheets only, so the CSP can forbid inline <style>.
		inlineStylesheets: "never",
	},
	security: {
		checkOrigin: true,
	},
	integrations: [
		react(), // required by the EmDash admin UI
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// Staff sign in ONLY through Cloudflare Access (email one-time PIN).
			// In `astro dev` EmDash falls back to its local login so the site can
			// be developed without Access.
			auth: access({
				teamDomain: ACCESS_TEAM_DOMAIN,
				audienceEnvVar: "CF_ACCESS_AUDIENCE",
				autoProvision: true,
				// New staff start as Contributor (can write drafts, cannot publish).
				defaultRole: 20,
				// Roles are managed in EmDash, never overwritten by the IdP.
				syncRoles: false,
				syncName: true,
			}),
			plugins: [auditLog],
			// The editorial team works in Arabic; English stays available.
			admin: {
				siteName: "Arabs Startups",
				favicon: "/favicon.svg",
				locales: ["ar", "en"],
			},
			// Runs before every EmDash middleware: security headers and the
			// origin-side Cloudflare Access gate (see src/middleware/outer.ts).
			middleware: { outer: "./src/middleware/outer.ts" },
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "IBM Plex Sans Arabic",
			cssVariable: "--font-ar",
			weights: [400, 500, 600, 700],
			subsets: ["arabic", "latin"],
			fallbacks: ["system-ui", "sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "Inter Tight",
			cssVariable: "--font-latin",
			weights: [500, 600, 700, 800],
			subsets: ["latin"],
			fallbacks: ["system-ui", "sans-serif"],
		},
	],
	devToolbar: { enabled: false },
});
