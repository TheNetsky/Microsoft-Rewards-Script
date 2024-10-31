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
**Note:** If you had previously built and run the script locally, remove the `/node_modules` and `/dist` from your Microsoft-Rewards-Script folder.

1. Download the source code
2. Make changes to your `accounts.json` and `config.json`
3. **Headless mode must be enabled.** You can do this in `config.json` or by using the `HEADLESS=true` environmental variable in docker run or docker compose.yaml (see below). Environmental variables are prioritized over the values in config.json. 
4. The container has in-built scheduling. Customize your schedule using the `CRON_START_TIME` environmental variable. Use [crontab.guru](crontab.guru) if you're unsure how to create a cron schedule.
5. **Note:** the container will add between 5 and 50 minutes of randomized variability to your scheduled start times. 

### Option 1: build and run with docker run

1. Build or re-build the container image with: `docker build -t microsoft-rewards-script-docker .` 

2. Run the container with:

   ```bash
   docker run --name netsky -d \
   -e TZ=America/New_York \
   -e HEADLESS=true \
   -e RUN_ON_START=true \
   -e CRON_START_TIME="0 5,11 * * *" \
   microsoft-rewards-script-docker
   ```
   
3. Optionally, customize your config by adding any other environmental variables from the table below.

4. You can view logs with `docker logs netsky`.

### Option 2: use docker compose

1. A basic docker compose.yaml has been provided. 

2. Optionally, customize your config by adding any other environmental variables from the table below.

3. Build and start the container using `docker compose up -d`.  

4. You can view logs with `docker logs netsky`


## Config ## 
| Setting        | Description           | Default  | Docker Environmental Variable |
| :------------- |:-------------| :-----| :-----|
|  baseURL    | MS Rewards page | `https://rewards.bing.com` | BASE_URL |
|  sessionPath    | Path to where you want sessions/fingerprints to be stored | `sessions` (In ./browser/sessions) | SESSION_PATH |
|  headless    | If the browser window should be visible be ran in the background | `false` (Browser is visible) | HEADLESS *(must be set to `true` for docker)* |
|  runOnZeroPoints    | Run the rest of the script if 0 points can be earned | `false` (Will not run on 0 points) | RUN_ON_ZERO_POINTS |
|  clusters    | Amount of instances ran on launch, 1 per account | `1` (Will run 1 account at the time) | CLUSTERS |
|  saveFingerprint    | Re-use the same fingerprint each time | `false` (Will generate a new fingerprint each time) | SAVE_FINGERPRINT |
|  workers.doDailySet    | Complete daily set items | `true`  | DO_DAILY_SET |
|  workers.doMorePromotions    | Complete promotional items | `true`  | DO_MORE_PROMOTIONS |
|  workers.doPunchCards    | Complete punchcards | `true`  | DO_PUNCH_CARDS |
|  workers.doDesktopSearch    | Complete daily desktop searches | `true`  | DO_DESKTOP_SEARCH |
|  workers.doMobileSearch    | Complete daily mobile searches | `true`  | DO_MOBILE_SEARCH |
|  workers.doDailyCheckIn    | Complete daily check-in activity | `true`  | DO_DAILY_CHECK_IN |
|  workers.doReadToEarn    | Complete read to earn activity | `true`  | DO_READ_TO_EARN |
|  globalTimeout    | The length before the action gets timeout | `30s`   | GLOBAL_TIMEOUT |
|  searchSettings.useGeoLocaleQueries    | Generate search queries based on your geo-location | `true` (Uses EN-US generated queries)  | USE_GEO_LOCALE_QUERIES |
|  scrollRandomResults    | Scroll randomly in search results | `true`   | SCROLL_RANDOM_RESULTS |
|  searchSettings.clickRandomResults    | Visit random website from search result| `true`   | CLICK_RANDOM_RESULTS |
|  searchSettings.searchDelay    | Minimum and maximum time in miliseconds between search queries | `min: 1min`    `max: 2min` | SEARCH_DELAY_MIN SEARCH_DELAY_MAX |
|  searchSettings.retryMobileSearchAmount     | Keep retrying mobile searches for specified amount | `3` | RETRY_MOBILE_SEARCH |
|  webhook.enabled     | Enable or disable your set webhook | `false` | WEBHOOK_ENABLED |
|  webhook.url     | Your Discord webhook URL | `null` | WEBHOOK_URL="" |
| cronStartTime | Scheduled script run-time, *only available for docker implementation* | `0 5,11 * * *` (5:00 am, 11:00 am daily) | CRON_START_TIME="" |
|  | Run the script immediately when the Docker container starts | `true` | RUN_ON_START |

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
