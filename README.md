<div align="center"># Microsoft Rewards Script V2<div align="center">



# 🎯 Microsoft Rewards Script V2



**The most advanced automation toolkit for Microsoft Rewards**Automate daily Microsoft Rewards activities with Playwright-driven browsers, a resilient scheduler, and full observability. This repository hosts the actively maintained V2 rewrite.# 🎯 Microsoft Rewards Script V2



[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)---```

[![Playwright](https://img.shields.io/badge/Playwright-Powered-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)

 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗

[📚 Documentation](./docs/index.md) • [🐳 Docker Guide](./docs/docker.md) • [💬 Discord](https://discord.gg/KRBFxxsU) • [🐛 Issues](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)

## Highlights ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝

</div>

 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗

---

- Coverage for desktop and mobile searches, daily sets, quizzes, punch cards, and promo activities ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║

## ✨ What Makes V2 Special

- Multi-account orchestration with optional per-account proxies and Time-based One-Time Password (TOTP) support ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║

<table>

<tr>- Humanization layer for realistic input timing, scrolling, and idle pauses ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝

<td width="50%">

- JSONC configuration (`src/config.jsonc`) with documented defaults and inline guidance```

### 🎯 **Complete Automation**

✅ Desktop & Mobile Bing searches  - Scheduler and Docker workflows that run the same logic paths as local executions

✅ Daily sets, quizzes, and polls  

✅ Promotional activities & punch cards  - Notification hooks for Discord webhooks and NTFY push, plus rich diagnostics when runs fail**🤖 Intelligent automation meets Microsoft Rewards**  

✅ Daily check-ins & read-to-earn  

✅ Multi-account orchestration  *Earn points effortlessly while you sleep*



</td>See `docs/index.md` for the curated documentation entry point.[Legacy-1.5.3](https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3)

<td width="50%">



### 🛡️ **Built for Safety**

