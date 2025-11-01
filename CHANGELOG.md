# 📝 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.50.5] - Current Release

### 📚 Documentation

- **Redesigned README.md** for better clarity and structure
  - Added project logo and improved visual presentation
  - Simplified installation instructions
  - Better organized feature list
  - Clear navigation to detailed documentation
- **Enhanced documentation structure**
  - Logo integration across documentation files
  - Improved docs/index.md hub page
  - Better cross-referencing between guides
- **Added CONTRIBUTING.md** guide for contributors
- **Improved CHANGELOG.md** structure

### 🎨 Visual Improvements

- Added official project logo (`assets/logo.png`)
- Modernized documentation layout with centered headers
- Improved badge display and version tracking

### 📖 Content Updates

- Clearer disclaimer and risk warnings
- Enhanced feature descriptions
- Better quick start guide
- Improved Docker setup instructions

### AND MOREEEEE++

---

## Previous Releases

For the full history of changes, please refer to the [GitHub Releases](https://github.com/TheNetsky/Microsoft-Rewards-Script/releases) page.

### Notable Features in v2.50.x

- Advanced humanization system with natural behavior patterns
- Risk management with ML-based ban prediction
- Query diversity engine with multiple sources
- Built-in scheduler with timezone support
- Analytics dashboard and diagnostics system
- Docker support with automated scheduling
- Multi-account management with clusters
- Discord webhooks and NTFY notifications
- TOTP/2FA support for secure automation
- Job state management to avoid duplicate work
- Proxy support for enhanced privacy
- Vacation mode for realistic usage patterns

---

## Release Types

- **Major (x.0.0):** Breaking changes, major features
- **Minor (2.x.0):** New features, significant improvements
- **Patch (2.50.x):** Bug fixes, minor improvements, documentation

---

## How to Update

### Git Update
```bash
git pull origin main
npm install
npm run build
```

### Docker Update
```bash
docker compose down
docker compose pull
docker compose up -d
```

### Manual Update
1. Download the latest release
2. Backup your `src/accounts.jsonc` and `src/config.jsonc`
3. Extract the new version
4. Restore your configuration files
5. Run `npm install && npm run build`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

---

<div align="center">

**Stay updated!** ⭐ Star the repo to get notified of new releases

[View Releases](https://github.com/TheNetsky/Microsoft-Rewards-Script/releases) • [Report Issues](https://github.com/TheNetsky/Microsoft-Rewards-Script/issues)

</div>
