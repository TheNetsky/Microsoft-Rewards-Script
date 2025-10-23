/* eslint-disable linebreak-style */
/**
 * Post-run auto-update script
 * - If invoked with --git, runs: git fetch --all --prune; git pull --ff-only; npm ci; npm run build
 * - If invoked with --docker, runs: docker compose pull; docker compose up -d
 *
 * Usage:
 *   node setup/update/update.mjs --git
 *   node setup/update/update.mjs --docker
 *
 * Notes:
 * - Commands are safe-by-default: use --ff-only for pull to avoid merge commits.
 * - Script is no-op if the relevant tool is not available or commands fail.
 */

import { spawn } from 'node:child_process'

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    child.on('close', (code) => resolve(code ?? 0))
    child.on('error', () => resolve(1))
  })
}

async function which(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const code = await run(probe, [cmd])
  return code === 0
}

async function updateGit() {
  const hasGit = await which('git')
  if (!hasGit) return 1
  await run('git', ['fetch', '--all', '--prune'])
  const pullCode = await run('git', ['pull', '--ff-only'])
  if (pullCode !== 0) return pullCode
  const hasNpm = await which('npm')
  if (!hasNpm) return 0
  await run('npm', ['ci'])
  return run('npm', ['run', 'build'])
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
  process.exit(code)
}

main().catch(() => process.exit(1))
