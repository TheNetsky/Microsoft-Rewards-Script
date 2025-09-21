# Security incidents and resolutions

This guide explains how the bot detects security-related issues, what it does automatically, and how you can fix them.

Security check by @Light

---

<div id="recovery-email-mismatch"></div>

## Recovery email mismatch

### Symptoms
- During Microsoft login, the page shows a masked recovery email like `ko*****@sfr.fr` that doesn’t match your expected recovery email (first two letters + domain).

### What the bot does
- Halts all automation for the current account (leaves the page open for manual action).
- Sends a strong alert to all channels and engages a global standby (no further accounts are processed).
- Repeats terminal reminders every 5 minutes until you intervene.

### Likely causes
- The recovery email was changed by someone else (possible account takeover).
- You recently changed the recovery email yourself but didn’t update `recoveryEmail` in `src/accounts.json`.

### How to fix
1. Manually verify the account security in your Microsoft Account settings.
2. If you changed the recovery email yourself, update `recoveryEmail` in `src/accounts.json` to match the first two letters and domain.
3. Change the password and review recent sign-in activity if you suspect compromise.
4. When you’re done, restart the bot to resume normal operation.

### Prevention
- Keep `recoveryEmail` in `src/accounts.json` up to date.
- Use strong unique passwords and MFA.

---

<div id="we-cant-sign-you-in-blocked"></div>

## We can’t sign you in (blocked)

### Symptoms
- Microsoft presents a page titled “We can’t sign you in” during login.

### What the bot does
- Stops automation and leaves the page open for manual recovery.
- Sends a strong alert with @everyone and engages a global standby to avoid processing other accounts.

### Likely causes
- Temporary lock, rate limiting, or a security check from Microsoft.
- Account restrictions or a ban related to unusual activity.

### How to fix
1. Complete any verification challenges (SMS code, authenticator, etc.).
2. If blocked repeatedly, pause activity on this account for 24–48h and reduce concurrency.
3. Check proxies, ensure consistent IP/country, and avoid frequent credential retries.
4. If you suspect a ban, review Microsoft policies and appeal if applicable.

### Prevention
- Respect human-like schedules and limits (see humanization settings in config).
- Avoid running too many accounts or frequent retries from the same IP.

---

## How links work
When an incident is detected, the bot opens this page directly to the relevant section for quick guidance.
