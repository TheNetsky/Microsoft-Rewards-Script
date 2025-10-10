# Microsoft Rewards Script V2<div align="center">



Automate daily Microsoft Rewards activities with Playwright-driven browsers, a resilient scheduler, and full observability. This repository hosts the actively maintained V2 rewrite.# 🎯 Microsoft Rewards Script V2



---```

 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗

## Highlights ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝

 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗

- Coverage for desktop and mobile searches, daily sets, quizzes, punch cards, and promo activities ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║

- Multi-account orchestration with optional per-account proxies and Time-based One-Time Password (TOTP) support ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║

- Humanization layer for realistic input timing, scrolling, and idle pauses ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝

- JSONC configuration (`src/config.jsonc`) with documented defaults and inline guidance```

- Scheduler and Docker workflows that run the same logic paths as local executions

- Notification hooks for Discord webhooks and NTFY push, plus rich diagnostics when runs fail**🤖 Intelligent automation meets Microsoft Rewards**  

*Earn points effortlessly while you sleep*

See `docs/index.md` for the curated documentation entry point.[Legacy-1.5.3](https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3)



---[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

## Requirements[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

- Node.js 18 or newer (Node.js 22 recommended)

- npm (ships with Node.js)<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">

- Playwright-managed Chromium dependencies (installed automatically on first run)  <img alt="Contributors" src="https://img.shields.io/github/contributors/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&label=Contributors&color=FF6B6B&labelColor=4ECDC4" />

- Optional: Docker and Docker Compose if you prefer containerized execution</a>

<img alt="Stars" src="https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=FFD93D&labelColor=6BCF7F" />

---<img alt="Version" src="https://img.shields.io/badge/Version-2.0-9B59B6?style=for-the-badge&labelColor=3498DB" />



## Quick Start</div>



```bash---

# Windows

setup/setup.bat<div align="center">



# Linux, macOS, or WSL## 🚀 **Big Update Alert — V2 is here!**

bash setup/setup.sh

<table>

# Any platform (runs the same wizard)<tr>

npm run setup<td width="33%" align="center">

```<img src="https://github.com/TheNetsky.png" width="80" style="border-radius: 50%;" /><br />

<strong><a href="https://github.com/TheNetsky/">TheNetsky</a></strong> 🙌<br />

The setup wizard copies `src/accounts.example.json` to `src/accounts.json`, guides credential entry, installs dependencies, builds the TypeScript output, and launches the first run using the current defaults (browser windows visible, diagnostics enabled).<em>Foundation Architect</em><br />

<sub>Building the massive foundation</sub>

Prefer manual steps? Follow the outline below.</td>

<td width="33%" align="center">

```bash<img src="https://github.com/mgrimace.png" width="80" style="border-radius: 50%;" /><br />

# 1. Prepare accounts and configuration<strong><a href="https://github.com/mgrimace">Mgrimace</a></strong> 🔥<br />

cp src/accounts.example.json src/accounts.json<em>Active Developer</em><br />

# Review src/config.jsonc and adjust options as needed<sub>Regular updates & <a href="./docs/ntfy.md">NTFY mode</a></sub>

</td>

# 2. Install and build<td width="33%" align="center">

npm install<img src="https://github.com/LightZirconite.png" width="80" style="border-radius: 50%;" /><br />

npm run build<strong><a href="https://github.com/LightZirconite">Light</a></strong> ✨<br />

<em>V2 Mastermind</em><br />

# 3. Run once or start the scheduler<sub>Massive feature overhaul</sub>

npm start              # Single pass</td>

npm run start:schedule # Built-in scheduler loop</tr>

```</table>



---**💡 Welcome to V2 — There are honestly so many changes that even I can't list them all!**  

*Trust me, you've got a **massive upgrade** in front of you. Enjoy the ride!* 🎢

## Configuration

</div>

- Canonical file: `src/config.jsonc`, parsed with comment support so your notes stay intact

- `browser.headless` defaults to `false` for local runs; Docker enforces headless via `FORCE_HEADLESS=1`---

- All fields are documented in `docs/config.md`; curated presets live under `docs/config-presets/`

- Legacy `config.json` files are still accepted, but `config.jsonc` is the maintained format## 🎯 **What Does This Script Do?**

- Critical paths can be overridden with environment variables (`ACCOUNTS_FILE`, `ACCOUNTS_JSON`) when needed

<div align="center">

---

**Automatically earn Microsoft Rewards points by completing daily tasks:**

## Running Options- 🔍 **Daily Searches** — Desktop & Mobile Bing searches  

- 📅 **Daily Set** — Complete daily quizzes and activities  

```bash- 🎁 **Promotions** — Bonus point opportunities  

npm start                     # Run activities for all configured accounts- 🃏 **Punch Cards** — Multi-day reward challenges  

npm run start:schedule        # Keep the scheduler active with jittered daily passes- ✅ **Daily Check-in** — Simple daily login rewards  

npm run dev                   # ts-node execution with autoreload for development- 📚 **Read to Earn** — News article reading points  

npm start -- -buy email@host  # Launch Buy Mode for interactive redemptions

*All done automatically while you sleep! 💤*

docker compose up -d          # Containerized scheduler (FORCE_HEADLESS enforced)

docker logs -f microsoft-rewards-script</div>

docker compose down

```---



Session data and optional fingerprints are stored under `src/browser/<sessionPath>/`. Use the `sessions` volume in Docker to persist them between container restarts.## ⚡ Quick Start



---```bash

# 🪟 Windows — One command setup

## Documentationsetup/setup.bat



- `docs/index.md` — navigation hub for all topics# 🐧 Linux/macOS/WSL  

- `docs/getting-started.md` — clean-room setup walkthroughbash setup/setup.sh

- `docs/accounts.md` — multi-account, MFA, and proxy configuration

- `docs/docker.md` — default compose stack, volumes, and environment tuning# 🌍 Any platform

- `docs/schedule.md` — host-side automation and job cadence controlsnpm run setup

- `docs/diagnostics.md` — log capture, artifact review, and support checklist```

- `docs/humanization.md` — how the natural behavior layer is implemented and tuned

- `docs/ntfy.md`, `docs/conclusionwebhook.md` — optional notification outputs**That's it!** The setup wizard configures accounts, installs dependencies, builds the project, and starts earning points.



If you spot a mismatch between the docs and the current behavior, open an issue—documentation is maintained alongside the codebase.<details>

<summary><strong>📖 Manual Setup</strong></summary>

---

```bash

## Support & Community# 1️⃣ Configure your Microsoft accounts

cp src/accounts.example.json src/accounts.json

- Issues: <https://github.com/TheNetsky/Microsoft-Rewards-Script/issues># Edit accounts.json with your credentials

- Discord: <https://discord.gg/KRBFxxsU>

- Legacy branch: <https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3># 2️⃣ Install & Build

npm install && npm run build

Before filing an issue, capture the diagnostics bundle referenced in `docs/diagnostics.md`. It speeds up triage significantly.

# 3️⃣ Run once or start scheduler

---npm start                    # Single run

npm run start:schedule       # Automated daily runs

## License & Disclaimer```



This project is distributed for educational use. Running automation against Microsoft Rewards can violate Microsoft’s terms of service and may lead to account action. You are responsible for how you deploy and operate this codebase.</details>



See `SECURITY.md` for details on data handling, reporting procedures, and safe-use recommendations.---


## 📑 Documentation

| Topic | Description |
|-------|-------------|
| **[🚀 Getting Started](./docs/getting-started.md)** | Complete setup guide from zero to running |
| **[👤 Accounts & 2FA](./docs/accounts.md)** | Microsoft account setup + TOTP authentication |
| **[🐳 Docker](./docs/docker.md)** | Containerized deployment with slim headless image |
| **[⏰ Scheduling](./docs/schedule.md)** | Automated daily runs with built-in scheduler |
| **[🛠️ Diagnostics](./docs/diagnostics.md)** | Troubleshooting, error capture, and logs |
| **[⚙️ Configuration](./docs/config.md)** | Full configuration reference |

**[📚 Full Documentation Index →](./docs/index.md)**

## 🎮 Commands

```bash
# 🚀 Run the automation once
npm start

# � Start automated daily scheduler  
npm run start:schedule

# 💳 Manual points redemption mode
npm start -- -buy your@email.com

# � Deploy with Docker
docker compose up -d

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
