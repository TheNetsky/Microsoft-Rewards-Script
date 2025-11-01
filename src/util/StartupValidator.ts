import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Config } from '../interface/Config'
import { Account } from '../interface/Account'

interface ValidationError {
  severity: 'error' | 'warning'
  category: string
  message: string
  fix?: string
  docsLink?: string
}

export class StartupValidator {
  private errors: ValidationError[] = []
  private warnings: ValidationError[] = []

  /**
   * Run all validation checks before starting the bot.
   * Always returns true - validation is informative, not blocking.
   * Displays errors and warnings but lets execution continue.
   */
  async validate(config: Config, accounts: Account[]): Promise<boolean> {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'))
    console.log(chalk.cyan('  🔍 STARTUP VALIDATION - Checking Configuration'))
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'))

    // Run all validation checks
    this.validateAccounts(accounts)
    this.validateConfig(config)
    this.validateEnvironment()
    this.validateFileSystem(config)
    this.validateBrowserSettings(config)
    this.validateScheduleSettings(config)
    this.validateNetworkSettings(config)
    this.validateWorkerSettings(config)
    this.validateSearchSettings(config)
    this.validateHumanizationSettings(config)
    this.validateSecuritySettings(config)

    // Display results (await to respect the delay)
    await this.displayResults()

    // Always return true - validation is informative only
    // Users can proceed even with errors (they might be false positives)
    return true
  }

  private validateAccounts(accounts: Account[]): void {
    if (!accounts || accounts.length === 0) {
      this.addError(
        'accounts',
        'No accounts found in accounts.json',
        'Add at least one account to src/accounts.json or src/accounts.jsonc',
        'docs/accounts.md'
      )
      return
    }

    accounts.forEach((account, index) => {
      const prefix = `Account ${index + 1} (${account.email || 'unknown'})`

      // Required: email
      if (!account.email || typeof account.email !== 'string') {
        this.addError(
          'accounts',
          `${prefix}: Missing or invalid email address`,
          'Add a valid email address in the "email" field'
        )
      } else if (!/@/.test(account.email)) {
        this.addError(
          'accounts',
          `${prefix}: Email format is invalid`,
          'Email must contain @ symbol (e.g., user@example.com)'
        )
      }

      // Required: password
      if (!account.password || typeof account.password !== 'string') {
        this.addError(
          'accounts',
          `${prefix}: Missing or invalid password`,
          'Add your Microsoft account password in the "password" field'
        )
      } else if (account.password.length < 4) {
        this.addWarning(
          'accounts',
          `${prefix}: Password seems too short (${account.password.length} characters)`,
          'Verify this is your correct Microsoft account password'
        )
      }

      // Required: recoveryEmail (NEW - mandatory field)
      if (!account.recoveryEmail || typeof account.recoveryEmail !== 'string') {
        this.addError(
          'accounts',
          `${prefix}: Missing required field "recoveryEmail"`,
          'Add your recovery/backup email address. This is MANDATORY for security checks.\nExample: "recoveryEmail": "backup@gmail.com"',
          'docs/accounts.md'
        )
      } else if (!/@/.test(account.recoveryEmail)) {
        this.addError(
          'accounts',
          `${prefix}: Recovery email format is invalid`,
          'Recovery email must be a valid email address (e.g., backup@gmail.com)'
        )
      } else if (account.recoveryEmail.trim() === '') {
        this.addError(
          'accounts',
          `${prefix}: Recovery email cannot be empty`,
          'Provide the actual recovery email associated with this Microsoft account'
        )
      }

      // Optional but recommended: TOTP
      if (!account.totp || account.totp.trim() === '') {
        this.addWarning(
          'accounts',
          `${prefix}: No TOTP (2FA) secret configured`,
          'Highly recommended: Set up 2FA and add your TOTP secret for automated login',
          'docs/accounts.md'
        )
      } else {
        const cleaned = account.totp.replace(/\s+/g, '')
        if (cleaned.length < 16) {
          this.addWarning(
            'accounts',
            `${prefix}: TOTP secret seems too short (${cleaned.length} chars)`,
            'Verify you copied the complete Base32 secret from Microsoft Authenticator setup'
          )
        }
        // Check if it's Base32 (A-Z, 2-7)
        if (!/^[A-Z2-7\s]+$/i.test(account.totp)) {
          this.addWarning(
            'accounts',
            `${prefix}: TOTP secret contains invalid characters`,
            'TOTP secrets should only contain letters A-Z and numbers 2-7 (Base32 format)'
          )
        }
      }

      // Proxy validation
      if (account.proxy) {
        if (account.proxy.url && account.proxy.url.trim() !== '') {
          if (!account.proxy.port || account.proxy.port <= 0) {
            this.addError(
              'accounts',
              `${prefix}: Proxy URL provided but port is missing or invalid`,
              'Add a valid proxy port number (e.g., 8080, 3128)'
            )
          }
        }
      }
    })
  }

