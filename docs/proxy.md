# 🌐 Proxy Setup

**Route traffic through proxy servers**

---

## 💡 Do You Need a Proxy?

**Most users DON'T need proxies.** Only use if:
- ✅ You run many accounts from same IP
- ✅ You want geographic flexibility
- ✅ Your IP is already flagged

**Otherwise, skip this guide.**

---

## ⚡ Quick Start

### Per-Account Proxy

**Edit** `src/accounts.json`:
```json
{
  "accounts": [
    {
      "email": "your@email.com",
      "password": "password",
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

**That's it!** Script uses proxy for this account only.

---

## 🎯 Proxy Types

### HTTP Proxy (Most Common)

```json
{
  "proxy": {
    "proxyAxios": true,
    "url": "http://proxy.example.com",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

### SOCKS5 Proxy

```json
{
  "proxy": {
    "proxyAxios": true,
    "url": "socks5://proxy.example.com",
    "port": 1080,
    "username": "user",
    "password": "pass"
  }
}
```

---

## 🏢 Recommended Providers

### Residential Proxies (Best)
- **Bright Data** — Premium quality, expensive
- **Smartproxy** — User-friendly
- **Oxylabs** — Enterprise-grade

### Datacenter Proxies (Cheaper)
- **SquidProxies** — Reliable
- **MyPrivateProxy** — Dedicated IPs

⚠️ **Avoid free proxies** — Unreliable and often blocked.

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Connection refused"** | Check proxy URL and port |
| **"407 Auth required"** | Verify username/password |
| **"Timeout"** | Try different proxy server |
| **"SSL error"** | Use HTTP instead of HTTPS |

### Test Proxy Manually

```bash
# Windows (PowerShell)
curl --proxy http://user:pass@proxy.com:8080 http://httpbin.org/ip

# Linux/macOS
curl --proxy http://user:pass@proxy.com:8080 http://httpbin.org/ip
```

---

## 📚 Next Steps

**Proxy working?**  
→ **[Setup Scheduler](./schedule.md)**

**Need humanization?**  
→ **[Humanization Guide](./humanization.md)**

**Multiple accounts?**  
→ **[Accounts Guide](./accounts.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
