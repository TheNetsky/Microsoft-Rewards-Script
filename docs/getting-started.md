# 🚀 Getting Started

<div align="center">

**🎯 From zero to earning Microsoft Rewards points in minutes**  
*Complete setup guide for beginners*

</div>

---

## ✅ Requirements

- **Node.js 18+** (22 recommended) — [Download here](https://nodejs.org/)
- **Microsoft accounts** with email + password
- **Optional:** Docker for containerized deployment

---

## ⚡ Quick Setup (Recommended)

<div align="center">

### **🎬 One Command, Total Automation**

</div>

```bash
# 🪟 Windows
setup/setup.bat

# 🐧 Linux/macOS/WSL  
bash setup/setup.sh

# 🌍 Any platform
npm run setup
```

**That's it!** The wizard will:
- ✅ Help you create `src/accounts.json` with your Microsoft credentials
- ✅ Install all dependencies automatically  
- ✅ Build the TypeScript project
- ✅ Start earning points immediately

---

## 🛠️ Manual Setup

<details>
<summary><strong>📖 Prefer step-by-step? Click here</strong></summary>

### 1️⃣ **Configure Your Accounts**
```bash
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your Microsoft credentials
```

### 2️⃣ **Install Dependencies & Build**
```bash
npm install
npm run build
```

### 3️⃣ **Choose Your Mode**
```bash
# Single run (test it works)
npm start

# Automated daily scheduler (set and forget)
npm run start:schedule
```

</details>

---

## 🎯 What Happens Next?

The script will automatically:
- 🔍 **Search Bing** for points (desktop + mobile)
- 📅 **Complete daily sets** (quizzes, polls, activities)  
- 🎁 **Grab promotions** and bonus opportunities
- 🃏 **Work on punch cards** (multi-day challenges)
- ✅ **Daily check-ins** for easy points
- 📚 **Read articles** for additional rewards

**All while looking completely natural to Microsoft!** 🤖

---

## 🐳 Docker Alternative

If you prefer containers:

```bash
# Ensure accounts.json and config.json exist
docker compose up -d

# Follow logs
docker logs -f microsoft-rewards-script
```

**[Full Docker Guide →](./docker.md)**

---

## 🔧 Next Steps

Once running, explore these guides:

| Priority | Guide | Why Important |
|----------|-------|---------------|
| **High** | **[Accounts & 2FA](./accounts.md)** | Set up TOTP for secure automation |
| **High** | **[Scheduling](./schedule.md)** | Configure automated daily runs |
| **Medium** | **[Notifications](./ntfy.md)** | Get alerts on your phone |
| **Low** | **[Humanization](./humanization.md)** | Advanced anti-detection |

---

## 🆘 Need Help?

**Script not starting?** → [Troubleshooting Guide](./diagnostics.md)  
**Login issues?** → [Accounts & 2FA Setup](./accounts.md)  
**Want Docker?** → [Container Guide](./docker.md)  

**Found a bug?** [Report it here](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)  
**Need support?** [Join our Discord](https://discord.gg/KRBFxxsU)

---

## 🔗 Related Guides

- **[Accounts & 2FA](./accounts.md)** — Add Microsoft accounts with TOTP
- **[Docker](./docker.md)** — Deploy with containers  
- **[Scheduler](./schedule.md)** — Automate daily execution
- **[Discord Webhooks](./conclusionwebhook.md)** — Get run summaries