#!/usr/bin/env node
/**
 * Unified cross-platform setup script for Microsoft Rewards Script.
 * Handles:
 *  - Renaming accounts.example.json -> accounts.json (idempotent)
 *  - Prompt loop to confirm passwords added
 *  - Inform about config.json and conclusionWebhook
 *  - Run npm install + npm run build
 *  - Optional start
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Project root = parent of this setup directory
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

function log(msg) { console.log(msg); }
function warn(msg) { console.warn(msg); }
function error(msg) { console.error(msg); }

function renameAccountsIfNeeded() {
  const accounts = path.join(SRC_DIR, 'accounts.json');
  const example = path.join(SRC_DIR, 'accounts.example.json');
  if (fs.existsSync(accounts)) {
    log('accounts.json already exists - skipping rename.');
    return;
  }
  if (fs.existsSync(example)) {
    log('Renaming accounts.example.json to accounts.json...');
    fs.renameSync(example, accounts);
  } else {
    warn('Neither accounts.json nor accounts.example.json found.');
  }
}

async function prompt(question) {
  return await new Promise(resolve => {
    process.stdout.write(question);
    const onData = (data) => {
      const ans = data.toString().trim();
      process.stdin.off('data', onData);
      resolve(ans);
    };
    process.stdin.on('data', onData);
  });
}

async function loopForAccountsConfirmation() {
  // Keep asking until user says yes
  for (;;) {
    const ans = (await prompt('Have you entered your passwords in accounts.json? (yes/no) : ')).toLowerCase();
    if (['yes', 'y'].includes(ans)) break;
    if (['no', 'n'].includes(ans)) {
      log('Please enter your passwords in accounts.json and save the file (Ctrl+S), then answer yes.');
      continue;
    }
    log('Please answer yes or no.');
  }
}

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function ensureNpmAvailable() {
  try {
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['-v']);
  } catch (e) {
    throw new Error('npm not found in PATH. Install Node.js first.');
  }
}

async function startOnly() {
  log('Starting program (npm run start)...');
  await ensureNpmAvailable();
  // Assume user already installed & built; if dist missing inform user.
  const distIndex = path.join(PROJECT_ROOT, 'dist', 'index.js');
  if (!fs.existsSync(distIndex)) {
    warn('Build output not found. Running build first.');
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
    await installPlaywrightBrowsers();
  } else {
    // Even if build exists, ensure browsers are installed once.
    await installPlaywrightBrowsers();
  }
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start']);
}

async function fullSetup() {
  renameAccountsIfNeeded();
  await loopForAccountsConfirmation();
  log('\nYou can now review config.json (same folder) to adjust settings such as conclusionWebhook.');
  log('(How to enable it is documented in the repository README.)\n');
  await ensureNpmAvailable();
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install']);
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
  await installPlaywrightBrowsers();
  const start = (await prompt('Do you want to start the program now? (yes/no) : ')).toLowerCase();
  if (['yes', 'y'].includes(start)) {
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start']);
  } else {
    log('Finished setup without starting.');
  }
}

async function installPlaywrightBrowsers() {
  const PLAYWRIGHT_MARKER = path.join(PROJECT_ROOT, '.playwright-chromium-installed');
  // Idempotent: skip if marker exists
  if (fs.existsSync(PLAYWRIGHT_MARKER)) {
    log('Playwright chromium already installed (marker found).');
    return;
  }
  log('Ensuring Playwright chromium browser is installed...');
  try {
    await runCommand(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium']);
    fs.writeFileSync(PLAYWRIGHT_MARKER, new Date().toISOString());
    log('Playwright chromium install complete.');
  } catch (e) {
    warn('Failed to install Playwright chromium automatically. You can manually run: npx playwright install chromium');
  }
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    error('[ERROR] Cannot find src directory at ' + SRC_DIR);
    process.exit(1);
  }
  process.chdir(PROJECT_ROOT);

  for (;;) {
    log('============================');
    log(' Microsoft Rewards Setup ');
    log('============================');
    log('Select an option:');
    log('  1) Start program now (skip setup)');
    log('  2) Full first-time setup');
    log('  3) Exit');
    const choice = (await prompt('Enter choice (1/2/3): ')).trim();
    if (choice === '1') { await startOnly(); break; }
    if (choice === '2') { await fullSetup(); break; }
    if (choice === '3') { log('Exiting.'); process.exit(0); }
    log('\nInvalid choice. Please select 1, 2 or 3.\n');
  }
  // After completing action, optionally pause if launched by double click on Windows (no TTY detection simple heuristic)
  if (process.platform === 'win32' && process.stdin.isTTY) {
    log('\nDone. Press Enter to close.');
    await prompt('');
  }
  process.exit(0);
}

// Allow clean Ctrl+C
process.on('SIGINT', () => { console.log('\nInterrupted.'); process.exit(1); });

main().catch(err => {
  error('\nSetup failed: ' + err.message);
  process.exit(1);
});
