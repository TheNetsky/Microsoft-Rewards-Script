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
[Legacy-1.5.3](https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/tree/Legacy-1.5.3)
**🤖 Intelligent automation meets Microsoft Rewards**  
*Earn points effortlessly while you sleep*

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
<sub>Regular updates & <a href="./information/ntfy.md">NTFY mode</a></sub>
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

<div align="center">

### **Container Magic in 60 Seconds** 🎪

</div>

```yaml
# docker-compose.yml (uses built-in scheduler by default)
services:
  microsoft-rewards:
    build: .
    environment:
      - TZ=America/New_York              # 🌍 Your timezone
      # Built-in scheduler randomization (optional)
      #- SCHEDULER_INITIAL_JITTER_MINUTES_MIN=5
      #- SCHEDULER_INITIAL_JITTER_MINUTES_MAX=20
      #- SCHEDULER_DAILY_JITTER_MINUTES_MIN=2
      #- SCHEDULER_DAILY_JITTER_MINUTES_MAX=10
      # Watchdog timeout (minutes)
      #- SCHEDULER_PASS_TIMEOUT_MINUTES=180
      # Accounts/config mounting options
      - ACCOUNTS_FILE=/data/accounts.json
    volumes:
      - ./accounts.json:/data/accounts.json:ro
      # Recommended: mount compiled config in dist or configure ACCOUNTS_JSON
      # - ./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json:ro
    restart: unless-stopped
```

```bash
# 🚀 Launch your automation fleet
docker compose up -d

# 📊 Monitor the magic happening
docker logs -f microsoft-rewards
```

<div align="center">

**🎯 Pro Configuration Options**

| Method | Setup | Perfect For |
|--------|-------|-------------|
| **📁 File Mount** | `ACCOUNTS_FILE=/data/accounts.json` | 🏢 Production environments |
| **🌍 Environment** | `ACCOUNTS_JSON='[{"email":"..."}]'` | 🔄 CI/CD pipelines |
| **📦 Built-in** | Include in Docker image | 🧪 Testing & development |

</div>

---

## ⏰ Scheduling Options

By default, the Docker image now runs the built‑in scheduler (no cron in the container). Configure time and timezone in `src/config.json` under `schedule`, and use these optional envs for randomization/robustesse:
- `TZ` — container timezone, e.g., `Europe/Paris`
- `SCHEDULER_INITIAL_JITTER_MINUTES_MIN` / `SCHEDULER_INITIAL_JITTER_MINUTES_MAX`
- `SCHEDULER_DAILY_JITTER_MINUTES_MIN` / `SCHEDULER_DAILY_JITTER_MINUTES_MAX`
- `SCHEDULER_PASS_TIMEOUT_MINUTES`

Alternative (external cron): you can still drive the script with cron outside the container or with the provided `src/run_daily.sh` on bare‑metal. See the next section.

Tip: If you switch to the built‑in scheduler, you can also enable start‑time variation and a watchdog timeout via env vars:
- `SCHEDULER_INITIAL_JITTER_MINUTES_MIN` / `SCHEDULER_INITIAL_JITTER_MINUTES_MAX` — random delay before the very first run inside the scheduler process (e.g., 5/20)
- `SCHEDULER_DAILY_JITTER_MINUTES_MIN` / `SCHEDULER_DAILY_JITTER_MINUTES_MAX` — extra random delay added to each daily scheduled time
- `SCHEDULER_PASS_TIMEOUT_MINUTES` — kill a stuck pass after N minutes (default 180)
- `SCHEDULER_FORK_PER_PASS` — if `false`, runs passes in‑process (can’t be force‑killed)

---

## 🖥️ Bare‑Metal (without Docker)

You can reuse `src/run_daily.sh` directly with your system’s cron:

1. Build once:
  - `npm install && npm run build`
2. Create a crontab entry, e.g.:
  - `0 7 * * * TZ=Europe/Paris PROJECT_DIR=/path/to/project /bin/bash /path/to/project/src/run_daily.sh >> /var/log/mrs.log 2>&1`

Notes:
- Set `PROJECT_DIR` to your project root (Docker defaults to `/usr/src/microsoft-rewards-script`).
- Optional envs: `MIN_SLEEP_MINUTES`, `MAX_SLEEP_MINUTES`, `STUCK_PROCESS_TIMEOUT_HOURS`.
- The lock file prevents overlap if a run is still in progress when cron fires again.

For an in‑depth guide (built‑in scheduler with `passesPerRun` vs. external cron), see: [information/schedule.md](./information/schedule.md)

---

## ⚙️ **Configuration Made Simple**

<div align="center">

### **The Brain of Your Operation** 🧠

</div>

