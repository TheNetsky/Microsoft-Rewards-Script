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

#### 1. **Desktop Viewport/UA Switch BEFORE Quest Processing** (NEW - CRITICAL FIX)

- **Problem:** Task links were not rendering in headless mode because script used mobile viewport (412x915) and mobile user agent
- **Solution:** Switch to desktop viewport (1920x1080) and desktop user agent BEFORE processing quests
- **Result:** HTML now loads with 82K+ bytes and includes task link container elements
- **Code Location:** Lines 32-55 in doQuests()

#### 2. Enhanced Link Detection (Lines 338-407)

- **Method 1:** Direct `querySelectorAll('a[href]')` with filter for ms-search/bing.com/search
- **Method 2:** Fallback search in element HTML for headless mode (when Method 1 finds nothing)
- **Method 3:** Aggressive regex-based extraction from `document.body.innerHTML` as last resort
    - Extracts ms-search:// URLs via regex: `/href=["']([^"']*ms-search:\/\/[^"']*)["']/g`
    - Extracts bing.com/search URLs via regex: `/href=["']([^"']*bing\.com\/search[^"']*)["']/g`
- **Post-hydration wait:** Added 3000ms wait after scrolling to allow React/Next.js components to fully render

#### 3. Improved Click Strategy (Lines 527-627)

- **Strategy 1:** Exact href match using `a[href="${destination}"]`
- **Strategy 2:** Partial href match:
    - For ms-search: Extract query parameter and match `a[href*="ms-search://"][href*="${query}"]`
    - For bing search: Match `a[href*="bing.com/search"]`
- **Strategy 3:** JavaScript click simulation as last resort
    - Uses `document.querySelectorAll` + `Array.find()` to locate link by exact href
    - Calls `.click()` directly from within page context
    - Avoids locator/element reference issues in headless mode
- **Dialog handling:** Improved logging for ms-search alert detection and dismissal

#### 4. Enhanced Diagnostics (Lines 270-300)

- Captures HTML body length, total anchor tags count
- Counts ms-search and bing search links separately
- Logs visible text snippet for debugging

### Test Results - Initial

```
HTML body length: 82940 bytes | Total <a> tags: 24 | ms-search: 0 | bing search: 0
```

Despite HTML loading with 82K, task links still not found. Root cause analysis:

- HTML HTML loads but task links still not rendering even with desktop viewport
- Possible reasons:
    1. Microsoft may use lazy loading or intersection observer that requires user interaction
    2. Task links may be in iframes or shadow DOM
    3. Microsoft may conditionally render based on account/quest status
    4. Rate limiting on account side (encountered "Too many requests" error)

### Key Findings

1. **Viewport/UA IS critical** - Without desktop viewport, HTML doesn't fully load
2. **HTML loading != Task links rendering** - Even with 82K HTML, task links elements may not be present
3. **Account rate limiting** - After multiple test attempts, Microsoft blocks with "Too many requests"
4. **Detection logic is solid** - Multiple fallback strategies ensure detection if links exist

### Commits Made

1. **4b68b2c** - feat: implement headless-mode-compatible quest task detection and clicking
2. **6f32e99** - fix: set desktop viewport and user agent before processing quests

### What Needs Investigation

1. **Why are task links not rendering despite desktop viewport?**
    - Possible: Microsoft uses JS rendering that requires specific conditions
    - Possible: Task links only appear for quests with pending tasks
    - Possible: Need more aggressive waiting (5000ms+ instead of 3000ms)
    - Possible: Need to trigger intersection observer or scroll into specific elements

2. **Next debugging steps:**
    - Check if BrowserOS can see task links with headless: false on same account
    - Inspect page structure with devtools to see if task links are in DOM at all
    - Check for iframes containing task content
    - Verify if task link HTML changes after certain user interactions
    - Check if account needs specific conditions (quest not started, etc.)

3. **Alternative approaches if headless detection fails:**
    - Use API endpoint (getuserinfo.json) to get task URLs directly
    - Implement API-based task clicking instead of DOM parsing
    - Use puppeteer's `exposeFunction` to call Node code from page context

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
