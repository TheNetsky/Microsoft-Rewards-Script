# Security & Privacy Guidelines# Security & Privacy Policy



This document describes how the Microsoft Rewards Script V2 handles data, the assumptions we make about your environment, and how to report security concerns. The codebase runs entirely under your control; there is no built-in telemetry or remote service component.Hi there! 👋 Thanks for caring about security and privacy — we do too. This document explains how this project approaches data handling, security practices, and how to report issues responsibly.



---## TL;DR



## Data Flow Summary- We do not collect, phone-home, or exfiltrate your data. No hidden telemetry. 🚫📡

- Your credentials stay on your machine (or in your container volumes). 🔒

- Configuration is loaded from local files (`src/config.jsonc`, `src/accounts.json`) or environment variables you supply.- Sessions/cookies are stored locally to reduce re-login friction. 🍪

- The automation layer drives Playwright browsers to interact with Microsoft Rewards. No other network destinations are contacted unless you configure outbound notifications.- Use at your own risk. Microsoft may take action on accounts that use automation.

- Diagnosed artifacts (logs, screenshots, HTML snapshots) are written to local folders within the repository.

## What this project does (and doesn’t)

We do not collect or transmit your credentials, points totals, or activity history. All state remains on the host executing the script.

This is a local automation tool that drives a browser (Playwright) to perform Microsoft Rewards activities. By default:

---

- It reads configuration from local files (e.g., `src/config.jsonc`, `src/accounts.json`).

## Stored Data- It can save session data (cookies and optional fingerprints) locally under `./src/browser/<sessionPath>/<email>/`.

- It can send optional notifications/webhooks if you enable them and provide a URL.

| Item | Location | Notes |

|------|----------|-------|It does not:

| Account credentials | `src/accounts.json` or environment variables | Keep this file out of source control. Use `.gitignore` and restrict file permissions. |

| Configuration | `src/config.jsonc` | Comment-friendly JSONC; may contain secrets (webhook URLs, proxies). |- Send your accounts or secrets to any third-party service by default.

| Sessions & fingerprints | `src/browser/<sessionPath>/` | Contains cookies and optional device fingerprints used for continuity. Safe to delete if you want fresh sessions. |- Embed any “phone-home” or analytics endpoints.

| Diagnostics | `reports/` (when enabled) | Screenshots, HTML, and logs captured for debugging. Review before sharing. |- Include built-in monetization, miners, or adware. 🚫🐛



When running inside Docker, the compose file mounts `./src/accounts.json`, `./src/config.jsonc`, and `./sessions` as read-only or persistent volumes. No data leaves those mounts unless you explicitly configure additional outputs.## Data handling and storage



---- Accounts: You control the `accounts.json` file. Keep it safe. Consider environment variables or secrets managers in CI/CD.

- Sessions: Cookies are stored locally to speed up login. You can delete them anytime by removing the session folder.

## Credentials & Secrets- Fingerprints: If you enable fingerprint saving, they are saved locally only. Disable this feature if you prefer ephemeral fingerprints.

- Logs/Reports: Diagnostic artifacts and daily summaries are written to the local `reports/` directory.

- Do not commit `src/accounts.json` or any file containing secrets. The sample `.gitignore` already excludes them; verify your local overrides do the same.- Webhooks/Notifications: If enabled, we send only the minimal information necessary (e.g., summary text, embed fields) to the endpoint you configured.

- If you use TOTP, the Base32 secret remains local and is only used to respond to Microsoft login challenges.

- For CI or scripted deployments, prefer supplying credentials through environment variables (`ACCOUNTS_JSON` or `ACCOUNTS_FILE`).Tip: For Docker, mount a dedicated data volume for sessions and reports so you can manage them easily. 📦

- Rotate your Microsoft account passwords and webhook tokens periodically.

## Credentials and secrets

---

- Do not commit secrets. Use `src/accounts.json` locally or set `ACCOUNTS_JSON`/`ACCOUNTS_FILE` via environment variables when running in containers.

