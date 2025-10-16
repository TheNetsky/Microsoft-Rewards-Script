# 💳 Buy Mode

**Manually redeem rewards while monitoring points**

---

## 💡 What Is It?

Launches browser and **passively monitors** your points balance while you manually shop/redeem.

**Use case:** Safely redeem gift cards without automation interference.

---

## ⚡ Quick Start

```bash
npm start -- -buy your@email.com
```

**What happens:**
1. Opens 2 browser tabs:
   - **Monitor tab** — Background point tracking (auto-refresh)
   - **Your tab** — Use this for manual purchases
2. Monitors points every ~10 seconds
3. Alerts you when spending detected

---

## 🎯 Example Usage

### Redeem Gift Card

```bash
npm start -- -buy myaccount@outlook.com
```

1. Script opens Microsoft Rewards in browser
2. Use the **user tab** to browse and redeem
3. **Monitor tab** tracks your balance in background
4. Get notification when points decrease

---

## ⚙️ Configuration

**Set max session time:**

**Edit** `src/config.jsonc`:
```jsonc
{
  "buyMode": {
    "enabled": false,
    "maxMinutes": 45
  }
}
```

---

## 🔔 Notifications

Buy mode sends alerts when:
- 💳 **Points spent** — Shows amount and new balance
- 📉 **Balance changes** — Tracks cumulative spending

**Example alert:**
```
💳 Spend detected (Buy Mode)
Account: user@email.com
Spent: -500 points
Current: 12,500 points
Session spent: 1,200 points
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Monitor tab closes** | Script auto-reopens it |
| **No spending alerts** | Check webhook/NTFY config |
| **Session too short** | Increase `maxMinutes` in config |

---

## ⚠️ Important Notes

- ✅ **Browser visible** — Always runs in visible mode
- ✅ **No automation** — Script only monitors, never clicks
- ✅ **Safe** — Use your browsing tab normally
- ✅ **Notifications** — Uses existing webhook/NTFY settings

---

## 📚 Next Steps

**Setup notifications?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**  
→ **[NTFY Push](./ntfy.md)**

**Back to automation?**  
→ **[Getting Started](./getting-started.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
