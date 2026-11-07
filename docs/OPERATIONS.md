# Operations — daily work, staff changes, backups, incidents

## Who can do what

| Role | Write | Publish | Contact inbox | Moderate / reply to comments | Users, audit, export |
|---|---|---|---|---|---|
| Visitor | — | — | send a message | post a comment (held for review) | — |
| Contributor (20) | own drafts | — | — | — | — |
| Author (30) | own posts | own posts | — | — | — |
| Editor (40) | all posts | all posts | read, triage, note, reply | yes | — |
| Admin (50) | all posts | all posts | everything + delete | yes | yes (CSV export needs a sign-in in the last 15 min) |

Keep two active Admins only: the owner and one backup.

## Adding a staff member (two steps)

1. Cloudflare Zero Trust → Access → *Arabs Startups — staff* → policy → add their
   **exact email**.
2. They sign in at `/_emdash/admin` (emailed code). They start as **Contributor**.
   An Admin raises the role in CMS → Users only when approved.

## Removing a staff member (same day, both steps)

1. Remove their email from the Access policy, then Zero Trust → My Team → Users →
   the person → **Revoke sessions**.
2. CMS → Users → the person → **Disable**. From the next click they are refused
   everywhere (CMS and newsroom), even with a session still open.

Every addition, role change, disable/enable and removal is detected and written
to the newsroom audit log (`/newsroom/audit`) within five minutes, wherever it
was made.

## Editorial workflow

Draft (Contributor) → set *Editorial review status* to **in_review** → an Editor
reviews and publishes → later edits are saved as a new draft until
*Publish changes*. Mark opinion, partner, sponsored and press-release content
with the *Content type* field; the site labels them for readers. Use the
*Corrections* field for public corrections. Uncheck *Sample content* (or
delete the sample) before launch.

Media: upload only licensed images. Videos and podcasts stay on YouTube /
Spotify / LinkedIn / Vimeo / Apple Podcasts / SoundCloud — paste the link into an
episode; other links are shown as plain links, never embedded.

## Comments

- Every visitor comment waits in **Pending**. Approve, mark spam or delete in
  `/newsroom/comments` (or CMS → Comments).
- Reply under an approved comment in `/newsroom/comments` → *Approved*. Replies
  are public at once, carry the **Editorial team** badge, and are audited.
- Commenter emails are never shown publicly.

## Contact inbox (`/newsroom/inbox`)

New → In progress → Responded → Closed (or Spam). Assign an owner, add internal
notes (never sent to anyone), reply by email (the reply quotes the original
message only). A person who asks for their data to be deleted: Admin opens the
message → *Delete permanently*. Messages are deleted automatically after
`INQUIRY_RETENTION_DAYS` (365 by default).

Each Editor/Admin can opt in to email alerts on the newsroom home page. Alerts
contain a link, never the message, at most one per 15 minutes.

## Backups and restore

- **Database:** D1 Time Travel restores to any minute in the last 30 days on
  Workers Paid (7 days on Free).
  `npx wrangler d1 time-travel restore arabsstartups-prod --timestamp=<ISO time>`
- **Daily off-site copy:** `node scripts/backup.mjs production` exports the
  database to `backups/` locally and uploads it to the private
  `arabsstartups-backups` bucket. Run it daily (cron on a trusted machine or a
  scheduled CI job with a scoped API token).
- **Media:** R2 objects are durable; for an off-site copy use
  `rclone sync` from `arabsstartups-media-prod` to private storage weekly.
- **Keys:** keep `EMDASH_ENCRYPTION_KEY` with the backups (password manager).
- **Restore drill — every quarter:** create a scratch D1 database, import the
  latest export (`npx wrangler d1 execute <scratch> --remote --file=<export.sql>`),
  point a staging deploy at it, check articles, comments and the inbox, then
  delete the scratch database. Write the date in the audit notes.

## Monitoring

- Uptime check: `https://arabsstartups.com/healthz` (no data, says ok/degraded).
- Logs: `npx wrangler tail --env production` (look for `[access-gate] denied`).
- Turn on Cloudflare Web Analytics and set `PUBLIC_CF_BEACON_TOKEN` (optional).
- Review monthly: Workers CPU errors, D1/R2 usage, mail volume (Resend free tier
  is 100 emails/day), the audit log, the staff list.

## Incident response (suspected account compromise)

1. Remove the email from Access and revoke its sessions.
2. Disable the user in CMS → Users.
3. If an Admin was affected: rotate `CF_ACCESS_AUDIENCE` (create a new Access
   application), `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`; review the audit log
   and CMS → Audit History for content changes; restore content with Time
   Travel if needed.
4. Note what happened and when in a short incident record.

## Updating the CMS

EmDash is pinned to an exact version in `package.json`. To update: read the
release notes, bump the version on a branch, `npm ci && npm run check &&
npm run test:e2e`, deploy to staging, test sign-in, comments and the inbox,
then production.
