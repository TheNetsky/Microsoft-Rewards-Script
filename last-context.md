# Quest Implementation Context

## Overview

Implementasi fitur Quest untuk Microsoft Rewards Script V4. Quest adalah kumpulan task yang harus diselesaikan 1-per-1 dengan cooldown antar task. Ada 2 quest yang ditemukan.

## Quest Structure

### Quest 1: Monthly PC Quest

- **OfferId:** `ENWW_pcparent_FY26_BingMonthlyPC_Mar_b_punchcard` (variant a/b = A/B test)
- **Points:** +50
- **Tasks:** 4 tasks dengan `bing.com/search` URLs
- **Status:** 4/4 completed (dari test sebelumnya)
- **Unlock:** Silver level required untuk beberapa task

### Quest 2: Windows Search Box (WSB) Quest

- **OfferId:** `ENstar_pcparent_FY26_WSB_Dec_punchcard`
- **Points:** +100
- **Tasks:** 4 tasks dengan `ms-search://` URLs
- **Status:** 0/4 tasks
- **Task URLs:**
    1. `ms-search://search/?q=create+an+image+of+a+kitten&form=ML2XHK`
    2. `ms-search://search/?q=what+is+the+definition+of+Biodiversity&form=ML2XHL`
    3. `ms-search://search/?q=spaghetti+recipe&form=ML2XHO`
    4. `ms-search://search/?q=calculator&form=ML2XHN`
- **How to complete:** Click link → alert dialog appears → dismiss/cancel → task completed

## Files Modified

### src/functions/activities/browser/Quest.ts

- Main implementation class
- `doQuests()` — entry point
- `findQuestLinks()` — find quests on Earn page via JavaScript
- `processQuest()` — navigate to quest page, find tasks, process them
- `clickTask()` — click task link, handle `ms-search://` alert dialogs
- `parsePunchCardTasks()` — (removed, replaced by page.evaluate)

### src/functions/Activities.ts

- Added `doQuests` method
- Added import for Quest class

### src/interface/Config.ts

- Added `doQuests: boolean` to ConfigWorkers

### src/util/Validator.ts

- Added `doQuests: z.boolean()` validation

### src/index.ts

- Quest worker runs BEFORE MorePromotions
- Order: DailySet → SpecialPromotions → **Quests** → MorePromotions → DailyCheckIn → ReadToEarn → PunchCards

### src/config.json

- Added `"doQuests": true`
- For testing: disable all workers except `doQuests`

### src/config.example.json

- Added `"doQuests": true`

## Key Findings

### Data Sources

1. **Earn page HTML** — quest card links in `section#quests`
2. **Quest detail page** — task links with `bing.com/search` or `ms-search://`
3. **MHTML reference** — desktop browser capture shows full structure
4. **getuserinfo.json** — API response with quest tasks and `ms-search://` URLs

### URL Patterns

- **Bing search:** `https://www.bing.com/search?q=...` — opens new tab, works in headless
- **ms-search:** `ms-search://search/?q=...` — Windows Search Box protocol, triggers alert dialog

### Page Structure

```
Earn page → section#quests → quest cards
Quest detail → Activities section → task cards with links
  <div class="flex flex-col gap-3 pb-4 border-b">
    <h3>Task title</h3>
    <p>Task description</p>
    <a href="ms-search://...">Click button text</a>
  </div>
```

### Known Issues

1. **HTML not loading in headless** — quest pages show 86870 bytes but no task links
2. **panelData access error** — `XMLHttpRequest is not defined` when accessing `this.bot.panelData`
3. **Rate limiting** — Microsoft limits login attempts, need 15-30 min cooldown
4. **ms-search:// in headless** — links may not render in headless mode

## Implementation Approach

### Current: page.evaluate()

```typescript
const allLinks = await page.evaluate(() => {
    const results = []
    document.querySelectorAll('a[href]').forEach(el => {
        const href = el.getAttribute('href') ?? ''
        if (href.includes('bing.com/search') || href.includes('ms-search://')) {
            results.push({ href, text, ariaLabel })
        }
    })
    return results
})
```

### Flow

1. Set desktop viewport (1920x1080)
2. Navigate to `/earn` with `networkidle`
3. Scroll 5x to trigger lazy loading
4. Find quest links via JavaScript
5. Try known quest URLs (ENstar)
6. For each quest:
    - Navigate to quest page
    - Wait for `networkidle`
    - Scroll 5x
    - `page.evaluate()` to find task links
    - Click each link
    - For `ms-search://`: set dialog handler to dismiss alert
    - Cooldown 8-15s between tasks
    - Re-navigate to quest page for next task

## Test Results

### Successful Tests

- ✅ Login and session management
- ✅ Quest detection (2 quests found)
- ✅ Build and compilation
- ✅ Config, Validator, Interface updates

### Failed Tests

