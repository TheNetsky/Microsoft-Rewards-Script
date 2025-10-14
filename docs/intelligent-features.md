# 🚀 New Features Integration Guide

This guide shows how to use the new intelligent features added in v2.2.0.

## 📋 Quick Reference

All new features are configured in `src/config.jsonc`:

```jsonc
{
  "riskManagement": {
    "enabled": true,
    "autoAdjustDelays": true,
    "banPrediction": true,
    "riskThreshold": 75
  },
  "analytics": {
    "enabled": true,
    "retentionDays": 30,
    "exportMarkdown": true
  },
  "queryDiversity": {
    "enabled": true,
    "sources": ["google-trends", "reddit", "local-fallback"]
  },
  "dryRun": false
}
```

---

## 🛡️ Risk Management

### What It Does
- Monitors captchas, errors, timeouts in real-time
- Calculates risk score (0-100) based on patterns
- Auto-adjusts delays when risk is elevated
- Predicts ban likelihood before it happens

### Configuration

```jsonc
"riskManagement": {
  "enabled": true,              // Master toggle
  "autoAdjustDelays": true,     // 1x → 4x delays when risky
  "stopOnCritical": false,      // Stop if risk > threshold
  "banPrediction": true,        // ML-style pattern analysis
  "riskThreshold": 75           // Pause if score exceeds this
}
```

### Risk Levels
- **0-20**: Safe (green)
- **20-40**: Elevated (yellow)
- **40-70**: High (orange)
- **70+**: Critical (red)

### What Triggers Risk?
- Multiple captchas in short time
- High error rate (>50%)
- Consecutive timeouts
- New account + aggressive activity
- Proxy flagged by Microsoft

### Recommendations by Level
- **Elevated**: Minor delays, keep monitoring
- **High**: 2.5x delays, reduce activity
- **Critical**: Stop automation for 24-48h

---

## 📊 Analytics Dashboard

### What It Tracks
- Points earned per day/account
- Success vs failure rates
- Execution times and trends
- Ban history and risk scores

### Output Location
`analytics/<email>_<date>.json`

Example:
```json
{
  "date": "2025-10-14",
  "email": "user@example.com",
  "pointsEarned": 180,
  "desktopPoints": 120,
  "mobilePoints": 60,
  "executionTimeMs": 450000,
  "successRate": 0.95,
  "errorsCount": 2,
  "banned": false,
  "riskScore": 25
}
```

### Generate Reports

The bot automatically creates:
- `reports/<date>/summary_<runId>.json` (per-run summary)
- Markdown tables (when `exportMarkdown: true`)

### View Analytics

```typescript
import { Analytics } from "./src/util/Analytics"

const analytics = new Analytics()
const history = analytics.getAccountHistory("user@example.com", 30)

console.log(`Total points (30 days): ${history.totalPointsEarned}`)
console.log(`Avg per day: ${history.avgPointsPerDay}`)
console.log(`Success rate: ${(history.successRate * 100).toFixed(1)}%`)

// Generate markdown report
const markdown = analytics.exportMarkdown(30)
console.log(markdown)
```

---

## 🔍 Query Diversity Engine

### Why Use It?
Default (Google Trends only) = **predictable patterns** → higher ban risk  
Diversity (multiple sources) = **natural variety** → lower detection

### Available Sources
1. **google-trends**: Trending searches (default)
2. **reddit**: Hot posts from popular subreddits
3. **news**: Headlines from news sites/APIs
4. **wikipedia**: Random articles + trending topics
5. **local-fallback**: Curated safe queries

### Configuration

```jsonc
"queryDiversity": {
  "enabled": true,
  "sources": ["google-trends", "reddit", "news", "local-fallback"],
  "maxQueriesPerSource": 10,
  "cacheMinutes": 30
}
```

### Strategy Mixing

When enabled, queries are **interleaved** from different sources:
```
Search 1: Google Trends → "climate change"
Search 2: Reddit       → "best gaming laptop 2025"
Search 3: News         → "latest space mission"
Search 4: Wikipedia    → "quantum computing"
Search 5: Google Trends → "celebrity news"
...
```

This breaks the pattern of "all searches from same source = bot".

### API Keys (Optional)

For **news** source, set environment variable:
```bash
export NEWS_API_KEY="your_newsapi_org_key"
```

Without it, falls back to web scraping (BBC headlines).

---

## ✅ Config Validator

### What It Checks

**Errors** (blocks execution):
- Empty emails/passwords
- Invalid email formats
- Duplicate accounts
- Missing proxy ports
- Invalid time windows

**Warnings** (shows but continues):
- Very short timeouts/delays
- Too many retry attempts
- Shared proxies across accounts
- High cluster count

**Info** (FYI):
- Clusters > accounts
- Parallel mode with 1 account
- All workers disabled

### Run Validator

```typescript
import { ConfigValidator } from "./src/util/ConfigValidator"

const result = ConfigValidator.validateFromFiles(
  "src/config.jsonc",
  "src/accounts.json"
)

ConfigValidator.printResults(result)

if (!result.valid) {
  process.exit(1) // Stop if errors found
}
```

