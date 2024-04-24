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
3. **Headless mode must be enabled when using Docker** using the `HEADLESS=true` environmental variable in docker run or docker compose.yaml (see examples below).
4. Optionally, you can add and customize environmental variables when running the container. Refer to the config table below for a full list of available variables. It's important to note that custom values for environmental variables provided during `docker run` or `docker-compose up` always supersede the values in `config.json`. In other words, you do not need to modify the values in the `config.json` file if you provide them as environmental variables.
5. The container will run immediately after starting then remain idle until the next scheduled run. Customize your schedule using the `CRON_START_TIME` environmental variable. Use [crontab.guru](crontab.guru) if you're unsure how to create a cron schedule. **Note:** the container will add between 5 and 50 minutes of randomized variability to your scheduled start times. 
### Option 1: build and run with docker run

1. Build or re-build the container image with: `docker build -t microsoft-rewards-script-docker .` 

2. Run the container with the following command (note: change TZ to your local timezone) :

   ```bash
   docker run --name netsky -d \
   -e TZ=America/New_York \
   -e HEADLESS=true \
   -e NODE_ENV=production \
   microsoft-rewards-script-docker
   ```
   
4. You can view logs with `docker logs netsky`.

### Option 2: use docker compose

1. A basic `docker-compose.yaml` file has been provided.

2. Build or rebuild and start the container using `docker compose up -d --build`.
3. You can view logs with `docker logs netsky`.


## Config ## 
| Setting        | Description           | Default  | Docker Environment Variable |
| :------------- |:-------------| :-----| ------|
| baseURL                                                  | MS Rewards page                                              | `https://rewards.bing.com`                          | BASE_URL                                                     |
| sessionPath                                              | Path to where you want sessions/fingerprints to be stored    | `sessions` (In ./browser/sessions)                  | SESSION_PATH                                                 |
| headless                                                 | If the browser window should be visible be ran in the background | `false` (Browser is visible)                        | HEADLESS *(must be set to `=true` for docker)*               |
| runOnZeroPoints                                          | Run the rest of the script if 0 points can be earned         | `false` (Will not run on 0 points)                  | RUN_ON_ZERO_POINTS                                           |
| clusters                                                 | Amount of instances ran on launch, 1 per account             | `1` (Will run 1 account at the time)                | CLUSTERS                                                     |
| saveFingerprint                                          | Re-use the same fingerprint each time                        | `false` (Will generate a new fingerprint each time) | SAVE_FINGERPRINT                                             |
| workers.doDailySet                                       | Complete daily set items                                     | `true`                                              | WORKERS_DO_DAILY_SET                                         |
| workers.doMorePromotions                                 | Complete promotional items                                   | `true`                                              | WORKERS_DO_MORE_PROMOTIONS                                   |
| workers.doPunchCards                                     | Complete punchcards                                          | `true`                                              | WORKERS_DO_PUNCH_CARDS                                       |
| workers.doDesktopSearch                                  | Complete daily desktop searches                              | `true`                                              | WORKERS_DO_DESKTOP_SEARCH                                    |
| workers.doMobileSearch                                   | Complete daily mobile searches                               | `true`                                              | WORKERS_DO_MOBILE_SEARCH                                     |
| searchSettings.useGeoLocaleQueries                       | Generate search queries based on your geo-location           | `false` (Uses EN-US generated queries)              | SEARCH_SETTINGS_USE_GEO_LOCALE_QUERIES                       |
| scrollRandomResults                                      | Scroll randomly in search results                            | `true`                                              | SEARCH_SETTINGS_SCROLL_RANDOM_RESULTS                        |
| searchSettings.clickRandomResults                        | Visit random website from search result                      | `true`                                              | SEARCH_SETTINGS_CLICK_RANDOM_RESULTS                         |
| searchSettings.searchDelay                               | Minimum and maximum time in miliseconds between search queries | `min: 10000` (10 seconds) `max: 20000` (20 seconds) | SEARCH_SETTINGS_SEARCH_DELAY_MIN SEARCH_SETTINGS_SEARCH_DELAY_MAX |
| searchSettings.retryMobileSearch                         | Keep retrying mobile searches until completed (indefinite)   | `false`                                             | SEARCH_SETTINGS_RETRY_MOBILE_SEARCH                          |
| webhook.enabled                                          | Enable or disable your set webhook                           | `false`                                             | WEBHOOK_ENABLED                                              |
| webhook.url                                              | Your Discord webhook URL                                     | `null`                                              | WEBHOOK_URL                                                  |
| cronStartTime *only available for docker implementation* | Scheduled script run-time                                    | `0 5,11 * * *` (5:00 am, 11:00 am daily)            | CRON_START_TIME                                              |

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
