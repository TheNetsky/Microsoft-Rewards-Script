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

## ⚡ Lightning Quick Start

<div align="center">

### 🎬 **One Command. Total Automation.**

</div>

```bash
# 🪟 Windows Users
setup/setup.bat

# 🐧 Linux/macOS/WSL Users  
bash setup/setup.sh

# 🌍 Universal (Any Platform)
npm run setup
```

<div align="center">

**⚡ That's it!** The magic setup wizard will:
- 🔧 **Configure** your accounts automatically
- 📦 **Install** all dependencies  
- 🏗️ **Build** the entire project
- 🚀 **Launch** your automation instantly

*Sit back and watch the points roll in! 💰*

</div>

### 🛠️ Manual Setup (For the Adventurous)

<details>
<summary><strong>📖 Expand for step-by-step manual setup</strong></summary>

```bash
# 1️⃣ Setup your accounts
cp src/accounts.example.json src/accounts.json
# ✏️ Edit accounts.json with your Microsoft credentials

# 2️⃣ Install & Build
npm install && npm run build

# 3️⃣ Launch!
npm start
```

</details>

### 🐧 Nix Enthusiasts

<details>
<summary><strong>❄️ Special setup for Nix users</strong></summary>

```bash
# Get Nix from https://nixos.org/
./run.sh
```

</details>

---

## 🎮 Mission Control Center

<div align="center">

### **Your Command Arsenal** 

</div>

```bash
# 🚀 Launch the automation
npm start

# 💳 Manual shopping mode (buy stuff yourself!)
npm start -- -buy your@email.com

# 🔧 Developer playground
npm run dev

# 🐳 Docker deployment
docker compose up -d
```

<div align="center">

**🎯 Pro Tip:** Use buy mode to manually redeem points while the script tracks your spending!

</div>

---

## ✨ Features

- Multi-account support with session persistence and 2FA
- Daily set, promotions, punchcards, check-in, read-to-earn
- Desktop and mobile searches with Edge-like behavior
- Human-like scrolling/clicking and natural delays
- Quiz automation: multiple choice, This or That, ABC, polls, click/URL rewards
- Discord live notifications + rich summaries; NTFY push support
- Headless mode, clustering, proxy, Docker scheduling
- Diagnostics (screenshots/HTML), logs, and job state recovery

---

## 🐳 **Docker: Deploy Like a Pro**

Deploy the bot in a slim headless container (Chromium Headless Shell). See the full guide with compose, volumes, env vars and tips:

→ Read: ./docs/docker.md

---

## ⏰ Scheduling Options

Built‑in scheduler (no cron in container). Configure time window, timezone and jitter.

→ Read: ./docs/schedule.md

---

## 🛒 Buy Mode

Manual redeem mode with live points monitor. Enable via CLI or config.

→ Read: ./docs/buy-mode.md

---

## ⚙️ Configuration

Configure behavior in `src/config.json`. For accounts (including TOTP 2FA), use `src/accounts.json`.

→ Read: ./docs/getting-started.md and ./docs/accounts.md

<div align="center">

**🎓 Need More Power?** Check out our [comprehensive guides](./docs/):

[Start here → Documentation Index](./docs/index.md)

[![Diagnostics](https://img.shields.io/badge/📊_Diagnostics-Error_Capture-FF6B6B?style=for-the-badge)](./docs/diagnostics.md)
[![Humanization](https://img.shields.io/badge/🧠_Humanization-Human_Mode-2ecc71?style=for-the-badge)](./docs/humanization.md)
[![Scheduling](https://img.shields.io/badge/⏰_Scheduling-Automated_Runs-4ECDC4?style=for-the-badge)](./docs/schedule.md)
[![Getting Started](https://img.shields.io/badge/🚀_Getting_Started-Setup-3498DB?style=for-the-badge)](./docs/getting-started.md)
[![Accounts & TOTP](https://img.shields.io/badge/👤_Accounts_%26_TOTP-2FA-9B59B6?style=for-the-badge)](./docs/accounts.md)
[![Docker](https://img.shields.io/badge/🐳_Docker-Guide-2E86C1?style=for-the-badge)](./docs/docker.md)
[![Notifications](https://img.shields.io/badge/📱_NTFY-Push_Alerts-9B59B6?style=for-the-badge)](./docs/ntfy.md)
[![Webhooks](https://img.shields.io/badge/🎯_Discord-Live_Updates-7289DA?style=for-the-badge)](./docs/conclusionwebhook.md)
[![Proxy](https://img.shields.io/badge/🌐_Proxy-Network_Setup-FF9F43?style=for-the-badge)](./docs/proxy.md)
[![Buy Mode](https://img.shields.io/badge/💳_Buy_Mode-Purchase_Tracking-00D2D3?style=for-the-badge)](./docs/buy-mode.md)

</div>

---

## 🌟 **Community & Contributing**

<div align="center">

### **Join the Revolution** 🚀

</div>

<table>
<tr>
<td width="70%" align="center">
<h3>🏆 <strong>Hall of Fame Contributors</strong></h3>
<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
<img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" alt="Contributors" />
</a><br/><br/>
<em>Every contribution, no matter how small, makes this project better for everyone! 💫</em>
</td>
<td width="30%" align="center">
<h3>🤝 <strong>Get Involved</strong></h3>
<br/>
🐛 <strong>Report Issues</strong><br/>
<em>Found a bug? Let us know!</em><br/><br/>
💡 <strong>Suggest Features</strong><br/>
<em>Have ideas? We're listening!</em><br/><br/>
🔧 <strong>Submit Pull Requests</strong><br/>
<em>Code contributions welcome!</em><br/><br/>
💬 <strong>Join Discussions</strong><br/>
<em>Share your experience!</em>
</td>
</tr>
</table>

<div align="center">

[![Contribute](https://img.shields.io/badge/🚀_Start_Contributing-GitHub-black?style=for-the-badge&logo=github)](https://github.com/TheNetsky/Microsoft-Rewards-Script)
[![Discord](https://img.shields.io/badge/💬_Join_Community-Discord-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/KRBFxxsU)
[![Star](https://img.shields.io/badge/⭐_Star_Repository-GitHub-yellow?style=for-the-badge&logo=github)](https://github.com/TheNetsky/Microsoft-Rewards-Script)

**🎯 Community Guidelines:** Be respectful, helpful, and awesome to each other! 

</div>

---

<div align="center">

## ⚠️ Disclaimer

This project is for educational purposes only. Use at your own risk. Microsoft may suspend or ban accounts that use automation tools. The authors are not responsible for any account actions taken by Microsoft.

<em>Made with ❤️ by the community • Happy automating! 🎉</em>

</div>

---

## 🛠️ Troubleshooting

Common issues and diagnostics, including screenshots/HTML capture and retention.

→ Read: ./docs/diagnostics.md

---

## 📚 **Advanced Documentation**

Need to go deeper? Start here:

- [Diagnostics](./docs/diagnostics.md)
- [Humanization](./docs/humanization.md)
- [Job State](./docs/jobstate.md)
- [Scheduling](./docs/schedule.md)
- [Auto Update](./docs/update.md)
- [NTFY](./docs/ntfy.md)
- [Discord Webhook Reports](./docs/conclusionwebhook.md)
- [Proxy Setup](./docs/proxy.md)
- [Buy Mode details](./docs/buy-mode.md)

---

<img width="1536" height="1024" alt="msn-rw" src="https://github.com/user-attachments/assets/4e396ab3-5292-4948-9778-7b385d751e4d" />
