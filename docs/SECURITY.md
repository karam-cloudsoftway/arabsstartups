# Security model

## Boundaries

```
Visitor ──► Cloudflare edge ──► Worker (Astro + EmDash)
              │                   ├─ outer middleware (runs first on every request)
              │                   │    • production: /_emdash/* and /newsroom/* need a valid
              │                   │      Cloudflare Access JWT (signature, issuer, audience, expiry)
              │                   │    • EmDash's own public comment write API is closed
              │                   │    • /dev/* answers 404; security headers on every response
              │                   ├─ public pages (published content only)
              │                   ├─ /api/comments, /api/contact (validated public writes)
              │                   ├─ /newsroom/* (staff; one access rule: src/lib/staff/guard.ts)
              │                   └─ /_emdash/* (EmDash admin; EmDash re-checks Access + roles)
              └─ Access app "staff": /_emdash/*, /newsroom/* (named emails, one-time PIN)
                 Access bypass: /_emdash/api/media/file/* only (public images)
```

## Controls (plan §7 and spec §9)

| Control | Where | Test |
|---|---|---|
| Staff sign in only by emailed one-time PIN; no passwords, no sign-up | Cloudflare Access + `access()` in astro.config.mjs | manual (RUNBOOK §4) |
| Origin re-verifies the Access JWT on every protected request (fail closed) | src/middleware/outer.ts, src/lib/security/access-jwt.ts | tests/unit/access-jwt.test.ts, tests/prod |
| Unfinished setup wizard cannot be hijacked | same gate covers /_emdash/admin/setup and /_emdash/api/setup | tests/prod |
| New staff start as Contributor; roles never synced from the IdP | `defaultRole: 20`, `syncRoles: false` | — |
| One access rule for the newsroom, re-reading the user every request | src/lib/staff/guard.ts, src/lib/staff/roles.ts | unit + e2e access.spec |
| Disabled account refused on the next request, even mid-session | guard + EmDash disabled check | e2e access.spec |
| Contributors cannot publish; drafts never public | EmDash RBAC; published-only queries | e2e access.spec |
| Visitor comments always pending until approved | src/lib/comments/service.ts | unit + e2e comments.spec |
| Server-side Turnstile (success, and in production hostname + action) | src/lib/security/turnstile.ts | tests/unit/turnstile.test.ts |
| Rate limits per IP hash and per email hash; duplicates refused | src/lib/security/rate-limit.ts | unit + e2e |
| Same-origin check, body size caps, strict schemas, no HTML, link limits, honeypot | src/lib/security/*, src/lib/*/validation | unit + e2e |
| Plain-text rendering of visitor text; emails never public | Comments.astro, newsroom pages | e2e |
| Private inbox: Editor/Admin only; export Admin-only + recent sign-in; CSV formula-safe | src/pages/newsroom/* | unit + e2e contact.spec |
| Audit trail of privileged actions and staff changes | src/lib/audit/* (+ EmDash audit-log plugin for content) | unit + e2e |
| Strict CSP (no inline script), HSTS, nosniff, frame-ancestors none | src/lib/security/headers.ts | unit + tests/prod |
| Secrets only in Worker secrets; build refuses placeholder/test keys | wrangler.jsonc, scripts/predeploy.mjs | — |
| Embeds only from an allow-list, sandboxed iframes | src/lib/content/embeds.ts | unit + e2e |
| Data retention: contact messages auto-deleted | src/lib/maintenance.ts | unit |
| Dependencies pinned; vulnerable transitive `zod` and `minimatch` overridden; Dependabot updates with a cooldown | package.json, .github/dependabot.yml | `npm audit` → 0 in CI |
| Lockfile only from the npm registry with integrity hashes; registry signatures verified | scripts/check-lockfile.mjs, `npm audit signatures` | CI |
| CI/CD: actions pinned to commit SHAs, read-only tokens, deploy token only in the deploy step, production only from `main` | .github/workflows/ci.yml ([CI_CD.md](CI_CD.md)) | zizmor + actionlint in CI |
| Secret scan of the whole git history | gitleaks in CI | CI |
| Lint guards for project rules: no secrets via `import.meta.env`, no inline scripts, no `set:html`, bound SQL; accessibility rules | eslint.config.mjs | `npm run lint` in CI |
| Static analysis for risky code and hard-coded secrets | Semgrep in CI | CI |
| After every deploy: health, headers, and all private areas closed | scripts/smoke-test.mjs | each deploy |

## Residual risks and manual duties

- **The mailbox is the key.** Email OTP proves control of a mailbox. Require
  MFA on every staff mailbox and on the Cloudflare and GitHub admin accounts.
- **Access policy hygiene.** Named emails only. Review the policy monthly
  against `/newsroom/team`.
- **Sessions after removal.** Removing an email from Access stops new sign-ins;
  revoke sessions in Zero Trust *and* disable the CMS user (OPERATIONS.md).
- **The deploy token.** Whoever holds the Cloudflare deploy token can change the
  live site. Keep it in a GitHub environment that only `main` can use, rotate it
  every 90 days, and keep GitHub write access small ([CI_CD.md](CI_CD.md) §3).
- **Rate limits need Cloudflare.** Limits key on `CF-Connecting-IP`, which only
  Cloudflare sets. Do not expose the Worker through another proxy.
- **Legal pages are drafts.** Privacy, terms and disclosure need legal review
  before launch; the ownership statement must be confirmed.
- **Third parties.** Turnstile, Resend and video providers process visitor data;
  list them in the privacy policy.

## Reporting a vulnerability

Email the site owner privately (address in the Access policy owner record). Do
not open a public issue.