  private validateConfig(config: Config): void {
    // Headless mode in Docker
    if (process.env.FORCE_HEADLESS === '1' && config.headless === false) {
      this.addWarning(
        'config',
        'FORCE_HEADLESS=1 but config.headless is false',
        'Docker environment forces headless mode. Your config setting will be overridden.'
      )
    }

    // Parallel mode warning
    if (config.parallel === true) {
      this.addWarning(
        'config',
        'Parallel mode enabled (desktop + mobile run simultaneously)',
        'This uses more resources. Disable if you experience crashes or timeouts.',
        'docs/config.md'
      )
    }

    // Clusters validation
    if (config.clusters > 1) {
      this.addWarning(
        'config',
        `Clusters set to ${config.clusters} - accounts will run in parallel`,
        'Ensure your system has enough resources (RAM, CPU) for concurrent execution'
      )
    }

    // Global timeout validation
    const timeout = typeof config.globalTimeout === 'string' 
      ? config.globalTimeout 
      : `${config.globalTimeout}ms`
    
    if (timeout === '0' || timeout === '0ms' || timeout === '0s') {
      this.addError(
        'config',
        'Global timeout is set to 0',
        'Set a reasonable timeout value (e.g., "30s", "60s") to prevent infinite hangs'
      )
    }

    // Job state validation
    if (config.jobState?.enabled === false) {
      this.addWarning(
        'config',
        'Job state tracking is disabled',
        'The bot will not save progress. If interrupted, all tasks will restart from scratch.',
        'docs/jobstate.md'
      )
    }

    // Risk management validation
    if (config.riskManagement?.enabled === true) {
      if (config.riskManagement.stopOnCritical === true) {
        this.addWarning(
          'config',
          'Risk management will stop execution if critical risk is detected',
          'Bot will halt all accounts if risk score becomes too high'
        )
      }
    }

    // Search delays validation
    const minDelay = typeof config.searchSettings.searchDelay.min === 'string'
      ? config.searchSettings.searchDelay.min
      : `${config.searchSettings.searchDelay.min}ms`

    if (minDelay === '0' || minDelay === '0ms' || minDelay === '0s') {
      this.addWarning(
        'config',
        'Search delay minimum is 0 - this may look suspicious',
        'Consider setting a minimum delay (e.g., "1s", "2s") for more natural behavior'
      )
    }
  }

  private validateEnvironment(): void {
    // Node.js version check
    const nodeVersion = process.version
    const major = parseInt(nodeVersion.split('.')[0]?.replace('v', '') || '0', 10)
    
    if (major < 18) {
      this.addError(
        'environment',
        `Node.js version ${nodeVersion} is too old`,
        'Install Node.js 18 or newer. Visit https://nodejs.org/',
        'docs/getting-started.md'
      )
    } else if (major < 20) {
      this.addWarning(
        'environment',
        `Node.js version ${nodeVersion} is outdated`,
        'Consider upgrading to Node.js 20+ for better performance and security'
      )
    }

    // Docker-specific checks
    if (process.env.FORCE_HEADLESS === '1') {
      this.addWarning(
        'environment',
        'Running in Docker/containerized environment',
        'Make sure volumes are correctly mounted for sessions persistence'
      )
    }

    // Time sync warning for TOTP users
    if (process.platform === 'linux') {
      this.addWarning(
        'environment',
        'Linux detected: Ensure system time is synchronized',
        'Run: sudo timedatectl set-ntp true (required for TOTP to work correctly)'
      )
    }
  }

