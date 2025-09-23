# 📊 Discord Conclusion Webhook

<div align="center">

**🎯 Comprehensive session summaries via Discord**  
*Complete execution reports delivered instantly*

</div>

---

## 🎯 What is the Conclusion Webhook?

The conclusion webhook sends a **detailed summary notification** at the end of each script execution via Discord, providing a complete overview of the session's results across all accounts.

### **Key Features**
- 📊 **Session overview** — Total accounts processed, success/failure counts
- 💎 **Points summary** — Starting points, earned points, final totals
- ⏱️ **Performance metrics** — Execution times, efficiency statistics
- ❌ **Error reporting** — Issues encountered during execution
- 💳 **Buy mode detection** — Point spending alerts and tracking
- 🎨 **Rich embeds** — Color-coded, well-formatted Discord messages

---

## ⚙️ Configuration

### **Basic Setup**
```json
{
  "notifications": {
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/123456789/abcdef-webhook-token-here"
    }
  }
}
```

### **Configuration Options**

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable conclusion webhook | `true` |
| `url` | Discord webhook URL | Full webhook URL from Discord |

---

## 🚀 Discord Setup

### **Step 1: Create Webhook**
1. **Open Discord** and go to your server
2. **Right-click** on the channel for notifications
3. **Select "Edit Channel"**
4. **Go to "Integrations" tab**
5. **Click "Create Webhook"**

### **Step 2: Configure Webhook**
- **Name** — "MS Rewards Summary"
- **Avatar** — Upload rewards icon (optional)
- **Channel** — Select appropriate channel
- **Copy webhook URL**

### **Step 3: Add to Config**
```json
{
  "notifications": {
    "conclusionWebhook": {
      "enabled": true,
      "url": "YOUR_COPIED_WEBHOOK_URL_HERE"
    }
  }
}
```

---

## 📋 Message Format

### **Rich Embed Summary**

#### **Header Section**
```
🎯 Microsoft Rewards Summary
⏰ Completed at 2025-01-20 14:30:15
📈 Total Runtime: 25m 36s
```

#### **Account Statistics**
```
📊 Accounts: 3 • 0 with issues
```

#### **Points Overview**
```
💎 Points: 15,230 → 16,890 (+1,660)
```

#### **Performance Metrics**
```
⏱️ Average Duration: 8m 32s
📈 Cumulative Runtime: 25m 36s
```

#### **Buy Mode Detection** (if applicable)
```
💳 Buy Mode Activity Detected
Total Spent: 1,200 points across 2 accounts
```

### **Account Breakdown**

#### **Successful Account**
```
👤 user@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully
```

#### **Failed Account**
```
👤 problem@example.com  
Points: 3,210 → 3,210 (+0)
Duration: 2m 15s
Status: ❌ Failed - Login timeout
```

#### **Buy Mode Account**
```
💳 spender@example.com
Session Spent: 500 points
Available: 12,500 points
Status: 💳 Purchase activity detected
```

---

## 📊 Message Examples

### **Successful Session**
```discord
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

### **Session with Issues**
```discord
🎯 Microsoft Rewards Summary

📊 Accounts: 3 • 1 with issues
💎 Points: 15,230 → 15,950 (+720)
⏱️ Average Duration: 6m 15s
📈 Cumulative Runtime: 18m 45s

👤 user1@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully

👤 user2@example.com
Points: 4,810 → 4,810 (+0)
Duration: 2m 15s
Status: ❌ Failed - Login timeout

👤 user3@example.com
Points: 5,000 → 5,000 (+0)
Duration: 9m 07s
Status: ⚠️ Partially completed - Quiz failed
```

### **Buy Mode Detection**
```discord
🎯 Microsoft Rewards Summary

📊 Accounts: 2 • 0 with issues
💎 Points: 25,500 → 24,220 (-1,280)
💳 Buy Mode Activity Detected
Total Spent: 1,500 points across 1 account

👤 buyer@example.com
Points: 15,000 → 13,500 (-1,500)
Duration: 12m 34s
Status: 💳 Buy mode detected
Activities: Purchase completed, searches skipped