```jsonc
// src/config.json - Your control center
{
  "headless": true,                    // 👻 Invisible browser mode
  "parallel": true,                    // ⚡ Simultaneous tasks
  "clusters": 1,                       // 🔢 Concurrent accounts
  "runOnZeroPoints": false,           // 🛑 Skip when no points available
  
  // 🎯 Task Selection Arsenal
  "workers": {
    "doDailySet": true,               // 📅 Daily challenges
    "doMorePromotions": true,         // 🎁 Special offers
    "doPunchCards": true,             // 🃏 Multi-day cards
    "doDesktopSearch": true,          // 🖥️ Desktop searches
    "doMobileSearch": true,           // 📱 Mobile searches
    "doDailyCheckIn": true,           // ✅ Daily check-ins
    "doReadToEarn": true              // 📚 Article reading
  },
  
  // 🔍 Smart Search Behavior
  "searchSettings": {
    "useGeoLocaleQueries": false,     // 🌍 Location-based queries
    "scrollRandomResults": true,      // 📜 Natural scrolling
    "clickRandomResults": true,       // 👆 Realistic clicking
    "searchDelay": "3-5 minutes",     // ⏰ Human-like delays
    "retryMobileSearchAmount": 2      // 🔄 Mobile retry attempts
  },
  
  // 🔔 Notification Setup
  "webhook": {
    "enabled": false,                 // 📢 Discord live updates
    "url": null                       // 🔗 Your Discord webhook URL
  },
  "ntfy": {
    "enabled": false,                 // 📱 Push notifications
    "url": null,                      // 🌐 NTFY server URL
    "topic": "rewards"                // 📝 Notification topic
  }
}
```

### Two‑Factor (TOTP) support

- You can add a Base32 TOTP secret per account in `src/accounts.json`:

```json
[
  {
    "email": "email_1",
    "password": "password_1",
    "totp": "",  
    "proxy": { "proxyAxios": true, "url": "", "port": 0, "username": "", "password": "" }
  }
]
```

- When Microsoft asks for a code (input `name="otc"`), the bot generates and submits it automatically.
- If `totp` is not set, the bot falls back to manual prompt in the terminal.

Tip: Accounts set to passwordless (Microsoft Authenticator with number match) also work very well.

<div align="center">

**🎓 Need More Power?** Check out our [comprehensive guides](./information/):

[![Diagnostics](https://img.shields.io/badge/📊_Diagnostics-Error_Capture-FF6B6B?style=for-the-badge)](./information/diagnostics.md)
[![Scheduling](https://img.shields.io/badge/⏰_Scheduling-Automated_Runs-4ECDC4?style=for-the-badge)](./information/schedule.md)
[![Notifications](https://img.shields.io/badge/📱_NTFY-Push_Alerts-9B59B6?style=for-the-badge)](./information/ntfy.md)
[![Webhooks](https://img.shields.io/badge/🎯_Discord-Live_Updates-7289DA?style=for-the-badge)](./information/conclusionwebhook.md)
[![Proxy](https://img.shields.io/badge/🌐_Proxy-Network_Setup-FF9F43?style=for-the-badge)](./information/proxy.md)
[![Buy Mode](https://img.shields.io/badge/💳_Buy_Mode-Purchase_Tracking-00D2D3?style=for-the-badge)](./information/buy-mode.md)

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

## 🛠️ **Quick Troubleshooting**

<details>
<summary><strong>🔧 Common Issues & Fixes</strong></summary>

**Browser not closing properly:**
```bash
# Windows
npm run kill-chrome-win

# Linux/macOS  
pkill -f chrome
```

**Login failures:**
- Enable 2FA on Microsoft accounts  
- Check proxy configuration in `src/config.json`
- Review error logs in `reports/` directory

**Missing points:**
- Verify account credentials are correct
- Check if activities are available in your region
- Enable diagnostics: `"diagnostics.enabled": true` in config

**Debug mode:**
```bash
npm start -- --debug
```

- `LOGIN_MAX_WAIT_MS` — Max time the login flow will wait for the portal to load before failing with guidance. Default: 180000 (3 min). Increase if your login routinely takes longer.

</details>

---

## 📚 **Advanced Documentation**

Need to go deeper? Check out these comprehensive guides:

[![Diagnostics](https://img.shields.io/badge/📊_Diagnostics-Error_Capture-FF6B6B?style=for-the-badge)](./information/diagnostics.md)
[![Job State](https://img.shields.io/badge/💾_Job_State-Task_Recovery-4ECDC4?style=for-the-badge)](./information/jobstate.md)
[![Scheduling](https://img.shields.io/badge/⏰_Scheduling-Automated_Runs-FFD93D?style=for-the-badge)](./information/schedule.md)
[![Auto Update](https://img.shields.io/badge/🔄_Auto_Update-Version_Control-9B59B6?style=for-the-badge)](./information/update.md)
[![NTFY](https://img.shields.io/badge/📱_NTFY-Push_Alerts-00A7E1?style=for-the-badge)](./information/ntfy.md)
[![Discord](https://img.shields.io/badge/🎯_Discord-Webhook_Reports-7289DA?style=for-the-badge)](./information/conclusionwebhook.md)
[![Proxy](https://img.shields.io/badge/🌐_Proxy-Network_Setup-FF9F43?style=for-the-badge)](./information/proxy.md)
[![Buy Mode](https://img.shields.io/badge/💳_Buy_Mode-Purchase_Track-00D2D3?style=for-the-badge)](./information/buy-mode.md)

---

<img width="1536" height="1024" alt="msn-rw" src="https://github.com/user-attachments/assets/4e396ab3-5292-4948-9778-7b385d751e4d" />
