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
1. Download the source code
2. Make changes to your `accounts.json`
3. **Headless mode must be enabled when using Docker.** You can do this using the `HEADLESS=true` environmental variable in docker run or docker compose.yaml (see below). Environmental variables are always prioritized over the values in config.json. 
4. The container will run scheduled. Customize your schedule using the `CRON_START_TIME` environmental variable. Use [crontab.guru](crontab.guru) if you're unsure how to create a cron schedule.
5. **Note:** the container will add between 5 and 50 minutes of randomized variability to your scheduled start times. 
### Option 1: build and run with docker run

1. Build or re-build the container image with: `docker build -t microsoft-rewards-script-docker .` 

2. Run the container with:

   ```bash
   docker run --name netsky -d \
   -e TZ=America/New_York \
   -e HEADLESS=true \
   -e SEARCH_DELAY_MIN=10000 \
   -e SEARCH_DELAY_MAX=20000 \
   -e CLUSTERS=1 \
   -e CRON_START_TIME="0 5,11 * * *" \
   microsoft-rewards-script-docker
   ```

3. Optionally, change any environmental variables other than `HEADLESS`, which must stay `=true`

4. You can view logs with `docker logs netsky`.

### Option 2: use docker compose

1. A basic docker compose.yaml has been provided. 

2. Optionally, change any environmental variables other than `HEADLESS`, which must stay `=true`

3. Build or rebuild and start the container using `docker compose up -d --build` 

4. You can view logs with `docker logs netsky`


## Config ## 
| Setting        | Description           | Default  | Docker Environmental Variable |
| :------------- |:-------------| :-----| ------|
|  baseURL    | MS Rewards page | `https://rewards.bing.com` |  |
|  sessionPath    | Path to where you want sessions/fingerprints to be stored | `sessions` (In ./browser/sessions) |  |
|  headless    | If the browser window should be visible be ran in the background | `false` (Browser is visible) | HEADLESS *(must be set to `=true` for docker)* |
|  runOnZeroPoints    | Run the rest of the script if 0 points can be earned | `false` (Will not run on 0 points) |  |
|  clusters    | Amount of instances ran on launch, 1 per account | `1` (Will run 1 account at the time) | CLUSTERS |
|  saveFingerprint    | Re-use the same fingerprint each time | `false` (Will generate a new fingerprint each time) |  |
|  workers.doDailySet    | Complete daily set items | `true`  |   |
|  workers.doMorePromotions    | Complete promotional items | `true`  |   |
|  workers.doPunchCards    | Complete punchcards | `true`  |   |
|  workers.doDesktopSearch    | Complete daily desktop searches | `true`  |   |
|  workers.doMobileSearch    | Complete daily mobile searches | `true`  |   |
|  globalTimeout    | The length before the action gets timeout | `30000` (30 seconds)   |   |
|  searchSettings.useGeoLocaleQueries    | Generate search queries based on your geo-location | `false` (Uses EN-US generated queries)  |   |
|  scrollRandomResults    | Scroll randomly in search results | `true`   |    |
|  searchSettings.clickRandomResults    | Visit random website from search result| `true`   |    |
|  searchSettings.searchDelay    | Minimum and maximum time in miliseconds between search queries | `min: 10000` (10 seconds)    `max: 20000` (20 seconds) | SEARCH_DELAY_MIN SEARCH_DELAY_MAX |
|  searchSettings.retryMobileSearch     | Keep retrying mobile searches until completed (indefinite)| `false` |  |
|  webhook.enabled     | Enable or disable your set webhook | `false` |  |
|  webhook.url     | Your Discord webhook URL | `null` |  |
| cronStartTime | Scheduled script run-time, *only available for docker implementation* | `0 5,11 * * *` (5:00 am, 11:00 am daily) | CRON_START_TIME |
|  | Run the script immediately when the Docker container starts | `true` | RUN_ON_START |

## Features ##
- [x] Multi-Account Support
- [x] Session Storing
- [x] 2FA Support
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
- [ ] Completing Shopping Game
- [ ] Completing Gaming Tab
- [x] Clustering Support
- [x] Proxy Support
- [x] Docker Support (experimental)
- [x] Automatic scheduling (via Docker)

## Disclaimer ##
Your account may be at risk of getting banned or suspended using this script, you've been warned!
<br /> 
Use this script at your own risk!
