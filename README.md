<div align="center">

# Microsoft Rewards Script V2

```
 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗
 ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗
 ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║
 ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║
 ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

**Automated Microsoft Rewards point collection with TypeScript and Playwright**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

<a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors">
  <img alt="Repo Contributors" src="https://img.shields.io/github/contributors/TheNetsky/Microsoft-Rewards-Script?label=Repo%20Contributors&color=00b894" />
</a>

*Automate daily sets, searches, quizzes, and promotional activities to earn Microsoft Rewards points*

</div>

---

## ⚡ Quick Setup

### Automated Installation (Recommended)

```bash
# Windows
setup/setup.bat

# Linux/macOS/WSL  
bash setup/setup.sh

# Any platform
npm run setup
```

The setup script automatically configures accounts, installs dependencies, and starts the script.

### Manual Installation

```bash
# 1. Configure accounts
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your Microsoft credentials

# 2. Install and build
npm install && npm run build

# 3. Start
npm start
```

---

## � Usage

### Basic Commands

```bash
# Run the script
npm start

# Manual purchase mode (no automation)
npm start -- -buy your@email.com

# Development mode
npm run dev
```

### Key Features

- **Multi-account support** with session persistence
- **Complete automation** of daily sets, searches, and quizzes
- **Smart browser simulation** with realistic human behavior
- **Headless operation** for server deployments
- **Docker support** with scheduling
- **Real-time notifications** via Discord/NTFY

---

## 🐳 Docker Deployment

### Quick Start with Docker

```yaml
# docker-compose.yml
services:
  rewards:
    build: .
    environment:
      - TZ=America/New_York
      - CRON_SCHEDULE=0 */6 * * *  # Every 6 hours
      - RUN_ON_START=true
      - ACCOUNTS_FILE=/data/accounts.json
    volumes:
      - ./accounts.json:/data/accounts.json:ro
    restart: unless-stopped
```

```bash
# Deploy and monitor
docker compose up -d
docker logs -f rewards
```

### Account Configuration Methods

| Method | Configuration | Use Case |
|--------|---------------|----------|
| **File Mount** | `ACCOUNTS_FILE=/data/accounts.json` | Production (recommended) |
| **Environment** | `ACCOUNTS_JSON='[{"email":"...","password":"..."}]'` | CI/CD pipelines |
| **Built-in** | Include `src/accounts.json` in image | Testing only |

---

## ⚙️ Configuration

### Basic Settings (`src/config.json`)

```jsonc
{
  "headless": true,           // Run browser in background
  "parallel": true,           // Run mobile/desktop tasks simultaneously  
  "clusters": 1,              // Number of concurrent accounts
  "runOnZeroPoints": false,   // Skip when no points available
  
  // Task selection
  "workers": {
    "doDailySet": true,
    "doMorePromotions": true,
    "doPunchCards": true,
    "doDesktopSearch": true,
    "doMobileSearch": true
  }
}
```

### Advanced Configuration

For detailed configuration options including search settings, notifications, scheduling, and diagnostics, see:
- **[Complete Configuration Guide](./information/schedule.md)** - All available settings
- **[Proxy Setup](./information/proxy.md)** - Network configuration
- **[Notifications](./information/ntfy.md)** - Discord and NTFY setup

---

## 📱 Notifications & Monitoring

### Discord Webhooks
- **Live notifications** during script execution
- **Summary reports** with point totals and account status
- **Error alerts** with diagnostic information

### NTFY Push Notifications
- Mobile and desktop notifications
- Real-time status updates
- Cross-platform support

**Setup:** Configure webhook URLs in `src/config.json`. See [notification guides](./information/) for details.

---

## 🛠️ Troubleshooting

### Common Issues

**Browser not closing properly:**
```bash
# Windows
npm run kill-chrome-win

# Linux/macOS  
pkill -f chrome
```

**Login failures:**
- Enable 2FA on Microsoft accounts
- Check proxy configuration
- Review error logs in `reports/` directory

**Missing points:**
- Verify account credentials
- Check if activities are available in your region
- Enable diagnostics for detailed error capture

### Debug Mode

```bash
# Enable detailed logging and screenshots
npm start -- --debug

# Save diagnostic reports
# Edit config.json: "diagnostics.enabled": true
```

---

## ✨ Features

### 🔧 Automation
- **Multi-account support** with session persistence and 2FA
- **Complete task automation** - daily sets, searches, quizzes, promotions
- **Smart browser simulation** with realistic human behavior patterns
- **Headless operation** and clustering for server deployments

### 🔍 Search & Activities  
- **Desktop & mobile searches** with Edge browser simulation
- **Geo-located queries** and emulated scrolling/clicking
- **Quiz solving** - multiple choice, This Or That, ABC quizzes
- **Daily check-ins** and read-to-earn activities

### 📊 Monitoring & Notifications
- **Discord webhooks** with live updates and summary reports
- **NTFY push notifications** for mobile/desktop alerts
- **Comprehensive logging** with error diagnostics and screenshots
- **Point tracking** with buy mode for manual purchases

---

## 📚 Documentation

For detailed guides and advanced configuration:

- 📊 **[Diagnostics System](./information/diagnostics.md)** - Error capture and troubleshooting
- � **[Job State Management](./information/jobstate.md)** - Task persistence and recovery
- ⏰ **[Scheduling Configuration](./information/schedule.md)** - Automated execution setup
- 🔄 **[Auto-Update System](./information/update.md)** - Script version management
- 📱 **[NTFY Notifications](./information/ntfy.md)** - Push notification setup
- 🎯 **[Discord Webhooks](./information/conclusionwebhook.md)** - Summary reports
- 🌐 **[Proxy Configuration](./information/proxy.md)** - Network routing setup
- 💳 **[Buy Mode Guide](./information/buy-mode.md)** - Manual purchase tracking

> **Community Error Reports:** Anonymized error summaries help improve the script. Disable with `communityHelp.enabled: false` in config.

---

## 🤝 Contributing

### Contributors

This repo: <a href="https://github.com/TheNetsky/Microsoft-Rewards-Script/graphs/contributors"><img src="https://contrib.rocks/image?repo=TheNetsky/Microsoft-Rewards-Script" alt="Contributors" /></a>

### Support

- **Issues:** Report bugs and request features on GitHub
- **Discord:** Join the community for help and discussions
- **Pull Requests:** Contributions are welcome!
[🤐](https://discord.gg/h6Z69ZPPCz)
---

## ⚠️ Disclaimer

> **Important Notice**
> 
> This script is provided for educational purposes only. Use at your own risk.
> 
> Microsoft may suspend or ban accounts that use automation tools. The authors are not responsible for any account actions taken by Microsoft.