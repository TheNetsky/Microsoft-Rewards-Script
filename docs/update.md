# Auto-Update Configuration

Automatic update system that runs after script completion to keep your installation current.

## Configuration

Add to your `src/config.json`:

```json
{
  "update": {
    "git": true,
    "docker": false,
    "scriptPath": "setup/update/update.mjs"
  }
}
```

## Options

| Setting | Description | Default |
|---------|-------------|---------|
| `git` | Enable Git-based updates | `true` |
| `docker` | Enable Docker container updates | `false` |
| `scriptPath` | Path to custom update script | `"setup/update/update.mjs"` |

## Update Methods

### Git Updates (`git: true`)

**What it does:**
- Fetches latest changes from remote repository
- Performs fast-forward only pulls (safe updates)
- Reinstalls dependencies (`npm ci`)
- Rebuilds the project (`npm run build`)

**Requirements:**
- Git installed and available in PATH
- Repository is a Git clone (not downloaded ZIP)
- No uncommitted local changes
- Internet connectivity

**Process:**
```bash
git fetch --all --prune
git pull --ff-only
npm ci
npm run build
```

### Docker Updates (`docker: true`)

**What it does:**
- Pulls latest container images
- Restarts services with new images
- Preserves mounted volumes and configurations

**Requirements:**
- Docker and Docker Compose installed
- `docker-compose.yml` file present
- Proper container registry access

**Process:**
```bash
docker compose pull
docker compose up -d
```

## Custom Update Scripts

### Default Script Location
- Path: `setup/update/update.mjs`
- Written in ES modules format
- Accepts command line arguments

### Script Arguments
- `--git`: Enable Git update process
- `--docker`: Enable Docker update process
- Both flags can be combined

### Custom Script Example
```javascript
// custom-update.mjs
import { execSync } from 'child_process'

const args = process.argv.slice(2)

if (args.includes('--git')) {
  console.log('Running custom Git update...')
  execSync('git pull && npm install', { stdio: 'inherit' })
}

if (args.includes('--docker')) {
  console.log('Running custom Docker update...')
  execSync('docker-compose pull && docker-compose up -d', { stdio: 'inherit' })
}
```

## Execution Timing

### When Updates Run
- **After normal script completion**: All accounts processed successfully
- **After error completion**: Script finished with errors but completed
- **Not after interruption**: Script killed or crashed mid-execution

### Update Order
1. Main script execution completes
2. Conclusion webhook sent (if enabled)
3. Update process begins
4. Git updates (if enabled)
5. Docker updates (if enabled)
6. Process exits

## Safety Features

### Git Safety
- **Fast-forward only**: Prevents overwriting local changes
- **Dependency verification**: Ensures `npm ci` succeeds
- **Build validation**: Confirms TypeScript compilation works

### Error Handling
- **Update failures don't break main script**
- **Silent failures**: Errors logged but don't crash process
- **Rollback protection**: Failed updates don't affect current installation

### Concurrent Execution
- **Single update process**: Multiple script instances don't conflict
- **Lock-free**: No file locking or process synchronization needed
- **Independent per instance**: Each script copy updates independently

## Monitoring Updates

### Log Output
```
[UPDATE] Starting post-run update process
[UPDATE] Git update enabled, Docker update disabled
[UPDATE] Running: git fetch --all --prune
[UPDATE] Running: git pull --ff-only
[UPDATE] Running: npm ci
[UPDATE] Running: npm run build
[UPDATE] Update completed successfully
```

### Update Verification
```bash
# Check if updates are pending
git status

# View recent commits
git log --oneline -5

# Verify build status
npm run build
```

## Use Cases

### Development Environment
- Keep local installation synchronized with repository
- Automatic dependency updates
- Seamless integration of bug fixes and features

### Production Deployment
- Automated security patches
- Feature updates without manual intervention
- Consistent update process across multiple servers

### Docker Environments
- Container image updates
- Security patches in base images
- Automated service restarts

## Best Practices

### Git Configuration
- **Clean working directory**: Commit or stash local changes
- **Stable branch**: Use `main` or `stable` branch for auto-updates
- **Regular commits**: Keep repository history clean
- **Backup important data**: Sessions and accounts before updates

### Docker Configuration
- **Image tagging**: Use specific tags, not `latest` for production
- **Volume persistence**: Ensure data volumes are properly mounted
- **Service dependencies**: Configure proper service startup order
- **Resource limits**: Set appropriate memory and CPU limits

### Monitoring
- **Check logs regularly**: Monitor update success/failure
- **Test after updates**: Verify script functionality
- **Backup before major updates**: Preserve working configurations
- **Version tracking**: Keep record of successful versions

## Troubleshooting

### Common Git Issues

**"Not a git repository"**
- Solution: Clone repository instead of downloading ZIP
- Alternative: Disable git updates

**"Local changes would be overwritten"**
- Solution: Commit or stash local changes
- Alternative: Reset to remote state (`git reset --hard origin/main`)

**"Fast-forward not possible"**
- Solution: Repository has diverged from upstream
- Fix: Reset to remote state or merge manually

### Common Docker Issues

**"Docker not found"**
- Solution: Install Docker and Docker Compose
- Alternative: Disable docker updates

**"Permission denied"**
- Solution: Add user to docker group
- Alternative: Run with sudo (not recommended)

**"No such file 'docker-compose.yml'"**
- Solution: Create docker-compose.yml file
- Alternative: Use custom script path

### Network Issues

**"Could not resolve host"**
- Solution: Check internet connectivity
- Temporary: Updates will retry on next run

**"Connection timeout"**
- Solution: Check firewall and proxy settings
- Alternative: Use VPN or different network

## Disabling Updates

### Complete Disable
```json
{
  "update": {
    "git": false,
    "docker": false
  }
}
```

### Selective Disable
```json
{
  "update": {
    "git": true,     // Keep Git updates
    "docker": false  // Disable Docker updates
  }
}
```

## Manual Updates

### Git Manual Update
```bash
git fetch --all --prune
git pull --ff-only
npm ci
npm run build
```

### Docker Manual Update
```bash
docker compose pull
docker compose up -d
```

### Dependency Only
```bash
npm ci
npm run build
```

## Security Considerations

### Git Security
- Updates pull from configured remote (verify it's trusted)
- Fast-forward only prevents malicious rewrites
- Dependencies installed from npm registry

### Docker Security
- Container images pulled from configured registries
- Verify image signatures when possible
- Regular security scanning of base images

### Script Execution
- Update scripts run with same permissions as main script
- No privilege escalation during updates
- Custom scripts should be reviewed for security