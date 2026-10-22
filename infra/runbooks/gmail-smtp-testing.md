# Gmail SMTP for local tester login

This is real email transport for a small development review, not production qualification. Resend and labelled sandbox mode remain available. No custom sending domain is needed for a personal Gmail sender. Google requires an eligible account with two-step verification and an app password; normal account passwords must never be used. Actual inbox delivery, quotas and spam placement need testing with the owner's account.

## Configure once on your computer

1. Stop the running app with Ctrl+C, then pull `main` into your existing checkout. Preserve local changes; do not reset files to force a pull. From the repository root run `npm.cmd ci` on Windows (`npm ci` on Linux/macOS).
2. If the root `.env` is missing, copy `.env.example` to `.env`. Never overwrite an existing `.env`. Enable Google two-step verification, generate a Google app password named Better Call Sir and store it only in the ignored root `.env` or a secret manager. Never put it in chat, screenshots, commits or frontend variables.
3. Add/update these values in that same root `.env`; replace the example address with the Google account that generated the app password. Remove any duplicate settings. Keep `APP_MODE=development`; leave `NODE_ENV` unset or development. Do not bypass the production release gate.

```dotenv
APP_MODE=development
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=youraccount@gmail.com
SMTP_FROM=youraccount@gmail.com
SMTP_PASSWORD=your_google_app_password
WEB_ORIGIN=http://localhost:3000
PUBLIC_APP_URL=http://localhost:3000
```

`SMTP_FROM` must equal `SMTP_USER`; it defaults to that user if omitted. Spaces in Google's grouped app password are removed internally. Port465 uses implicit TLS; port587 is supported only with `SMTP_SECURE=false` and mandatory STARTTLS. TLS certificate verification remains on. Other SMTP hosts, mismatched senders and plaintext configurations are rejected. `RESEND_API_KEY`, `EMAIL_FROM` and Resend webhook secrets are not required for SMTP. Existing SMTP rows retain their frozen sender; changing sender requires a fresh sign-in request, rather than silently changing an in-flight message.

4. Run these from the root after saving `.env`. Docker Desktop must be running for the local database. The migration adds SMTP to the existing provider allowlist and preserves historical deliveries.

```powershell
node scripts/development-key.mjs
npm.cmd run generate
docker compose -f infra/compose/development.yaml up -d --wait
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

The key helper generates missing local OTP/MFA encryption keys without replacing existing ones. In development, encrypted email content uses a derived key from `OTP_HASH_KEY` if `EMAIL_CONTENT_KEY` is not configured. Upgrade/restart API and worker together; do not leave a pre-SMTP worker consuming the queue after this migration. Restart API and worker after editing settings; setting SMTP options in a running process does not reload them. Root `npm run dev` still starts all three workspaces; the API workspace command is now portable on Windows. Scanner setup is still separately required for actual document uploads; see [development setup](development.md).

## Test seven to ten profiles

- Open `http://localhost:3000/login`. Use a real recipient address; Google can send to other people's supported email providers. Check inbox and spam. The interface must ask for the received code and must not reveal a development code in SMTP mode.
- For several independent accounts delivered into your own Gmail inbox, use unique plus addresses such as `youraccount+guardian1@gmail.com`, `youraccount+teacher1@gmail.com` and `youraccount+student1@gmail.com`. Use your actual Gmail username. These are separate platform identities; Gmail delivers them to the same inbox. Dots/case are not a recommended account-separation method.
- New ordinary OTP signup creates an unverified guardian account. Use `/onboarding/guardian` for the guardian flow, `/onboarding/teacher` for teacher application (including the existing role/ownership restrictions), or `/onboarding/independent-student` for an adult18+ student with the existing declarations/consent. Signing in to an existing email preserves its role and verification status. Receiving an email never grants guardian verification, teacher approval or staff privileges.
- Managed younger students still use the guardian-authorized invitation/device flow. Do not create an adult account or change a child's stored role to bypass that process. Staff MFA remains required. The development account picker still supports seeded personas separately; reserved addresses ending in `.test`, `.invalid` or `example.com` do not provide actual inboxes. Do not rewrite fixture identities into real user accounts.
- Test one session/profile at a time, signing out between identities or using separate browser profiles. Send requests sequentially. Existing limits include three new codes per recipient/minute, ten request and verification attempts per source IP/minute, five wrong attempts per code and five-minute expiry. Do not raise limits to get around a failed login; wait for the window. Exact request retries reuse the same delivery; a fresh request invalidates the prior code. Google may impose lower provider limits or block suspicious sending.
- Verify wrong code, expired code and reuse after success are rejected; reload/sign-out/re-login preserves the intended account. Never share genuine OTPs in test screenshots or logs.

## Delivery and failure behavior

SMTP acceptance is recorded as `ACCEPTED`/`SENT`, not proof of inbox delivery. Gmail SMTP has no signed Resend receipt stream and no provider idempotency guarantee. Its staff-visible reference is a local delivery UUID corresponding to the stable RFC message ID, not a Gmail provider receipt ID. Resend receipts cannot change SMTP state.

An uncertain send or interrupted SMTP lease becomes `UNKNOWN`; automatic and staff retries cannot send it again. Request a fresh code after the normal cooldown and use only the newest email. Failed authentication/configuration produces a generic email-unavailable error without exposing credentials. Explicit provider rejections are recorded as failures; an authorized staff review can retry an appropriate non-OTP failure. OTP retries require a new sign-in request.

If no email arrives, check SMTP settings/app-password eligibility, Google account alerts, spam, outbound port465/587 availability and the clock. Restart after changing settings. Never disable TLS validation or use your normal Gmail password. To return to offline synthetic testing, set `EMAIL_DELIVERY_MODE=sandbox` and restart API/worker.

Do not expose the development API or its synthetic session endpoints publicly. A restricted hosted review needs a separate protected testing configuration and infrastructure plan. Actual Gmail credentials and inbox qualification are not included in automated acceptance.
