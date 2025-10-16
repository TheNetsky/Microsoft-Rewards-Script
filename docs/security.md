# 🔒 Security Guide

**Protect your accounts and handle security incidents**

---

## ⚠️ Important Disclaimer

**Using automation violates Microsoft's Terms of Service.**

Your accounts **may be banned**. Use at your own risk.

---

## 🛡️ Best Practices

### ✅ DO

- **Enable humanization** — Natural behavior reduces detection
- **Use 2FA/TOTP** — More secure authentication
- **Run 1-2x daily max** — Don't be greedy
- **Test on secondary accounts** — Never risk your main account
- **Enable vacation mode** — Random off days look natural
- **Monitor regularly** — Check diagnostics and logs

### ❌ DON'T

- **Run on main account** — Too risky
- **Schedule hourly** — Obvious bot pattern
- **Ignore warnings** — Security alerts matter
- **Use shared proxies** — Higher detection risk
- **Skip humanization** — Robotic behavior gets caught

---

## 🚨 Security Incidents

### Recovery Email Mismatch

**What:** Login shows unfamiliar recovery email (e.g., `ko*****@hacker.net`)

**Action:**
1. **Stop immediately** — Script halts automatically
2. **Check Microsoft Account** → Security settings
3. **Update config** if you changed email yourself:
   ```json
   {
     "recoveryEmail": "ko*****@hacker.net"
   }
   ```
4. **Change password** if compromise suspected

---

### "We Can't Sign You In" (Blocked)

**What:** Microsoft blocks login attempt

**Action:**
1. **Wait 24-48 hours** — Temporary locks usually lift
2. **Complete any challenges** — SMS, authenticator, etc.
3. **Reduce frequency** — Run less often
4. **Enable humanization** — If not already enabled
5. **Check proxy** — Ensure consistent IP/location

---

## 🔐 Account Security

### Strong Credentials

```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "strong-unique-password",
      "totp": "JBSWY3DPEHPK3PXP"
    }
  ]
}
```

- ✅ **Unique passwords** per account
- ✅ **TOTP enabled** for all accounts
- ✅ **Strong passwords** (16+ characters)
- 🔄 **Rotate every 90 days**

### File Permissions

```bash
# Linux/macOS - Restrict access
chmod 600 src/accounts.json

# Windows - Right-click → Properties → Security
# Remove all users except yourself
```

---

## 🌐 Network Security

### Use Proxies (Optional)

```json
{
  "proxy": {
    "proxyAxios": true,
    "url": "proxy.example.com",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

**Benefits:**
- IP masking
- Geographic flexibility
- Reduces pattern detection

→ **[Full Proxy Guide](./proxy.md)**

---

## 📊 Monitoring

### Enable Diagnostics

```jsonc
{
  "diagnostics": {
    "enabled": true,
    "saveScreenshot": true,
    "saveHtml": true
  }
}
```

→ **[Diagnostics Guide](./diagnostics.md)**

### Enable Notifications

```jsonc
{
  "conclusionWebhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/..."
  }
}
```

→ **[Webhook Setup](./conclusionwebhook.md)**

---

## 🛠️ Incident Response

### Account Compromised

1. **Stop all automation**
2. **Change password immediately**
3. **Check sign-in activity** in Microsoft Account
4. **Enable 2FA** if not already
5. **Review security info** (recovery email, phone)
6. **Contact Microsoft** if unauthorized access

### Temporary Ban

1. **Pause automation** for 48-72 hours
2. **Reduce frequency** when resuming
3. **Increase delays** in humanization
4. **Use proxy** from your region
5. **Monitor closely** after resuming

---

## 🔗 Privacy Tips

- 🔐 **Local-only** — All data stays on your machine
- 🚫 **No telemetry** — Script doesn't phone home
- 📁 **File security** — Restrict permissions
- 🔄 **Regular backups** — Keep config backups
- 🗑️ **Clean logs** — Delete old diagnostics

---

## 📚 Next Steps

**Setup humanization?**  
→ **[Humanization Guide](./humanization.md)**

**Need proxies?**  
→ **[Proxy Guide](./proxy.md)**

**Want monitoring?**  
→ **[Diagnostics](./diagnostics.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
