<div align="center">

# 🎯 Microsoft Rewards Script V2

```
 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗
 ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗
 ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║
 ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║
 ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

**🤖 Intelligent automation meets Microsoft Rewards**  
*Earn points effortlessly while you sleep*
[Legacy-1.5.3](https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
  <img alt="Contributors" src="https://img.shields.io/github/contributors/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&label=Contributors&color=FF6B6B&labelColor=4ECDC4" />
</a>
<img alt="Stars" src="https://img.shields.io/github/stars/TheNetsky/Microsoft-Rewards-Script?style=for-the-badge&color=FFD93D&labelColor=6BCF7F" />
<img alt="Version" src="https://img.shields.io/badge/Version-2.0-9B59B6?style=for-the-badge&labelColor=3498DB" />

</div>

---

<div align="center">

## 🚀 **Big Update Alert — V2 is here!**

<table>
<tr>
<td width="33%" align="center">
<img src="https://github.com/TheNetsky.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/TheNetsky/">TheNetsky</a></strong> 🙌<br />
<em>Foundation Architect</em><br />
<sub>Building the massive foundation</sub>
</td>
<td width="33%" align="center">
<img src="https://github.com/mgrimace.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/mgrimace">Mgrimace</a></strong> 🔥<br />
<em>Active Developer</em><br />
<sub>Regular updates & <a href="./docs/ntfy.md">NTFY mode</a></sub>
</td>
<td width="33%" align="center">
<img src="https://github.com/LightZirconite.png" width="80" style="border-radius: 50%;" /><br />
<strong><a href="https://github.com/LightZirconite">Light</a></strong> ✨<br />
<em>V2 Mastermind</em><br />
<sub>Massive feature overhaul</sub>
</td>
</tr>
</table>

**💡 Welcome to V2 — There are honestly so many changes that even I can't list them all!**  
*Trust me, you've got a **massive upgrade** in front of you. Enjoy the ride!* 🎢

</div>

---

## 🎯 **What Does This Script Do?**

<div align="center">

**Automatically earn Microsoft Rewards points by completing daily tasks:**
- 🔍 **Daily Searches** — Desktop & Mobile Bing searches  
- 📅 **Daily Set** — Complete daily quizzes and activities  
- 🎁 **Promotions** — Bonus point opportunities  
- 🃏 **Punch Cards** — Multi-day reward challenges  
- ✅ **Daily Check-in** — Simple daily login rewards  
- 📚 **Read to Earn** — News article reading points  

*All done automatically while you sleep! 💤*

</div>

---

## ⚡ Quick Start

```bash
# 🪟 Windows — One command setup
setup/setup.bat

# 🐧 Linux/macOS/WSL  
bash setup/setup.sh

# 🌍 Any platform
npm run setup
```

**That's it!** The setup wizard configures accounts, installs dependencies, builds the project, and starts earning points.

<details>
<summary><strong>📖 Manual Setup</strong></summary>

```bash
# 1️⃣ Configure your Microsoft accounts
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your credentials

# 2️⃣ Install & Build
npm install && npm run build

# 3️⃣ Run once or start scheduler
npm start                    # Single run
npm run start:schedule       # Automated daily runs
```

</details>

---

## 📑 Documentation

| Topic | Description |
|-------|-------------|
| **[🚀 Getting Started](./docs/getting-started.md)** | Complete setup guide from zero to running |
| **[👤 Accounts & 2FA](./docs/accounts.md)** | Microsoft account setup + TOTP authentication |
| **[🐳 Docker](./docs/docker.md)** | Containerized deployment with slim headless image |
| **[⏰ Scheduling](./docs/schedule.md)** | Automated daily runs with built-in scheduler |
| **[🛠️ Diagnostics](./docs/diagnostics.md)** | Troubleshooting, error capture, and logs |
| **[⚙️ Configuration](./docs/config.md)** | Full config.json reference |

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