- ❌ Task detection on quest pages (HTML not loaded)
- ❌ panelData API access (XMLHttpRequest error)
- ❌ ms-search:// link clicking (no links found)

### Test Commands

```bash
# Build
npm run build

# Run with only quest enabled
# Edit config.json: set all workers to false except doQuests
npm run start

# Check for QUEST output
grep "QUEST" /tmp/quest_*.log
```

## Implementation Updates (Headless Mode Support)

### Changes Made to Quest.ts

#### 1. Enhanced Link Detection (Lines 337-385)

- **Method 1:** Direct `querySelectorAll('a[href]')` with filter for ms-search/bing.com/search
- **Method 2:** Fallback search in element HTML for headless mode (when Method 1 finds nothing)
- **Method 3:** Aggressive regex-based extraction from `document.body.innerHTML` as last resort
    - Extracts ms-search:// URLs via regex: `/href=["']([^"']*ms-search:\/\/[^"']*)["']/g`
    - Extracts bing.com/search URLs via regex: `/href=["']([^"']*bing\.com\/search[^"']*)["']/g`
- **Post-hydration wait:** Added 2000ms wait after scrolling to allow React/Vue components to fully render

#### 2. Improved Click Strategy (Lines 407-506)

- **Strategy 1:** Exact href match using `a[href="${destination}"]`
- **Strategy 2:** Partial href match:
    - For ms-search: Extract query parameter and match `a[href*="ms-search://"][href*="${query}"]`
    - For bing search: Match `a[href*="bing.com/search"]`
- **Strategy 3:** JavaScript click simulation as last resort
    - Uses `document.querySelectorAll` + `Array.find()` to locate link by exact href
    - Calls `.click()` directly from within page context
    - Avoids locator/element reference issues in headless mode
- **Dialog handling:** Improved logging for ms-search alert detection and dismissal

#### 3. Better Page Re-navigation (Lines 362-399)

- Changed from `waitUntil: 'networkidle'` to `'domcontentloaded'` for faster re-navigation (15s timeout)
- Scroll cycle reduced from 5x to 3x per re-navigation to save time
- Added error handling with warning log instead of silent failure
- Total re-navigation cycle: ~3-4 seconds vs previous 5-6 seconds

### Why These Changes Help with Headless Mode

1. **Method 2 & 3 Detection:** Headless mode sometimes doesn't hydrate HTML immediately, so we search in the raw HTML
2. **JavaScript Click:** Patchright locators sometimes fail in headless; direct `.click()` from within page context is more reliable
3. **Extended Hydration Wait:** React/Vue apps may take longer to render in headless; 2000ms buffer helps
4. **Regex Extraction:** As a nuclear option, we parse the HTML ourselves to find href patterns

### Testing Recommendations

```bash
# Build the updated code
npm run build

# Test with headless: true (NEW - should now work)
# Edit config.json: headless: true, only doQuests: true
npm run start

# Expected behavior:
# 1. Find quest links on /earn page
# 2. Navigate to ENstar_pcparent_FY26_WSB_Dec_punchcard
# 3. Detect remaining task links (should find 1 task: "Define any word in Biodiversity")
# 4. Click the ms-search:// link
# 5. Dismiss alert dialog
# 6. Task completed

# Check logs
tail -f dist/logs/*.log | grep -E "QUEST|QUEST-TASK"
```

### Known Limitations & Workarounds

1. **If headless still fails to detect links:**
    - Try increasing the 2000ms hydration wait to 5000ms
    - Add more scroll cycles (change loop `< 3` to `< 5`)
    - Check if Microsoft changed the page structure (validate with BrowserOS)

2. **If ms-search:// dialog doesn't get dismissed:**
    - Verify `page.on('dialog', handler)` is set BEFORE the click
    - Check logs for "Dialog detected" message
    - May need timeout increase if system is slow

3. **If this still doesn't work in your environment:**
    - Fall back to headless: false (GUI mode) which is confirmed working
    - Or implement API-based approach using getuserinfo.json endpoint

## Reference Files

- `refrensi/Earn – Microsoft Rewards.html` — Earn page from desktop browser
- `refrensi/Earn – Microsoft Rewards.mhtml` — MHTML capture from desktop
- `refrensi/Get 100 points...mhtml` — ENstar quest page from desktop
- `refrensi/getuserinfo.json` — API response with quest tasks
- `refrensi/quest_earn_*.html` — Earn page captures from script
- `refrensi/quest_ENstar_*.html` — ENstar quest page captures
- `refrensi/quest_*_punchcard_tasks.json` — Parsed task data

## Config State

```json
{
    "headless": true,
    "workers": {
        "doDailySet": false,
        "doSpecialPromotions": false,
        "doMorePromotions": false,
        "doPunchCards": false,
        "doAppPromotions": false,
        "doDesktopSearch": false,
        "doMobileSearch": false,
        "doDailyCheckIn": false,
        "doReadToEarn": false,
        "doQuests": true
    }
}
```
