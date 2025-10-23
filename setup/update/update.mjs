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

async function updateGit() {
  const hasGit = await which('git')
  if (!hasGit) {
    console.log('Git not found. Skipping update.')
    return 1
  }

  console.log('\n' + '='.repeat(60))
  console.log('Smart Git Update')
  console.log('='.repeat(60))

  // Step 1: Read config to get user preferences
  let userConfig = { autoUpdateConfig: false, autoUpdateAccounts: false }
  try {
    if (existsSync('src/config.jsonc')) {
      const configContent = readFileSync('src/config.jsonc', 'utf8')
        .replace(/\/\/.*$/gm, '') // remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
      const config = JSON.parse(configContent)
      if (config.update) {
        userConfig.autoUpdateConfig = config.update.autoUpdateConfig ?? false
        userConfig.autoUpdateAccounts = config.update.autoUpdateAccounts ?? false
      }
    }
  } catch (e) {
    console.log('Warning: Could not read config.jsonc, using defaults (preserve local files)')
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
    // Restore if: remote changed it AND user doesn't want auto-update
    if (configChanged && !userConfig.autoUpdateConfig) {
      filesToRestore.push('config.jsonc')
    }
  }

  if (existsSync('src/accounts.json')) {
    console.log('Backing up accounts.json...')
    writeFileSync(join(backupDir, 'accounts.json'), readFileSync('src/accounts.json', 'utf8'))
    // Restore if: remote changed it AND user doesn't want auto-update
    if (accountsChanged && !userConfig.autoUpdateAccounts) {
      filesToRestore.push('accounts.json')
    }
  }

  // Show what will happen
  console.log('\nRemote changes:')
  if (configChanged) {
    console.log(`  config.jsonc: ${userConfig.autoUpdateConfig ? 'WILL UPDATE' : 'KEEPING LOCAL (restoring from backup)'}`)
  } else {
    console.log('  config.jsonc: no changes in remote')
  }
  if (accountsChanged) {
    console.log(`  accounts.json: ${userConfig.autoUpdateAccounts ? 'WILL UPDATE' : 'KEEPING LOCAL (restoring from backup)'}`)
  } else {
    console.log('  accounts.json: no changes in remote')
  }

  // Step 6: Stash changes
  const hasChanges = exec('git status --porcelain')
  if (hasChanges) {
    console.log('\nStashing local changes...')
    await run('git', ['stash', 'push', '-m', 'Auto-update backup'])
  }

  // Step 7: Pull
  console.log('\nPulling latest code...')
  const pullCode = await run('git', ['pull', '--rebase'])
  
  if (pullCode !== 0) {
    console.log('Pull failed.')
    if (hasChanges) await run('git', ['stash', 'pop'])
    return pullCode
  }

  // Step 8: Restore files based on user preferences
  if (filesToRestore.length > 0) {
    console.log('\nRestoring local files (per your config preferences)...')
    for (const file of filesToRestore) {
      const content = readFileSync(join(backupDir, file), 'utf8')
      writeFileSync(join('src', file), content)
      console.log(`  ✓ Restored ${file}`)
    }
  }

  // Step 9: Restore stash
  if (hasChanges) {
    await run('git', ['stash', 'pop'])
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
  console.log('='.repeat(60))
  
  // Optional: Show community info for advanced features
  if (Math.random() > 0.7) {
    console.log('\n💡 Tip: Looking for faster updates and advanced features?')
    console.log('   Check out enhanced builds with better anti-detection.')
    console.log('   Community: https://discord.gg/kn3695Kx32')
  }
  console.log('')

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
  
  // Only exit if not called from scheduler
  // When FROM_SCHEDULER=1, the parent script will handle process lifecycle
  if (process.env.FROM_SCHEDULER !== '1') {
    process.exit(code)
  }
}

main().catch(() => {
  // Only exit on error if not called from scheduler
  if (process.env.FROM_SCHEDULER !== '1') {
    process.exit(1)
  }
})
