# Git Conflict Resolution Guide

## Problem: "Pulling is not possible because you have unmerged files"

This error occurs when Git has conflicting changes between your local repository and the remote repository.

## Quick Fix (Recommended)

### Option 1: Keep Remote Changes (Safest for updates)

```bash
# Abort any ongoing operations
git merge --abort
git rebase --abort

# Reset to remote version (discards local changes)
git fetch --all
git reset --hard origin/main

# Reinstall and rebuild
npm ci
npm run build
```

### Option 2: Keep Local Changes

```bash
# Save your changes
git stash push -m "My local changes"

# Get remote changes
git fetch --all
git reset --hard origin/main

# Reapply your changes (may cause conflicts again)
git stash pop
```

## Automatic Conflict Prevention

The update script (`setup/update/update.mjs`) now automatically:

1. **Detects conflicts** before attempting updates
2. **Aborts** failed merge/rebase operations
3. **Preserves** your stashed changes
4. **Reports** exactly what went wrong

### Update Script Features

- ✅ Pre-flight conflict detection
- ✅ Automatic abort of failed operations
- ✅ Smart backup of config.jsonc and accounts.json
- ✅ User-configurable auto-update preferences
- ✅ Detailed error reporting with recovery instructions

## Config Options

In `config.jsonc`, set these to control what gets auto-updated:

```jsonc
{
  "update": {
    "autoUpdateConfig": false,    // Keep your local config.jsonc
    "autoUpdateAccounts": false,  // Keep your local accounts.json
    "git": true,                  // Enable Git updates
    "docker": false               // Enable Docker updates
  }
}
```

## Manual Conflict Resolution

If you need to manually resolve conflicts:

### 1. Check Status

```bash
git status
```

### 2. View Conflicted Files

```bash
git ls-files -u
```

### 3. For Each Conflicted File

**Option A: Keep Remote Version**
```bash
git checkout --theirs <file>
git add <file>
```

**Option B: Keep Local Version**
```bash
git checkout --ours <file>
git add <file>
```

**Option C: Manual Edit**
- Open the file
- Look for `<<<<<<<`, `=======`, `>>>>>>>` markers
- Edit to keep what you want
- Remove the markers
- Save the file

```bash
git add <file>
```

### 4. Complete the Merge

```bash
git commit -m "Resolved conflicts"
```

## Prevention Tips

1. **Don't edit code files directly** - they're meant to be updated from Git
2. **Only customize** `config.jsonc` and `accounts.json`
3. **Use the auto-update feature** with proper config flags
4. **Commit your config changes** if you want version control
5. **Use branches** for custom modifications

## Troubleshooting

### "detached HEAD state"

```bash
git checkout main
git pull
```

### "Your branch has diverged"

```bash
git fetch origin
git reset --hard origin/main
```

### "Permission denied" or file locks

On Windows:
```powershell
# Close all Node/VS Code instances
taskkill /F /IM node.exe
git clean -fd
git reset --hard origin/main
```

On Linux/macOS:
```bash
sudo chown -R $USER:$USER .git
git clean -fd
git reset --hard origin/main
```

## Emergency Recovery

If everything is broken:

```bash
# Backup your config and accounts
cp src/config.jsonc ~/backup-config.jsonc
cp src/accounts.json ~/backup-accounts.json

# Nuclear option: fresh clone
cd ..
rm -rf Microsoft-Rewards-Rewi
git clone https://github.com/Light60-1/Microsoft-Rewards-Rewi.git
cd Microsoft-Rewards-Rewi

# Restore your files
cp ~/backup-config.jsonc src/config.jsonc
cp ~/backup-accounts.json src/accounts.json

# Reinstall
npm ci
npm run build
```

## Support

If conflicts persist:
1. Check GitHub Issues
2. Create a new issue with the output of `git status`
3. Include your update configuration settings
4. Mention your OS and Git version

---

**Remember**: The safest approach is to let Git updates manage code files, and only customize config and accounts files.
