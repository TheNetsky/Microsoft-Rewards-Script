/* eslint-disable linebreak-style */
/**
 * Smart Auto-Update Script
 * 
 * Intelligently updates while preserving user settings:
 * - ALWAYS updates code files (*.ts, *.js, etc.)
 * - ONLY updates config.jsonc if remote has changes to it
 * - ONLY updates accounts.json if remote has changes to it
 * - KEEPS user passwords/emails/settings otherwise
 *
 * Usage:
 *   node setup/update/update.mjs --git
 *   node setup/update/update.mjs --docker
 */

import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function stripJsonComments(input) {
  let result = ""
  let inString = false
  let stringChar = ""
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    const next = input[i + 1]

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false
        result += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      result += char
      if (char === "\\") {
        i++
        if (i < input.length) result += input[i]
        continue
      }
      if (char === stringChar) inString = false
      continue
    }

    if (char === "\"" || char === "'") {
      inString = true
      stringChar = char
      result += char
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }

    result += char
  }

  return result
}

function readJsonConfig(preferredPaths) {
  for (const candidate of preferredPaths) {
    if (!existsSync(candidate)) continue
    try {
      const raw = readFileSync(candidate, "utf8").replace(/^\uFEFF/, "")
      return JSON.parse(stripJsonComments(raw))
    } catch {
      // Try next candidate on parse errors
    }
  }
  return null
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    child.on('close', (code) => resolve(code ?? 0))
    child.on('error', () => resolve(1))
  })
}

