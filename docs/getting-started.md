# Getting Started

This guide gets you from zero to a running automation in minutes. For deeper topics, follow the links at the end.

## Requirements
- Node.js 18+ (22 recommended)
- Microsoft accounts (email + password; optional 2FA via TOTP)
- Optional: Docker

## Quick Setup (Wizard)
- Windows: run `setup/setup.bat`
- Linux/macOS/WSL: run `bash setup/setup.sh`
- Any OS: `npm run setup`

The wizard will help you create `src/accounts.json`, install dependencies, build, and start.

## Manual Setup
1) Copy and edit your accounts file:
- Copy `src/accounts.example.json` to `src/accounts.json`
- Fill each item with `email`, `password`, optional `totp` (Base32 secret), optional `recoveryEmail`, and proxy if needed

2) Install and build:
- `npm install`
- `npm run build`

3) Run:
- `npm start` to run a single pass
- `npm run start:schedule` to use the built‑in scheduler

## Docker (Optional)
- Ensure `src/accounts.json` and `src/config.json` exist
- `docker compose up -d` in the repo root
- Logs: `docker logs -f microsoft-rewards-script`

See the dedicated [Docker Guide](./docker.md) for advanced options.

## Next Steps
- [Accounts & TOTP (2FA)](./accounts.md)
- [Scheduling](./schedule.md)
- [Notifications: NTFY](./ntfy.md) and [Discord conclusion webhook](./conclusionwebhook.md)
- [Diagnostics](./diagnostics.md) and [Humanization](./humanization.md)