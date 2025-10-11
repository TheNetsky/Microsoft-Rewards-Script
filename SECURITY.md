# 🔐 Security & Privacy Policy# Security & Privacy Guidelines# Security & Privacy Policy



<div align="center">



**Your data, your control — transparency first**This document describes how the Microsoft Rewards Script V2 handles data, the assumptions we make about your environment, and how to report security concerns. The codebase runs entirely under your control; there is no built-in telemetry or remote service component.Hi there! 👋 Thanks for caring about security and privacy — we do too. This document explains how this project approaches data handling, security practices, and how to report issues responsibly.



This document explains how the Microsoft Rewards Script handles your information,  

what we do (and don't do) with it, and how to keep your setup secure.

---## TL;DR

</div>



---

## Data Flow Summary- We do not collect, phone-home, or exfiltrate your data. No hidden telemetry. 🚫📡

## 🎯 TL;DR — The Quick Version

- Your credentials stay on your machine (or in your container volumes). 🔒

| Topic | What You Need to Know |

|:------|:----------------------|- Configuration is loaded from local files (`src/config.jsonc`, `src/accounts.json`) or environment variables you supply.- Sessions/cookies are stored locally to reduce re-login friction. 🍪

| **📡 Data Collection** | ❌ **None** — No telemetry, no phone-home, no tracking |

| **🔒 Credentials** | ✅ Stored **locally only** in `src/accounts.json` or environment variables |- The automation layer drives Playwright browsers to interact with Microsoft Rewards. No other network destinations are contacted unless you configure outbound notifications.- Use at your own risk. Microsoft may take action on accounts that use automation.

| **🍪 Sessions** | ✅ Saved **on your machine** to avoid repeated logins |

| **🔔 Webhooks** | ⚠️ Optional — **You control** what gets sent where |- Diagnosed artifacts (logs, screenshots, HTML snapshots) are written to local folders within the repository.

| **🐳 Docker** | ✅ Read-only mounts, no data leaves the container |

| **⚖️ Terms of Service** | ⚠️ Automation **may violate** Microsoft's ToS — use at your own risk |## What this project does (and doesn’t)



---We do not collect or transmit your credentials, points totals, or activity history. All state remains on the host executing the script.



## 🔍 What This Script DoesThis is a local automation tool that drives a browser (Playwright) to perform Microsoft Rewards activities. By default:



This is a **local automation tool** that drives a browser (Playwright) to complete Microsoft Rewards activities on your behalf.---



### ✅ What it does:- It reads configuration from local files (e.g., `src/config.jsonc`, `src/accounts.json`).

- Reads configuration from local files (`src/config.jsonc`, `src/accounts.json`)

- Stores session data (cookies, fingerprints) locally under `src/browser/`## Stored Data- It can save session data (cookies and optional fingerprints) locally under `./src/browser/<sessionPath>/<email>/`.

- Optionally sends notifications to endpoints **you configure**

- Saves diagnostic logs and screenshots to `reports/` when troubleshooting- It can send optional notifications/webhooks if you enable them and provide a URL.



### ❌ What it does NOT do:| Item | Location | Notes |

- Collect or transmit your data to any third-party service by default

- Include any hidden telemetry or analytics|------|----------|-------|It does not:

- Store credentials anywhere except where you specify

- Run background processes you don't know about| Account credentials | `src/accounts.json` or environment variables | Keep this file out of source control. Use `.gitignore` and restrict file permissions. |



---| Configuration | `src/config.jsonc` | Comment-friendly JSONC; may contain secrets (webhook URLs, proxies). |- Send your accounts or secrets to any third-party service by default.



## 📦 Where Your Data Lives| Sessions & fingerprints | `src/browser/<sessionPath>/` | Contains cookies and optional device fingerprints used for continuity. Safe to delete if you want fresh sessions. |- Embed any “phone-home” or analytics endpoints.



| Data Type | Location | Purpose | Security Notes || Diagnostics | `reports/` (when enabled) | Screenshots, HTML, and logs captured for debugging. Review before sharing. |- Include built-in monetization, miners, or adware. 🚫🐛

|:----------|:---------|:--------|:--------------|

| **🔑 Credentials** | `src/accounts.json` or env vars | Login automation | **Keep out of Git!** Add to `.gitignore` |

| **⚙️ Configuration** | `src/config.jsonc` | Runtime settings | May contain webhook URLs — treat as sensitive |

| **🍪 Sessions** | `src/browser/<sessionPath>/` | Persist logins | Cookies + fingerprints — delete to reset |When running inside Docker, the compose file mounts `./src/accounts.json`, `./src/config.jsonc`, and `./sessions` as read-only or persistent volumes. No data leaves those mounts unless you explicitly configure additional outputs.## Data handling and storage

| **📊 Reports** | `reports/` folder | Diagnostics | Screenshots/logs — review before sharing |

| **🐳 Docker volumes** | Container mounts | Same as above | Read-only where possible |



------- Accounts: You control the `accounts.json` file. Keep it safe. Consider environment variables or secrets managers in CI/CD.



## 🔐 Keeping Your Setup Secure- Sessions: Cookies are stored locally to speed up login. You can delete them anytime by removing the session folder.



### 1️⃣ **Protect Your Credentials**## Credentials & Secrets- Fingerprints: If you enable fingerprint saving, they are saved locally only. Disable this feature if you prefer ephemeral fingerprints.



```bash- Logs/Reports: Diagnostic artifacts and daily summaries are written to the local `reports/` directory.

# ✅ DO: Keep accounts.json out of version control

echo "src/accounts.json" >> .gitignore- Do not commit `src/accounts.json` or any file containing secrets. The sample `.gitignore` already excludes them; verify your local overrides do the same.- Webhooks/Notifications: If enabled, we send only the minimal information necessary (e.g., summary text, embed fields) to the endpoint you configured.



# ✅ DO: Use environment variables in CI/CD- If you use TOTP, the Base32 secret remains local and is only used to respond to Microsoft login challenges.

export ACCOUNTS_JSON='[{"email":"...","password":"..."}]'

- For CI or scripted deployments, prefer supplying credentials through environment variables (`ACCOUNTS_JSON` or `ACCOUNTS_FILE`).Tip: For Docker, mount a dedicated data volume for sessions and reports so you can manage them easily. 📦

# ❌ DON'T: Commit secrets to GitHub

# ❌ DON'T: Share accounts.json publicly- Rotate your Microsoft account passwords and webhook tokens periodically.

```

## Credentials and secrets

### 2️⃣ **Secure Your Configuration**

---

- **Webhook URLs** in `config.jsonc` are essentially passwords — anyone with the URL can post to your channel

- **TOTP secrets** stay local and are only used during Microsoft login challenges- Do not commit secrets. Use `src/accounts.json` locally or set `ACCOUNTS_JSON`/`ACCOUNTS_FILE` via environment variables when running in containers.

- **Proxy credentials** should be treated like passwords

## Notifications- Consider using OS keychains or external secret managers where possible.

### 3️⃣ **Session Management**

- TOTP: If you include a Base32 TOTP secret per account, it remains local and is used strictly during login challenge flows.

```bash

# Clear sessions if you suspect compromiseOptional integrations (Discord webhooks, NTFY, others you add) send only the payloads you configure. Review each provider’s privacy policy before enabling. Treat webhook URLs as shared secrets; they allow anyone with the URL to post into the channel.

rm -rf src/browser/sessions/*

## Buy Mode safety

# Or in Docker

docker compose down -v  # Removes volumes---

```

Buy Mode opens a monitor tab (read-only points polling) and a separate user tab for your manual actions. The monitor tab doesn’t redeem or click on your behalf — it just reads dashboard data to keep totals up to date. 🛍️

### 4️⃣ **Docker Best Practices**

## Recommended Practices

The included `compose.yaml` already:

- ✅ Uses read-only mounts for config files## Responsible disclosure

- ✅ Runs as non-root user where possible

- ✅ Limits container privileges- Run the script with least privilege. When using Docker, the provided compose file uses non-root execution and read-only mounts where possible.



Additional hardening:- Back up `sessions` only if you understand the contents (cookies, fingerprints). Delete the directory if you suspect compromise or want to reset state.We value coordinated disclosure. If you find a security issue:

```yaml

security_opt:- Enable the diagnostics bundle (`docs/diagnostics.md`) only when troubleshooting, and scrub artifacts before sharing.

  - no-new-privileges:true

cap_drop:- Keep dependencies updated (`npm run build` after `npm install`) to receive security patches for Playwright and transitive packages.1. Please report it privately first via an issue marked “Security” with a note to request contact details, or by contacting the repository owner directly if available.

  - ALL

```- Review `src/config.jsonc` comments; several fields (e.g., `humanization`, `retryPolicy`) influence how aggressively the automation behaves. Conservative defaults reduce the chance of account flags.2. Provide a minimal reproduction and version info.



### 5️⃣ **Regular Maintenance**3. We will acknowledge within a reasonable timeframe and work on a fix. 🙏



- 🔄 **Update dependencies:** `npm install && npm run build`---

- 🔑 **Rotate credentials** periodically

- 🧹 **Clean diagnostics:** Review and delete `reports/` contentsPlease do not open public issues with sensitive details before we have had a chance to remediate.

- 🔍 **Monitor logs** for suspicious activity

## Responsible Disclosure

---

## Scope and assumptions

## 🔔 Notifications & Privacy

If you discover a vulnerability in this project:

When you enable Discord webhooks or NTFY:

- The script sends **only the summary data you configure**- This project is open-source and runs on your infrastructure (local machine or container). You are responsible for host hardening and network policies.

- No credentials or session data is included

- The receiving service (Discord, NTFY, etc.) has its own privacy policy1. Privately reach out via a GitHub issue tagged “Security” requesting a direct contact channel, or message a maintainer through the listed GitHub profile if available.- Automation can violate terms of service. You assume all responsibility for how you use this tool.



**Control what gets sent:**2. Include a minimal reproduction, environment details, and the commit or release you tested.- Browsers and dependencies evolve. Keep the project and your runtime up to date.

```jsonc

// In config.jsonc3. Allow a reasonable window for investigation and remediation before publishing details.

"notifications": {

  "conclusionWebhook": {## Dependency and update policy

    "enabled": false,  // Disable to send nothing

    "url": "https://discord.com/api/webhooks/..."We appreciate coordinated disclosure and will credit contributions in the changelog when permitted.

  }

}- We pin key dependencies where practical and avoid risky postinstall scripts in production builds.

```

---- Periodic updates are encouraged. The project includes an optional auto-update helper. Review changes before enabling in sensitive environments.

---

- Use Playwright official images when running in containers to receive timely browser security updates. 🛡️

## 🛡️ Responsible Use Guidelines

## Scope & Assumptions

### ✅ **Good Practices**

- Run with least privileges (avoid root/admin unless needed)## Safe use guidelines

- Use environment variables for secrets in production

- Keep the repository and dependencies updated- The project runs on infrastructure you control. Host hardening, firewall rules, and secret storage are your responsibility.

- Review code changes before pulling updates

- Monitor account health regularly- Automation may violate Microsoft’s terms of service. Use at your own risk; the maintainers are not liable for account actions Microsoft may take.- Run with least privileges. In Docker, prefer non-root where feasible and set `no-new-privileges` if supported.



### ⚠️ **Risk Awareness**- Playwright and Chromium evolve quickly. Rebuild after dependency updates and monitor upstream advisories.- Limit outbound network access if your threat model requires it.

- **Microsoft ToS:** Automation violates their terms — accounts may be suspended

- **Rate limiting:** Aggressive settings increase ban risk- Rotate credentials periodically and revoke unused secrets.

- **Shared environments:** Don't run on untrusted machines

- **Network exposure:** Limit outbound connections if your threat model requires it---- Clean up diagnostics and reports if they contain sensitive metadata.



---



## 🐛 Vulnerability Reporting## Contact## Privacy statement



We value security research and coordinated disclosure.



### 📧 **How to Report**Open a GitHub issue labeled “Security” or reach out to the repository owner if you require a private communication channel. Provide as much diagnostic context as you can share safely.We don’t collect personal data. The repository does not embed analytics. Any processing done by this tool happens locally or against the Microsoft endpoints it drives on your behalf.



1. **Privately open a GitHub issue** labeled "Security"

2. **Include:**

   - Description of the vulnerabilityStay safe, and automate responsibly.If you enable third-party notifications (Discord, NTFY, etc.), data sent there is under your control and subject to those services’ privacy policies.

   - Steps to reproduce

   - Affected versions/commits

   - Suggested remediation (if any)## Contact

3. **Give us time** to investigate and patch before public disclosure

To report a security issue or ask a question, please open an issue with the “Security” label and we’ll follow up with a private channel. You can also reach out to the project owner/maintainers via GitHub if contact details are listed. 💬

### 🏆 **Recognition**

Security contributors will be credited in the changelog (with permission).— Stay safe and have fun automating! ✨


---

## 📋 Security Checklist

<details>
<summary><strong>🔒 Click to expand the complete security checklist</strong></summary>

- [ ] `src/accounts.json` is in `.gitignore`
- [ ] File permissions restrict access to sensitive configs
- [ ] Using TOTP for 2FA (reduces password-only exposure)
- [ ] Webhook URLs treated as secrets
- [ ] Sessions folder backed up securely (if at all)
- [ ] Running with minimal privileges
- [ ] Docker using read-only mounts where possible
- [ ] Dependencies updated regularly
- [ ] Diagnostic reports reviewed before sharing
- [ ] Monitoring for unusual account activity

</details>

---

## 📞 Contact

- **Security issues:** Open a GitHub issue with "Security" label
- **General support:** [Discord community](https://discord.gg/KRBFxxsU)
- **Bug reports:** [GitHub Issues](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)

---

<div align="center">

**Stay safe, automate responsibly** ✨

---

*Last updated: 2025*

</div>
