# Runbook — first production setup

There is one environment: **production** (`arabsstartups.com`). There is no
staging site. Automated tests run on a laptop and in GitHub Actions against
separate, throwaway test data. Manual checks happen on the live site while it
is still locked behind sign-in (§4 step 6, §8).

Everything here needs the company's own Cloudflare account. Nothing in this
repository can create accounts, buy plans or change DNS for you.
Keep Arabs Startups fully separate from any other company's accounts,
billing, repositories and mailboxes.

## 0. Before you start

| You need | Notes |
|---|---|
| Cloudflare account owned by Arabs Startups, with two-factor sign-in | Workers **Paid** plan (~$5/month): Workers & Pages → Plans. Free has a 10 ms CPU limit per request, too little for this site. R2 also needs a payment method on file. |
| `arabsstartups.com` active on that account | The domain can stay registered anywhere; its nameservers must point to Cloudflare. |
| A GitHub repository owned by Arabs Startups | Private is the simple default: see [CI_CD.md §3](CI_CD.md#3-before-you-start-pick-the-github-plan). |
| MFA on every admin mailbox, Cloudflare and GitHub account | Email one-time PIN is only as safe as the mailbox. |
| Node 24 LTS (from nodejs.org) | Same version as CI. Then run `npm ci` in the project folder. |

Optional: Manage Account → Billing → Budget alerts → alert at $10.

## 1. DNS: clear the old parking records

Cloudflare → `arabsstartups.com` → DNS → Records.

- Delete the **A**, **AAAA** and **CNAME** records named `arabsstartups.com`
  (shown as `@`) and `www`. They point at the registrar's parking page. The
  first deploy creates the site's own records, and refuses while these exist.
- **Keep** the **MX** and **TXT** records. They carry the company email.

Undo: add the deleted records back with the same values.

## 2. Create the resources

```bash
npx wrangler login                                        # browser opens: choose Allow
npx wrangler d1 create arabsstartups-prod
npx wrangler r2 bucket create arabsstartups-media-prod
npx wrangler r2 bucket create arabsstartups-backups      # PRIVATE — never give it a public domain
```

Add the printed `database_id` to `env.production` → `d1_databases` in
`wrangler.jsonc`. `scripts/predeploy.mjs` refuses to deploy without it, because
a deploy with no id could create a new, empty database.

## 3. Turnstile (spam protection)

1. Cloudflare dashboard → Turnstile → Add widget → name `Arabs Startups`,
   hostnames `arabsstartups.com` and `www.arabsstartups.com`, mode Managed.
2. Put the **site key** in `PUBLIC_TURNSTILE_SITE_KEY` (`env.production.vars`).
3. Store the **secret key**: `npx wrangler secret put TURNSTILE_SECRET_KEY --env production`.
4. Keep `TURNSTILE_ALLOWED_HOSTNAMES` set to the real hostnames (strict checks).

## 4. Cloudflare Access (staff sign-in with an emailed code)

1. Open Zero Trust. On first use, pick the team name `arabsstartups` and the
   Free plan. If that name is taken, set `CF_ACCESS_TEAM_DOMAIN` in
   `wrangler.jsonc` to `<your-team>.cloudflareaccess.com`.
2. Zero Trust → Integrations → Identity providers → **Add new identity
   provider** → **One-time PIN**. (A new Zero Trust organisation does not add
   it automatically.)
3. Zero Trust → Access controls → Applications → **Create new application** →
   **Self-hosted and private** → **Add public hostname**:
   - Name: `Arabs Startups — staff`
   - Hostnames and paths: `arabsstartups.com/_emdash/*`, `arabsstartups.com/newsroom/*`,
     `www.arabsstartups.com/_emdash/*`, `www.arabsstartups.com/newsroom/*`
   - Login method: One-time PIN only (untick every other identity provider)
   - Session duration: 8 hours (or shorter)
   - Policy **Allow — named staff**: *Include → Emails →* the named addresses only.
     At first, only the owner's email. Never use "Everyone", never an `@domain` rule.
4. Copy the application's **Audience (AUD) tag**:
   `npx wrangler secret put CF_ACCESS_AUDIENCE --env production`
5. Public images: add a **second** self-hosted application for exactly
   `arabsstartups.com/_emdash/api/media/file/*` (and the `www.` twin) with a
   **Bypass → Everyone** policy. This path only serves uploaded editorial media
   (EmDash refuses backup keys there). Do not bypass any other `/_emdash` path.
6. **Pre-launch lock**: add a **third** self-hosted application named
   `Arabs Startups — pre-launch lock` for the whole hostnames `arabsstartups.com`
   and `www.arabsstartups.com` (no path), with the same **Allow — named staff**
   policy. Until launch day every page asks for the emailed code, so test
   content and draft legal pages stay private. Access uses the most specific
   match, so steps 3 and 5 still apply to their paths. Delete it on launch day (§8).

The site also checks the Access token itself on every `/_emdash` and
`/newsroom` request (src/middleware/outer.ts). If step 3 is ever misconfigured,
those paths answer `403` instead of opening up.

## 5. Remaining secrets and email

```bash
npm run secrets:generate                                          # copy the key into the password manager first
npx wrangler secret put EMDASH_ENCRYPTION_KEY --env production   # paste the key
npx wrangler secret put RESEND_API_KEY --env production          # optional: enables email replies/alerts
```

Run every `wrangler secret put` in your own Terminal window: it must stop and
ask for the value. (Run without a prompt, it can store an empty secret.)
If Wrangler asks whether to create the Worker `arabsstartups`, answer yes.
Paste secret values only into these prompts, never into chat, email or files.
Check the names (values are never shown): `npx wrangler secret list --env production`
must list `CF_ACCESS_AUDIENCE`, `EMDASH_ENCRYPTION_KEY` and `TURNSTILE_SECRET_KEY`.
Without `EMDASH_ENCRYPTION_KEY`, encrypted CMS settings cannot be read after a
restore, so the password-manager copy matters.

Email:

- Resend: add the domain `arabsstartups.com` and add the DNS records it shows.
  Its records sit on the `send.` subdomain and a DKIM name, so existing
  company email keeps working. Keep `MAIL_FROM` on that domain.
- `MAIL_REPLY_TO` (`hello@arabsstartups.com`) must be a real mailbox. If the
  domain already has email (MX records), create `hello@` at that provider and
  do **not** turn on Cloudflare Email Routing: it replaces the MX records. Use
  Email Routing only for a domain with no email yet.
- Replies to that mailbox do **not** appear in the newsroom inbox — the inbox
  holds website form messages only.

## 6. First deploy (from the owner's laptop)

```bash
npm ci
npm run check                 # lint + type check + unit tests + build
npm run test:e2e              # browser tests against local dev
npm run deploy:production     # builds, runs safety checks, deploys
npm run smoke -- https://arabsstartups.com   # checks the live site
```

This first deploy creates the Worker and its custom domains, so it runs from
the owner's laptop. Later deploys can stay on the laptop or run from GitHub
Actions: see [CI_CD.md](CI_CD.md).

`scripts/predeploy.mjs` refuses to deploy placeholder values, Turnstile TEST
keys, an empty hostname list, a missing database id, or the local-dev
configuration, and deletes the local `.dev.vars` copy from the build output.
While the pre-launch lock is on, the smoke test expects every path to ask for
sign-in.

Every deploy goes straight to the live site. If one breaks it:
`npx wrangler rollback --name arabsstartups`.

## 7. First sign-in (bootstrap) — do this immediately after the first deploy

1. Access policies contain **only the owner's email** at this point.
2. The owner opens `https://arabsstartups.com/_emdash/admin`, signs in with the
   emailed code and completes the setup screen. The first account becomes Admin.
3. Add the **backup admin's** email to the staff and pre-launch policies; they
   sign in once (they start as Contributor); the owner raises them to Admin in
   CMS → Users.
4. Only then add editors and contributors (see OPERATIONS.md).
5. Settings → General: confirm the site URL is `https://arabsstartups.com`.

## 8. Test, then launch

1. On the locked live site: publish a test article, post a comment, approve
   it, reply, send a contact message, reply to it, export, delete. Then delete
   the test content.
2. Replace the sample posts with real articles. Publish the policy pages only
   after legal review.
3. Launch: Zero Trust → Access → Applications → delete
   `Arabs Startups — pre-launch lock`.
4. `npm run smoke -- https://arabsstartups.com` — now the home page must load with its security headers and
   every private area must stay closed.
5. After a week on HTTPS without problems, consider adding `preload` to HSTS
   (src/lib/security/headers.ts) and submitting the domain to the preload list.

Sources: [Cloudflare One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/),
[Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/),
[Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[EmDash on Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/).
