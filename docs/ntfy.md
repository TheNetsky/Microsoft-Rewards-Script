# 📱 NTFY Push Notifications

**Get alerts on your phone instantly**

---

## 💡 What Is NTFY?

Simple push notification service that sends alerts to your phone/desktop.

**Free to use:** No account required for basic features.

---

## ⚡ Quick Start

### 1. Install NTFY App

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- **iOS:** [App Store](https://apps.apple.com/app/ntfy/id1625396347)

### 2. Choose a Topic Name

Pick any unique name (e.g., `rewards-myname-2025`)

### 3. Subscribe in App

Open NTFY app → Add subscription → Enter your topic name

### 4. Configure Script

**Edit** `src/config.jsonc`:
```jsonc
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-myname-2025"
    }
  }
}
```

**That's it!** You'll get push notifications on your phone.

---

## 🔔 What Notifications You Get

- 🚨 **Errors** — Script crashes, login failures
- ⚠️ **Warnings** — Missing points, suspicious activity
- 🏆 **Milestones** — Account completed successfully
- 💳 **Buy mode** — Point spending detected
- 📊 **Summary** — End-of-run report

---

## 🔒 Use Private Server (Optional)

### Self-Host NTFY

**Docker:**
```yaml
services:
  ntfy:
    image: binwiederhier/ntfy
    ports:
      - "80:80"
    volumes:
      - ./ntfy-data:/var/lib/ntfy
    command: serve
```

**Then configure:**
```jsonc
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.yourdomain.com",
      "topic": "rewards",
      "authToken": "tk_your_token_here"
    }
  }
}
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No notifications** | Check topic name matches exactly |
| **Wrong server** | Verify URL includes `https://` |
| **Auth failures** | Token must start with `tk_` |

### Test Manually

```bash
# Send test message
curl -d "Test from rewards script" https://ntfy.sh/your-topic
```

---

## 📚 Next Steps

**Want Discord too?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**

**Need detailed logs?**  
→ **[Diagnostics Guide](./diagnostics.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
