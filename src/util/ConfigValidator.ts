import fs from 'fs'
import { Config } from '../interface/Config'
import { Account } from '../interface/Account'

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  suggestion?: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

/**
 * ConfigValidator performs intelligent validation of config.jsonc and accounts.json
 * before execution to catch common mistakes, conflicts, and security issues.
 */
export class ConfigValidator {
  /**
   * Validate the main config file
   */
  static validateConfig(config: Config): ValidationResult {
    const issues: ValidationIssue[] = []

    // Check baseURL
    if (!config.baseURL || !config.baseURL.startsWith('https://')) {
      issues.push({
        severity: 'error',
        field: 'baseURL',
        message: 'baseURL must be a valid HTTPS URL',
        suggestion: 'Use https://rewards.bing.com'
      })
    }

    // Check sessionPath
    if (!config.sessionPath || config.sessionPath.trim() === '') {
      issues.push({
        severity: 'error',
        field: 'sessionPath',
        message: 'sessionPath cannot be empty'
      })
    }

    // Check clusters
    if (config.clusters < 1) {
      issues.push({
        severity: 'error',
        field: 'clusters',
        message: 'clusters must be at least 1'
      })
    }
    if (config.clusters > 10) {
      issues.push({
        severity: 'warning',
        field: 'clusters',
        message: 'High cluster count may consume excessive resources',
        suggestion: 'Consider using 2-4 clusters for optimal performance'
      })
    }

    // Check globalTimeout
    const timeout = this.parseTimeout(config.globalTimeout)
    if (timeout < 10000) {
      issues.push({
        severity: 'warning',
        field: 'globalTimeout',
        message: 'Very short timeout may cause frequent failures',
        suggestion: 'Use at least 15s for stability'
      })
    }
    if (timeout > 120000) {
      issues.push({
        severity: 'warning',
        field: 'globalTimeout',
        message: 'Very long timeout may slow down execution',
        suggestion: 'Use 30-60s for optimal balance'
      })
    }

    // Check search settings
    if (config.searchSettings) {
      const searchDelay = config.searchSettings.searchDelay
      const minDelay = this.parseTimeout(searchDelay.min)
      const maxDelay = this.parseTimeout(searchDelay.max)

      if (minDelay >= maxDelay) {
        issues.push({
          severity: 'error',
          field: 'searchSettings.searchDelay',
          message: 'min delay must be less than max delay'
        })
      }

      if (minDelay < 10000) {
        issues.push({
          severity: 'warning',
          field: 'searchSettings.searchDelay.min',
          message: 'Very short search delays increase ban risk',
          suggestion: 'Use at least 30s between searches'
        })
      }

      if (config.searchSettings.retryMobileSearchAmount > 5) {
        issues.push({
          severity: 'warning',
          field: 'searchSettings.retryMobileSearchAmount',
          message: 'Too many retries may waste time',
          suggestion: 'Use 2-3 retries maximum'
        })
      }
    }

    // Check humanization
    if (config.humanization) {
      if (config.humanization.enabled === false && config.humanization.stopOnBan === true) {
        issues.push({
          severity: 'warning',
          field: 'humanization',
          message: 'stopOnBan is enabled but humanization is disabled',
          suggestion: 'Enable humanization for better ban protection'
        })
      }

      const actionDelay = config.humanization.actionDelay
      if (actionDelay) {
        const minAction = this.parseTimeout(actionDelay.min)
        const maxAction = this.parseTimeout(actionDelay.max)
        if (minAction >= maxAction) {
          issues.push({
            severity: 'error',
            field: 'humanization.actionDelay',
            message: 'min action delay must be less than max'
          })
        }
      }

      if (config.humanization.allowedWindows && config.humanization.allowedWindows.length > 0) {
        for (const window of config.humanization.allowedWindows) {
          if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(window)) {
            issues.push({
              severity: 'error',
              field: 'humanization.allowedWindows',
              message: `Invalid time window format: ${window}`,
              suggestion: 'Use format HH:mm-HH:mm (e.g., 09:00-17:00)'
            })
          }
        }
      }
    }

    // Check proxy config
    if (config.proxy) {
      if (config.proxy.proxyGoogleTrends === false && config.proxy.proxyBingTerms === false) {
        issues.push({
          severity: 'info',
          field: 'proxy',
          message: 'All proxy options disabled - outbound requests will use direct connection'
        })
      }
    }

    // Check webhooks
    if (config.webhook?.enabled && (!config.webhook.url || config.webhook.url.trim() === '')) {
      issues.push({
        severity: 'error',
        field: 'webhook.url',
        message: 'Webhook enabled but URL is empty'
      })
    }

    if (config.conclusionWebhook?.enabled && (!config.conclusionWebhook.url || config.conclusionWebhook.url.trim() === '')) {
      issues.push({
        severity: 'error',
        field: 'conclusionWebhook.url',
        message: 'Conclusion webhook enabled but URL is empty'
      })
    }

