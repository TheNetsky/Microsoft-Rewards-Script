# 👤 Accounts & 2FA Setup

**Add your Microsoft accounts with secure TOTP authentication**

---

## 📍 Quick Start

### Basic Setup (No 2FA)

**Edit** `src/accounts.json`:
```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "your_password"
    }
  ]
}
```

**That's it!** Run `npm start` to test.

---

## 🔐 Add 2FA/TOTP (Recommended)

### Why Use TOTP?
- ✅ **Automated login** — No manual code entry
- ✅ **More secure** — Better than SMS
- ✅ **Works 24/7** — Scheduler-friendly

### How to Get Your TOTP Secret

1. **Open Microsoft Account** → Security → Advanced security options
2. **Add authenticator app** → Click "Set up"
3. **Choose "I want to use a different app"**
4. Microsoft shows a **QR code** + **secret key**
5. **Copy the secret key** (starts with letters/numbers)
6. **Add to** `accounts.json`:

```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "your_password",
      "totp": "JBSWY3DPEHPK3PXP"
    }
  ]
}
```

---

## 🎯 Multiple Accounts

```json
{
  "accounts": [
    {
      "email": "account1@email.com",
      "password": "password1",
      "totp": "SECRET1"
    },
    {
      "email": "account2@email.com",
      "password": "password2",
      "totp": "SECRET2"
    }
  ]
}
```

---

## 🌐 Per-Account Proxy (Optional)

```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "password",
      "totp": "",
      "proxy": {
        "proxyAxios": true,
        "url": "proxy.example.com",
        "port": 8080,
        "username": "proxyuser",
        "password": "proxypass"
      }
    }
  ]
}
```

→ **[Full Proxy Guide](./proxy.md)**

---

## 🔒 Environment Variables (Docker/CI)

### Option 1: File Path
```bash
export ACCOUNTS_FILE=/path/to/accounts.json
```

### Option 2: Inline JSON
```bash
export ACCOUNTS_JSON='{"accounts":[{"email":"test@example.com","password":"pass"}]}'
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **"accounts.json not found"** | Create file or set `ACCOUNTS_FILE` env var |
| **"2FA prompt not auto-filled"** | Check TOTP secret is valid Base32 |
| **"Invalid TOTP"** | Verify system time is correct |
| **"Account locked"** | Manually unlock in Microsoft Account |
| **"Login timeout"** | Check internet connection, try proxy |

### 2FA Not Working?

1. **Check secret format** — Should be Base32 (only letters/numbers, no spaces)
2. **Verify system time** — Must be accurate (NTP sync)
3. **Test manually** — Use authenticator app to verify code works
4. **Remove backup codes** — Some security settings block TOTP

---

## 🔒 Security Tips

- 🔐 **Use strong passwords** — Unique for each account
- 🔑 **Enable TOTP** — More secure than SMS
- 📁 **Restrict file permissions** — `chmod 600 accounts.json` (Linux)
- 🔄 **Rotate passwords** — Change every 90 days
- 🚫 **Never commit** — Add `accounts.json` to `.gitignore`

---

## 📚 Next Steps

**TOTP setup?**  
→ **[Security Guide](./security.md)** for best practices

**Ready for automation?**  
→ **[Scheduler Setup](./schedule.md)**

**Need proxies?**  
→ **[Proxy Guide](./proxy.md)**

---

**[← Back to Hub](./index.md)** | **[Getting Started](./getting-started.md)**
