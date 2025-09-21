# Security & Privacy Policy

Hi there! 👋 Thanks for caring about security and privacy — we do too. This document explains how this project approaches data handling, security practices, and how to report issues responsibly.

## TL;DR

- We do not collect, phone-home, or exfiltrate your data. No hidden telemetry. 🚫📡
- Your credentials stay on your machine (or in your container volumes). 🔒
- Sessions/cookies are stored locally to reduce re-login friction. 🍪
- Use at your own risk. Microsoft may take action on accounts that use automation.

## What this project does (and doesn’t)

This is a local automation tool that drives a browser (Playwright) to perform Microsoft Rewards activities. By default:

- It reads configuration from local files (e.g., `src/config.json`, `src/accounts.json`).
- It can save session data (cookies and optional fingerprints) locally under `./src/browser/<sessionPath>/<email>/`.
- It can send optional notifications/webhooks if you enable them and provide a URL.

It does not:

- Send your accounts or secrets to any third-party service by default.
- Embed any “phone-home” or analytics endpoints.
- Include built-in monetization, miners, or adware. 🚫🐛

## Data handling and storage

- Accounts: You control the `accounts.json` file. Keep it safe. Consider environment variables or secrets managers in CI/CD.
- Sessions: Cookies are stored locally to speed up login. You can delete them anytime by removing the session folder.
- Fingerprints: If you enable fingerprint saving, they are saved locally only. Disable this feature if you prefer ephemeral fingerprints.
- Logs/Reports: Diagnostic artifacts and daily summaries are written to the local `reports/` directory.
- Webhooks/Notifications: If enabled, we send only the minimal information necessary (e.g., summary text, embed fields) to the endpoint you configured.

Tip: For Docker, mount a dedicated data volume for sessions and reports so you can manage them easily. 📦

## Credentials and secrets

- Do not commit secrets. Use `src/accounts.json` locally or set `ACCOUNTS_JSON`/`ACCOUNTS_FILE` via environment variables when running in containers.
- Consider using OS keychains or external secret managers where possible.
- TOTP: If you include a Base32 TOTP secret per account, it remains local and is used strictly during login challenge flows.

## Buy Mode safety

Buy Mode opens a monitor tab (read-only points polling) and a separate user tab for your manual actions. The monitor tab doesn’t redeem or click on your behalf — it just reads dashboard data to keep totals up to date. 🛍️

## Responsible disclosure

We value coordinated disclosure. If you find a security issue:

1. Please report it privately first via an issue marked “Security” with a note to request contact details, or by contacting the repository owner directly if available.
2. Provide a minimal reproduction and version info.
3. We will acknowledge within a reasonable timeframe and work on a fix. 🙏

Please do not open public issues with sensitive details before we have had a chance to remediate.

## Scope and assumptions

- This project is open-source and runs on your infrastructure (local machine or container). You are responsible for host hardening and network policies.
- Automation can violate terms of service. You assume all responsibility for how you use this tool.
- Browsers and dependencies evolve. Keep the project and your runtime up to date.

## Dependency and update policy

- We pin key dependencies where practical and avoid risky postinstall scripts in production builds.
- Periodic updates are encouraged. The project includes an optional auto-update helper. Review changes before enabling in sensitive environments.
- Use Playwright official images when running in containers to receive timely browser security updates. 🛡️

## Safe use guidelines

- Run with least privileges. In Docker, prefer non-root where feasible and set `no-new-privileges` if supported.
- Limit outbound network access if your threat model requires it.
- Rotate credentials periodically and revoke unused secrets.
- Clean up diagnostics and reports if they contain sensitive metadata.

## Privacy statement

We don’t collect personal data. The repository does not embed analytics. Any processing done by this tool happens locally or against the Microsoft endpoints it drives on your behalf.

If you enable third-party notifications (Discord, NTFY, etc.), data sent there is under your control and subject to those services’ privacy policies.

## Contact

To report a security issue or ask a question, please open an issue with the “Security” label and we’ll follow up with a private channel. You can also reach out to the project owner/maintainers via GitHub if contact details are listed. 💬

— Stay safe and have fun automating! ✨