🧠 Human-like behavior patterns  ---[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

🔐 TOTP 2FA support  

🌐 Per-account proxy routing  [![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

📊 Ban detection & alerts  

🔄 Session persistence & recovery  ## Requirements[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)



</td>[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

</tr>

</table>- Node.js 18 or newer (Node.js 22 recommended)



### 🚀 Modern Architecture- npm (ships with Node.js)<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">



- **Commented Configuration** — `src/config.jsonc` with inline documentation- Playwright-managed Chromium dependencies (installed automatically on first run)  <img alt="Contributors" src="https://img.shields.io/github/contributors/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&label=Contributors&color=FF6B6B&labelColor=4ECDC4" />

- **Smart Scheduler** — Randomized timing with configurable windows

- **Docker Ready** — Optimized headless container deployment- Optional: Docker and Docker Compose if you prefer containerized execution</a>

- **Rich Notifications** — Discord webhooks + NTFY push alerts

- **Full Diagnostics** — Automated screenshot & HTML capture on errors<img alt="Stars" src="https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=FFD93D&labelColor=6BCF7F" />



------<img alt="Version" src="https://img.shields.io/badge/Version-2.0-9B59B6?style=for-the-badge&labelColor=3498DB" />



## ⚡ Quick Start



<details open>## Quick Start</div>

<summary><h3>🪄 One-Command Setup (Recommended)</h3></summary>



```bash

# 🪟 Windows```bash---

setup\setup.bat

# Windows

# 🐧 Linux / macOS / WSL

bash setup/setup.shsetup/setup.bat<div align="center">



# 🌍 Cross-platform

npm run setup

```# Linux, macOS, or WSL## 🚀 **Big Update Alert — V2 is here!**



The wizard handles everything: account setup, dependencies, build, and first run.bash setup/setup.sh



</details><table>



<details># Any platform (runs the same wizard)<tr>

<summary><h3>🔧 Manual Installation</h3></summary>

npm run setup<td width="33%" align="center">

```bash

# 1️⃣ Configure accounts```<img src="https://github.com/TheNetsky.png" width="80" style="border-radius: 50%;" /><br />

cp src/accounts.example.json src/accounts.json

# Edit src/accounts.json with your Microsoft credentials<strong><a href="https://github.com/TheNetsky/">TheNetsky</a></strong> 🙌<br />



# 2️⃣ Install dependencies & buildThe setup wizard copies `src/accounts.example.json` to `src/accounts.json`, guides credential entry, installs dependencies, builds the TypeScript output, and launches the first run using the current defaults (browser windows visible, diagnostics enabled).<em>Foundation Architect</em><br />

npm install

npm run build<sub>Building the massive foundation</sub>



# 3️⃣ Choose your modePrefer manual steps? Follow the outline below.</td>

npm start               # Single run (test mode)

npm run start:schedule  # Automated daily runs<td width="33%" align="center">

```

```bash<img src="https://github.com/mgrimace.png" width="80" style="border-radius: 50%;" /><br />

</details>

# 1. Prepare accounts and configuration<strong><a href="https://github.com/mgrimace">Mgrimace</a></strong> 🔥<br />

---

cp src/accounts.example.json src/accounts.json<em>Active Developer</em><br />

## 📖 Documentation

# Review src/config.jsonc and adjust options as needed<sub>Regular updates & <a href="./docs/ntfy.md">NTFY mode</a></sub>

<table>

<tr></td>

<td width="50%">

# 2. Install and build<td width="33%" align="center">

### 🎓 **Essential Guides**

- [🚀 Getting Started](./docs/getting-started.md)npm install<img src="https://github.com/LightZirconite.png" width="80" style="border-radius: 50%;" /><br />

- [👤 Accounts & 2FA Setup](./docs/accounts.md)

- [⚙️ Configuration Reference](./docs/config.md)npm run build<strong><a href="https://github.com/LightZirconite">Light</a></strong> ✨<br />

- [🐳 Docker Deployment](./docs/docker.md)

<em>V2 Mastermind</em><br />

</td>

<td width="50%"># 3. Run once or start the scheduler<sub>Massive feature overhaul</sub>



### 🔥 **Advanced Topics**npm start              # Single pass</td>

- [🧠 Humanization](./docs/humanization.md)

- [⏰ Scheduling](./docs/schedule.md)npm run start:schedule # Built-in scheduler loop</tr>

- [🛠️ Diagnostics](./docs/diagnostics.md)

- [📱 Notifications](./docs/ntfy.md)```</table>



</td>

</tr>

</table>---**💡 Welcome to V2 — There are honestly so many changes that even I can't list them all!**  



**📚 [Complete Documentation Index →](./docs/index.md)***Trust me, you've got a **massive upgrade** in front of you. Enjoy the ride!* 🎢



---## Configuration



## 🎮 Available Commands</div>



```bash- Canonical file: `src/config.jsonc`, parsed with comment support so your notes stay intact

# 🏃 Run automation once

npm start- `browser.headless` defaults to `false` for local runs; Docker enforces headless via `FORCE_HEADLESS=1`---



# ⏰ Start automated scheduler- All fields are documented in `docs/config.md`; curated presets live under `docs/config-presets/`

npm run start:schedule

- Legacy `config.json` files are still accepted, but `config.jsonc` is the maintained format## 🎯 **What Does This Script Do?**

# 💳 Interactive redemption mode

npm start -- -buy your@email.com- Critical paths can be overridden with environment variables (`ACCOUNTS_FILE`, `ACCOUNTS_JSON`) when needed



# 🐳 Docker deployment<div align="center">

docker compose up -d

docker logs -f microsoft-rewards-script---



# 🔧 Development mode with hot reload**Automatically earn Microsoft Rewards points by completing daily tasks:**

npm run dev

```## Running Options- 🔍 **Daily Searches** — Desktop & Mobile Bing searches  



---- 📅 **Daily Set** — Complete daily quizzes and activities  



## 🌟 Key Features```bash- 🎁 **Promotions** — Bonus point opportunities  



<div align="center">npm start                     # Run activities for all configured accounts- 🃏 **Punch Cards** — Multi-day reward challenges  



| Feature | Description |npm run start:schedule        # Keep the scheduler active with jittered daily passes- ✅ **Daily Check-in** — Simple daily login rewards  

|:-------:|:------------|

| **🔐 Multi-Account** | Run multiple Microsoft accounts simultaneously with isolated sessions |npm run dev                   # ts-node execution with autoreload for development- 📚 **Read to Earn** — News article reading points  

| **🤖 Humanization** | Advanced behavior patterns with randomized timing and realistic interactions |

| **📱 Cross-Device** | Separate desktop and mobile browser contexts with device-specific fingerprints |npm start -- -buy email@host  # Launch Buy Mode for interactive redemptions

| **🧩 Activity Coverage** | All known reward types: searches, quizzes, polls, cards, promos |

| **🔔 Smart Notifications** | Discord embeds + NTFY push with rich status updates |*All done automatically while you sleep! 💤*

| **🐳 Docker Optimized** | Slim headless Chromium build for minimal container footprint |

| **🛡️ Session Management** | Persistent cookies and fingerprints to reduce login friction |docker compose up -d          # Containerized scheduler (FORCE_HEADLESS enforced)

| **🌐 Proxy Support** | Configure different proxies per account with automatic rotation |

| **📊 Diagnostics** | Automatic error capture with screenshots and HTML snapshots |docker logs -f microsoft-rewards-script</div>

| **🔄 Auto-Recovery** | Job state tracking and resume capability after interruptions |

docker compose down

</div>

```---

---



## ⚙️ Configuration Highlights

Session data and optional fingerprints are stored under `src/browser/<sessionPath>/`. Use the `sessions` volume in Docker to persist them between container restarts.## ⚡ Quick Start

The project uses **`src/config.jsonc`** — JSON with comments enabled, so you get inline documentation without editor warnings.



**Key defaults:**

- ✅ Browser windows visible by default (`headless: false`) — see what's happening---```bash

- 🔒 Docker enforces headless via `FORCE_HEADLESS=1` environment variable

- 🎯 All activities enabled by default for maximum point collection# 🪟 Windows — One command setup

- 🧠 Humanization active with realistic delays and gesture simulation

- 📊 Diagnostics enabled for troubleshooting support## Documentationsetup/setup.bat



**[📄 Full Configuration Docs →](./docs/config.md)**



---- `docs/index.md` — navigation hub for all topics# 🐧 Linux/macOS/WSL  



## 🐳 Docker Deployment- `docs/getting-started.md` — clean-room setup walkthroughbash setup/setup.sh



```bash- `docs/accounts.md` — multi-account, MFA, and proxy configuration

# Ensure accounts.json and config.jsonc are ready

docker compose up -d- `docs/docker.md` — default compose stack, volumes, and environment tuning# 🌍 Any platform



# Follow logs in real-time- `docs/schedule.md` — host-side automation and job cadence controlsnpm run setup

docker logs -f microsoft-rewards-script

- `docs/diagnostics.md` — log capture, artifact review, and support checklist```

# Stop container

docker compose down- `docs/humanization.md` — how the natural behavior layer is implemented and tuned

```

- `docs/ntfy.md`, `docs/conclusionwebhook.md` — optional notification outputs**That's it!** The setup wizard configures accounts, installs dependencies, builds the project, and starts earning points.

The Docker setup uses Playwright's Chromium Headless Shell for a minimal footprint while maintaining full compatibility.



**[🐳 Complete Docker Guide →](./docs/docker.md)**

If you spot a mismatch between the docs and the current behavior, open an issue—documentation is maintained alongside the codebase.<details>

---

<summary><strong>📖 Manual Setup</strong></summary>

## 🤝 Community & Support

---

<div align="center">

```bash

[![Discord Server](https://img.shields.io/badge/💬_Join_Our_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KRBFxxsU)

[![GitHub Issues](https://img.shields.io/badge/🐛_Report_Issues-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)## Support & Community# 1️⃣ Configure your Microsoft accounts



</div>cp src/accounts.example.json src/accounts.json



### 📋 Before Reporting Issues- Issues: <https://github.com/TheNetsky/Microsoft-Rewards-Script/issues># Edit accounts.json with your credentials



Please capture diagnostics using the built-in system:- Discord: <https://discord.gg/KRBFxxsU>

```bash

npm start  # Run with diagnostics enabled (default)- Legacy branch: <https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3># 2️⃣ Install & Build

# Check reports/ folder for logs and screenshots

```npm install && npm run build



**[🔍 Diagnostics Guide →](./docs/diagnostics.md)**Before filing an issue, capture the diagnostics bundle referenced in `docs/diagnostics.md`. It speeds up triage significantly.



---# 3️⃣ Run once or start scheduler



## 🛡️ Security & Privacy---npm start                    # Single run



- ✅ **No telemetry** — All data stays on your machinenpm run start:schedule       # Automated daily runs

- 🔒 **Local-first** — Configuration and credentials stored locally

- 🛡️ **Open source** — Audit the code yourself## License & Disclaimer```

- 📝 **Transparent** — Full activity logging available



**[🔐 Security Policy →](./SECURITY.md)**

This project is distributed for educational use. Running automation against Microsoft Rewards can violate Microsoft’s terms of service and may lead to account action. You are responsible for how you deploy and operate this codebase.</details>

---



## ⚠️ Important Disclaimer

See `SECURITY.md` for details on data handling, reporting procedures, and safe-use recommendations.---

<div align="center">



> **This project is for educational purposes only.**## 📑 Documentation

>

> Using automation tools with Microsoft Rewards may violate Microsoft's Terms of Service.  | Topic | Description |

> Account suspension or termination is possible.  |-------|-------------|

> **Use at your own risk** — the maintainers accept no liability.| **[🚀 Getting Started](./docs/getting-started.md)** | Complete setup guide from zero to running |

| **[👤 Accounts & 2FA](./docs/accounts.md)** | Microsoft account setup + TOTP authentication |

</div>| **[🐳 Docker](./docs/docker.md)** | Containerized deployment with slim headless image |

| **[⏰ Scheduling](./docs/schedule.md)** | Automated daily runs with built-in scheduler |

---| **[🛠️ Diagnostics](./docs/diagnostics.md)** | Troubleshooting, error capture, and logs |

| **[⚙️ Configuration](./docs/config.md)** | Full configuration reference |

## 🙏 Credits

**[📚 Full Documentation Index →](./docs/index.md)**

<div align="center">

## 🎮 Commands

Built with ❤️ by the community

```bash

**Special thanks to:**  # 🚀 Run the automation once

[TheNetsky](https://github.com/TheNetsky) • [mgrimace](https://github.com/mgrimace) • [LightZirconite](https://github.com/LightZirconite)npm start



[View all contributors →](https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors)# � Start automated daily scheduler  

npm run start:schedule

---

# 💳 Manual points redemption mode

**Legacy Version:** [v1.5.3 Branch](https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3)npm start -- -buy your@email.com



*Happy automating! 🎉*# � Deploy with Docker

docker compose up -d

</div>

# � Development mode
npm run dev
```

---

## ✨ Key Features

<div align="center">

| Feature | Description |
|---------|-------------|
| **🔐 Multi-Account** | Support multiple Microsoft accounts with 2FA |
| **🤖 Human-like** | Natural delays, scrolling, clicking patterns |
| **📱 Cross-Platform** | Desktop + Mobile search automation |
| **🎯 Smart Activities** | Quizzes, polls, daily sets, punch cards |
| **🔔 Notifications** | Discord webhooks + NTFY push alerts |
| **🐳 Docker Ready** | Slim headless container deployment |
| **🛡️ Resilient** | Session persistence, job state recovery |
| **🕸️ Proxy Support** | Per-account proxy configuration |

</div>

---

## 🚀 Advanced Features

**[💳 Buy Mode](./docs/buy-mode.md)** — Manual redemption with live points monitoring  
**[🧠 Humanization](./docs/humanization.md)** — Advanced anti-detection patterns  
**[📊 Diagnostics](./docs/diagnostics.md)** — Error capture with screenshots/HTML  
**[🔗 Webhooks](./docs/conclusionwebhook.md)** — Rich Discord notifications  
**[📱 NTFY](./docs/ntfy.md)** — Push notifications to your phone

---

## 📚 Documentation & Support

<div align="center">

**📖 [Complete Documentation Index](./docs/index.md)**

</div>

### Essential Guides
- **[Getting Started](./docs/getting-started.md)** — Zero to running in minutes
- **[Accounts Setup](./docs/accounts.md)** — Microsoft accounts + 2FA configuration  
- **[Docker Guide](./docs/docker.md)** — Container deployment
- **[Scheduling](./docs/schedule.md)** — Automated daily runs
- **[Troubleshooting](./docs/diagnostics.md)** — Fix common issues

### Advanced Topics
- **[Humanization](./docs/humanization.md)** — Anti-detection features
- **[Notifications](./docs/ntfy.md)** — Push alerts & Discord webhooks
- **[Proxy Setup](./docs/proxy.md)** — Network configuration
- **[Buy Mode](./docs/buy-mode.md)** — Manual redemption tracking

---

## 🤝 Community

<div align="center">

[![Discord](https://img.shields.io/badge/💬_Join_Discord-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/KRBFxxsU)
[![GitHub](https://img.shields.io/badge/⭐_Star_Project-yellow?style=for-the-badge&logo=github)](https://github.com/TheNetsky/Microsoft-Rewards-Script)

**Found a bug?** [Report an issue](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)  
**Have suggestions?** [Start a discussion](https://github.com/TheNetsky/Microsoft-Rewards-Script/discussions)

</div>

---

<div align="center">

## ⚠️ Disclaimer

This project is for educational purposes only. Use at your own risk. Microsoft may suspend accounts that use automation tools. The authors are not responsible for any account actions taken by Microsoft.

**🎯 Contributors**

<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
<img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" alt="Contributors" />
</a>

*Made with ❤️ by the community • Happy automating! 🎉*

</div>

---

<img width="1536" height="1024" alt="msn-rw" src="https://github.com/user-attachments/assets/4e396ab3-5292-4948-9778-7b385d751e4d" />
