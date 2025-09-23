# 💳 Buy Mode

<div align="center">

**🛒 Manual redemption with live point monitoring**  
*Track your spending while maintaining full control*

</div>

---

## 🎯 What is Buy Mode?

Buy Mode allows you to **manually redeem rewards** while the script **passively monitors** your point balance. Perfect for safe redemptions without automation interference.

### **Key Features**
- 👀 **Passive monitoring** — No clicks or automation
- 🔄 **Real-time tracking** — Instant spending alerts  
- 📱 **Live notifications** — Discord/NTFY integration
- ⏱️ **Configurable duration** — Set your own time limit
- 📊 **Session summary** — Complete spending report

---

## 🚀 How to Use

### **Command Options**
```bash
# Monitor specific account
npm start -- -buy your@email.com

# Monitor first account in accounts.json  
npm start -- -buy

# Alternative: Enable in config (see below)
```

### **What Happens Next**
1. **🖥️ Dual Tab System Opens**
   - **Monitor Tab** — Background monitoring (auto-refresh)
   - **User Tab** — Your control for redemptions/browsing

2. **📊 Passive Point Tracking**
   - Reads balance every ~10 seconds
   - Detects spending when points decrease
   - Zero interference with your browsing

3. **🔔 Real-time Alerts**
   - Instant notifications when spending detected
   - Shows amount spent + current balance
   - Tracks cumulative session spending

---

## ⚙️ Configuration

### **Set Duration in Config**
Add to `src/config.json`:
```json
{
  "buyMode": {
    "enabled": false,
    "maxMinutes": 45
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Force buy mode without CLI flag |
| `maxMinutes` | `45` | Auto-stop after N minutes |

### **Enable Notifications**
Buy mode works with existing notification settings:
```json
{
  "conclusionWebhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/YOUR_URL"
  },
  "ntfy": {
    "enabled": true,
    "url": "https://ntfy.sh",
    "topic": "rewards"
  }
}
```

---

## 🖥️ Terminal Output

### **Startup**
```
 ███╗   ███╗███████╗    ██████╗ ██╗   ██╗██╗   ██╗
 ████╗ ████║██╔════╝    ██╔══██╗██║   ██║╚██╗ ██╔╝
 ██╔████╔██║███████╗    ██████╔╝██║   ██║ ╚████╔╝ 
 ██║╚██╔╝██║╚════██║    ██╔══██╗██║   ██║  ╚██╔╝  
 ██║ ╚═╝ ██║███████║    ██████╔╝╚██████╔╝   ██║   
 ╚═╝     ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                   
            Manual Purchase Mode • Passive Monitoring

[BUY-MODE] Opening dual-tab system for safe redemptions...
[BUY-MODE] Monitor tab: Background point tracking
[BUY-MODE] User tab: Your control for purchases/browsing
```

### **Live Monitoring**
```
[BUY-MODE] Current balance: 15,000 points
[BUY-MODE] 🛒 Spending detected: -500 points (new balance: 14,500)
[BUY-MODE] Session total spent: 500 points
```

---

## 📋 Use Cases

| Scenario | Benefit |
|----------|---------|
| **🎁 Gift Card Redemption** | Track exact point cost while redeeming safely |
| **🛍️ Microsoft Store Purchases** | Monitor spending across multiple items |
| **✅ Account Verification** | Ensure point changes match expected activity |
| **📊 Spending Analysis** | Real-time tracking of reward usage patterns |
| **🔒 Safe Browsing** | Use Microsoft Rewards normally with monitoring |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Monitor tab closes** | Script auto-reopens in background |
| **No spending alerts** | Check webhook/NTFY config; verify notifications enabled |
| **Session too short** | Increase `maxMinutes` in config |
| **Login failures** | Verify account credentials in `accounts.json` |
| **Points not updating** | Check internet connection; try refresh |

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Accounts & 2FA](./accounts.md)** — Microsoft account setup
- **[NTFY Notifications](./ntfy.md)** — Mobile push alerts
- **[Discord Webhooks](./conclusionwebhook.md)** — Server notifications

## Terminal Output

When you start buy mode, you'll see:

```
 ███╗   ███╗███████╗    ██████╗ ██╗   ██╗██╗   ██╗
 ████╗ ████║██╔════╝    ██╔══██╗██║   ██║╚██╗ ██╔╝
 ██╔████╔██║███████╗    ██████╔╝██║   ██║ ╚████╔╝ 
 ██║╚██╔╝██║╚════██║    ██╔══██╗██║   ██║  ╚██╔╝  
 ██║ ╚═╝ ██║███████║    ██████╔╝╚██████╔╝   ██║   
 ╚═╝     ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                   
            Manual Purchase Mode • Passive Monitoring

[BUY-MODE] Buy mode ENABLED for your@email.com. We'll open 2 tabs: 
           (1) monitor tab (auto-refreshes), (2) your browsing tab
[BUY-MODE] The monitor tab may refresh every ~10s. Use the other tab...
[BUY-MODE] Opened MONITOR tab (auto-refreshes to track points)
[BUY-MODE] Opened USER tab (use this one to redeem/purchase freely)
[BUY-MODE] Logged in as your@email.com. Buy mode is active...
```

During monitoring:
```
[BUY-MODE] Detected spend: -500 points (current: 12,500)
[BUY-MODE] Monitor tab was closed; reopening in background...
```

## Features

- ✅ **Non-intrusive**: No clicks or navigation in your browsing tab
- ✅ **Real-time alerts**: Instant notifications when points are spent
- ✅ **Auto-recovery**: Reopens monitor tab if accidentally closed
- ✅ **Webhook support**: Works with Discord and NTFY notifications
- ✅ **Configurable duration**: Set your own monitoring time limit
- ✅ **Session tracking**: Complete summary of spending activity

## Use Cases

- **Manual redemptions**: Redeem gift cards or rewards while tracking spending
- **Account verification**: Monitor point changes during manual account activities
- **Spending analysis**: Track how points are being used in real-time
- **Safe browsing**: Use Microsoft Rewards normally while monitoring balance

## Notes

- Monitor tab runs in background and may refresh periodically
- Your main browsing tab is completely under your control
- Session data is saved automatically for future script runs
- Buy mode works with existing notification configurations
- No automation or point collection occurs in this mode

## Troubleshooting

- **Monitor tab closed**: Script automatically reopens it in background
- **No notifications**: Check webhook/NTFY configuration in `config.json`
- **Session timeout**: Increase `maxMinutes` if you need longer monitoring
- **Login issues**: Ensure account credentials are correct in `accounts.json`