    // Check ntfy
    if (config.ntfy?.enabled) {
      if (!config.ntfy.url || config.ntfy.url.trim() === '') {
        issues.push({
          severity: 'error',
          field: 'ntfy.url',
          message: 'NTFY enabled but URL is empty'
        })
      }
      if (!config.ntfy.topic || config.ntfy.topic.trim() === '') {
        issues.push({
          severity: 'error',
          field: 'ntfy.topic',
          message: 'NTFY enabled but topic is empty'
        })
      }
    }

    // Check schedule
    if (config.schedule?.enabled) {
      if (!config.schedule.timeZone) {
        issues.push({
          severity: 'warning',
          field: 'schedule.timeZone',
          message: 'No timeZone specified, defaulting to UTC',
          suggestion: 'Set your local timezone (e.g., America/New_York)'
        })
      }

      const useAmPm = config.schedule.useAmPm
      const time12 = (config.schedule as unknown as Record<string, unknown>)['time12']
      const time24 = (config.schedule as unknown as Record<string, unknown>)['time24']

      if (useAmPm === true && (!time12 || (typeof time12 === 'string' && time12.trim() === ''))) {
        issues.push({
          severity: 'error',
          field: 'schedule.time12',
          message: 'useAmPm is true but time12 is empty'
        })
      }
      if (useAmPm === false && (!time24 || (typeof time24 === 'string' && time24.trim() === ''))) {
        issues.push({
          severity: 'error',
          field: 'schedule.time24',
          message: 'useAmPm is false but time24 is empty'
        })
      }
    }

    // Check workers
    if (config.workers) {
      const allDisabled = !config.workers.doDailySet && 
                          !config.workers.doMorePromotions &&
                          !config.workers.doPunchCards &&
                          !config.workers.doDesktopSearch &&
                          !config.workers.doMobileSearch &&
                          !config.workers.doDailyCheckIn &&
                          !config.workers.doReadToEarn

      if (allDisabled) {
        issues.push({
          severity: 'warning',
          field: 'workers',
          message: 'All workers are disabled - bot will not perform any tasks',
          suggestion: 'Enable at least one worker type'
        })
      }
    }

    // Check diagnostics
    if (config.diagnostics?.enabled) {
      const maxPerRun = config.diagnostics.maxPerRun || 2
      if (maxPerRun > 20) {
        issues.push({
          severity: 'warning',
          field: 'diagnostics.maxPerRun',
          message: 'Very high maxPerRun may fill disk quickly'
        })
      }

      const retention = config.diagnostics.retentionDays || 7
      if (retention > 90) {
        issues.push({
          severity: 'info',
          field: 'diagnostics.retentionDays',
          message: 'Long retention period - monitor disk usage'
        })
      }
    }

