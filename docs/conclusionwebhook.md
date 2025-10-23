# 📊 Discord Webhooks

**Get beautiful run summaries in Discord**

---

## 💡 What Is It?

Sends a **professional, rich embed** to your Discord server after each run with:
- 📊 **Total accounts processed** with success/warning/banned breakdown
- 💎 **Points earned** — clear before/after comparison
- ⚡ **Performance metrics** — average points and execution time
- 📈 **Per-account breakdown** — detailed stats for each account
- 🎨 **Beautiful formatting** — color-coded status, emojis, and clean layout
- ⏱️ **Timestamp** and version info in footer

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
      "url": "https://discord.com/api/webhooks/123456789/abcdef-your-webhook-token",
      // Optional: Customize webhook appearance
      "username": "Microsoft Rewards",
      "avatarUrl": "https://media.discordapp.net/attachments/1421163952972369931/1421929950377939125/Gc.png"
    }
  }
}
```

**That's it!** You'll get a summary after each run.

---

## 📋 Example Summary

The new webhook format provides a **clean, professional Discord embed** with:

### Main Summary Card
```
🎯 Microsoft Rewards — Daily Summary

Status: ✅ Success
Version: v2.4.0 • Run ID: abc123xyz
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Global Statistics
💎 Total Points Earned
15,230 → 16,890 (+1,660)

📊 Accounts Processed
✅ Success: 3 | ⚠️ Errors: 0 | 🚫 Banned: 0
Total: 3 accounts

⚡ Performance
Average: 553pts/account in 8m 32s
Total Runtime: 25m 36s
```

### Per-Account Details
```
� Account Details

✅ user1@example.com
└ Points: +720 (🖥️ 450 • 📱 270)
└ Duration: 7m 23s

✅ user2@example.com
└ Points: +940 (🖥️ 540 • 📱 400)
└ Duration: 9m 41s

✅ user3@example.com
└ Points: +0 (🖥️ 0 • 📱 0)
└ Duration: 8m 32s
```

**Color coding:**
- 🟢 **Green** — All accounts successful
- 🟠 **Orange** — Some accounts with errors
- 🔴 **Red** — Banned accounts detected

---

## 🎯 Advanced: Separate Channels

Use different webhooks for different notifications:

```jsonc
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../errors-channel",
      "username": "Rewards Errors",
      "avatarUrl": "https://example.com/error-icon.png"
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../summary-channel",
      "username": "Rewards Summary",
      "avatarUrl": "https://example.com/success-icon.png"
    }
  }
}
```

- **`webhook`** — Real-time errors during execution
- **`conclusionWebhook`** — End-of-run summary

### 🎨 Customize Webhook Appearance

You can personalize how your webhook appears in Discord:

- **`username`** — The display name shown in Discord (default: "Microsoft Rewards")
- **`avatarUrl`** — Direct URL to an image for the webhook's avatar

**Example:**
```jsonc
"conclusionWebhook": {
  "enabled": true,
  "url": "YOUR_WEBHOOK_URL",
  "username": "My Custom Bot Name",
  "avatarUrl": "https://i.imgur.com/YourImage.png"
}
```

> **💡 Tip:** If you set custom values for both `webhook` and `conclusionWebhook`, the conclusion webhook will use its own settings. Otherwise, it falls back to the main webhook settings.

---

## 🎨 New Enhanced Format Features

The **v2.4+** webhook format includes:

### Visual Improvements
- ✨ **Clean, professional layout** with clear sections
- 🎨 **Color-coded status** (Green/Orange/Red based on results)
- 📊 **Thumbnail image** for brand recognition
- ⏰ **Footer with timestamp** and version info
- 🔢 **Formatted numbers** with thousands separators

### Better Organization
- **Main embed** — Global statistics and summary
- **Detail fields** — Per-account breakdown (auto-splits for many accounts)
- **Smart truncation** — Long emails and errors are shortened intelligently
- **Status icons** — ✅ Success, ⚠️ Warning, 🚫 Banned

### More Information
- **Before/After points** — Clear progression tracking
- **Desktop vs Mobile** breakdown per account
- **Success rate** — Quick glance at account health
- **Performance metrics** — Average time and points per account

### Smart Splitting
If you have many accounts (5+), the webhook automatically splits details into multiple fields to avoid hitting Discord's character limits.

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
