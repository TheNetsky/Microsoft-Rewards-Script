# ❓ Frequently Asked Questions (FAQ)

<div align="center">

**Quick answers to common questions**

[📚 Back to Documentation Hub](index.md)

</div>

---

## 📋 Table of Contents

- [General Questions](#general-questions)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Safety & Security](#safety--security)
- [Features & Functionality](#features--functionality)

---

## General Questions

### What is this project?

This is an automated script that completes Microsoft Rewards tasks to earn points. It uses Playwright to control a browser and perform searches, quizzes, and other activities automatically.

### Is this legal?

The script itself is legal software. However, using automation tools may violate Microsoft's Terms of Service, which could result in account suspension or ban. **Use at your own risk.**

### Will I get banned?

There's always a risk when using automation. The script includes humanization features and anti-detection measures to reduce risk, but we cannot guarantee account safety. Many users have used it successfully for extended periods, but results vary.

### How many points can I earn per day?

Typically 150-300 points per day per account, depending on available activities and your region. This varies by country and account type.

### How long does a run take?

Usually 5-15 minutes per account, depending on:
- Number of searches required
- Available daily activities
- Humanization delay settings
- Internet speed

---

## Installation & Setup

### What are the system requirements?

- **Node.js 20+** (version 22 recommended)
- **2 GB RAM minimum** (4 GB recommended)
- **Windows, macOS, or Linux**
- **Stable internet connection**

### Do I need to install a browser?

No! Playwright downloads Chromium automatically during setup. You don't need Chrome or Edge installed.

### Can I use this on a Raspberry Pi?

Yes, but performance may be limited. Headless mode is recommended for resource-constrained devices.

### How do I update to the latest version?

```bash
# Using Git
git pull origin main
npm install
npm run build

# Or run the update script
npm run setup
```

### Can I run this on a server 24/7?

Yes! Use Docker with the built-in scheduler for unattended operation. See the [Docker Guide](docker.md).

---

## Configuration

### Where do I put my Microsoft credentials?

In `src/accounts.jsonc`. Copy `src/accounts.example.jsonc` as a template.

⚠️ **Never commit this file to Git!** It should be in `.gitignore`.

### Do I need to enable 2FA/TOTP?

Not required, but **highly recommended** for:
- Automated login without manual code entry
- Better security
- 24/7 scheduler compatibility

See the [Accounts & 2FA Guide](accounts.md).

### How do I schedule automatic runs?

Enable the built-in scheduler in `src/config.jsonc`:

```jsonc
{
  "schedule": {
    "enabled": true,
    "time24": "09:00",
    "timeZone": "America/New_York"
  }
}
```

Then run: `npm run start:schedule`

See the [Scheduling Guide](schedule.md).

### Can I run multiple accounts?

Yes! Add multiple entries to `accounts.jsonc` and adjust the `clusters` setting:

```jsonc
{
  "execution": {
    "clusters": 2  // Run 2 accounts in parallel
  }
}
```

### Should I use headless mode?

- **Headless (`true`):** Background operation, required for Docker, lower resource usage
- **Non-headless (`false`):** See what the bot is doing, easier debugging

For production/automated runs, use headless mode.

---

## Troubleshooting

### The script won't start

1. **Check Node.js version:** `node --version` (must be 20+)
2. **Rebuild:** `npm run build`
3. **Check accounts.jsonc:** Valid JSON format?
4. **Review logs:** Look for error messages

### Login fails constantly

- **Wrong credentials:** Double-check email/password
- **2FA issues:** Verify TOTP secret is correct
- **Account locked:** Check Microsoft account security page
- **Recovery email mismatch:** Ensure recovery email matches account settings

See [Accounts Troubleshooting](accounts.md#troubleshooting).

### No points are earned

- **Already completed:** Tasks may be done for the day
- **Region restrictions:** Some activities vary by country
- **Account level:** New accounts may have limited activities
- **Ban/suspension:** Check account status on Microsoft Rewards

### Browser crashes or freezes

- **Increase timeout:** Adjust `browser.globalTimeout` in config
- **Reduce load:** Lower `clusters` value
- **Update dependencies:** `npm install`
- **Check system resources:** Ensure adequate RAM

### Docker container exits immediately

1. **Check logs:** `docker logs microsoft-rewards-script`
2. **Verify mounts:** Ensure `accounts.jsonc` exists and is mounted
3. **Check config:** `headless` must be `true` for Docker
4. **Review environment variables:** Timezone, cron settings

See [Docker Troubleshooting](docker.md#troubleshooting).

### "Command not found" errors

Ensure you're in the project directory and have run `npm install`.

---

## Safety & Security

### How can I minimize ban risk?

1. **Enable humanization:** Keep `humanization.enabled: true`
2. **Use reasonable delays:** Don't make searches too fast
3. **Run consistently:** Daily runs at similar times
4. **Start with one account:** Test before scaling
5. **Monitor for warnings:** Check logs regularly
6. **Use vacation mode:** Enable random off-days

See [Humanization Guide](humanization.md).

### Is my data safe?

- **No telemetry:** The script doesn't send data anywhere except Microsoft
- **Local storage:** Credentials stay on your machine
- **Open source:** You can audit the code

See [Security Policy](../SECURITY.md).

### Can Microsoft detect this?

The script uses advanced anti-detection techniques:
- Browser fingerprinting management
- Human-like mouse movements and delays
- Natural search patterns
- Randomized timing

However, **no detection evasion is foolproof**. Always use at your own risk.

### Should I use a proxy?

Not required for most users. Consider a proxy if:
- Running many accounts from one IP
- Want extra privacy layer
- Your IP is rate-limited

See [Proxy Guide](proxy.md).

---

## Features & Functionality

### What tasks does the script complete?

- ✅ Desktop searches (30+)
- ✅ Mobile searches (20+)
- ✅ Daily set activities (quizzes, polls)
- ✅ More activities (promotional offers)
- ✅ Punch cards (multi-day challenges)
- ✅ Daily check-in
- ✅ Read to Earn articles

Configure in `config.jsonc` under `workers`.

### Can I disable specific activities?

Yes! In `config.jsonc`:

```jsonc
{
  "workers": {
    "doDesktopSearch": true,
    "doMobileSearch": false,  // Disable mobile searches
    "doDailySet": true,
    "doMorePromotions": false  // Disable promotions
  }
}
```

### How does the query generation work?

The script uses multiple sources for search queries:
- **Google Trends:** Current trending topics
- **Reddit:** Popular posts from various subreddits
- **Local fallback:** Pre-defined queries

This creates diverse, natural-looking search patterns.

See [Query Diversity Engine](config.md#query-diversity-engine).

### What is "Buy Mode"?

A manual purchase assistant that monitors your points in real-time while you redeem rewards. Not fully automated—you control the redemption.

See [Buy Mode Guide](buy-mode.md).

### Can I get notifications?

Yes! The script supports:
- **Discord Webhooks:** Summary messages in Discord
- **NTFY:** Push notifications to mobile

See [Notifications Guide](conclusionwebhook.md) and [NTFY Guide](ntfy.md).

### What are "clusters"?

Clusters allow running multiple accounts in parallel using separate processes. Higher values = more accounts simultaneously (but more resource usage).

```jsonc
{
  "execution": {
    "clusters": 3  // Run 3 accounts at once
  }
}
```

### How does the risk management system work?

The script includes:
- **Ban detection:** Monitors for suspension indicators
- **Risk prediction:** ML-based ban probability scoring
- **Adaptive delays:** Automatically adjusts timing based on risk
- **Emergency stop:** Halts execution on critical risk

See [Configuration Guide](config.md#risk-management--security).

---

## Still Have Questions?

- 💬 **[Join our Discord](https://discord.gg/kn3695Kx32)** — Ask the community
- 📖 **[Documentation Hub](index.md)** — Browse all guides
- 🐛 **[GitHub Issues](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)** — Report problems
- 📧 **[Diagnostics Guide](diagnostics.md)** — Debug issues

---

<div align="center">

**Didn't find your answer?** [Ask on Discord](https://discord.gg/kn3695Kx32) or [open an issue](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)!

[← Back to Documentation](index.md)

</div>
