# 🔒 Security & Privacy Guide

<div align="center">

**🛡️ Comprehensive security measures and incident response**  
*Protect your accounts and maintain privacy*

</div>

---

## 🎯 Security Overview

This guide explains how the script **detects security-related issues**, what it does automatically, and how you can **resolve incidents** safely.

### **Security Features**
- 🚨 **Automated detection** — Recognizes account compromise attempts
- 🛑 **Emergency halting** — Stops all automation during incidents
- 🔔 **Strong alerts** — Immediate notifications via Discord/NTFY
- 📋 **Recovery guidance** — Step-by-step incident resolution
- 🔒 **Privacy protection** — Local-only operation by default

---

## 🚨 Security Incidents & Resolutions

### **Recovery Email Mismatch**

#### **Symptoms**
During Microsoft login, the page shows a masked recovery email like `ko*****@hacker.net` that **doesn't match** your expected recovery email pattern.

#### **What the Script Does**
- 🛑 **Halts automation** for the current account (leaves page open for manual action)
- 🚨 **Sends strong alerts** to all channels and engages global standby
- ⏸️ **Stops processing** — No further accounts are processed
- 🔔 **Repeats reminders** every 5 minutes until intervention

#### **Likely Causes**
- ⚠️ **Account takeover** — Recovery email changed by someone else
- 🔄 **Recent change** — You changed recovery email but forgot to update config

#### **How to Fix**
1. **🔍 Verify account security** in Microsoft Account settings
2. **📝 Update config** if you changed recovery email yourself:
   ```json
   {
     "email": "your@email.com",
     "recoveryEmail": "ko*****@hacker.net"
   }
   ```
3. **🔐 Change password** and review sign-in activity if compromise suspected
4. **🚀 Restart script** to resume normal operation

#### **Prevention**
- ✅ Keep `recoveryEmail` in `accounts.json` up to date
- ✅ Use strong unique passwords and MFA
- ✅ Regular security reviews

---

### **"We Can't Sign You In" (Blocked)**

#### **Symptoms**
Microsoft presents a page titled **"We can't sign you in"** during login attempts.

#### **What the Script Does**
- 🛑 **Stops automation** and leaves page open for manual recovery
- 🚨 **Sends strong alert** with high priority notifications
- ⏸️ **Engages global standby** to avoid processing other accounts

#### **Likely Causes**
- ⏱️ **Temporary lock** — Rate limiting or security check from Microsoft
- 🚫 **Account restrictions** — Ban related to unusual activity
- 🔒 **Verification required** — SMS code, authenticator, or other challenges

#### **How to Fix**
1. **✅ Complete verification** challenges (SMS, authenticator, etc.)
2. **⏸️ Pause activity** for 24-48h if blocked repeatedly
3. **🔧 Reduce concurrency** and increase delays between actions
4. **🌐 Check proxies** — Ensure consistent IP/country
5. **📞 Appeal if needed** — Contact Microsoft if ban is suspected

#### **Prevention**
- ✅ **Respect rate limits** — Use humanization settings
- ✅ **Avoid patterns** — Don't run too many accounts from same IP
- ✅ **Geographic consistency** — Use proxies from your actual region
- ✅ **Human-like timing** — Avoid frequent credential retries

---

## 🔐 Privacy & Data Protection

### **Local-First Architecture**
- 💾 **All data local** — Credentials, sessions, logs stored locally only
- 🚫 **No telemetry** — Zero data collection or external reporting
- 🔒 **No cloud storage** — Everything remains on your machine

### **Credential Security**
```json
{
  "accounts": [
    {
      "email": "user@example.com",
      "password": "secure-password-here",
      "totpSecret": "optional-2fa-secret"
    }
  ]
}
```

**Best Practices:**
- 🔐 **Strong passwords** — Unique, complex passwords per account
- 🔑 **2FA enabled** — Time-based one-time passwords when possible
- 📁 **File permissions** — Restrict access to `accounts.json`
- 🔄 **Regular rotation** — Change passwords periodically

### **Session Management**
- 🍪 **Persistent cookies** — Stored locally in `sessions/` directory
- 🔒 **Encrypted storage** — Session data protected at rest
- ⏰ **Automatic expiry** — Old sessions cleaned up automatically
- 🗂️ **Per-account isolation** — No session data mixing

---

## 🌐 Network Security

### **Proxy Configuration**
```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "username": "user",
      "password": "pass"
    }
  }
}
```

**Security Benefits:**
- 🎭 **IP masking** — Hide your real IP address
- 🌍 **Geographic flexibility** — Appear from different locations
- 🔒 **Traffic encryption** — HTTPS proxy connections
- 🛡️ **Detection avoidance** — Rotate IPs to avoid patterns