👤 normal@example.com
Points: 10,500 → 10,720 (+220)
Duration: 8m 45s
Status: ✅ Completed successfully
```

---

## 🤝 Integration with Other Notifications

### **Webhook vs Conclusion Webhook**

| Feature | Real-time Webhook | Conclusion Webhook |
|---------|------------------|-------------------|
| **Timing** | During execution | End of session only |
| **Content** | Errors, warnings, progress | Comprehensive summary |
| **Frequency** | Multiple per session | One per session |
| **Purpose** | Immediate alerts | Session overview |

### **Recommended Combined Setup**
```json
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../real-time"
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../summary"
    },
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-mobile"
    }
  }
}
```

### **Benefits of Combined Setup**
- ⚡ **Real-time webhook** — Immediate error alerts
- 📊 **Conclusion webhook** — Comprehensive session summary  
- 📱 **NTFY** — Mobile notifications for critical issues

---

## 🎛️ Advanced Configuration

### **Multiple Webhooks**
```json
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

### **Channel Organization**

#### **Recommended Discord Structure**
- **#rewards-errors** — Real-time error notifications (webhook)
- **#rewards-summary** — End-of-run summaries (conclusionWebhook)
- **#rewards-logs** — Detailed text logs (manual uploads)

#### **Channel Settings**
- **Notification settings** — Configure per your preference
- **Webhook permissions** — Limit to specific channels
- **Message history** — Enable for tracking trends

---

## 🔒 Security & Privacy

### **Webhook Security Best Practices**
- 🔐 Use **dedicated Discord server** for notifications
- 🎯 **Limit permissions** to specific channels only
- 🔄 **Regenerate URLs** if compromised
- 🚫 **Don't share** webhook URLs publicly

### **Data Transmission**
- ✅ **Summary statistics** only
- ✅ **Points and email** addresses
- ❌ **No passwords** or sensitive tokens
- ❌ **No personal information** beyond emails

### **Data Retention**
- 💾 **Discord stores** messages per server settings
- 🗑️ **No local storage** by the script
- ✂️ **Manual deletion** possible anytime
- 📝 **Webhook logs** may be retained by Discord

---

## 🧪 Testing & Debugging

### **Manual Webhook Test**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message from rewards script"}' \
  "YOUR_WEBHOOK_URL_HERE"
```

### **Script Debug Mode**
```powershell
$env:DEBUG_REWARDS_VERBOSE=1; npm start
```

### **Success Indicators**
```
[INFO] Sending conclusion webhook...
[INFO] Conclusion webhook sent successfully
```

### **Error Messages**
```
[ERROR] Failed to send conclusion webhook: Invalid webhook URL
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No summary received** | Check webhook URL; verify Discord permissions |
| **Malformed messages** | Validate webhook URL; check Discord server status |
| **Missing information** | Ensure script completed; check for execution errors |
| **Rate limited** | Single webhook per session prevents this |

### **Common Fixes**
- ✅ **Webhook URL** — Must be complete Discord webhook URL
- ✅ **Channel permissions** — Webhook must have send permissions
- ✅ **Server availability** — Discord server must be accessible
- ✅ **Script completion** — Summary only sent after full execution

---

## ⚡ Performance Impact

### **Resource Usage**
- 📨 **Single HTTP request** at script end
- ⚡ **Non-blocking operation** — No execution delays
- 💾 **Payload size** — Typically < 2KB
- 🌐 **Delivery time** — Usually < 1 second

### **Benefits**
- ✅ **No impact** on account processing
- ✅ **Minimal memory** footprint
- ✅ **No disk storage** required
- ✅ **Negligible bandwidth** usage

---

## 🎨 Customization

### **Embed Features**
- 🎨 **Color-coded** status indicators
- 🎭 **Emoji icons** for visual clarity
- 📊 **Structured fields** for easy reading
- ⏰ **Timestamps** and duration info

### **Discord Integration**
- 💬 **Thread notifications** support
- 👥 **Role mentions** (configure in webhook)
- 🔍 **Searchable messages** for history
- 📂 **Archive functionality** for records

---

## 🔗 Related Guides

- **[NTFY Notifications](./ntfy.md)** — Mobile push notifications
- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Buy Mode](./buy-mode.md)** — Manual purchasing with monitoring
- **[Security](./security.md)** — Privacy and data protection