<div align="center">

```
 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗
 ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗
 ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║
 ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║
 ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

# 🎯 Microsoft Rewards Automation — V2

**Automate your Microsoft Rewards daily tasks with intelligent browser automation**  
*Earn points while you sleep — naturally and safely* 💤

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

[![Version](https://img.shields.io/badge/Version-2.1.5-9B59B6?style=for-the-badge&labelColor=3498DB)](https://github.com/TheNetsky/Microsoft-Rewards-Script)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](./LICENSE)

</div>

---

## 🎯 What Does This Do?

This TypeScript-based automation **logs into your Microsoft Rewards account** and automatically completes daily activities to earn points:

<div align="center">

| Activity | Description | Points |
|----------|-------------|--------|
| 🔍 **Bing Searches** | Desktop & mobile browser searches | ~150 pts/day |
| 📅 **Daily Set** | Quizzes, polls, click-through tasks | ~30-50 pts |
| 🎁 **Promotions** | Bonus offers and promotional activities | Variable |
| 🃏 **Punch Cards** | Multi-step challenges for bonus points | Variable |
| ✅ **Daily Check-In** | Mobile app check-in | 5-15 pts |
| 📚 **Read to Earn** | Browse articles in Microsoft Start | Variable |

**Estimated daily earnings:** 150-300+ points per account (varies by region)

</div>

### 🤖 How It Works

1. **Launches real browser** via Playwright (Chrome-based)
2. **Logs in** to your Microsoft account (supports 2FA/TOTP)
3. **Navigates** to Microsoft Rewards dashboard
4. **Detects** available tasks (Daily Set, searches, etc.)
5. **Completes** each activity with human-like behavior
6. **Reports** total points earned

All actions simulate natural human behavior with **randomized delays, mouse movements, and scrolling** to avoid detection.

---

## 🧠 NEW: Intelligent Features (v2.1.5+)

### 🛡️ Risk-Aware Throttling
- **Real-time risk assessment** based on captchas, errors, timeouts
- **Dynamic delay adjustment** (1x → 4x when risk is high)
- **Automatic cool-down periods** after suspicious activity
- **Ban prediction** using ML-style pattern analysis

### 📊 Performance Dashboard
- Track **points/day**, **success rates**, **execution times**
- **Markdown reports** for easy analysis
- **Historical trends** and account health monitoring
- Lightweight JSON storage (no database needed)

### 🔍 Query Diversity Engine
- **Multi-source queries**: Google Trends, Reddit, News, Wikipedia
- **Pattern breaking**: Mix different topics across sessions
- **Smart deduplication** and query rotation
- **Reduces detection** by avoiding repetitive searches

### ✅ Config Validator
- **Pre-flight checks** before execution
- Detects **common mistakes** (empty passwords, invalid proxies, etc.)
- **Security warnings** (shared proxies, weak configs)
- **Helpful suggestions** for optimization

### 🧪 Dry-Run Mode
- **Test configurations** without touching accounts
- **Execution time estimates**
- **Debug issues** safely
- **Validate changes** before going live

---

## ⚡ Quick Start

### 🚀 Automated Setup (Recommended)

Run the setup wizard to get started in seconds:

```bash
# Windows
setup\setup.bat

# Linux/macOS/WSL
bash setup/setup.sh

