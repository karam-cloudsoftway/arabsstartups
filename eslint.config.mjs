// @ts-check
/**
 * Code-quality and safety lint. Run: npm run lint (CI fails on any warning).
 *  - JavaScript / TypeScript: ESLint + typescript-eslint recommended rules.
 *  - .astro files: eslint-plugin-astro recommended + accessibility (jsx-a11y) rules.
 *  - Project rules from AGENTS.md, enforced instead of remembered:
 *      rule 4: never read secrets through import.meta.env
 *      rule 5: no inline <script> on pages (CSP)
 *      rule 7: SQL values are always bound, never interpolated
 */
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Build-time flags that are safe to read from import.meta.env. Everything else is a runtime secret. */
const SAFE_ENV = "^(DEV|PROD|MODE|SSR|BASE_URL|SITE|ASSETS_PREFIX|PUBLIC_[A-Z0-9_]+)$";

export default defineConfig(
	globalIgnores([
		"dist/",
		".astro/",
		".wrangler/",
		"node_modules/",
		"playwright-report/",
		"test-results/",
	]),
	js.configs.recommended,
	tseslint.configs.recommended,
	astro.configs.recommended,
	astro.configs["jsx-a11y-recommended"],
	{
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		rules: {
			eqeqeq: ["error", "always", { null: "ignore" }],
			"no-eval": "error",
			"no-implied-eval": "error",
			"no-new-func": "error",
			"no-script-url": "error",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
			],
			"no-restricted-syntax": [
				"error",
				{
					selector: `MemberExpression[object.type='MemberExpression'][object.object.type='MetaProperty'][object.property.name='env'][property.name!=/${SAFE_ENV}/]`,
					message: "Read secrets with getConfig() at runtime, never import.meta.env (AGENTS.md rule 4).",
				},
				{
					selector: "CallExpression[callee.property.name=/^(prepare|exec)$/] > TemplateLiteral[expressions.length>0]",
					message: "Bind SQL values with ? placeholders; never interpolate them (AGENTS.md rule 7).",
				},
			],
		},
	},
	{
		files: ["**/*.astro"],
		rules: {
			"astro/no-set-html-directive": "error",
			"astro/no-unsafe-inline-scripts": "error",
		},
	},
	{
		// Tests feed attack strings (javascript: URLs) and build fixture SQL on purpose.
		files: ["tests/**"],
		rules: {
			"no-script-url": "off",
			"no-restricted-syntax": "off",
		},
	},
);
