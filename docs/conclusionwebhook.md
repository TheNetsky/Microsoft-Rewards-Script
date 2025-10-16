# 📊 Discord Webhooks

**Get run summaries in Discord**

---

## 💡 What Is It?

Sends a **rich embed** to your Discord server after each run with:
- 📊 Total accounts processed
- 💎 Points earned
- ⏱️ Execution time
- ❌ Errors encountered

---

## ⚡ Quick Start

### 1. Create Webhook in Discord

1. **Open Discord** → Right-click channel
2. **Edit Channel** → **Integrations** tab
3. **Create Webhook**
4. **Copy webhook URL**

### 2. Configure Script

**Edit** `src/config.jsonc`:
```jsonc
{
  "notifications": {
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/123456789/abcdef-your-webhook-token"
    }
  }
}
```

**That's it!** You'll get a summary after each run.

---

## 📋 Example Summary

```
🎯 Microsoft Rewards Summary

📊 Accounts: 3 • 0 with issues
💎 Points: 15,230 → 16,890 (+1,660)
⏱️ Average Duration: 8m 32s
📈 Cumulative Runtime: 25m 36s

👤 user1@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully

👤 user2@example.com
Points: 4,810 → 5,750 (+940)
Duration: 9m 41s
Status: ✅ Completed successfully

👤 user3@example.com
Points: 5,000 → 5,000 (+0)
Duration: 8m 32s
Status: ✅ Completed successfully
```

---

## 🎯 Advanced: Separate Channels

Use different webhooks for different notifications:

```jsonc
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../errors-channel"
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../summary-channel"
    }
  }
}
```

- **`webhook`** — Real-time errors during execution
- **`conclusionWebhook`** — End-of-run summary

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No message received** | Check webhook URL is complete |
| **"Invalid webhook"** | Regenerate webhook in Discord |
| **Partial data** | Ensure script completed fully |

### Test Webhook Manually

```bash
curl -X POST -H "Content-Type: application/json" -d '{"content":"Test message"}' "YOUR_WEBHOOK_URL"
```

---

## 📚 Next Steps

**Want mobile alerts?**  
→ **[NTFY Push Notifications](./ntfy.md)**

**Need detailed logs?**  
→ **[Diagnostics Guide](./diagnostics.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
