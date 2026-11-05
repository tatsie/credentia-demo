# Credentia — CE & licence compliance tracker

Node 20 + Express + SQLite (better-sqlite3), rendered on the server. No front-end framework, no CDN.

## Run locally
    npm install
    npm run seed          # demo data + DEMO_CREDENTIALS.md (chmod 600); `npm run seed:reset` to start over
    ./start.sh            # background server on http://127.0.0.1:3100 (logs: storage/server.log)
    ./test-e2e.sh         # end-to-end smoke test (login, RBAC, upload, CSRF, headers)

## Configuration (env)
| Var | Purpose |
|---|---|
| PORT / HOST | listen address (default 127.0.0.1:3000; Docker uses 0.0.0.0) |
| STORAGE_DIR | database + uploaded certificates + session key (default ./storage) — keep outside the web root, on a persistent disk |
| PUBLIC_URL | base URL used in reminder-email links |
| SESSION_SECRET | optional; otherwise generated into STORAGE_DIR/session.key |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM | real email delivery; without SMTP_HOST every email is recorded in the Outbox page + server log |
| DISPLAY_TZ | timezone for timestamps (default America/New_York) |
| SEED_MODE=admin-only + ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME | production bootstrap: credential catalog + one admin, no demo people |
| DEMO_MODE=1 | one-click demo sign-in buttons on /login (never for real client data) |
| DEMO_ADMIN_PASSWORD / DEMO_STAFF_PASSWORD | stable demo passwords across restarts |

## Deploy (Docker: Render, Fly.io, Railway, Azure App Service, any VPS)
    docker build -t credentia .
    docker run -p 3000:3000 -v credentia-data:/data -e PUBLIC_URL=https://ce.example.com credentia
Mount a persistent volume at /data. Put it behind HTTPS (cookies become `Secure` automatically behind a TLS proxy).

## Security
bcrypt (cost 12) password hashing · httpOnly SameSite=Lax session cookie (Secure over HTTPS), regenerated at login, 8 h rolling, server-side session store · synchronizer CSRF token on every POST (incl. multipart) · server-side role checks; staff can only read/write their own licences, CE entries and files (others return 404) · uploads: 10 MB max, PDF/PNG/JPG/WEBP verified by magic bytes + extension, random filenames, stored outside the web root with 0600 perms, streamed only to the owner or an admin, `nosniff` + sandbox CSP on images · login rate limit (20/15 min per IP) + per-account lockout (5 fails → 10 min) + constant-time failure path · helmet headers with strict CSP (no inline script/style), HSTS, frame-ancestors self · parameterised SQL everywhere · auto-escaping HTML templates · CSV export guarded against formula injection · audit log (logins, changes, file views).

## Compliance colours (firm RAG)
Per person-licence: **Green** = compliant · **Yellow** = licence held but renewal period / status not yet provided · **Red** = not in compliance, being worked toward. Colour can be set per licence (or left on Auto from hours & renewal). Shown on the admin matrix, licence lists, and staff view.

## Status confirmation (PCAOB / AICPA)
Staff confirm they have submitted CPE certificates and that their listed licences are accurate. Each confirmation is timestamped, stored, and written to the audit log. Admins see confirmation status on People and the Overview matrix.

## Export to CPE folder
Admin **Settings** holds the firm server path (default `Z:\Shared\Internal\CPE`). **Export to CPE folder** downloads a ZIP laid out as `<Person>/<Licence>/<certificate files>` plus `_checklist.csv` and a README — ready to unpack onto that share.

## Reminder logic
Hourly + on start-up: for each active licence, the most urgent un-sent threshold of 120/90/60/30 days before renewal is emailed once per cycle; after the renewal date, weekly until the date is updated. Admins are cc'd at 30 days and when overdue. Every send is in the Reminder log and Outbox. Admins can run the check or nudge one person manually.

Timing status: **Expired** past the renewal date · **Due soon** within 90 days, or hours/ethics outstanding within 180 days · otherwise **Current**. CE entries count toward a licence if completed within its cycle (cycle start → renewal date), either for one licence or for all of the person's licences.

Sample CPE rules in the seed (including state CPA boards and specialty credentials) are illustrative — confirm with each board / issuer. Marked in the catalog as “example rules — verify”.
