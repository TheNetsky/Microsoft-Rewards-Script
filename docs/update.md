# 🔄 Auto-Update System

<div align="center">

**🚀 Automatic updates to keep your installation current**  
*Set it and forget it*

</div>

---

## 🎯 What is Auto-Update?

The automatic update system runs **after script completion** to keep your installation current with the latest features, bug fixes, and security patches.

### **Key Features**
- 🔄 **Automatic updates** — Runs after each script completion
- 🛡️ **Safe by design** — Fast-forward only Git updates
- 🐳 **Docker support** — Container image updates
- 🛠️ **Custom scripts** — Extensible update process
- 🔒 **Error resilient** — Failed updates don't break main script

---

## ⚙️ Configuration

### **Basic Setup**
```json
{
  "update": {
    "git": true,
    "docker": false,
    "scriptPath": "setup/update/update.mjs"
  }
}
```

### **Configuration Options**

| Setting | Description | Default |
|---------|-------------|---------|
| `git` | Enable Git-based updates | `true` |
| `docker` | Enable Docker container updates | `false` |
| `scriptPath` | Path to custom update script | `"setup/update/update.mjs"` |

---

## 🚀 Update Methods

### **Git Updates (`git: true`)**

#### **What It Does**
- 📥 **Fetches latest changes** from remote repository
- ⚡ **Fast-forward only pulls** (safe updates)
- 📦 **Reinstalls dependencies** (`npm ci`)
- 🔨 **Rebuilds the project** (`npm run build`)

#### **Requirements**
- ✅ Git installed and available in PATH
- ✅ Repository is a Git clone (not downloaded ZIP)
- ✅ No uncommitted local changes
- ✅ Internet connectivity

#### **Process**
```bash
git fetch --all --prune
git pull --ff-only
npm ci
npm run build
```

### **Docker Updates (`docker: true`)**

#### **What It Does**
- 📥 **Pulls latest container images**
- 🔄 **Restarts services** with new images
- 💾 **Preserves configurations** and mounted volumes

#### **Requirements**
- ✅ Docker and Docker Compose installed
- ✅ `docker-compose.yml` file present
- ✅ Proper container registry access

#### **Process**
```bash
docker compose pull
docker compose up -d
```

---

## 🛠️ Custom Update Scripts

### **Default Script**
- **Path** — `setup/update/update.mjs`
- **Format** — ES modules
- **Arguments** — Command line flags

### **Script Arguments**
- `--git` — Enable Git update process
- `--docker` — Enable Docker update process
- Both flags can be combined

### **Custom Script Example**
```javascript
// custom-update.mjs
import { execSync } from 'child_process'

const args = process.argv.slice(2)

if (args.includes('--git')) {
  console.log('🔄 Running custom Git update...')
  execSync('git pull && npm install', { stdio: 'inherit' })
}

if (args.includes('--docker')) {
  console.log('🐳 Running custom Docker update...')
  execSync('docker-compose pull && docker-compose up -d', { stdio: 'inherit' })
}
```

---

## ⏰ Execution Timing

### **When Updates Run**
| Scenario | Update Runs |
|----------|-------------|
| **Normal completion** | ✅ All accounts processed successfully |
| **Error completion** | ✅ Script finished with errors but completed |
| **Interruption** | ❌ Script killed or crashed mid-execution |

### **Update Sequence**
1. **🏁 Main script completion** — All accounts processed
2. **📊 Conclusion webhook** sent (if enabled)
3. **🚀 Update process begins**
4. **📥 Git updates** (if enabled)
5. **🐳 Docker updates** (if enabled)
6. **🔚 Process exits**

---

## 🛡️ Safety Features

### **Git Safety**
- ⚡ **Fast-forward only** — Prevents overwriting local changes
- 📦 **Dependency verification** — Ensures `npm ci` succeeds
- 🔨 **Build validation** — Confirms TypeScript compilation works

### **Error Handling**
- ✅ **Update failures** don't break main script
- 🔇 **Silent failures** — Errors logged but don't crash process
- 🔄 **Rollback protection** — Failed updates don't affect current installation

### **Concurrent Execution**
- 🔒 **Single update process** — Multiple instances don't conflict
- 🚫 **Lock-free design** — No file locking needed
- 🎯 **Independent updates** — Each script copy updates separately

---

## 📊 Monitoring Updates

### **Log Output**
```
[UPDATE] Starting post-run update process
[UPDATE] Git update enabled, Docker update disabled
[UPDATE] Running: git fetch --all --prune
[UPDATE] Running: git pull --ff-only
[UPDATE] Running: npm ci
[UPDATE] Running: npm run build
[UPDATE] Update completed successfully
```