    const valid = !issues.some(i => i.severity === 'error')
    return { valid, issues }
  }

  /**
   * Validate accounts.json
   */
  static validateAccounts(accounts: Account[]): ValidationResult {
    const issues: ValidationIssue[] = []

    if (accounts.length === 0) {
      issues.push({
        severity: 'error',
        field: 'accounts',
        message: 'No accounts found in accounts.json'
      })
      return { valid: false, issues }
    }

    const seenEmails = new Set<string>()
    const seenProxies = new Map<string, string[]>() // proxy -> [emails]

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i]
      const prefix = `accounts[${i}]`

      if (!acc) continue

      // Check email
      if (!acc.email || acc.email.trim() === '') {
        issues.push({
          severity: 'error',
          field: `${prefix}.email`,
          message: 'Account email is empty'
        })
      } else {
        if (seenEmails.has(acc.email)) {
          issues.push({
            severity: 'error',
            field: `${prefix}.email`,
            message: `Duplicate email: ${acc.email}`
          })
        }
        seenEmails.add(acc.email)

        if (!/@/.test(acc.email)) {
          issues.push({
            severity: 'error',
            field: `${prefix}.email`,
            message: 'Invalid email format'
          })
        }
      }

      // Check password
      if (!acc.password || acc.password.trim() === '') {
        issues.push({
          severity: 'error',
          field: `${prefix}.password`,
          message: 'Account password is empty'
        })
      } else if (acc.password.length < 8) {
        issues.push({
          severity: 'warning',
          field: `${prefix}.password`,
          message: 'Very short password - verify it\'s correct'
        })
      }

      // Check proxy
      if (acc.proxy) {
        const proxyUrl = acc.proxy.url
        if (proxyUrl && proxyUrl.trim() !== '') {
          if (!acc.proxy.port) {
            issues.push({
              severity: 'error',
              field: `${prefix}.proxy.port`,
              message: 'Proxy URL specified but port is missing'
            })
          }

          // Track proxy reuse
          const proxyKey = `${proxyUrl}:${acc.proxy.port}`
          if (!seenProxies.has(proxyKey)) {
            seenProxies.set(proxyKey, [])
          }
          seenProxies.get(proxyKey)?.push(acc.email)
        }
      }

      // Check TOTP
      if (acc.totp && acc.totp.trim() !== '') {
        if (acc.totp.length < 16) {
          issues.push({
            severity: 'warning',
            field: `${prefix}.totp`,
            message: 'TOTP secret seems too short - verify it\'s correct'
          })
        }
      }
    }

    // Warn about excessive proxy reuse
    for (const [proxyKey, emails] of seenProxies) {
      if (emails.length > 3) {
        issues.push({
          severity: 'warning',
          field: 'accounts.proxy',
          message: `Proxy ${proxyKey} used by ${emails.length} accounts - may trigger rate limits`,
          suggestion: 'Use different proxies per account for better safety'
        })
      }
    }

    const valid = !issues.some(i => i.severity === 'error')
    return { valid, issues }
  }

  /**
   * Validate both config and accounts together (cross-checks)
   */
  static validateAll(config: Config, accounts: Account[]): ValidationResult {
    const configResult = this.validateConfig(config)
    const accountsResult = this.validateAccounts(accounts)

    const issues = [...configResult.issues, ...accountsResult.issues]

    // Cross-validation: clusters vs accounts
    if (accounts.length > 0 && config.clusters > accounts.length) {
      issues.push({
        severity: 'info',
        field: 'clusters',
        message: `${config.clusters} clusters configured but only ${accounts.length} account(s)`,
        suggestion: 'Reduce clusters to match account count for efficiency'
      })
    }

    // Cross-validation: parallel mode with single account
    if (config.parallel && accounts.length === 1) {
      issues.push({
        severity: 'info',
        field: 'parallel',
        message: 'Parallel mode enabled with single account has no effect',
        suggestion: 'Disable parallel mode or add more accounts'
      })
    }

    const valid = !issues.some(i => i.severity === 'error')
    return { valid, issues }
  }

  /**
   * Load and validate from file paths
   */
  static validateFromFiles(configPath: string, accountsPath: string): ValidationResult {
    try {
      if (!fs.existsSync(configPath)) {
        return {
          valid: false,
          issues: [{
            severity: 'error',
            field: 'config',
            message: `Config file not found: ${configPath}`
          }]
        }
      }

      if (!fs.existsSync(accountsPath)) {
        return {
          valid: false,
          issues: [{
            severity: 'error',
            field: 'accounts',
            message: `Accounts file not found: ${accountsPath}`
          }]
        }
      }

      const configRaw = fs.readFileSync(configPath, 'utf-8')
      const accountsRaw = fs.readFileSync(accountsPath, 'utf-8')

      // Remove JSONC comments (basic approach)
      const configJson = configRaw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      const config: Config = JSON.parse(configJson)
      const accounts: Account[] = JSON.parse(accountsRaw)

      return this.validateAll(config, accounts)
    } catch (error) {
      return {
        valid: false,
        issues: [{
          severity: 'error',
          field: 'parse',
          message: `Failed to parse files: ${error instanceof Error ? error.message : String(error)}`
        }]
      }
    }
  }

  /**
   * Print validation results to console with color
   * Note: This method intentionally uses console.log for CLI output formatting
   */
  static printResults(result: ValidationResult): void {
    if (result.valid) {
      console.log('✅ Configuration validation passed\n')
    } else {
      console.log('❌ Configuration validation failed\n')
    }

    if (result.issues.length === 0) {
      console.log('No issues found.')
      return
    }

    const errors = result.issues.filter(i => i.severity === 'error')
    const warnings = result.issues.filter(i => i.severity === 'warning')
    const infos = result.issues.filter(i => i.severity === 'info')

    if (errors.length > 0) {
      console.log(`\n🚫 ERRORS (${errors.length}):`)
      for (const issue of errors) {
        console.log(`  ${issue.field}: ${issue.message}`)
        if (issue.suggestion) {
          console.log(`    → ${issue.suggestion}`)
        }
      }
    }

    if (warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${warnings.length}):`)
      for (const issue of warnings) {
        console.log(`  ${issue.field}: ${issue.message}`)
        if (issue.suggestion) {
          console.log(`    → ${issue.suggestion}`)
        }
      }
    }

    if (infos.length > 0) {
      console.log(`\nℹ️  INFO (${infos.length}):`)
      for (const issue of infos) {
        console.log(`  ${issue.field}: ${issue.message}`)
        if (issue.suggestion) {
          console.log(`    → ${issue.suggestion}`)
        }
      }
    }

    console.log()
  }

  private static parseTimeout(value: number | string): number {
    if (typeof value === 'number') return value
    const str = String(value).toLowerCase()
    if (str.endsWith('ms')) return parseInt(str, 10)
    if (str.endsWith('s')) return parseInt(str, 10) * 1000
    if (str.endsWith('min')) return parseInt(str, 10) * 60000
    return parseInt(str, 10) || 30000
  }
}
