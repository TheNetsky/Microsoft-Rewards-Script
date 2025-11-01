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
      "password": "your_password",
      "recoveryEmail": "backup@email.com"
    }
  ]
}
```

> ℹ️ `recoveryEmail` is **mandatory**. It lets the bot verify Microsoft’s masked hint during login and alert you if the recovery address ever changes.

**That's it!** Run `npm start` to test.

---

## 🔐 Add 2FA/TOTP (Recommended)

### Why Use TOTP?
- ✅ **Automated login** — No manual code entry
- ✅ **More secure** — Better than SMS
- ✅ **Works 24/7** — Scheduler-friendly

### How to Get Your TOTP Secret

1. **Open** https://account.live.com/proofs/Manage/additional (Security → Advanced security options → Additional security).
2. Enable two-step verification and click **Next** until you see the setup wizard.
3. Click the blue link **"Set up a different authenticator app"**.
4. On the next screen click **"I can't scan the bar code"** to reveal the Base32 secret.
5. Scan the QR with your preferred authenticator (Google Authenticator recommended to keep data separate from Microsoft) **and** copy the secret:
  - The same secret can stay in your app and be saved in this file (multiple authenticators can share it).
6. Enter the 6-digit code in Microsoft’s wizard to finish pairing.
7. **Add the secret to** `accounts.json`:

```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "your_password",
      "recoveryEmail": "backup@email.com",
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
      "recoveryEmail": "backup1@email.com",
      "totp": "SECRET1"
    },
    {
      "email": "account2@email.com",
      "password": "password2",
      "recoveryEmail": "backup2@email.com",
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
      "recoveryEmail": "backup@email.com",
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
