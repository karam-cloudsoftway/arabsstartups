# Notes for coding agents

Arabs Startups: Arabic-first startup media site. Astro 7 + EmDash 1.4 CMS on
Cloudflare Workers (D1, R2, Access, Turnstile). Read `docs/ARCHITECTURE.md` and
`docs/SECURITY.md` before changing anything security-related.

## Commands

```bash
npm ci
npm run dev                       # http://localhost:4321 (loopback only)
#   first run: open /_emdash/api/setup/dev-bypass?redirect=/ to seed the CMS
#   staff test login (dev only): /dev/login?role=editor&next=/newsroom
npm run lint                      # ESLint (quality, a11y, rules 4/5/7) — 0 warnings
npm run typecheck                 # astro check — must be 0 errors
npm test                          # unit tests (Vitest)
npm run test:e2e                  # Playwright against astro dev
npm run test:prod                 # production build boundary tests (stop `npm run dev` first)
npm run check:lockfile            # every package from registry.npmjs.org with sha512
npm run seed:build                # regenerate seed/seed.json from scripts/build-seed.mjs
```

CI (`.github/workflows/ci.yml`, explained in `docs/CI_CD.md`) runs all of the
above plus gitleaks, actionlint, zizmor and Semgrep.

## Rules that must not be broken

1. Every newsroom page/route calls `requireStaff(scope, permission)` from
   `src/lib/runtime.ts`. Add new permissions to `src/lib/staff/roles.ts` only.
2. Public writes go through `/api/comments` or `/api/contact` with: same-origin
   check, size cap, zod schema, honeypot, `verifyTurnstile`, `checkRateLimits`.
3. Visitor comments are created with status `pending`. Never auto-approve.
4. Never read secrets via `import.meta.env`; use `getConfig()` (runtime
   `process.env`). Never commit `.env`. Never weaken `scripts/predeploy.mjs`.
5. No inline `<script>` on public pages (CSP). Load local scripts with
   `<script src="../scripts/x.ts">` (Astro bundles them); external third-party
   scripts need a CSP update in `src/lib/security/headers.ts`.
6. Own tables use the `as_` prefix. Migrations in `src/lib/db/migrations.ts`
   are append-only — never edit an existing migration; add a new version.
7. All SQL uses bound parameters.
8. Arabic is the default locale: logical CSS properties only (no left/right),
   numbers/emails/URLs inside `.ltr`/`<time>`, strings in `src/i18n/{ar,en}.ts`.
9. Do not invent facts, names, partners, figures or guests in content; mark
   samples with `sample_content: true`.
10. Never show empty channels (e.g. the episodes nav item appears only when an
    episode is published).
11. CI: every action stays pinned to a full commit SHA, `permissions` stay
    minimal, and the Cloudflare token appears only in the deploy step. Do not
    weaken `.github/workflows/ci.yml`, `eslint.config.mjs` or
    `scripts/smoke-test.mjs`. A lint exception needs
    `// eslint-disable-next-line <rule> -- reason`.

## Definition of done for a change

Lint and type check clean, unit + e2e + production-build tests green, docs
updated when behaviour or setup changes.