  private validateFileSystem(config: Config): void {
    // Check if sessions directory exists or can be created
    const sessionPath = path.isAbsolute(config.sessionPath)
      ? config.sessionPath
      : path.join(process.cwd(), config.sessionPath)

    if (!fs.existsSync(sessionPath)) {
      try {
        fs.mkdirSync(sessionPath, { recursive: true })
        this.addWarning(
          'filesystem',
          `Created missing sessions directory: ${sessionPath}`,
          'Session data will be stored here'
        )
      } catch (error) {
        this.addError(
          'filesystem',
          `Cannot create sessions directory: ${sessionPath}`,
          `Check file permissions. Error: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // Check job-state directory if enabled
    if (config.jobState?.enabled !== false) {
      const jobStateDir = config.jobState?.dir 
        ? config.jobState.dir 
        : path.join(sessionPath, 'job-state')
      
      if (!fs.existsSync(jobStateDir)) {
        try {
          fs.mkdirSync(jobStateDir, { recursive: true })
        } catch (error) {
          this.addWarning(
            'filesystem',
            `Cannot create job-state directory: ${jobStateDir}`,
            'Job state tracking may fail. Check file permissions.'
          )
        }
      }
    }

    // Check diagnostics directory if enabled
    if (config.diagnostics?.enabled === true) {
      const diagPath = path.join(process.cwd(), 'diagnostics')
      if (!fs.existsSync(diagPath)) {
        try {
          fs.mkdirSync(diagPath, { recursive: true })
        } catch (error) {
          this.addWarning(
            'filesystem',
            'Cannot create diagnostics directory',
            'Screenshots and HTML snapshots will not be saved'
          )
        }
      }
    }
  }

  private validateBrowserSettings(config: Config): void {
    // Headless validation - only warn in Docker/containerized environments
    if (!config.headless && process.env.FORCE_HEADLESS === '1') {
      this.addWarning(
        'browser',
        'FORCE_HEADLESS=1 but config.headless is false',
        'Docker environment forces headless mode. Your config setting will be overridden.',
        'docs/docker.md'
      )
    }

    // Fingerprinting validation
    if (config.saveFingerprint?.desktop === false && config.saveFingerprint?.mobile === false) {
      this.addWarning(
        'browser',
        'Fingerprint saving is completely disabled',
        'Each run will generate new fingerprints, which may look suspicious'
      )
    }
  }

  private validateScheduleSettings(config: Config): void {
    if (config.schedule?.enabled === true) {
      // Time format validation
      const schedRec = config.schedule as Record<string, unknown>
      const useAmPm = schedRec.useAmPm
      const time12 = typeof schedRec.time12 === 'string' ? schedRec.time12 : ''
      const time24 = typeof schedRec.time24 === 'string' ? schedRec.time24 : ''
      
      if (useAmPm === true && (!time12 || time12.trim() === '')) {
        this.addError(
          'schedule',
          'Schedule enabled with useAmPm=true but time12 is missing',
          'Add time12 field (e.g., "9:00 AM") or set useAmPm=false',
          'docs/schedule.md'
        )
      }
      
      if (useAmPm === false && (!time24 || time24.trim() === '')) {
        this.addError(
          'schedule',
          'Schedule enabled with useAmPm=false but time24 is missing',
          'Add time24 field (e.g., "09:00") or set useAmPm=true',
          'docs/schedule.md'
        )
      }

      // Timezone validation
      const tz = config.schedule.timeZone || 'UTC'
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz })
      } catch {
        this.addError(
          'schedule',
          `Invalid timezone: ${tz}`,
          'Use a valid IANA timezone (e.g., "America/New_York", "Europe/Paris")',
          'docs/schedule.md'
        )
      }

      // Vacation mode check
      if (config.vacation?.enabled === true) {
        if (config.vacation.minDays && config.vacation.maxDays) {
          if (config.vacation.minDays > config.vacation.maxDays) {
            this.addError(
              'schedule',
              `Vacation minDays (${config.vacation.minDays}) > maxDays (${config.vacation.maxDays})`,
              'Set minDays <= maxDays (e.g., minDays: 2, maxDays: 4)'
            )
          }
        }
      }
    }
  }

  private validateNetworkSettings(config: Config): void {
    // Webhook validation
    if (config.webhook?.enabled === true) {
      if (!config.webhook.url || config.webhook.url.trim() === '') {
        this.addError(
          'network',
          'Webhook enabled but URL is missing',
          'Add webhook URL or set webhook.enabled=false',
          'docs/config.md'
        )
      } else if (!config.webhook.url.startsWith('http')) {
        this.addError(
          'network',
          `Invalid webhook URL: ${config.webhook.url}`,
          'Webhook URL must start with http:// or https://'
        )
      }
    }

    // Conclusion webhook validation
    if (config.conclusionWebhook?.enabled === true) {
      if (!config.conclusionWebhook.url || config.conclusionWebhook.url.trim() === '') {
        this.addError(
          'network',
          'Conclusion webhook enabled but URL is missing',
          'Add conclusion webhook URL or disable it'
        )
      }
    }

    // NTFY validation
    if (config.ntfy?.enabled === true) {
      if (!config.ntfy.url || config.ntfy.url.trim() === '') {
        this.addError(
          'network',
          'NTFY enabled but URL is missing',
          'Add NTFY server URL or set ntfy.enabled=false',
          'docs/ntfy.md'
        )
      }
      if (!config.ntfy.topic || config.ntfy.topic.trim() === '') {
        this.addError(
          'network',
          'NTFY enabled but topic is missing',
          'Add NTFY topic name',
          'docs/ntfy.md'
        )
      }
    }
  }

  private validateWorkerSettings(config: Config): void {
    const workers = config.workers
    
    // Check if at least one worker is enabled
    const anyEnabled = workers.doDailySet || workers.doMorePromotions || workers.doPunchCards ||
                       workers.doDesktopSearch || workers.doMobileSearch || workers.doDailyCheckIn ||
                       workers.doReadToEarn
    
    if (!anyEnabled) {
      this.addWarning(
        'workers',
        'All workers are disabled - bot will do nothing',
        'Enable at least one worker task (doDailySet, doDesktopSearch, etc.)',
        'docs/config.md'
      )
    }

    // Mobile + desktop search check
    if (!workers.doDesktopSearch && !workers.doMobileSearch) {
      this.addWarning(
        'workers',
        'Both desktop and mobile searches are disabled',
        'Enable at least one search type to earn search points'
      )
    }

    // Bundle validation
    if (workers.bundleDailySetWithSearch === true && !workers.doDesktopSearch) {
      this.addWarning(
        'workers',
        'bundleDailySetWithSearch is enabled but doDesktopSearch is disabled',
        'Desktop search will not run after Daily Set. Enable doDesktopSearch or disable bundling.'
      )
    }
  }

  private validateSearchSettings(config: Config): void {
    const search = config.searchSettings

    // Retry validation
    if (search.retryMobileSearchAmount < 0) {
      this.addWarning(
        'search',
        'retryMobileSearchAmount is negative',
        'Set to 0 or positive number (recommended: 2-3)'
      )
    }

    if (search.retryMobileSearchAmount > 10) {
      this.addWarning(
        'search',
        `retryMobileSearchAmount is very high (${search.retryMobileSearchAmount})`,
        'High retry count may trigger detection. Recommended: 2-3'
      )
    }

    // Fallback validation
    if (search.localFallbackCount !== undefined && search.localFallbackCount < 10) {
      this.addWarning(
        'search',
        `localFallbackCount is low (${search.localFallbackCount})`,
        'Consider at least 15-25 fallback queries for variety'
      )
    }

    // Query diversity check
    if (config.queryDiversity?.enabled === false && !config.searchOnBingLocalQueries) {
      this.addWarning(
        'search',
        'Query diversity disabled and local queries disabled',
        'Bot will only use Google Trends. Enable one query source for better variety.',
        'docs/config.md'
      )
    }
  }

  private validateHumanizationSettings(config: Config): void {
    const human = config.humanization

    if (!human || human.enabled === false) {
      this.addWarning(
        'humanization',
        'Humanization is completely disabled',
        'This increases detection risk. Consider enabling for safer automation.',
        'docs/config.md'
      )
      return
    }

    // Gesture probabilities
    if (human.gestureMoveProb !== undefined) {
      if (human.gestureMoveProb < 0 || human.gestureMoveProb > 1) {
        this.addError(
          'humanization',
          `gestureMoveProb must be between 0 and 1 (got ${human.gestureMoveProb})`,
          'Set a probability value between 0.0 and 1.0'
        )
      }
      if (human.gestureMoveProb === 0) {
        this.addWarning(
          'humanization',
          'Mouse gestures disabled (gestureMoveProb=0)',
          'This may look robotic. Consider 0.3-0.7 for natural behavior.'
        )
      }
    }

    if (human.gestureScrollProb !== undefined) {
      if (human.gestureScrollProb < 0 || human.gestureScrollProb > 1) {
        this.addError(
          'humanization',
          `gestureScrollProb must be between 0 and 1 (got ${human.gestureScrollProb})`,
          'Set a probability value between 0.0 and 1.0'
        )
      }
    }

    // Action delays
    if (human.actionDelay) {
      const minMs = typeof human.actionDelay.min === 'string' 
        ? parseInt(human.actionDelay.min, 10) 
        : human.actionDelay.min
      const maxMs = typeof human.actionDelay.max === 'string'
        ? parseInt(human.actionDelay.max, 10)
        : human.actionDelay.max

      if (minMs > maxMs) {
        this.addError(
          'humanization',
          'actionDelay min is greater than max',
          `Fix: min=${minMs} should be <= max=${maxMs}`
        )
      }
    }

    // Random off days
    if (human.randomOffDaysPerWeek !== undefined) {
      if (human.randomOffDaysPerWeek < 0 || human.randomOffDaysPerWeek > 7) {
        this.addError(
          'humanization',
          `randomOffDaysPerWeek must be 0-7 (got ${human.randomOffDaysPerWeek})`,
          'Set to a value between 0 (no off days) and 7 (always off)'
        )
      }
    }

    // Allowed windows validation
    if (human.allowedWindows && Array.isArray(human.allowedWindows)) {
      human.allowedWindows.forEach((window, idx) => {
        if (typeof window !== 'string') {
          this.addError(
            'humanization',
            `allowedWindows[${idx}] is not a string`,
            'Format: "HH:mm-HH:mm" (e.g., "09:00-17:00")'
          )
        } else if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(window)) {
          this.addWarning(
            'humanization',
            `allowedWindows[${idx}] format may be invalid: "${window}"`,
            'Expected format: "HH:mm-HH:mm" (24-hour, e.g., "09:00-17:00")'
          )
        }
      })
    }
  }

  private validateSecuritySettings(config: Config): void {
    // Check logging redaction
    const logging = config.logging as { redactEmails?: boolean } | undefined
    if (logging && logging.redactEmails === false) {
      this.addWarning(
        'security',
        'Email redaction is disabled in logs',
        'Enable redactEmails=true if you share logs publicly',
        'docs/security.md'
      )
    }

    // Removed diagnostics warning - reports/ folder with masked emails is safe for debugging

    // Proxy exposure check
    if (config.proxy?.proxyGoogleTrends === false && config.proxy?.proxyBingTerms === false) {
      this.addWarning(
        'security',
        'All external API calls will use your real IP',
        'Consider enabling proxy for Google Trends or Bing Terms to mask your IP'
      )
    }

    // Crash recovery
    if (config.crashRecovery?.autoRestart === true) {
      const maxRestarts = config.crashRecovery.maxRestarts ?? 2
      if (maxRestarts > 5) {
        this.addWarning(
          'security',
          `Crash recovery maxRestarts is high (${maxRestarts})`,
          'Excessive restarts on errors may trigger rate limits or detection'
        )
      }
    }
  }

  private addError(category: string, message: string, fix?: string, docsLink?: string): void {
    this.errors.push({ severity: 'error', category, message, fix, docsLink })
  }

  private addWarning(category: string, message: string, fix?: string, docsLink?: string): void {
    this.warnings.push({ severity: 'warning', category, message, fix, docsLink })
  }

  private async displayResults(): Promise<void> {
    // Display errors
    if (this.errors.length > 0) {
      console.log(chalk.red('\n❌ VALIDATION ERRORS FOUND:\n'))
      this.errors.forEach((err, index) => {
        console.log(chalk.red(`  ${index + 1}. [${err.category.toUpperCase()}] ${err.message}`))
        if (err.fix) {
          console.log(chalk.yellow(`     💡 Fix: ${err.fix}`))
        }
        if (err.docsLink) {
          console.log(chalk.cyan(`     📖 Documentation: ${err.docsLink}`))
        }
        console.log('')
      })
    }

    // Display warnings
    if (this.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  WARNINGS:\n'))
      this.warnings.forEach((warn, index) => {
        console.log(chalk.yellow(`  ${index + 1}. [${warn.category.toUpperCase()}] ${warn.message}`))
        if (warn.fix) {
          console.log(chalk.gray(`     💡 Suggestion: ${warn.fix}`))
        }
        if (warn.docsLink) {
          console.log(chalk.cyan(`     📖 Documentation: ${warn.docsLink}`))
        }
        console.log('')
      })
    }

    // Summary
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'))
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(chalk.green('  ✅ All validation checks passed! Configuration looks good.'))
      console.log(chalk.gray('  → Starting bot execution...'))
    } else {
      console.log(chalk.white(`  Found: ${chalk.red(`${this.errors.length} error(s)`)} | ${chalk.yellow(`${this.warnings.length} warning(s)`)}`))
      
      if (this.errors.length > 0) {
        console.log(chalk.red('\n  ⚠️  CRITICAL ERRORS DETECTED'))
        console.log(chalk.white('  → Bot will continue, but these issues may cause failures'))
        console.log(chalk.white('  → Review errors above and fix them for stable operation'))
        console.log(chalk.gray('  → If you believe these are false positives, you can ignore them'))
      } else {
        console.log(chalk.yellow('\n  ⚠️  Warnings detected - review recommended'))
        console.log(chalk.gray('  → Bot will continue normally'))
      }
      
      console.log(chalk.white('\n  📖 Full documentation: docs/index.md'))
      console.log(chalk.gray('  → Proceeding with execution in 5 seconds...'))
      
      // Give user time to read (5 seconds for errors, 5 seconds for warnings)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'))
  }
}
