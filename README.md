<div align="center"><div align="center">



<img src="https://capsule-render.vercel.app/api?type=waving&height=200&color=gradient&customColorList=0,2,2,5,6,8&text=MS%20REWARDS&fontSize=80&fontColor=fff&animation=twinkling&fontAlignY=40" /><!-- Epic Header -->

<img src="https://capsule-render.vercel.app/api?type=waving&height=300&color=gradient&customColorList=0,2,2,5,6,8&text=MICROSOFT%20REWARDS&fontSize=75&fontColor=fff&animation=twinkling&fontAlignY=38&desc=Intelligent%20Browser%20Automation&descSize=24&descAlignY=58" />

<br>

</div>

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)<br>

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)

<div align="center">

![Version](https://img.shields.io/badge/v2.2.3-blue?style=for-the-badge)

![License](https://img.shields.io/badge/ISC-00D9FF?style=for-the-badge)<!-- Badges modernes -->

![Stars](https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=blue)![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)

<br>![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**Automate Microsoft Rewards daily tasks**  

*Searches • Quizzes • Activities — ~150 points/day in 3 minutes*<br>



</div>![Version](https://img.shields.io/badge/v2.1.5-blue?style=for-the-badge&logo=github&logoColor=white)

![License](https://img.shields.io/badge/ISC-00D9FF?style=for-the-badge)

---![Stars](https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=blue)

![Status](https://img.shields.io/badge/Active-00C851?style=for-the-badge)

## ⚡ Quick Start

<br><br>

### **Easiest Way (Recommended)**

<!-- Animated Description -->

```bash<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&duration=3000&pause=1000&color=00D9FF&center=true&vCenter=true&width=650&lines=Automate+Microsoft+Rewards+Daily+Tasks;Human-Like+Behavior+%E2%80%A2+Anti-Detection;Multi-Account+%E2%80%A2+Smart+Scheduling;150-300%2B+Points+Per+Day+Automatically" />

# Windows

setup\setup.bat</div>



# Linux/macOS<br>

bash setup/setup.sh

``````

╔══════════════════════════════════════════════════════════════════════════════╗

**That's it!** The wizard will:║                          WHAT DOES THIS DO?                                  ║

- ✅ Create your `accounts.json`╚══════════════════════════════════════════════════════════════════════════════╝

- ✅ Install everything```

- ✅ Run your first automation

<div align="center">

---

**Automate your Microsoft Rewards daily activities with intelligent browser automation.**  

## 📚 DocumentationComplete searches, quizzes, and promotions automatically while mimicking natural human behavior.



**New here?** → [Getting Started Guide](./docs/getting-started.md)  <br>

**Docker setup?** → [Docker Guide](./docs/docker.md)  

**All docs** → [Complete Index](./docs/index.md)### **Daily Earnings Breakdown**



### Popular Guides| 🎯 Activity | 💎 Points | ⏱️ Time |

- [Accounts & 2FA Setup](./docs/accounts.md) — Add Microsoft accounts with TOTP|:-----------|:---------|:--------|

- [Scheduler](./docs/schedule.md) — Automate daily runs| **Desktop Searches** | ~90 pts | 30 sec |

- [Configuration](./docs/config.md) — Customize behavior| **Mobile Searches** | ~60 pts | 20 sec |

- [Notifications](./docs/conclusionwebhook.md) — Discord/NTFY alerts| **Daily Set Tasks** | ~30-50 pts | 1-2 min |

- [Humanization](./docs/humanization.md) — Natural behavior (anti-ban)| **Promotions & Punch Cards** | Variable | 30s-2min |

| **📊 TOTAL AVERAGE** | **150-300+ pts** | **3-5 min** |

---

</div>

## 🎯 What It Does

<br>

| Task | Points | Time |

|------|--------|------|```

| Desktop searches | ~90 pts | 30s |╔══════════════════════════════════════════════════════════════════════════════╗

| Mobile searches | ~60 pts | 20s |║                             QUICK START                                      ║

| Daily activities | ~30-50 pts | 1-2min |╚══════════════════════════════════════════════════════════════════════════════╝

| **Total** | **~150-200 pts** | **~3min** |```



### Key Features### **🚀 Automated Setup** (Recommended)

- 🤖 **Human-like behavior** — Random delays, mouse movements

- 🔐 **2FA/TOTP support** — Automated login```bash

- 📅 **Built-in scheduler** — Daily automation# Windows

- 🔔 **Notifications** — Discord webhooks, NTFY pushsetup\setup.bat

- 🌐 **Proxy support** — Per-account proxies

- 🐳 **Docker ready** — Container deployment# Linux / macOS / WSL

bash setup/setup.sh

---

# Universal

## 🔧 Basic Usagenpm run setup

```

```bash

# Run once**The wizard handles everything:**

npm start- ✅ Creates `accounts.json` with your credentials

- ✅ Installs dependencies & builds project

# Daily automation- ✅ Runs first automation (optional)

npm run start:schedule

<br>

# Docker

docker compose up -d### **🛠️ Manual Setup**



# Buy mode (manual purchases)```bash

npm start -- -buy your@email.com# 1. Clone repository

```git clone -b v2 https://github.com/TheNetsky/Microsoft-Rewards-Script.git

cd Microsoft-Rewards-Script

---

# 2. Configure accounts

## ⚙️ Configurationcp src/accounts.example.json src/accounts.json

# Edit accounts.json with your Microsoft credentials

Edit `src/config.jsonc`:

# 3. Install & build

```jsoncnpm i

{

  "humanization": {# 4. Run automation

    "enabled": true  // Natural behavior (recommended)npm start

  },```

  "schedule": {

    "enabled": true,<br>

    "time": "09:00",

    "timeZone": "America/New_York"```

  },╔══════════════════════════════════════════════════════════════════════════════╗

  "workers": {║                        INTELLIGENT FEATURES                                  ║

    "doDailySet": true,╚══════════════════════════════════════════════════════════════════════════════╝

    "doDesktopSearch": true,```

    "doMobileSearch": true

  }<table>

}<tr>

```<td width="50%" valign="top">



**[Full Config Guide →](./docs/config.md)**### 🛡️ **Risk-Aware System**

```

---Real-time threat detection

├─ Monitors captchas & errors

## ⚠️ Disclaimer├─ Dynamic delay adjustment (1x→4x)

├─ Automatic cool-down periods

**Using automation violates Microsoft's Terms of Service.**  └─ ML-based ban prediction

Your accounts may be suspended or permanently banned.```



**For educational purposes only.** Use at your own risk.### 📊 **Performance Analytics**

```

### Best PracticesTrack everything

- ✅ Enable humanization├─ Points earned per day

- ✅ Use 2FA/TOTP├─ Success/failure rates

- ✅ Run 1-2x daily max├─ Historical trends

- ✅ Test on secondary accounts└─ Account health monitoring

- ❌ Don't use on main account```

- ❌ Don't run hourly

</td>

---<td width="50%" valign="top">



## 🆘 Support### 🔍 **Query Diversity Engine**

```

**Need help?** [Join Discord](https://discord.gg/KRBFxxsU)  Natural search patterns

**Found a bug?** [GitHub Issues](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)├─ Multi-source queries

├─ Pattern breaking algorithms

---├─ Smart deduplication

└─ Reduced detection risk

## 🤝 Contributors```



<div align="center">### ✅ **Config Validator**

```

<table>Pre-flight checks

<tr>├─ Detects common mistakes

<td align="center">├─ Security warnings

<a href="https://github.com/TheNetsky/">├─ Optimization suggestions

<img src="https://github.com/TheNetsky.png" width="80" /><br />└─ Dry-run test mode

<sub><b>TheNetsky</b></sub>```

</a>

</td></td>

<td align="center"></tr>

<a href="https://github.com/mgrimace"></table>

<img src="https://github.com/mgrimace.png" width="80" /><br />

<sub><b>Mgrimace</b></sub><br>

</a>

</td>```

<td align="center">╔══════════════════════════════════════════════════════════════════════════════╗

<a href="https://github.com/LightZirconite">║                          USAGE COMMANDS                                      ║

<img src="https://github.com/LightZirconite.png" width="80" /><br />╚══════════════════════════════════════════════════════════════════════════════╝

<sub><b>LightZirconite</b></sub>```

</a>

</td>```bash

</tr># Run automation once

</table>npm start



<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors"># Daily automated scheduler

  <img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" />npm run start:schedule

</a>

# Manual redemption mode (monitor points while shopping)

</div>npm start -- -buy your@email.com



---# Docker deployment

docker compose up -d

## 📄 License

# Test configuration without executing

**ISC License** — Free and open source  npm start -- --dry-run

See [LICENSE](./LICENSE) for details```



<br><br>



<div align="center">```

╔══════════════════════════════════════════════════════════════════════════════╗

<img src="https://capsule-render.vercel.app/api?type=waving&height=100&color=gradient&customColorList=0,2,2,5,6,8&section=footer" />║                           CONFIGURATION                                      ║

╚══════════════════════════════════════════════════════════════════════════════╝

</div>```


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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CORE FEATURES                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           DOCUMENTATION                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                       TECHNICAL ARCHITECTURE                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      IMPORTANT DISCLAIMERS                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         CONTRIBUTORS                                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      COMMUNITY & SUPPORT                                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                             LICENSE                                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

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
