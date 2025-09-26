# 👤 Accounts & TOTP (2FA)

<div align="center">

**🔐 Secure Microsoft account setup with 2FA support**  
*Everything you need to configure authentication*

</div>

---

## 📍 File Location & Options

The bot needs Microsoft account credentials to log in and complete activities. Here's how to provide them:

### **Default Location**
```
src/accounts.json
```

### **Environment Overrides** (Docker/CI)
- **`ACCOUNTS_FILE`** — Path to accounts file (e.g., `/data/accounts.json`)
- **`ACCOUNTS_JSON`** — Inline JSON string (useful for CI/CD)

The loader tries: `ACCOUNTS_JSON` → `ACCOUNTS_FILE` → default locations in project root.

## Schema
Each account has at least `email` and `password`.

```
{
  "accounts": [
    {
      "email": "email_1",
      "password": "password_1",
      "totp": "",
      "recoveryEmail": "your_email@domain.com",
      "proxy": {
        "proxyAxios": true,
        "url": "",
        "port": 0,
        "username": "",
        "password": ""
      }
    }
  ]
}
```

- `totp` (optional): Base32 secret for Time‑based One‑Time Passwords (2FA). If set, the bot generates the 6‑digit code automatically when asked by Microsoft.
- `recoveryEmail` (optional): used to validate masked recovery prompts.
- `proxy` (optional): per‑account proxy config. See the [Proxy guide](./proxy.md).

## How to get your TOTP secret
1) In your Microsoft account security settings, add an authenticator app.
2) When shown the QR code, choose the option to enter the code manually — this reveals the Base32 secret.
3) Copy that secret (only the text after `secret=` if you have an otpauth URL) into the `totp` field.

Security tips:
- Never commit real secrets to Git.
- Prefer `ACCOUNTS_FILE` or `ACCOUNTS_JSON` in production.

## Examples
- Single account, no 2FA:
```
{"accounts":[{"email":"a@b.com","password":"pass","totp":"","recoveryEmail":"","proxy":{"proxyAxios":true,"url":"","port":0,"username":"","password":""}}]}
```

- Single account with TOTP secret:
```
{"accounts":[{"email":"a@b.com","password":"pass","totp":"JBSWY3DPEHPK3PXP","recoveryEmail":"","proxy":{"proxyAxios":true,"url":"","port":0,"username":"","password":""}}]}
```

- Multiple accounts:
```
{"accounts":[
  {"email":"a@b.com","password":"pass","totp":"","recoveryEmail":"" ,"proxy":{"proxyAxios":true,"url":"","port":0,"username":"","password":""}},
  {"email":"c@d.com","password":"pass","totp":"","recoveryEmail":"" ,"proxy":{"proxyAxios":true,"url":"","port":0,"username":"","password":""}}
]}
```

## Troubleshooting
- “accounts file not found”: ensure the file exists, or set `ACCOUNTS_FILE` to the correct path.
- 2FA prompt not filled: verify `totp` is a valid Base32 secret; time on the host/container should be correct.
- Locked account: the bot will log and skip; resolve manually then re‑enable.

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Docker](./docker.md)** — Container deployment with accounts
- **[Security](./security.md)** — Account protection and incident response
- **[NTFY Notifications](./ntfy.md)** — Get alerts for login issues