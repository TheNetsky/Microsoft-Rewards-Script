# Microsoft-Rewards-Script
Automated Microsoft Rewards script, however this time using TypeScript, Cheerio and Playwright.

Under development, however mainly for personal use!

## How to setup ##
1. Download or clone source code
2. Run `npm i` to install the packages
3. Change `accounts.example.json` to `accounts.json` and add your account details
4. Change `config.json` to your liking
5. Run `npm run build` to build the script
6. Run `npm run start` to start the built script

## Notes ##
- If you end the script without closing the browser window first (only with headless as false), you'll be left with hanging chrome instances using resources. Use taskmanager to kill these or use the included `npm run kill-chrome-win` script. (Windows)
- If you automate this script, set it to run at least 2 times a day to make sure it picked up all tasks, set `"runOnZeroPoints": false` so it doesn't run when no points are found.

## Docker (Experimental) ##
### **Before Starting**

- If you had previously built and run the script locally, **remove** the `/node_modules` and `/dist` folders from your `Microsoft-Rewards-Script` directory.
- If you had used Docker with an older version of the script (e.g., 1.4), **remove** any persistently saved `config.json` and session folders. Old `accounts.json` files can be reused.

### **Setup the Source Files**

1. **Download the Source Code**

2. **Update `accounts.json`**

3. **Edit `config.json`,** ensuring the following values are set (other settings are up to your preference):

   ```json
   "headless": true,
   "clusters": 1,
   ```

### **Customize the `compose.yaml` File**

A basic docker `compose.yaml` is provided. Follow these steps to configure and run the container:

1. **Set Your Timezone:** Adjust the `TZ` variable to ensure correct scheduling.
2. **Configure Persistent Storage:**
   - Map `config.json` and `accounts.json` to retain settings and accounts.
   - (Optional) Use a persistent `sessions` folder to save login sessions.
3. **Customize the Schedule:**
   - Modify `CRON_SCHEDULE` to set run times. Use [crontab.guru](https://crontab.guru) for help.
   - **Note:** The container adds 5–50 minutes of random variability to each scheduled start time.
4. **(Optional) Run on Startup:**
   - Set `RUN_ON_START=true` to execute the script immediately when the container starts.
5. **Start the Container:** Run `docker compose up -d` to build and launch.
6. **Monitor Logs:** Use `docker logs microsoft-rewards-script` to view script execution and to retrieve 'passwordless' login codes.


## Config ## 
| Setting        | Description           | Default  |
| :------------- |:-------------| :-----|
|  baseURL    | MS Rewards page | `https://rewards.bing.com` |
|  sessionPath    | Path to where you want sessions/fingerprints to be stored | `sessions` (In ./browser/sessions) |
|  headless    | If the browser window should be visible be ran in the background | `false` (Browser is visible) |
|  parallel    | If you want mobile and desktop tasks to run parallel or sequential| `true` |
|  runOnZeroPoints    | Run the rest of the script if 0 points can be earned | `false` (Will not run on 0 points) |
|  clusters    | Amount of instances ran on launch, 1 per account | `1` (Will run 1 account at the time) |
|  saveFingerprint.mobile    | Re-use the same fingerprint each time | `false` (Will generate a new fingerprint each time) |
|  saveFingerprint.desktop    | Re-use the same fingerprint each time | `false` (Will generate a new fingerprint each time) |
|  workers.doDailySet    | Complete daily set items | `true`  |
|  workers.doMorePromotions    | Complete promotional items | `true`  |
|  workers.doPunchCards    | Complete punchcards | `true`  |
|  workers.doDesktopSearch    | Complete daily desktop searches | `true`  |
|  workers.doMobileSearch    | Complete daily mobile searches | `true`  |
|  workers.doDailyCheckIn    | Complete daily check-in activity | `true`  |
|  workers.doReadToEarn    | Complete read to earn activity | `true`  |
|  searchOnBingLocalQueries    | Complete the activity "search on Bing" using the `queries.json` or fetched from this repo | `false` (Will fetch from this repo)   |
|  globalTimeout    | The length before the action gets timeout | `30s`   |
|  searchSettings.useGeoLocaleQueries    | Generate search queries based on your geo-location | `false` (Uses EN-US generated queries)  |
|  searchSettings.scrollRandomResults    | Scroll randomly in search results | `true`   |
|  searchSettings.clickRandomResults    | Visit random website from search result| `true`   |
|  searchSettings.searchDelay    | Minimum and maximum time in milliseconds between search queries | `min: 3min`    `max: 5min` |
|  searchSettings.retryMobileSearchAmount     | Keep retrying mobile searches for specified amount | `2` |
|  logExcludeFunc | Functions to exclude out of the logs and webhooks | `SEARCH-CLOSE-TABS` |
|  webhookLogExcludeFunc | Functions to exclude out of the webhooks log | `SEARCH-CLOSE-TABS` |
|  proxy.proxyGoogleTrends     | Enable or disable proxying the request via set proxy | `true` (will be proxied) |
|  proxy.proxyBingTerms     | Enable or disable proxying the request via set proxy | `true` (will be proxied) |
|  webhook.enabled     | Enable or disable your set webhook | `false` |
|  webhook.url     | Your Discord webhook URL | `null` |

## Features ##
- [x] Multi-Account Support
- [x] Session Storing
- [x] 2FA Support
- [x] Passwordless Support
- [x] Headless Support
- [x] Discord Webhook Support
- [x] Desktop Searches
- [x] Configurable Tasks
- [x] Microsoft Edge Searches
- [x] Mobile Searches
- [x] Emulated Scrolling Support
- [x] Emulated Link Clicking Support
- [x] Geo Locale Search Queries
- [x] Completing Daily Set
- [x] Completing More Promotions
- [x] Solving Quiz (10 point variant)
- [x] Solving Quiz (30-40 point variant)
- [x] Completing Click Rewards
- [x] Completing Polls
- [x] Completing Punchcards
- [x] Solving This Or That Quiz (Random)
- [x] Solving ABC Quiz
- [x] Completing Daily Check In
- [x] Completing Read To Earn
- [x] Clustering Support
- [x] Proxy Support
- [x] Docker Support (experimental)
- [x] Automatic scheduling (via Docker)

## Disclaimer ##
Your account may be at risk of getting banned or suspended using this script, you've been warned!
<br /> 
Use this script at your own risk!