# Universal (any platform)
npm run setup
```

The wizard will:
- ✅ Create `accounts.json` from your Microsoft credentials
- ✅ Install dependencies and build the project
- ✅ Optionally run your first automation

### 🛠️ Manual Setup

<details>
<summary><strong>Click to expand manual steps</strong></summary>

```bash
# 1. Configure accounts
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your email/password

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Run automation
npm start
```

</details>

---

## 📋 Core Features

<div align="center">

| Feature | Description |
|---------|-------------|
| **🔐 Multi-Account Support** | Run multiple Microsoft accounts in sequence or parallel |
| **🎭 Human-Like Behavior** | Randomized delays, mouse movements, scrolling patterns |
| **🔄 Session Persistence** | Saves cookies/fingerprints to avoid repeated logins |
| **📱 Desktop + Mobile** | Automates both desktop and mobile search quotas |
| **🧩 Activity Detection** | Automatically finds and completes all available tasks |
| **🎯 Smart Quiz Solver** | Handles polls, ABC quizzes, This or That, 4/8-option quizzes |
| **🛡️ Proxy Support** | Per-account proxy configuration (HTTP/HTTPS/SOCKS) |
| **⏰ Built-in Scheduler** | Set daily run times without external cron |
| **🔔 Notifications** | Discord webhooks + NTFY push alerts |
| **📊 Detailed Reports** | JSON reports with points earned per account |
| **🐳 Docker Ready** | Containerized deployment with headless browser |
| **💳 Buy Mode** | Manual redemption mode with live points monitoring |

</div>

---

## 🎮 Usage

### Basic Commands

```bash
# Run automation once
npm start

# Automated daily scheduler (see docs/schedule.md)
npm run start:schedule

# Manual redemption mode (passive monitoring while you shop)
npm start -- -buy your@email.com