### **Traffic Analysis Protection**
- 🔐 **HTTPS only** — All Microsoft communications encrypted
- 🚫 **No plaintext passwords** — Credentials protected in transit
- 🛡️ **Certificate validation** — SSL/TLS verification enabled
- 🔍 **Deep packet inspection** resistant

---

## 🛡️ Anti-Detection Measures

### **Humanization**
```json
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 150, "max": 450 },
    "gestureMoveProb": 0.4,
    "gestureScrollProb": 0.2
  }
}
```

**Natural Behavior Simulation:**
- ⏱️ **Random delays** — Variable timing between actions
- 🖱️ **Mouse movements** — Subtle cursor adjustments
- 📜 **Scrolling gestures** — Natural page interactions
- 🎲 **Randomized patterns** — Avoid predictable automation

### **Browser Fingerprinting**
- 🌐 **Real user agents** — Authentic browser identification
- 📱 **Platform consistency** — Mobile/desktop specific headers
- 🔧 **Plugin simulation** — Realistic browser capabilities
- 🖥️ **Screen resolution** — Appropriate viewport dimensions

---

## 📊 Monitoring & Alerting

### **Real-Time Monitoring**
```json
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/..."
    },
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-security"
    }
  }
}
```

**Alert Types:**
- 🚨 **Security incidents** — Account compromise attempts
- ⚠️ **Login failures** — Authentication issues
- 🔒 **Account blocks** — Access restrictions detected
- 📊 **Performance anomalies** — Unusual execution patterns

### **Log Analysis**
- 📝 **Detailed logging** — All actions recorded locally
- 🔍 **Error tracking** — Failed operations highlighted
- 📊 **Performance metrics** — Timing and success rates
- 🛡️ **Security events** — Incident timeline reconstruction

---

## 🧪 Security Testing

### **Penetration Testing**
```powershell
# Test credential handling
$env:DEBUG_SECURITY=1; npm start

# Test session persistence  
$env:DEBUG_SESSIONS=1; npm start

# Test proxy configuration
$env:DEBUG_PROXY=1; npm start
```

### **Vulnerability Assessment**
- 🔍 **Regular audits** — Check for security issues
- 📦 **Dependency scanning** — Monitor npm packages
- 🔒 **Code review** — Manual security analysis
- 🛡️ **Threat modeling** — Identify attack vectors

---

## 📋 Security Checklist

### **Initial Setup**
- ✅ **Strong passwords** for all accounts
- ✅ **2FA enabled** where possible
- ✅ **File permissions** restricted to user only
- ✅ **Proxy configured** if desired
- ✅ **Notifications set up** for alerts

### **Regular Maintenance**
- ✅ **Password rotation** every 90 days
- ✅ **Session cleanup** weekly
- ✅ **Log review** for anomalies
- ✅ **Security updates** for dependencies
- ✅ **Backup verification** of configurations

### **Incident Response**
- ✅ **Alert investigation** within 15 minutes
- ✅ **Account verification** when suspicious
- ✅ **Password changes** if compromise suspected
- ✅ **Activity review** in Microsoft account settings
- ✅ **Documentation** of incidents and resolutions

---

## 🚨 Emergency Procedures

### **Account Compromise Response**
1. **🛑 Immediate shutdown** — Stop all script activity
2. **🔒 Change passwords** — Update all affected accounts
3. **📞 Contact Microsoft** — Report unauthorized access
4. **🔍 Audit activity** — Review recent sign-ins and changes
5. **🛡️ Enable additional security** — Add 2FA, recovery options
6. **📋 Document incident** — Record timeline and actions taken

### **Detection Evasion**
1. **⏸️ Temporary suspension** — Pause automation for 24-48h
2. **🔧 Reduce intensity** — Lower pass counts and frequencies
3. **🌐 Change IPs** — Rotate proxies or VPN endpoints
4. **⏰ Adjust timing** — Modify scheduling patterns
5. **🎭 Increase humanization** — More natural behavior simulation

---

## 🔗 Quick Reference Links

When the script detects a security incident, it opens this guide directly to the relevant section:

- **[Recovery Email Mismatch](#recovery-email-mismatch)** — Email change detection
- **[Account Blocked](#we-cant-sign-you-in-blocked)** — Login restriction handling

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration  
- **[Accounts & 2FA](./accounts.md)** — Microsoft account setup
- **[Proxy Configuration](./proxy.md)** — Network privacy and routing
- **[Humanization](./humanization.md)** — Natural behavior patterns