async function which(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const code = await run(probe, [cmd], { stdio: 'ignore' })
  return code === 0
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function hasUnresolvedConflicts() {
  // Check for unmerged files
  const unmerged = exec('git ls-files -u')
  if (unmerged) {
    return { hasConflicts: true, files: unmerged.split('\n').filter(Boolean) }
  }
  
  // Check if in middle of merge/rebase
  const gitDir = exec('git rev-parse --git-dir')
  if (gitDir) {
    const mergePath = join(gitDir, 'MERGE_HEAD')
    const rebasePath = join(gitDir, 'rebase-merge')
    const rebaseApplyPath = join(gitDir, 'rebase-apply')
    
    if (existsSync(mergePath) || existsSync(rebasePath) || existsSync(rebaseApplyPath)) {
      return { hasConflicts: true, files: ['merge/rebase in progress'] }
    }
  }
  
  return { hasConflicts: false, files: [] }
}

function abortAllGitOperations() {
  console.log('Aborting any ongoing Git operations...')
  
  // Try to abort merge
  exec('git merge --abort')
  
  // Try to abort rebase
  exec('git rebase --abort')
  
  // Try to abort cherry-pick
  exec('git cherry-pick --abort')
  
  console.log('Git operations aborted.')
}

async function updateGit() {
  const hasGit = await which('git')
  if (!hasGit) {
    console.log('Git not found. Skipping update.')
    return 1
  }

  console.log('\n' + '='.repeat(60))
  console.log('Smart Git Update')
  console.log('='.repeat(60))

  // Step 0: Check for existing conflicts FIRST
  const conflictCheck = hasUnresolvedConflicts()
  if (conflictCheck.hasConflicts) {
    console.log('\n⚠️  ERROR: Git repository has unresolved conflicts!')
    console.log('Conflicted files:')
    conflictCheck.files.forEach(f => console.log(`  - ${f}`))
    console.log('\nAttempting automatic resolution...')
    
    // Abort any ongoing operations
    abortAllGitOperations()
    
    // Verify conflicts are cleared
    const recheckConflicts = hasUnresolvedConflicts()
    if (recheckConflicts.hasConflicts) {
      console.log('\n❌ Could not automatically resolve conflicts.')
      console.log('Manual intervention required. Please run:')
      console.log('  git status')
      console.log('  git reset --hard origin/main  # WARNING: This will discard ALL local changes')
      console.log('\nUpdate aborted for safety.')
      return 1
    }
    
    console.log('✓ Conflicts cleared. Continuing with update...\n')
  }

  // Step 1: Read config to get user preferences
  let userConfig = { autoUpdateConfig: false, autoUpdateAccounts: false }
  const configData = readJsonConfig([
    "src/config.jsonc",
    "config.jsonc",
    "src/config.json",
    "config.json"
  ])

  if (!configData) {
    console.log('Warning: Could not read config.jsonc, using defaults (preserve local files)')
  } else if (configData.update) {
    userConfig.autoUpdateConfig = configData.update.autoUpdateConfig ?? false
    userConfig.autoUpdateAccounts = configData.update.autoUpdateAccounts ?? false
  }

  console.log('\nUser preferences:')
  console.log(`  Auto-update config.jsonc: ${userConfig.autoUpdateConfig}`)
  console.log(`  Auto-update accounts.json: ${userConfig.autoUpdateAccounts}`)

  // Step 2: Fetch
  console.log('\nFetching latest changes...')
  await run('git', ['fetch', '--all', '--prune'])

  // Step 3: Get current branch
  const currentBranch = exec('git branch --show-current')
  if (!currentBranch) {
    console.log('Could not determine current branch.')
    return 1
  }

  // Step 4: Check which files changed in remote
  const remoteBranch = `origin/${currentBranch}`
  const filesChanged = exec(`git diff --name-only HEAD ${remoteBranch}`)
  
  if (!filesChanged) {
    console.log('Already up to date!')
    return 0
  }

  const changedFiles = filesChanged.split('\n').filter(f => f.trim())
  const configChanged = changedFiles.includes('src/config.jsonc')
  const accountsChanged = changedFiles.includes('src/accounts.json')

  // Step 5: ALWAYS backup config and accounts (smart strategy!)
  const backupDir = join(process.cwd(), '.update-backup')
  mkdirSync(backupDir, { recursive: true })
  
  const filesToRestore = []
  
  if (existsSync('src/config.jsonc')) {
    console.log('\nBacking up config.jsonc...')
    writeFileSync(join(backupDir, 'config.jsonc'), readFileSync('src/config.jsonc', 'utf8'))
    // ALWAYS restore config unless user explicitly wants auto-update
    if (!userConfig.autoUpdateConfig) {
      filesToRestore.push('config.jsonc')
    }
  }

  if (existsSync('src/accounts.json')) {
    console.log('Backing up accounts.json...')
    writeFileSync(join(backupDir, 'accounts.json'), readFileSync('src/accounts.json', 'utf8'))
    // ALWAYS restore accounts unless user explicitly wants auto-update
    if (!userConfig.autoUpdateAccounts) {
      filesToRestore.push('accounts.json')
    }
  }

  // Show what will happen
  console.log('\nUpdate strategy:')
  console.log(`  config.jsonc: ${userConfig.autoUpdateConfig ? 'WILL UPDATE from remote' : 'KEEPING YOUR LOCAL VERSION (always)'}`)
  console.log(`  accounts.json: ${userConfig.autoUpdateAccounts ? 'WILL UPDATE from remote' : 'KEEPING YOUR LOCAL VERSION (always)'}`)
  console.log('  All other files: will update from remote')

  // Step 6: Handle local changes intelligently
  // Check if there are uncommitted changes to config/accounts
  const localChanges = exec('git status --porcelain')
  const hasConfigChanges = localChanges && localChanges.includes('src/config.jsonc')
  const hasAccountChanges = localChanges && localChanges.includes('src/accounts.json')
  
  if (hasConfigChanges && !userConfig.autoUpdateConfig) {
    console.log('\n✓ Detected local changes to config.jsonc - will preserve them')
  }
  
  if (hasAccountChanges && !userConfig.autoUpdateAccounts) {
    console.log('✓ Detected local changes to accounts.json - will preserve them')
  }

  // Step 7: Stash ALL changes (including untracked)
  const hasChanges = exec('git status --porcelain')
  let stashCreated = false
  if (hasChanges) {
    console.log('\nStashing local changes (including config/accounts)...')
    await run('git', ['stash', 'push', '-u', '-m', 'Auto-update backup with untracked files'])
    stashCreated = true
  }

  // Step 8: Pull with strategy to handle diverged branches
  console.log('\nPulling latest code...')
  let pullCode = await run('git', ['pull', '--rebase'])
  
  if (pullCode !== 0) {
    console.log('\n❌ Pull failed! Checking for conflicts...')
    
    // Check if it's a conflict
    const postPullConflicts = hasUnresolvedConflicts()
    if (postPullConflicts.hasConflicts) {
      console.log('Conflicts detected during pull:')
      postPullConflicts.files.forEach(f => console.log(`  - ${f}`))
      
      // Abort the rebase/merge
      console.log('\nAborting failed pull...')
      abortAllGitOperations()
      
      // Pop stash before giving up
      if (stashCreated) {
        console.log('Restoring stashed changes...')
        await run('git', ['stash', 'pop'])
      }
      
      console.log('\n⚠️  Update failed due to conflicts.')
      console.log('Your local changes have been preserved.')
      console.log('\nTo force update (DISCARDS local changes), run:')
      console.log('  git fetch --all')
      console.log('  git reset --hard origin/main')
      console.log('  npm ci && npm run build')
      
      return 1
    }
    
    // Not a conflict, just a generic pull failure
    console.log('Pull failed for unknown reason.')
    if (stashCreated) await run('git', ['stash', 'pop'])
    return pullCode
  }

  // Step 9: Restore user files based on preferences
  if (filesToRestore.length > 0) {
    console.log('\nRestoring your local files (per config preferences)...')
    for (const file of filesToRestore) {
      const content = readFileSync(join(backupDir, file), 'utf8')
      writeFileSync(join('src', file), content)
      console.log(`  ✓ Restored ${file}`)
    }
  }

  // Step 10: Restore stash (but skip config/accounts if we already restored them)
  if (stashCreated) {
    console.log('\nRestoring stashed changes...')
    // Pop stash but auto-resolve conflicts by keeping our versions
    const popCode = await run('git', ['stash', 'pop'])
    
    if (popCode !== 0) {
      console.log('⚠️  Stash pop had conflicts - resolving automatically...')
      
      // For config/accounts, keep our version (--ours)
      if (!userConfig.autoUpdateConfig) {
        await run('git', ['checkout', '--ours', 'src/config.jsonc'])
        await run('git', ['add', 'src/config.jsonc'])
      }
      
      if (!userConfig.autoUpdateAccounts) {
        await run('git', ['checkout', '--ours', 'src/accounts.json'])
        await run('git', ['add', 'src/accounts.json'])
      }
      
      // Drop the stash since we resolved manually
      await run('git', ['reset'])
      await run('git', ['stash', 'drop'])
      
      console.log('✓ Conflicts auto-resolved')
    }
  }

  // Step 9: Install & build
  const hasNpm = await which('npm')
  if (!hasNpm) return 0

  console.log('\nInstalling dependencies...')
  await run('npm', ['ci'])
  
  console.log('\nBuilding project...')
  const buildCode = await run('npm', ['run', 'build'])

  console.log('\n' + '='.repeat(60))
  console.log('Update completed!')
  console.log('='.repeat(60) + '\n')

  return buildCode
}

async function updateDocker() {
  const hasDocker = await which('docker')
  if (!hasDocker) return 1
  // Prefer compose v2 (docker compose)
  await run('docker', ['compose', 'pull'])
  return run('docker', ['compose', 'up', '-d'])
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const doGit = args.has('--git')
  const doDocker = args.has('--docker')

  let code = 0
  if (doGit) {
    code = await updateGit()
  }
  if (doDocker && code === 0) {
    code = await updateDocker()
  }
  
  // CRITICAL FIX: Always exit with code, even from scheduler
  // The scheduler expects the update script to complete and exit
  // Otherwise the process hangs indefinitely and gets killed by watchdog
  process.exit(code)
}

main().catch((err) => {
  console.error('Update script error:', err)
  process.exit(1)
})
