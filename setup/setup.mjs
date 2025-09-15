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

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    error('[ERROR] Cannot find src directory at ' + SRC_DIR);
    process.exit(1);
  }

  // Change working directory to project root so npm commands run in correct location
  process.chdir(PROJECT_ROOT);

  renameAccountsIfNeeded();
  await loopForAccountsConfirmation();

  log('\nYou can now review config.json (same folder) to adjust settings such as conclusionWebhook.');
  log('(How to enable it is documented in the repository README.)\n');

  await ensureNpmAvailable();
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install']);
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

  const start = (await prompt('Do you want to start the program now? (yes/no) : ')).toLowerCase();
  if (['yes', 'y'].includes(start)) {
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start']);
  } else {
    log('Exiting without starting.');
  }
  process.exit(0);
}

// Allow clean Ctrl+C
process.on('SIGINT', () => { console.log('\nInterrupted.'); process.exit(1); });

main().catch(err => {
  error('\nSetup failed: ' + err.message);
  process.exit(1);
});