### Output Example

```
❌ Configuration validation failed

🚫 ERRORS (2):
  accounts[0].password: Account password is empty
  webhook.url: Webhook enabled but URL is empty

⚠️  WARNINGS (1):
  searchSettings.searchDelay.min: Very short search delays increase ban risk
    → Use at least 30s between searches

ℹ️  INFO (1):
  clusters: 4 clusters configured but only 2 account(s)
    → Reduce clusters to match account count for efficiency
```

---

## 🧪 Dry-Run Mode

### What It Does
- **Logs actions** instead of executing them
- Shows what **would** happen
- **Estimates** execution time
- **Safe testing** of new configs

### Enable It

```jsonc
{
  "dryRun": true
}
```

### Output Example

```
[DRY-RUN] Would login to user@example.com
[DRY-RUN] Would navigate to rewards dashboard
[DRY-RUN] Would complete Daily Set (3 activities)
[DRY-RUN] Would perform 30 desktop searches
[DRY-RUN] Would perform 20 mobile searches
[DRY-RUN] Estimated time: 8 minutes
[DRY-RUN] Estimated points: 150-180
```

### Use Cases
1. **Test new accounts** without risking bans
2. **Debug config issues** (wrong timeouts, bad proxies)
3. **Estimate run duration** before scheduling
4. **Validate changes** after editing config

---

## 🎯 Recommended Setup

### For Maximum Safety

```jsonc
{
  "humanization": {
    "enabled": true,
    "stopOnBan": true,
    "actionDelay": { "min": "500ms", "max": "2s" },
    "gestureMoveProb": 0.7,
    "gestureScrollProb": 0.5,
    "allowedWindows": ["09:00-12:00", "18:00-22:00"]
  },
  "searchSettings": {
    "delay": { "min": "1min", "max": "3min" }
  },
  "riskManagement": {
    "enabled": true,
    "autoAdjustDelays": true,
    "banPrediction": true,
    "stopOnCritical": true,
    "riskThreshold": 70
  },
  "queryDiversity": {
    "enabled": true,
    "sources": ["google-trends", "reddit", "wikipedia", "local-fallback"]
  },
  "analytics": {
    "enabled": true,
    "webhookSummary": true
  }
}
```

### For Speed (Higher Risk)

```jsonc
{
  "humanization": {
    "enabled": false
  },
  "searchSettings": {
    "delay": { "min": "15s", "max": "45s" }
  },
  "riskManagement": {
    "enabled": false
  },
  "queryDiversity": {
    "enabled": false
  }
}
```

⚠️ **Not recommended** unless you know what you're doing.

---

## 📈 Monitoring Your Accounts

### Daily Workflow

1. **Morning**: Check analytics dashboard
   ```bash
   npm run analytics:summary
   ```

2. **Check risk scores** in reports
   - Score < 40 = continue normally
   - Score 40-70 = increase delays
   - Score > 70 = pause automation

3. **Review ban predictions**
   - Look for detected patterns
   - Follow preventive actions

4. **Adjust config** based on trends
   - If risk trending up → increase delays
   - If success rate < 80% → check proxies
   - If captchas frequent → slow down

### Weekly Review

Generate 7-day report:
```typescript
const summary = analytics.generateSummary(7)
console.log(analytics.exportMarkdown(7))
```

Look for:
- Declining point trends
- Rising risk scores
- Increasing error rates
- Pattern anomalies

---

## 🔧 Troubleshooting

### "High risk detected"
→ Increase `searchSettings.delay`  
→ Enable `humanization.allowedWindows`  
→ Reduce activity frequency

### "Multiple captchas"
→ Change proxy  
→ Increase delays to 3-5min  
→ Enable `riskManagement.stopOnCritical`

### "Low success rate"
→ Run config validator  
→ Check proxy connectivity  
→ Verify User-Agent settings

### "Analytics not saving"
→ Check `analytics/` folder permissions  
→ Verify disk space  
→ Check logs for write errors

---

## 🎓 Best Practices

1. **Start conservative**: Use long delays initially
2. **Monitor trends**: Watch analytics for 1 week
3. **Adjust gradually**: Don't change too many settings at once
4. **Diversify queries**: Always use multiple sources
5. **Respect risk signals**: If score > 70, pause immediately
6. **Age accounts slowly**: New accounts = higher risk
7. **Use different proxies**: Never share 1 proxy across 5+ accounts
8. **Validate config**: Run validator before every major change
9. **Test with dry-run**: Always test new configs first
10. **Keep analytics**: Historical data improves predictions

---

## 📚 Further Reading

- [docs/config.md](./config.md) - Full config reference
- [docs/humanization.md](./humanization.md) - Anti-ban strategies
- [docs/proxy.md](./proxy.md) - Proxy setup guide
- [docs/diagnostics.md](./diagnostics.md) - Debugging tips

---

**Questions?** Open an issue or check existing docs.

**Working well?** ⭐ Star the repo and share your analytics!
