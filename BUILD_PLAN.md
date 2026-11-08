# Arabs Startups — Website Build Plan

**Date:** 7 November 2026
**Owner:** Product (you)
**Source of truth:** the three files in `/design` (Content Brief, Technology Spec, "Slash" brand PDF)

This plan turns those three documents into a step-by-step build. It is written in plain language. The deep technical detail already lives in `design/Arabs_Startups_Technology_Implementation_Spec.md`; this file is the map on top of it.

---

## Status — 8 November 2026

| Phase | Code | Needs the company's Cloudflare account |
|---|---|---|
| 0 Setup | Done: repo layout, pinned stack, production config (the only environment), deploy safety check, CI/CD with quality and security checks and a post-deploy smoke test (`docs/CI_CD.md`) | Create account, D1/R2, add `arabsstartups.com` zone; GitHub org, plan choice and repo settings (`docs/CI_CD.md` §3–4) |
| A Prove it | Done and tested locally: EmDash CMS, Access sign-in wiring, origin-side token check, safe comment path | Turn on one-time PIN, create the Access app, set secrets |
| B The site | Done: Arabic + English pages, articles, episodes, search, RSS, sitemap, SEO, dark mode, mobile | — |
| C Engagement | Done: moderated comments, editorial replies, contact inbox, alerts, audit log, team page | Resend key for outgoing email (optional) |
| D Harden | Done: security tests, headers/CSP, retention, backup script, runbooks | Deploy production behind the pre-launch lock, first admin bootstrap, tests on the locked site, launch, restore drill |

How to finish launch: `docs/RUNBOOK.md`. Daily work, staff changes, backups: `docs/OPERATIONS.md`.
Security controls and their tests: `docs/SECURITY.md`. Pipeline setup and deploys: `docs/CI_CD.md`.

Deploys: default is a trusted laptop (`npm run deploy:production`), so no
Cloudflare token is stored in GitHub and §7 holds as written. Deploying from
GitHub Actions stays possible later; see `docs/CI_CD.md` §3.

---

## 1. What we are building (one line)

An Arabic-first news website about startups and founders, starting with Syria, where staff log in with an emailed code, publish articles, and readers can comment and send messages.

---

## 2. The pieces, in plain words

| Piece | What it is | Why we use it |
|---|---|---|
| Astro | The website frame | Fast, good for Google, built for reading sites |
| EmDash CMS | The staff writing desk | Ready-made editor, drafts, comments, roles — so we don't build one |
| Cloudflare | The place it all runs | Cheap, fast everywhere, strong security |
| Email code login | How staff sign in | A numeric code to their inbox. No passwords, no public sign-up |
| Comments + replies | Reader voice | Readers comment; editors approve and reply as the team |
| Contact inbox | Messages to staff | A private box for "send us a story" messages — we build this small part |

**Brand ("Slash"):** logo is `arabs/startups` with an indigo slash. Colors: near-black `#000012`, white `#FFFFFF`, indigo `#4B3BFF`. Fonts: Inter Tight (Latin), IBM Plex Sans Arabic (Arabic). Palette is marked provisional — confirm in brand Stage 2 before launch.

---

## 3. The build in five phases

```
Phase 0  Setup        accounts, domain, repo, brand colors confirmed
   │
Phase A  Prove it     EmDash runs, email login works, comments safe   (riskiest part first)
   │
Phase B  The site     Arabic pages, article look, news/stories/podcasts
   │
Phase C  Engagement   comments live, contact inbox, staff accounts
   │
Phase D  Harden+launch security tests, backups, switch the domain on
```

### Phase 0 — Setup (foundation)
- Create a **separate** Cloudflare account, GitHub repo, and billing for Arabs Startups. Do not mix with Hub63 or CloudSoftway.
- Use the owned domain `arabsstartups.com`.
- Confirm the final brand colors and the Arabic version of the name with the founders.
- **Done when:** empty project deploys to a test web address.

### Phase A — Secure proof-of-concept (do this first; it is the risky part)
- Install EmDash from the Cloudflare blog template; pin a tested version.
- Make email-code (OTP) login work for one named admin. Build the identity rules in section 7 from day one — this is the security spine, not a later add-on.
- Prove: a stranger cannot see admin pages or private data; a reader can view published articles only.
- Prove the server checks the signed login token and the person's role on every action — never a browser "logged-in" flag.
- Prove: readers can post comments **without** opening any admin door. (This is the one tricky security test the spec flags.)
- Test everyday editing under the paid Cloudflare plan (~$5/mo) to avoid slow-page errors.
- **Done when:** login, public viewing, blocked admin, and safe comments all pass in a real browser.

