# Runbook — first production setup

Everything here needs the company's own Cloudflare account. Nothing in this
repository can create accounts, buy plans or change DNS for you.
Keep Arabs Startups fully separate from any other company's accounts,
billing, repositories and mailboxes.

## 0. Before you start

| You need | Notes |
|---|---|
| Cloudflare account owned by Arabs Startups | Workers **Paid** plan (~$5/month) is recommended (Free has a 10 ms CPU limit per request). |
| `arabsstartups.com` added to that account as a zone | Required for the custom domain. |
| A GitHub organisation/repo owned by Arabs Startups | For code, reviews and CI. |
| MFA on every admin mailbox, Cloudflare and GitHub account | Email one-time PIN is only as safe as the mailbox. |
| Node 24 LTS and `npm ci` | Locally or in CI. |

Log in once on the machine that deploys: `npx wrangler login`.

## 1. Create the resources (staging first, then production)

```bash
npx wrangler d1 create arabsstartups-staging
npx wrangler r2 bucket create arabsstartups-media-staging
npx wrangler d1 create arabsstartups-prod
npx wrangler r2 bucket create arabsstartups-media-prod
npx wrangler r2 bucket create arabsstartups-backups      # PRIVATE — never give it a public domain
```

Add each printed `database_id` to the matching `d1_databases` entry in
`wrangler.jsonc` (`env.staging` and `env.production`).

## 2. Turnstile (spam protection)

1. Cloudflare dashboard → Turnstile → Add widget → hostnames `arabsstartups.com`,
   `www.arabsstartups.com` (and the staging workers.dev hostname for staging).
2. Put the **site key** in `PUBLIC_TURNSTILE_SITE_KEY` (wrangler.jsonc vars).
3. Store the **secret**: `npx wrangler secret put TURNSTILE_SECRET_KEY --env production`.
4. Keep `TURNSTILE_ALLOWED_HOSTNAMES` set to the real hostnames (strict checks).

## 3. Cloudflare Access (staff sign-in with an emailed code)

1. Zero Trust → Settings → Authentication → add **One-time PIN** as a login method.
   (A new Zero Trust organisation does not enable it automatically.)
2. Zero Trust → Access → Applications → **Add a self-hosted application**:
   - Name: `Arabs Startups — staff`
   - Destinations (paths): `arabsstartups.com/_emdash/*` **and** `arabsstartups.com/newsroom/*`
     (add `www.` too if it serves the site)
   - Login method: One-time PIN only
   - Session duration: 8 hours (or shorter)
   - Policy **Allow — named staff**: *Include → Emails →* the named addresses only.
     Never use "Everyone", never an `@domain` rule.
3. Copy the application's **Audience (AUD) tag**:
   `npx wrangler secret put CF_ACCESS_AUDIENCE --env production`
4. Set `CF_ACCESS_TEAM_DOMAIN` in wrangler.jsonc to `<your-team>.cloudflareaccess.com`.
5. Public images: add a **second** self-hosted application for exactly
   `arabsstartups.com/_emdash/api/media/file/*` with a **Bypass → Everyone** policy.
   This path only serves uploaded editorial media (EmDash refuses backup keys
   there). Do not bypass any other `/_emdash` path.

The site also checks the Access token itself on every `/_emdash` and
`/newsroom` request (src/middleware/outer.ts). If step 2 is ever misconfigured,
those paths answer `403` instead of opening up.

## 4. Remaining secrets

```bash
npx wrangler secret put EMDASH_ENCRYPTION_KEY --env production   # value from: npm run secrets:generate
npx wrangler secret put RESEND_API_KEY --env production          # optional: enables email replies/alerts
```

Store `EMDASH_ENCRYPTION_KEY` in the company password manager too. Without it,
encrypted CMS settings cannot be read after a restore.

Email: verify `arabsstartups.com` in Resend, keep `MAIL_FROM` on that domain and
point `MAIL_REPLY_TO` at a mailbox that really receives mail (for example via
Cloudflare Email Routing). Replies to that mailbox do **not** appear in the
newsroom inbox — the inbox holds website form messages only.

## 5. Deploy staging, test, then production

```bash
npm ci
npm run check                 # type check + unit tests + build
npm run test:e2e              # browser tests against local dev
npm run deploy:staging        # builds for staging, runs safety checks, deploys
```

`scripts/predeploy.mjs` refuses to deploy placeholder values, Turnstile TEST
keys, an empty hostname list, or the local-dev configuration, and deletes the
local `.dev.vars` copy from the build output.

On staging: sign in through Access, publish a test article, post a comment,
approve it, reply, send a contact message, reply to it, export, delete. Then:

```bash
npm run deploy:production
```

## 6. First sign-in (bootstrap) — do this immediately after the first deploy

1. Access policy contains **only the owner's email** at this point.
2. The owner opens `https://arabsstartups.com/_emdash/admin`, signs in with the
   emailed code and completes the setup screen. The first account becomes Admin.
3. Add the **backup admin's** email to the Access policy; they sign in once
   (they start as Contributor); the owner raises them to Admin in
   CMS → Users.
4. Only then add editors and contributors (see OPERATIONS.md).
5. Settings → General: confirm the site URL is `https://arabsstartups.com`.
6. After a week on HTTPS without problems, consider adding `preload` to HSTS
   (src/lib/security/headers.ts) and submitting the domain to the preload list.

Sources: [Cloudflare One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/),
[Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/),
[Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[EmDash on Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/).