# Docker deployment
docker compose up -d
```

### 🔧 Configuration

Edit `src/config.jsonc` to customize behavior:

```jsonc
{
  "browser": {
    "headless": false  // Set true for background operation
  },
  "execution": {
    "parallel": false,     // Run desktop+mobile at same time
    "runOnZeroPoints": false,  // Skip when no points available
    "clusters": 1      // Number of parallel account processes
  },
  "workers": {
    "doDailySet": true,
    "doDesktopSearch": true,
    "doMobileSearch": true,
    "doPunchCards": true
    // ... enable/disable specific tasks
  },
  "humanization": {
    "enabled": true,   // Add natural human-like delays and gestures
    "actionDelay": { "min": 500, "max": 2200 },
    "randomOffDaysPerWeek": 1  // Skip random days naturally
  }
}
```

**[📖 Full Configuration Reference →](./docs/config.md)**

---

## 📚 Documentation

### 🚀 Getting Started
- **[Installation & Setup](./docs/getting-started.md)** — Zero to first run
- **[Accounts Configuration](./docs/accounts.md)** — Add Microsoft accounts + 2FA
- **[Docker Deployment](./docs/docker.md)** — Container setup with headless mode

### ⚙️ Configuration & Advanced
- **[Configuration Guide](./docs/config.md)** — All `config.jsonc` options explained
- **[Scheduler Setup](./docs/schedule.md)** — Automated daily runs
- **[Humanization](./docs/humanization.md)** — Anti-detection behavior settings
- **[Proxy Configuration](./docs/proxy.md)** — Per-account proxy setup

### 🔔 Monitoring & Troubleshooting
- **[Notifications (Discord/NTFY)](./docs/ntfy.md)** — Get alerts on completion
- **[Diagnostics & Logs](./docs/diagnostics.md)** — Debug issues with screenshots
- **[Buy Mode](./docs/buy-mode.md)** — Manual redemption monitoring

**[📚 Complete Documentation Index →](./docs/index.md)**

---

## 🧠 Key Technical Details

### Architecture

- **Language:** TypeScript (Node.js 18+)
- **Browser:** Playwright + Rebrowser (anti-detection browser profiles)
- **Fingerprinting:** `fingerprint-generator` for device consistency
- **Session Management:** Persistent cookies + local storage
- **Search Queries:** Google Trends API + Bing autocomplete
- **Parallel Processing:** Node cluster for multi-account execution

### What Gets Automated

| Module | File | What It Does |
|--------|------|--------------|
| **Login** | `Login.ts` | Handles Microsoft auth flow, detects 2FA, supports TOTP |
| **Workers** | `Workers.ts` | Completes Daily Set, More Promotions, Punch Cards |
| **Activities** | `Activities.ts` | Routes to specific activity handlers (Quiz, Poll, etc.) |
| **Search** | `Search.ts` | Desktop/mobile Bing searches with natural query variations |
| **Quiz Handlers** | `activities/*.ts` | Poll, ABC, This or That, 4/8-option quizzes, URL rewards |

### Security Features

- ✅ **Ban Detection:** Heuristics to detect account suspension (stops automation)
- ✅ **Compromised Mode:** Leaves browser open if security challenge detected
- ✅ **Retry Logic:** Adaptive backoff for transient failures
- ✅ **Job State:** Tracks completed tasks to avoid duplicate work
- ✅ **Diagnostic Capture:** Saves screenshots + HTML on errors

---

## 🛡️ Safety & Best Practices

### ⚠️ Important Warnings

> **Use at your own risk.** Microsoft may suspend accounts that use automation tools.  
> This project is for **educational purposes only**. The authors are not responsible for account actions.

### 🎯 Recommendations

- ✅ **Use 2FA/TOTP** for added security (see [Accounts Guide](./docs/accounts.md))
- ✅ **Enable humanization** to add natural delays and behavior
- ✅ **Schedule runs 1-2x daily** (avoid hourly runs)
- ✅ **Set `runOnZeroPoints: false`** to skip unnecessary runs
- ✅ **Monitor diagnostics** for errors or detection signals
- ✅ **Use proxies** if running many accounts
- ⚠️ **Don't run on main account** — test with secondary accounts first

---

## 🤝 Community & Support

<div align="center">

[![Discord](https://img.shields.io/badge/💬_Discord_Support-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/KRBFxxsU)
[![GitHub Issues](https://img.shields.io/badge/🐛_Report_Bug-red?style=for-the-badge&logo=github)](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)

</div>

### 👥 Core Contributors

<table>
<tr>
<td align="center" width="33%">
<img src="https://github.com/TheNetsky.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/TheNetsky/">TheNetsky</a></strong><br />
<sub>Foundation Architect</sub>
</td>
<td align="center" width="33%">
<img src="https://github.com/mgrimace.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/mgrimace">Mgrimace</a></strong><br />
<sub>Active Developer + NTFY</sub>
</td>
<td align="center" width="33%">
<img src="https://github.com/LightZirconite.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/LightZirconite">Light</a></strong><br />
<sub>V2 Lead + Security</sub>
</td>
</tr>
</table>

### 🌟 All Contributors

<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" alt="Contributors" />
</a>

---

## 📝 License

This project is licensed under the **ISC License** — a permissive open-source license.

See [LICENSE](./LICENSE) for the full legal text.

### ⚠️ Important Disclaimers

**Please read [NOTICE](./NOTICE) for critical information:**

- ⚠️ **Terms of Service:** Using automation violates Microsoft's ToS
- ⚠️ **Account Risk:** May result in suspension or permanent ban
- ⚠️ **Educational Purpose:** This software is for learning purposes only
- ⚠️ **No Warranty:** Provided "AS IS" without any guarantees
- ⚠️ **No Liability:** Authors are not responsible for any consequences

**By using this software, you accept full responsibility for your actions.**

---

### 🛠️ Built With

**Core Technologies:**
- [Playwright](https://playwright.dev/) — Browser automation framework
- [Rebrowser](https://github.com/rebrowser/rebrowser-playwright) — Anti-fingerprinting extensions
- [TypeScript](https://www.typescriptlang.org/) — Type-safe JavaScript
- [Node.js](https://nodejs.org/) — JavaScript runtime

**Key Libraries:**
- [Cheerio](https://cheerio.js.org/) — Fast HTML parsing
- [Luxon](https://moment.github.io/luxon/) — Modern date/time handling
- [Axios](https://axios-http.com/) — HTTP client with proxy support
- [fingerprint-generator](https://www.npmjs.com/package/fingerprint-generator) — Browser fingerprint spoofing

---

<div align="center">

**Made with ❤️ by the community**  
*Happy automating — and happy earning! 🎉*

[![Star History](https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=social)](https://github.com/TheNetsky/Microsoft-Rewards-Script/stargazers)

![discord-avatar-128-ULDXD](https://github.com/user-attachments/assets/c33b0ee7-c56c-4f14-b177-851627236457)

</div>