### Phase B — The public website
- Build Arabic-first, right-to-left, mobile-first layouts from the brand.
- Build the page types: Home, News, Founder Stories, Webinars & Podcasts, About, Contact.
- Article template with author, dates, categories, cover image, sharing, SEO.
- Embed videos/podcasts from YouTube/Spotify/LinkedIn — never upload big video files.
- **Done when:** a real Arabic article publishes and looks right on phone and desktop, with working search and sharing.

### Phase C — Engagement and team
- Turn on comments with moderation (nothing shows until an editor approves).
- Let editors reply publicly as "Arabs Startups Editorial Team."
- Build the small custom **contact inbox**: form → private box → editors read, sort, and reply by email.
- Add spam protection (Turnstile) checked on the server, not just in the browser.
- Set up accounts the secure way (section 7): 1 admin, 1 backup admin, 1 editor, contributors as needed.
- **Done when:** a reader comment is approved and replied to; a contact message arrives and gets answered; and the add/remove/promote steps in section 7 all work and are logged.

### Phase D — Harden and launch
- Security tests: no public drafts, spam blocked, no leaked emails, no privilege jumps.
- Run the full **access test** in section 7.5: a removed person loses access everywhere, including open sessions.
- Write the policy pages: Privacy, Terms, Editorial Policy, Corrections, Disclosure.
- Confirm the site shows **no Hub63 tie** anywhere and no data leaks between the two.
- Set up daily backups and rehearse a restore.
- Mobile Arabic walkthrough with the editorial team.
- Switch the real domain on; watch for errors and costs.
- **Done when:** the live site passes the full checklist in the spec (section 12).

---

## 4. Build order (no timeline)

This will be built by an agentic coding tool, so week-estimates do not apply. What matters is the **order**, not the calendar:

- **Phase A goes first and gates everything.** If the login and comment security does not hold, the stack choice changes before anything else is built.
- Phases B and C can run together once A passes.
- Phase D is last: the full security and launch checks.

Sequence, not dates.

---

## 5. Cost

About **$5/month** baseline (Cloudflare paid plan), plus domain renewal and possibly a small cost for a reply mailbox. Everything else sits inside free tiers at launch traffic. Treat free-tier as a test result, not a promise.

---

## 6. Decisions (settled 7 Nov 2026)

1. **Domain name** — `arabsstartups.com`. ✓
2. **Arabic brand name** — keep the Latin `arabs/startups` logo, add an Arabic tagline. (Founders may still swap in a different Arabic rendition.)
3. **Brand colors** — use the "Slash" PDF set now: `#000012`, `#FFFFFF`, `#4B3BFF`. Confirm at brand Stage 2. ✓
4. **Hub63 relationship** — **no link at all.** Arabs Startups is presented as fully independent. No Hub63 mention anywhere on the site. Keep accounts, billing, repo, and email fully separate. ✓
5. **Staff management** — simple two-step add/remove at launch (section 7); one-screen panel later only if needed. ✓
6. **Environments** (8 Nov 2026) — **production only, no staging.** Automated tests run on a laptop and in CI with separate throwaway data. The live site starts behind a pre-launch sign-in lock for manual checks, then opens on launch day. Bad deploys are undone with `wrangler rollback`. This replaces the spec's staging requirement. ✓

---

## 7. User and role management (security-critical)

This is the lock on the whole site. If it holds, a stranger can read but never run the newsroom. Every rule below is built in Phase A and tested again in Phase D.

### 7.1 The roles

| Role | Write | Publish | Approve/reply comments | Manage users & settings |
|---|---|---|---|---|
| Visitor | no | no | post a comment (held for review) | no |
| Contributor | own drafts | no | no | no |
| Author | own posts | own posts | per policy | no |
| Editor | all posts | yes | yes | no |
| Admin | all posts | yes | yes | yes |

Rule: give the **lowest role that still lets the person do their job.** Most people are Contributor or Author. Few are Editor. Admin is rare.

### 7.2 How staff sign in

```
staff → admin page → types email → Cloudflare checks the allow-list
     → emails a one-time numeric code → staff types code
     → Cloudflare signs a token → server checks token + role → in
```

No passwords. No public sign-up. The emailed code only proves the person can open that inbox — so the inbox itself must be locked down (see 7.6).

### 7.3 Adding a person (two steps)

1. An **admin** adds the person's email to the allow-list (Cloudflare Access).
2. The first time they sign in, the system makes them a **Contributor** (lowest role). An admin then raises them to Author or Editor if approved.

### 7.4 Removing a person (two steps, do both, same day)

1. Remove their email from the allow-list.
2. Turn off their account inside the CMS.
3. End any open sessions, then write it in the log.

### 7.5 The access test (must pass before launch)

- A removed person cannot reach any admin page or private data — **including a session they already had open.**
- A random email cannot become staff.
- A Contributor cannot publish; an Editor can, and can undo it.
- A non-admin cannot see users, change roles, or export contact messages.
- Every add, remove, role change, publish, and contact reply shows up in the log.