## Notifications- Consider using OS keychains or external secret managers where possible.

- TOTP: If you include a Base32 TOTP secret per account, it remains local and is used strictly during login challenge flows.

Optional integrations (Discord webhooks, NTFY, others you add) send only the payloads you configure. Review each provider’s privacy policy before enabling. Treat webhook URLs as shared secrets; they allow anyone with the URL to post into the channel.

## Buy Mode safety

---

Buy Mode opens a monitor tab (read-only points polling) and a separate user tab for your manual actions. The monitor tab doesn’t redeem or click on your behalf — it just reads dashboard data to keep totals up to date. 🛍️

## Recommended Practices

## Responsible disclosure

- Run the script with least privilege. When using Docker, the provided compose file uses non-root execution and read-only mounts where possible.

- Back up `sessions` only if you understand the contents (cookies, fingerprints). Delete the directory if you suspect compromise or want to reset state.We value coordinated disclosure. If you find a security issue:

- Enable the diagnostics bundle (`docs/diagnostics.md`) only when troubleshooting, and scrub artifacts before sharing.

- Keep dependencies updated (`npm run build` after `npm install`) to receive security patches for Playwright and transitive packages.1. Please report it privately first via an issue marked “Security” with a note to request contact details, or by contacting the repository owner directly if available.

- Review `src/config.jsonc` comments; several fields (e.g., `humanization`, `retryPolicy`) influence how aggressively the automation behaves. Conservative defaults reduce the chance of account flags.2. Provide a minimal reproduction and version info.

3. We will acknowledge within a reasonable timeframe and work on a fix. 🙏

---

Please do not open public issues with sensitive details before we have had a chance to remediate.

## Responsible Disclosure

## Scope and assumptions

If you discover a vulnerability in this project:

- This project is open-source and runs on your infrastructure (local machine or container). You are responsible for host hardening and network policies.

1. Privately reach out via a GitHub issue tagged “Security” requesting a direct contact channel, or message a maintainer through the listed GitHub profile if available.- Automation can violate terms of service. You assume all responsibility for how you use this tool.

2. Include a minimal reproduction, environment details, and the commit or release you tested.- Browsers and dependencies evolve. Keep the project and your runtime up to date.

3. Allow a reasonable window for investigation and remediation before publishing details.

## Dependency and update policy

We appreciate coordinated disclosure and will credit contributions in the changelog when permitted.

- We pin key dependencies where practical and avoid risky postinstall scripts in production builds.

---- Periodic updates are encouraged. The project includes an optional auto-update helper. Review changes before enabling in sensitive environments.

- Use Playwright official images when running in containers to receive timely browser security updates. 🛡️

## Scope & Assumptions

## Safe use guidelines

- The project runs on infrastructure you control. Host hardening, firewall rules, and secret storage are your responsibility.

- Automation may violate Microsoft’s terms of service. Use at your own risk; the maintainers are not liable for account actions Microsoft may take.- Run with least privileges. In Docker, prefer non-root where feasible and set `no-new-privileges` if supported.

- Playwright and Chromium evolve quickly. Rebuild after dependency updates and monitor upstream advisories.- Limit outbound network access if your threat model requires it.

- Rotate credentials periodically and revoke unused secrets.

---- Clean up diagnostics and reports if they contain sensitive metadata.



## Contact## Privacy statement



Open a GitHub issue labeled “Security” or reach out to the repository owner if you require a private communication channel. Provide as much diagnostic context as you can share safely.We don’t collect personal data. The repository does not embed analytics. Any processing done by this tool happens locally or against the Microsoft endpoints it drives on your behalf.



Stay safe, and automate responsibly.If you enable third-party notifications (Discord, NTFY, etc.), data sent there is under your control and subject to those services’ privacy policies.


## Contact

To report a security issue or ask a question, please open an issue with the “Security” label and we’ll follow up with a private channel. You can also reach out to the project owner/maintainers via GitHub if contact details are listed. 💬

— Stay safe and have fun automating! ✨
