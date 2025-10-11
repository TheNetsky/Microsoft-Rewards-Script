# 📚 Microsoft Rewards Script V2 Docs

<div align="center">

**🎯 Your companion for mastering the automation stack**  
*Curated guides, verified against the current codebase*

</div>

---

## 🚀 Quick Navigation

### **Essential Setup**
| Guide | Why you should read it |
|-------|------------------------|
| **[🎬 Getting Started](./getting-started.md)** | Install, configure, and run the bot in minutes |
| **[👤 Accounts & 2FA](./accounts.md)** | Add Microsoft accounts, enable TOTP, and secure logins |
| **[⚙️ Configuration Reference](./config.md)** | Understand every option in `src/config.jsonc` |

### **Run & Operate**
| Guide | Focus |
|-------|-------|
| **[⏰ Scheduling](./schedule.md)** | Cron-style automation and daily cadence |
| **[🐳 Docker](./docker.md)** | Container deployment with prewired headless settings |
| **[🛠️ Diagnostics](./diagnostics.md)** | Troubleshooting, log capture, and support checklist |
| **[🧠 Humanization](./humanization.md)** | Natural browser behavior and ban avoidance |
| **[🌐 Proxy Setup](./proxy.md)** | Per-account proxy routing and geo-tuning |
| **[📊 Job State](./jobstate.md)** | How runs persist progress and recover |
| **[🔄 Auto Update](./update.md)** | Keep the script current without manual pulls |
| **[🛡️ Security Notes](./security.md)** | Threat model, secrets handling, and best practices |

### **Notifications & Control**
| Guide | Purpose |
|-------|---------|
| **[📱 NTFY Push](./ntfy.md)** | Real-time phone notifications |
| **[� Discord Webhooks](./conclusionwebhook.md)** | Detailed run summaries in your server |

### **Special Modes**
| Guide | Purpose |
|-------|---------|
| **[💳 Buy Mode](./buy-mode.md)** | Assisted manual redemption and live monitoring |

---

## 🧭 Reading Paths

- **First install:** Getting Started → Accounts & 2FA → Configuration Reference → Scheduling **or** Docker
- **Docker-first:** Getting Started prerequisites → Docker → Diagnostics → Notifications (NTFY or Webhooks)
- **Optimizing runs:** Humanization → Schedule tuning → Proxy → Job State → Update

Each guide now links back to the most relevant follow-up topics so you can jump between setup, operations, and troubleshooting without losing context.

---

## 🔗 Useful Shortcuts

- Need sample configs? → [Config presets](./config-presets/)
- Want a scripted environment? → [Scheduler](./schedule.md)
- Looking to self-audit? → [Diagnostics](./diagnostics.md) + [Security](./security.md)

If something feels out of sync with the code, open an issue or ping us on Discord—the docs are maintained to match the current defaults (`src/config.jsonc`, visible browsers by default, Docker headless enforcement via `FORCE_HEADLESS=1`).
