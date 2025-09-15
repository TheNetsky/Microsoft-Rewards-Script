# Microsoft-Rewards-Script
Automated Microsoft Rewards script built with TypeScript, Cheerio and Playwright.

Under development, however mainly for personal use!

---

## 🚀 Quick Setup (Recommended)

**The easiest way to get started - just download and run!**

1. **Download or clone** the source code
2. **Run the setup script:**
   
   **Windows:** Double-click `setup/setup.bat` or run it from command line
   
   **Linux/macOS/WSL:** `bash setup/setup.sh` 
   
   **Alternative (any platform):** `npm run setup`

3. **Follow the prompts:** The setup script will automatically:
   - Rename `accounts.example.json` to `accounts.json` 
   - Ask you to enter your Microsoft account credentials
   - Remind you to review configuration options in `config.json`
   - Install all dependencies (`npm install`)
   - Build the project (`npm run build`)
   - Optionally start the script immediately

**That's it!** The setup script handles everything for you.

---

## ⚙️ Advanced Setup Options

### Nix Users
1. Get [Nix](https://nixos.org/)
2. Run `./run.sh`
3. Done!

### Manual Setup (Troubleshooting)
If the automatic setup script doesn't work for your environment:

1. Manually rename `src/accounts.example.json` to `src/accounts.json`
2. Add your Microsoft account details to `accounts.json`
3. Customize `src/config.json` to your preferences
4. Install dependencies: `npm install`
5. Build the project: `npm run build`
6. Start the script: `npm run start`---

## 🐳 Docker Setup (Experimental)

For automated scheduling and containerized deployment.

### Before Starting
- Remove `/node_modules` and `/dist` folders if you previously built locally
- Remove old Docker volumes if upgrading from version 1.4 or earlier
- Old `accounts.json` files can be reused

### Quick Docker Setup
1. **Download source code** and configure `accounts.json`
2. **Edit `config.json`** - ensure `"headless": true`
3. **Customize `compose.yaml`:**
   - Set your timezone (`TZ` variable)
   - Configure schedule (`CRON_SCHEDULE`) - use [crontab.guru](https://crontab.guru) for help
   - Optional: Set `RUN_ON_START=true` for immediate execution
4. **Start container:** `docker compose up -d`
5. **Monitor logs:** `docker logs microsoft-rewards-script`

**Note:** The container adds 5–50 minutes random delay to scheduled runs for more natural behavior.

---

## 📋 Usage Notes

- **Browser Instances:** If you stop the script without closing browser windows (headless=false), use Task Manager or `npm run kill-chrome-win` to clean up
- **Automation Scheduling:** Run at least twice daily, set `"runOnZeroPoints": false` to skip when no points available
- **Multiple Accounts:** The script supports clustering - configure `clusters` in `config.json`

--- 
## ⚙️ Configuration Reference

Customize behavior by editing `src/config.json`:

### Core Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `baseURL` | Microsoft Rewards page URL | `https://rewards.bing.com` |
| `sessionPath` | Session/fingerprint storage location | `sessions` |
| `headless` | Run browser in background | `false` (visible) |
| `parallel` | Run mobile/desktop tasks simultaneously | `true` |
| `runOnZeroPoints` | Continue when no points available | `false` |
| `clusters` | Number of concurrent account instances | `1` |

### Fingerprint Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `saveFingerprint.mobile` | Reuse mobile browser fingerprint | `false` |
| `saveFingerprint.desktop` | Reuse desktop browser fingerprint | `false` |

### Task Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `workers.doDailySet` | Complete daily set activities | `true` |
| `workers.doMorePromotions` | Complete promotional offers | `true` |
| `workers.doPunchCards` | Complete punchcard activities | `true` |
| `workers.doDesktopSearch` | Perform desktop searches | `true` |
| `workers.doMobileSearch` | Perform mobile searches | `true` |
| `workers.doDailyCheckIn` | Complete daily check-in | `true` |
| `workers.doReadToEarn` | Complete read-to-earn activities | `true` |

### Search Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `searchOnBingLocalQueries` | Use local queries vs. fetched | `false` |
| `searchSettings.useGeoLocaleQueries` | Generate location-based queries | `false` |
| `searchSettings.scrollRandomResults` | Randomly scroll search results | `true` |
| `searchSettings.clickRandomResults` | Click random result links | `true` |
| `searchSettings.searchDelay` | Delay between searches (min/max) | `3-5 minutes` |
| `searchSettings.retryMobileSearchAmount` | Mobile search retry attempts | `2` |

### Advanced Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `globalTimeout` | Action timeout duration | `30s` |
| `logExcludeFunc` | Functions to exclude from logs | `SEARCH-CLOSE-TABS` |
| `webhookLogExcludeFunc` | Functions to exclude from webhooks | `SEARCH-CLOSE-TABS` |
| `proxy.proxyGoogleTrends` | Proxy Google Trends requests | `true` |
| `proxy.proxyBingTerms` | Proxy Bing Terms requests | `true` |

### Webhook Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `webhook.enabled` | Enable Discord notifications | `false` |
| `webhook.url` | Discord webhook URL | `null` |
| `conclusionWebhook.enabled` | Enable summary-only webhook | `false` |
| `conclusionWebhook.url` | Summary webhook URL | `null` |

---

## ✨ Features

**Account Management:**
- ✅ Multi-Account Support
- ✅ Session Storage & Persistence
- ✅ 2FA Support
- ✅ Passwordless Login Support

**Automation & Control:**
- ✅ Headless Browser Operation
- ✅ Clustering Support (Multiple accounts simultaneously)
- ✅ Configurable Task Selection
- ✅ Proxy Support
- ✅ Automatic Scheduling (Docker)

**Search & Activities:**
- ✅ Desktop & Mobile Searches
- ✅ Microsoft Edge Search Simulation
- ✅ Geo-Located Search Queries
- ✅ Emulated Scrolling & Link Clicking
- ✅ Daily Set Completion
- ✅ Promotional Activities
- ✅ Punchcard Completion
- ✅ Daily Check-in
- ✅ Read to Earn Activities

**Quiz & Interactive Content:**
- ✅ Quiz Solving (10 & 30-40 point variants)
- ✅ This Or That Quiz (Random answers)
- ✅ ABC Quiz Solving
- ✅ Poll Completion
- ✅ Click Rewards

**Notifications & Monitoring:**
- ✅ Discord Webhook Integration
- ✅ Dedicated Summary Webhook
- ✅ Comprehensive Logging
- ✅ Docker Support with Monitoring

---

## ⚠️ Disclaimer

**Use at your own risk!** Your Microsoft Rewards account may be suspended or banned when using automation scripts.

This script is provided for educational purposes. The authors are not responsible for any account actions taken by Microsoft.

---

## 🤝 Contributing

This project is primarily for personal use but contributions are welcome. Please ensure any changes maintain compatibility with the existing configuration system.