### 7.6 Hard security rules (do not skip)

- **Named emails only** on the allow-list. Never "allow everyone," never a whole-domain wildcard.
- **Every check runs on the server** — the signed login token and the role — never a browser flag.
- **MFA on every staff mailbox** and on every Cloudflare and GitHub admin account. The mailbox is the master key.
- **Two admins only** to start: one owner, one backup. Keep the admin count tiny.
- **Big actions need a fresh login** and a log entry: making a new admin, exporting contact messages, or changing the allow-list.
- **Short sessions.** Signing out works. Test it.
- **Secrets** (keys, tokens) live only in Cloudflare's runtime vault — never in code, GitHub, or the browser.
- **Separate test and live** sign-in setups and data. Never test on real accounts.
- The log never records the codes or secrets themselves.

### 7.7 First setup (bootstrap), in order

1. Make the first account the **named owner** only.
2. Confirm it has the Admin role, then finish setup right away.
3. Create one **backup admin**.
4. Turn off any broad email-domain access.

### 7.8 Later: the one-screen staff panel (optional)

The ready-made "invite by button" is off when email-code login is on — that is why add/remove is two steps. A single-screen add/remove can be built later. If built, it must use a **narrowly-scoped** Cloudflare key, check the person's role, protect against forged requests, touch only the allow-list, log every action, and have a safe two-step recovery. Treat it as its own project, not part of launch.

---

## 8. Code and architecture best practices

How the site is built, so it stays safe, fast, and easy to change. Written for whoever (or whatever) writes the code.

### 8.1 Shape of the project
- One repo. Clear folders: public site, CMS config, the small custom contact-inbox code, infrastructure config, and tests.
- Keep custom code **separate from EmDash core**, so CMS updates don't clash with our code.
- All settings come from the environment (`.env` / runtime vault), never hardcoded.

### 8.2 Keep it simple (fewest moving parts)
- Use EmDash's built-in features before writing new code. Build custom **only** for the contact inbox and any missing "reply as staff" screen.
- No new library without a clear reason. Check each one's license, pin its version, and keep it updated.
- Delete code that isn't used. Small surface = less to attack and less to maintain.

### 8.3 Clear boundaries (the architecture)
- **Public side and admin side are separate.** A reader's page can never reach admin data.
- The **access rule** (who may see or do what) lives in **one place** and is reused everywhere — never copy-pasted per page.
- **Reading is separate from writing.** Public pages read; only signed-in staff write, and every write is checked on the server.

### 8.4 Guard every input
- Check every form field on the server: type, length, allowed links. Never trust the browser.
- Comments and messages: strip HTML, block scripts, cap size and link count.
- Use parameterized database queries only — never glue user text into a query.

### 8.5 Tests, security-critical ones first
- Automated tests for: login, roles, comment safety, and contact-inbox privacy.
- One test must prove a stranger cannot reach admin or private data.
- Tests run automatically on every change, and a change can't go live if they fail.

### 8.6 Safe delivery
- Every change is reviewed before it reaches the live site.
- **Separate test and live data.** Tests use throwaway local data; only production exists in Cloudflare (decision 6).
- Ship in small steps; be able to undo fast.
- Secrets live only in Cloudflare's runtime vault.

### 8.7 Readable, lasting code
- Clear names, small functions, comments only where the "why" isn't obvious.
- Use TypeScript (typed code) so mistakes show up early.
- One agreed style, enforced automatically by a linter and formatter (tools that flag and fix style).

### 8.8 Fast and findable (it's a reading site)
- Pre-build pages where possible; quick first load on a phone.
- Images sized and served from R2 storage; no large video files on our server.
- Proper Arabic right-to-left, canonical URLs, sitemap, RSS feed, and page metadata for Google.

### 8.9 Works for everyone
- Keyboard and screen-reader friendly; strong contrast in both light and dark.

### 8.10 Watch it after launch
- Error and uptime monitoring, plus the audit log for privileged actions.
- Watch Cloudflare usage so limits are seen before they cause errors.

---

## 9. Hard rules (from the spec, do not skip)

- Arabic first, right-to-left, mobile first.
- Staff log in by emailed code only. No passwords. No public sign-up.
- Comments are moderated before they show. Reader emails are never public.
- Every security check runs on the server, not just the browser.
- Secrets (keys, tokens) live in Cloudflare runtime, never in code or GitHub.
- Separate test and live data. Never test on real records.
- Do not invent logos, partners, articles, figures, guests, or quotes. Use clearly-labeled placeholders during the build.

---

## 10. What "finished" looks like

The live Arabic site loads fast over HTTPS; readers browse and comment; staff log in by code, write, moderate, and reply; a contact inbox collects and answers messages; private data stays private; backups work; and the full checklist in the Technology Spec (section 12) passes.