### **Update Verification**
```powershell
# Check if updates are pending
git status

# View recent commits
git log --oneline -5

# Verify build status
npm run build
```

---

## 📋 Use Cases

### **Development Environment**
| Benefit | Description |
|---------|-------------|
| **Synchronized** | Keep local installation current with repository |
| **Automated** | Automatic dependency updates |
| **Seamless** | Integration of bug fixes and features |

### **Production Deployment**
| Benefit | Description |
|---------|-------------|
| **Security** | Automated security patches |
| **Features** | Updates without manual intervention |
| **Consistent** | Same update process across servers |

### **Docker Environments**
| Benefit | Description |
|---------|-------------|
| **Images** | Container image updates |
| **Security** | Patches in base images |
| **Automated** | Service restarts |

---

## 📋 Best Practices

### **Git Configuration**
- 🧹 **Clean working directory** — Commit or stash local changes
- 🌿 **Stable branch** — Use `main` or `stable` for auto-updates
- 📝 **Regular commits** — Keep repository history clean
- 💾 **Backup data** — Sessions and accounts before updates

### **Docker Configuration**
- 🏷️ **Image tagging** — Use specific tags, not `latest` for production
- 💾 **Volume persistence** — Ensure data volumes are mounted
- 🔗 **Service dependencies** — Configure proper startup order
- 🎯 **Resource limits** — Set appropriate memory and CPU limits

### **Monitoring**
- 📝 **Check logs regularly** — Monitor update success/failure
- 🧪 **Test after updates** — Verify script functionality
- 💾 **Backup configurations** — Preserve working setups
- 📊 **Version tracking** — Record successful versions

---

## 🛠️ Troubleshooting

### **Git Issues**

| Error | Solution |
|-------|----------|
| **"Not a git repository"** | Clone repository instead of downloading ZIP |
| **"Local changes would be overwritten"** | Commit or stash local changes |
| **"Fast-forward not possible"** | Repository diverged - reset to remote state |

#### **Git Reset Command**
```powershell
# Reset to remote state (⚠️ loses local changes)
git fetch origin
git reset --hard origin/main
```

### **Docker Issues**

| Error | Solution |
|-------|----------|
| **"Docker not found"** | Install Docker and Docker Compose |
| **"Permission denied"** | Add user to docker group |
| **"No docker-compose.yml"** | Create compose file or use custom script |

#### **Docker Permission Fix**
```powershell
# Windows: Ensure Docker Desktop is running
# Linux: Add user to docker group
sudo usermod -aG docker $USER
```

### **Network Issues**

| Error | Solution |
|-------|----------|
| **"Could not resolve host"** | Check internet connectivity |
| **"Connection timeout"** | Check firewall and proxy settings |

---

## 🔧 Manual Updates

### **Git Manual Update**
```powershell
git fetch --all --prune
git pull --ff-only
npm ci
npm run build
```

### **Docker Manual Update**  
```powershell
docker compose pull
docker compose up -d
```

### **Dependencies Only**
```powershell
npm ci
npm run build
```

---

## ⚙️ Update Configuration

### **Complete Disable**
```json
{
  "update": {
    "git": false,
    "docker": false
  }
}
```

### **Selective Enable**
```json
{
  "update": {
    "git": true,     // Keep Git updates
    "docker": false  // Disable Docker updates
  }
}
```

### **Custom Script Path**
```json
{
  "update": {
    "git": true,
    "docker": false,
    "scriptPath": "my-custom-update.mjs"
  }
}
```

---

## 🔒 Security Considerations

### **Git Security**
- ✅ **Trusted remote** — Updates pull from configured remote only
- ⚡ **Fast-forward only** — Prevents malicious rewrites
- 📦 **NPM registry** — Dependencies from official registry

### **Docker Security**
- 🏷️ **Verified images** — Container images from configured registries
- ✍️ **Image signatures** — Verify when possible
- 🔍 **Security scanning** — Regular scanning of base images

### **Script Execution**
- 👤 **Same permissions** — Update scripts run with same privileges
- 🚫 **No escalation** — No privilege escalation during updates
- 🔍 **Review scripts** — Custom scripts should be security reviewed

---

## 🎯 Environment Examples

### **Development**
```json
{
  "update": {
    "git": true,
    "docker": false
  }
}
```

### **Production**
```json
{
  "update": {
    "git": false,
    "docker": true
  }
}
```

### **Hybrid**
```json
{
  "update": {
    "git": true,
    "docker": true,
    "scriptPath": "setup/update/production-update.mjs"
  }
}
```

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Docker](./docker.md)** — Container deployment and management
- **[Scheduler](./schedule.md)** — Automated timing and execution  
- **[Security](./security.md)** — Privacy and data protection