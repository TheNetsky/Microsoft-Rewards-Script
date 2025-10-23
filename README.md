<div align="center">

<!-- Epic Header -->
<img src="https://capsule-render.vercel.app/api?type=waving&height=300&color=gradient&customColorList=0,2,2,5,6,8&text=MICROSOFT%20REWARDS&fontSize=75&fontColor=fff&animation=twinkling&fontAlignY=38&desc=Intelligent%20Browser%20Automation&descSize=24&descAlignY=58" />

</div>

<br>

<div align="center">

<!-- Badges modernes -->
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<br>

![Version](https://img.shields.io/badge/v2.4.0-blue?style=for-the-badge&logo=github&logoColor=white)
![License](https://img.shields.io/badge/ISC-00D9FF?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=blue)
![Status](https://img.shields.io/badge/Active-00C851?style=for-the-badge)

<br><br>

<!-- Animated Description -->
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&duration=3000&pause=1000&color=00D9FF&center=true&vCenter=true&width=650&lines=Automate+Microsoft+Rewards+Daily+Tasks;Human-Like+Behavior+%E2%80%A2+Anti-Detection;Multi-Account+%E2%80%A2+Smart+Scheduling;150-300%2B+Points+Per+Day+Automatically" />

</div>

<br>

---

<div align="center">

### 📌 **Update Notice**

Recent updates changed the structure of `config.jsonc` and `accounts.jsonc` files (including extensions).

**If you see Git conflicts during `git pull` on these files:**

```bash
# Delete and fresh clone
rm -rf Microsoft-Rewards-Script
git clone -b v2 https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script

# Manually re-enter your settings in the new files
```

⚠️ Don't copy old config files directly—structure has changed. Re-enter your credentials and preferences manually.

This notice will remain for a few releases. Once we reach stable v2.5+, automatic updates will work smoothly again.

</div>

---

<br>

## What Does This Do?

**Automate your Microsoft Rewards daily activities with intelligent browser automation.**  
Complete searches, quizzes, and promotions automatically while mimicking natural human behavior.

<br>

### **Daily Earnings Breakdown**

| 🎯 Activity | 💎 Points | ⏱️ Time |
|:-----------|:---------|:--------|
| **Desktop Searches** | ~90 pts | 30 sec |
| **Mobile Searches** | ~60 pts | 20 sec |
| **Daily Set Tasks** | ~30-50 pts | 1-2 min |
| **Promotions & Punch Cards** | Variable | 30s-2min |
| **📊 TOTAL AVERAGE** | **150-300+ pts** | **3-5 min** |
</div>

<br>

## Quick Start

### **🚀 Automated Setup** (Recommended)

```bash
# Windows
setup\setup.bat

# Linux / macOS / WSL
bash setup/setup.sh

# Universal
npm run setup
```

**The wizard handles everything:**
- ✅ Creates `accounts.json` with your credentials
- ✅ Installs dependencies & builds project
- ✅ Runs first automation (optional)

<br>

### **🛠️ Manual Setup**

```bash
# 1. Clone repository
git clone -b v2 https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script

# 2. Configure accounts
cp src/accounts.example.jsonc src/accounts.json
# Edit accounts.json with your Microsoft credentials

# 3. Install & build
npm i

# 4. Run automation
npm start
```

<br>

## Intelligent Features

<table>
<tr>
<td width="50%" valign="top">

### 🛡️ **Risk-Aware System**
```
Real-time threat detection
├─ Monitors captchas & errors
├─ Dynamic delay adjustment (1x→4x)
├─ Automatic cool-down periods
└─ ML-based ban prediction
```

### 📊 **Performance Analytics**
```
Track everything
├─ Points earned per day
├─ Success/failure rates
├─ Historical trends
└─ Account health monitoring
```

</td>
<td width="50%" valign="top">

### 🔍 **Query Diversity Engine**
```
Natural search patterns
├─ Multi-source queries
├─ Pattern breaking algorithms
├─ Smart deduplication
└─ Reduced detection risk
```

### ✅ **Config Validator**
```
Pre-flight checks
├─ Detects common mistakes
├─ Security warnings
├─ Optimization suggestions
└─ Dry-run test mode
```

</td>
</tr>
</table>

<br>

## Usage Commands

```bash
# Run automation once
npm start

# Daily automated scheduler
npm run start:schedule

# Manual redemption mode (monitor points while shopping)
npm start -- -buy your@email.com

# Docker deployment
docker compose up -d

# Test configuration without executing
npm start -- --dry-run
```

<br>

## Configuration

Edit `src/config.jsonc` to customize behavior:

```jsonc
{
  "browser": {
    "headless": false  // Set true for background operation
  },
  "execution": {
    "parallel": false,           // Run desktop + mobile simultaneously
    "runOnZeroPoints": false,    // Skip when no points available
    "clusters": 1                // Parallel account processes
  },
  "workers": {
    "doDailySet": true,
    "doDesktopSearch": true,
    "doMobileSearch": true,
    "doPunchCards": true
  },
  "humanization": {
    "enabled": true,             // Natural human-like delays
    "actionDelay": { "min": 500, "max": 2200 },
    "randomOffDaysPerWeek": 1    // Skip random days naturally
  }
}
```

**[📖 Complete Configuration Guide →](./docs/config.md)**

<br>

## Core Features

<div align="center">

<table>
<tr>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/bot.png" width="80"/><br>
<b>Human-Like Behavior</b><br>
<sub>Randomized delays • Mouse movements<br>Natural scrolling patterns</sub>
</td>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/security-checked.png" width="80"/><br>
<b>Anti-Detection</b><br>
<sub>Session persistence • Fingerprinting<br>Proxy support</sub>
</td>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/user-group-man-man.png" width="80"/><br>
<b>Multi-Account</b><br>
<sub>Parallel execution • 2FA/TOTP<br>Per-account proxies</sub>
</td>
</tr>
<tr>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/artificial-intelligence.png" width="80"/><br>
<b>Smart Quiz Solver</b><br>
<sub>Polls • ABC Quiz • This or That<br>4/8-option quizzes</sub>
</td>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/clock.png" width="80"/><br>
<b>Built-in Scheduler</b><br>
<sub>Daily automation<br>No external cron needed</sub>
</td>
<td align="center" width="33%">
<img src="https://img.icons8.com/fluency/96/alarm.png" width="80"/><br>
<b>Notifications</b><br>
<sub>Discord webhooks • NTFY<br>Real-time alerts</sub>
</td>
</tr>
</table>

</div>

<br>

## Documentation

<div align="center">

| 📖 Getting Started | ⚙️ Configuration | 🔔 Monitoring |
|:------------------|:----------------|:-------------|
| [Installation & Setup](./docs/getting-started.md) | [Config Guide](./docs/config.md) | [Notifications](./docs/ntfy.md) |
| [Accounts Setup](./docs/accounts.md) | [Scheduler](./docs/schedule.md) | [Diagnostics](./docs/diagnostics.md) |
| [Docker Deployment](./docs/docker.md) | [Humanization](./docs/humanization.md) | [Buy Mode](./docs/buy-mode.md) |
| | [Proxy Configuration](./docs/proxy.md) | |

**[📚 Complete Documentation Index →](./docs/index.md)**

</div>

<br>

## Technical Architecture

<div align="center">

**Built with Modern Technologies**

<br>

<img src="https://skillicons.dev/icons?i=ts,nodejs,playwright,docker&theme=light&perline=4" />

</div>

<br>

**Core Modules:**

| Module | Purpose |
|--------|---------|
| `Login.ts` | Microsoft authentication flow with 2FA/TOTP support |
| `Workers.ts` | Completes Daily Set, Promotions, and Punch Cards |
| `Search.ts` | Desktop/mobile Bing searches with natural query variations |
| `Activities.ts` | Routes to specific activity handlers (Quiz, Poll, etc.) |
| `activities/*.ts` | Individual handlers for each reward type |

**Key Technologies:**
- [Playwright](https://playwright.dev/) — Browser automation framework
- [Rebrowser](https://github.com/rebrowser/rebrowser-playwright) — Anti-fingerprinting extensions
- [fingerprint-generator](https://www.npmjs.com/package/fingerprint-generator) — Device consistency
- [Cheerio](https://cheerio.js.org/) — Fast HTML parsing
- [Luxon](https://moment.github.io/luxon/) — Modern date/time handling

<br>

## Important Disclaimers

<div align="center">

### ⚠️ **USE AT YOUR OWN RISK** ⚠️

**Using automation violates Microsoft's Terms of Service.**  
Accounts may be **suspended or permanently banned**.

This project is for **educational purposes only**.

</div>

<br>

**Best Practices:**

✅ **DO:**
- Use 2FA/TOTP for security
- Enable humanization features
- Schedule 1-2x daily maximum
- Set `runOnZeroPoints: false`
- Test on secondary accounts first
- Monitor diagnostics regularly

❌ **DON'T:**
- Run on your main account
- Schedule hourly runs
- Ignore security warnings
- Use shared proxies
- Skip configuration validation

<br>

## Contributors

<div align="center">

### **Core Development Team**

<table>
<tr>
<td align="center">
<a href="https://github.com/TheNetsky/">
<img src="https://github.com/TheNetsky.png" width="100" style="border-radius: 50%;" /><br />
<sub><b>TheNetsky</b></sub><br>
<sub>🏗️ Foundation Architect</sub>
</a>
</td>
<td align="center">
<a href="https://github.com/mgrimace">
<img src="https://github.com/mgrimace.png" width="100" style="border-radius: 50%;" /><br />
<sub><b>Mgrimace</b></sub><br>
<sub>💻 Active Developer</sub>
</a>
</td>
<td align="center">
<a href="https://github.com/LightZirconite">
<img src="https://github.com/LightZirconite.png" width="100" style="border-radius: 50%;" /><br />
<sub><b>LightZirconite</b></sub><br>
<sub>🔐 V2+</sub>
</a>
</td>
</tr>
</table>

<br>

### **All Contributors**

<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" />
</a>

</div>

<br>

## Community & Support

<div align="center">

### **Need Help? Found a Bug?**

**Join our Discord community — we're here to help!**

<br>

[![Discord](https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KRBFxxsU)

<br>

**For bug reports and feature requests, please use Discord first.**  
GitHub Issues are also available for documentation and tracking.

<br>

[![GitHub Issues](https://img.shields.io/badge/GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)

</div>

<br>

> 💡 **Looking for enhanced builds?** Community-maintained versions with faster updates and advanced features may be available. Ask in our Discord for more info.

</div>

<br>

## License

<div align="center">

**ISC License** — Free and open source

See [LICENSE](./LICENSE) for details • [NOTICE](./NOTICE) for disclaimers

<br>

---

<br>

**⭐ Star this repo if you found it useful! ⭐**

<br>

![Stars](https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=social)

<br>

**Made with ❤️ by the open source community**

<img src="https://capsule-render.vercel.app/api?type=waving&height=120&color=gradient&customColorList=0,2,2,5,6,8&section=footer" />

</div>