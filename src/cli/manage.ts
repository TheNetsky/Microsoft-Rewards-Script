import fs from 'fs'
import path from 'path'
import { stdin as input, stdout as output } from 'process'
import readline from 'readline/promises'

import type { Account } from '../interface/Account'
import type { Config } from '../interface/Config'
import { createEmptyAccount, readAccountsFromEnvFile, saveAccountsToEnvFile } from '../util/EnvAccounts'
import { resolveProjectFile } from '../util/ProjectFiles'
import { validateAccounts, validateConfig } from '../util/Validator'
import { formatCurrentValueSuffix, InteractiveMenu } from './InteractiveMenu'

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

interface JsonObject {
    [key: string]: JsonValue
}

class CliApp {
    private readonly rl = readline.createInterface({ input, output })
    private readonly menu = new InteractiveMenu(input, output)
    private readonly envPath: string
    private readonly configPath: string
    private accounts: Account[]
    private config: Config

    constructor() {
        this.envPath = this.resolveWritableFile('.env')
        this.configPath = this.resolveWritableFile('config.json')
        this.accounts = this.loadAccounts()
        this.config = this.loadConfig()
    }

    public async run(): Promise<void> {
        console.log('Microsoft Rewards Script Manager')
        console.log(`.env: ${this.envPath}`)
        console.log(`config.json: ${this.configPath}`)

        while (true) {
            console.log('')
            console.log(`Accounts loaded: ${this.accounts.length}`)
            console.log(`Clusters: ${this.config.clusters} | Headless: ${this.config.headless}`)

            const choice = await this.selectOption('Main menu', [
                'Manage accounts (.env)',
                'Manage config (config.json)',
                'Validate current setup',
                'Exit'
            ])

            switch (choice) {
                case 0:
                    await this.manageAccounts()
                    break
                case 1:
                    await this.manageConfig()
                    break
                case 2:
                    this.validateCurrentState()
                    break
                case 3:
                    this.rl.close()
                    return
                default:
                    break
            }
        }
    }

    private resolveWritableFile(filename: string): string {
        const resolved = resolveProjectFile(filename)
        return resolved ?? path.join(process.cwd(), filename)
    }

    private loadAccounts(): Account[] {
        try {
            return readAccountsFromEnvFile(this.envPath)
        } catch (error) {
            console.warn(`Failed to parse .env accounts: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
    }

    private loadConfig(): Config {
        const configSource = resolveProjectFile('config.json') ?? resolveProjectFile('config.example.json')
        if (!configSource) {
            return validateConfig({})
        }

        const raw = fs.readFileSync(configSource, 'utf-8')
        return validateConfig(JSON.parse(raw))
    }

    private async manageAccounts(): Promise<void> {
        while (true) {
            console.log('')
            this.printAccounts()

            const choice = await this.selectOption('Accounts menu', [
                'Add account',
                'Edit account',
                'Remove account',
                'Save .env',
                'Back'
            ])

            switch (choice) {
                case 0:
                    await this.addAccount()
                    break
                case 1:
                    await this.editAccount()
                    break
                case 2:
                    await this.removeAccount()
                    break
                case 3:
                    this.saveAccounts()
                    break
                case 4:
                    return
                default:
                    break
            }
        }
    }

    private async manageConfig(): Promise<void> {
        const draft = this.clone(this.config)

        while (true) {
            console.log('')
            console.log('Config editor')
            console.log('Navigate objects, edit values, then save.')

            const choice = await this.selectOption('Config menu', [
                'Edit config tree',
                'Validate draft',
                'Save config.json',
                'Discard changes and go back'
            ])

            switch (choice) {
                case 0:
                    await this.editConfigNode(draft, [])
                    break
                case 1:
                    this.validateConfigDraft(draft)
                    break
                case 2:
                    this.config = this.saveConfig(draft)
                    return
                case 3:
                    return
                default:
                    break
            }
        }
    }

    private async addAccount(): Promise<void> {
        console.log('')
        console.log('Add account')
        const account = await this.promptAccount(createEmptyAccount())
        this.accounts.push(account)
        this.saveAccounts()
    }

    private async editAccount(): Promise<void> {
        if (!this.accounts.length) {
            console.log('No accounts to edit.')
            return
        }

        const index = await this.promptAccountIndex('Choose an account to edit')
        if (index === undefined) {
            return
        }

        const current = this.accounts[index]
        if (!current) {
            console.log('Selected account no longer exists.')
            return
        }

        const updated = await this.promptAccount(this.clone(current))
        this.accounts[index] = updated
        this.saveAccounts()
    }

    private async removeAccount(): Promise<void> {
        if (!this.accounts.length) {
            console.log('No accounts to remove.')
            return
        }

        const index = await this.promptAccountIndex('Choose an account to remove')
        if (index === undefined) {
            return
        }

        const account = this.accounts[index]
        if (!account) {
            console.log('Selected account no longer exists.')
            return
        }

        const confirm = await this.prompt(`Type REMOVE to delete ${account.email}: `)
        if (confirm !== 'REMOVE') {
            console.log('Removal cancelled.')
            return
        }

        this.accounts.splice(index, 1)
        this.saveAccounts()
    }

    private printAccounts(): void {
        if (!this.accounts.length) {
            console.log('No accounts loaded from .env.')
            return
        }

        this.accounts.forEach((account, index) => {
            console.log(
                `${index + 1}. ${account.email} | locale=${account.geoLocale} | lang=${account.langCode} | ` +
                    `totp=${account.totpSecret ? 'yes' : 'no'} | proxy=${account.proxy.url ? 'yes' : 'no'}`
            )
        })
    }

    private async promptAccount(base: Account): Promise<Account> {
        console.log('Enter keeps the current value. Type "-" to clear an optional field.')

        const email = await this.promptRequired('Email', base.email)
        const password = await this.promptRequired('Password', base.password)
        const totpSecret = await this.promptOptional('TOTP secret', base.totpSecret ?? '')
        const recoveryEmail = await this.promptOptional('Recovery email', base.recoveryEmail)
        const geoLocale = await this.promptOptional('Geo locale', base.geoLocale)
        const langCode = await this.promptOptional('Language code', base.langCode)
        const proxyHttp = await this.promptBoolean('Proxy HTTP enabled', base.proxy.proxyHttp)
        const proxyUrl = await this.promptOptional('Proxy URL', base.proxy.url)
        const proxyPort = await this.promptInteger('Proxy port', base.proxy.port)
        const proxyUsername = await this.promptOptional('Proxy username', base.proxy.username)
        const proxyPassword = await this.promptOptional('Proxy password', base.proxy.password)
        const saveMobile = await this.promptBoolean('Save mobile fingerprint', base.saveFingerprint.mobile)
        const saveDesktop = await this.promptBoolean('Save desktop fingerprint', base.saveFingerprint.desktop)

        return {
            email,
            password,
            totpSecret: totpSecret || undefined,
            recoveryEmail,
            geoLocale: geoLocale || 'auto',
            langCode: langCode || 'en',
            proxy: {
                proxyHttp,
                url: proxyUrl,
                port: proxyPort,
                username: proxyUsername,
                password: proxyPassword
            },
            saveFingerprint: {
                mobile: saveMobile,
                desktop: saveDesktop
            }
        }
    }

    private saveAccounts(): void {
        validateAccounts(this.accounts)
        saveAccountsToEnvFile(this.envPath, this.accounts)
        console.log(`Saved ${this.accounts.length} account(s) to ${this.envPath}`)
    }

    private saveConfig(draft: Config): Config {
        const validated = validateConfig(this.clone(draft))
        fs.writeFileSync(this.configPath, `${JSON.stringify(validated, null, 4)}\n`, 'utf-8')
        console.log(`Saved config to ${this.configPath}`)
        return validated
    }

    private validateCurrentState(): void {
        try {
            validateAccounts(this.accounts)
            if (!this.accounts.length) {
                console.warn('Validation warning: there are no accounts configured yet.')
            } else {
                console.log(`Accounts valid: ${this.accounts.length}`)
            }
        } catch (error) {
            console.error(`Accounts invalid: ${error instanceof Error ? error.message : String(error)}`)
        }

        try {
            validateConfig(this.clone(this.config))
            console.log('Config valid.')
        } catch (error) {
            console.error(`Config invalid: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private validateConfigDraft(draft: Config): void {
        try {
            validateConfig(this.clone(draft))
            console.log('Draft config is valid.')
        } catch (error) {
            console.error(`Draft config is invalid: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private async editConfigNode(root: Config, pathParts: string[]): Promise<void> {
        while (true) {
            const current = this.getValue(this.toJsonObject(root), pathParts)
            if (!this.isJsonObject(current)) {
                return
            }

            const entries = Object.entries(current)
            const choice = await this.selectOption(
                `Config path: ${pathParts.length ? pathParts.join('.') : '<root>'}`,
                [
                    ...entries.map(([key, value]) => `${key} = ${this.formatValue(value)}`),
                    'Validate this draft',
                    'Back'
                ]
            )

            if (choice === entries.length) {
                this.validateConfigDraft(root)
                continue
            }
            if (choice === entries.length + 1) {
                return
            }

            const selected = entries[choice]
            if (!selected) {
                continue
            }

            const [key, value] = selected
            if (this.isJsonObject(value)) {
                await this.editConfigNode(root, [...pathParts, key])
                continue
            }

            const nextValue = await this.promptJsonValue([...pathParts, key], value)
            if (nextValue === undefined) {
                continue
            }

            this.setValue(this.toJsonObject(root), [...pathParts, key], nextValue)
        }
    }

    private async promptJsonValue(pathParts: string[], current: JsonValue): Promise<JsonValue | undefined> {
        const pathLabel = pathParts.join('.')

        if (typeof current === 'boolean') {
            const answer = await this.prompt(`${pathLabel} [true/false/toggle, current=${current}]: `)
            const normalized = answer.trim().toLowerCase()
            if (!normalized) return undefined
            if (normalized === 'toggle') return !current
            if (['true', 't', '1', 'yes', 'y', 'on'].includes(normalized)) return true
            if (['false', 'f', '0', 'no', 'n', 'off'].includes(normalized)) return false
            console.log('Invalid boolean value.')
            return undefined
        }

        if (typeof current === 'number') {
            const answer = await this.prompt(`${pathLabel} [number, current=${current}]: `)
            if (!answer.trim()) return undefined
            const parsed = Number(answer)
            if (!Number.isFinite(parsed)) {
                console.log('Invalid number.')
                return undefined
            }
            return parsed
        }

        if (typeof current === 'string') {
            const answer = await this.prompt(`${pathLabel} [string, current=${current}]: `)
            if (!answer.trim()) return undefined
            return answer
        }

        if (Array.isArray(current)) {
            const answer = await this.prompt(
                `${pathLabel} [comma separated or JSON array, current=${JSON.stringify(current)}]: `
            )
            if (!answer.trim()) return undefined

            if (answer.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(answer) as JsonValue
                    if (!Array.isArray(parsed)) {
                        console.log('Value is not a JSON array.')
                        return undefined
                    }
                    return parsed
                } catch (error) {
                    console.log(`Invalid JSON array: ${error instanceof Error ? error.message : String(error)}`)
                    return undefined
                }
            }

            return answer
                .split(',')
                .map(part => part.trim())
                .filter(part => part.length > 0)
        }

        return undefined
    }

    private getValue(root: JsonObject, pathParts: string[]): JsonValue {
        return pathParts.reduce<JsonValue>((current, part) => {
            if (!this.isJsonObject(current)) {
                throw new Error(`Path "${pathParts.join('.')}" is not editable.`)
            }

            const next = current[part]
            if (next === undefined) {
                throw new Error(`Path "${pathParts.join('.')}" does not exist.`)
            }

            return next
        }, root)
    }

    private setValue(root: JsonObject, pathParts: string[], value: JsonValue): void {
        const parent = pathParts.slice(0, -1).reduce<JsonValue>((current, part) => {
            if (!this.isJsonObject(current)) {
                throw new Error(`Path "${pathParts.join('.')}" is not editable.`)
            }

            const next = current[part]
            if (next === undefined) {
                throw new Error(`Path "${pathParts.join('.')}" does not exist.`)
            }

            return next
        }, root)

        const key = pathParts[pathParts.length - 1]
        if (!key || !this.isJsonObject(parent)) {
            throw new Error(`Path "${pathParts.join('.')}" is not editable.`)
        }

        parent[key] = value
    }

    private formatValue(value: JsonValue): string {
        if (Array.isArray(value)) {
            return JSON.stringify(value)
        }
        if (this.isJsonObject(value)) {
            return `{${Object.keys(value).join(', ')}}`
        }
        return JSON.stringify(value)
    }

    private isJsonObject(value: JsonValue): value is JsonObject {
        return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    private toJsonObject(value: unknown): JsonObject {
        return value as JsonObject
    }

    private async promptAccountIndex(label: string): Promise<number | undefined> {
        const options = this.accounts.map(
            (account, index) =>
                `${index + 1}. ${account.email} | locale=${account.geoLocale} | lang=${account.langCode} | ` +
                `totp=${account.totpSecret ? 'yes' : 'no'} | proxy=${account.proxy.url ? 'yes' : 'no'}`
        )

        const choice = await this.selectOption(label, [...options, 'Cancel'])
        if (choice === options.length) {
            return undefined
        }

        return choice
    }

    private async selectOption(title: string, options: string[]): Promise<number> {
        if (this.menu.isSupported()) {
            this.rl.pause()
            try {
                return await this.menu.select(title, options)
            } finally {
                this.rl.resume()
            }
        }

        console.log(title)
        options.forEach((option, index) => {
            console.log(`${index + 1}. ${option}`)
        })
        return (await this.promptMenuSelection(options.length)) - 1
    }

    private async promptMenuSelection(max: number, includeCancel = false): Promise<number> {
        if (includeCancel) {
            console.log(`${max}. Cancel`)
        }

        while (true) {
            const answer = await this.prompt('Select an option: ')
            const parsed = Number.parseInt(answer.trim(), 10)
            if (Number.isInteger(parsed) && parsed >= 1 && parsed <= max) {
                return parsed
            }
            console.log(`Enter a number between 1 and ${max}.`)
        }
    }

    private async prompt(text: string): Promise<string> {
        return this.rl.question(text)
    }

    private async promptRequired(label: string, currentValue: string): Promise<string> {
        while (true) {
            const suffix = formatCurrentValueSuffix(currentValue)
            const answer = (await this.prompt(`${label}${suffix}: `)).trim()
            if (answer) return answer
            if (currentValue) return currentValue
            console.log(`${label} is required.`)
        }
    }

    private async promptOptional(label: string, currentValue: string): Promise<string> {
        const suffix = formatCurrentValueSuffix(currentValue)
        const answer = await this.prompt(`${label}${suffix}: `)
        const trimmed = answer.trim()
        if (!trimmed) {
            return currentValue
        }
        if (trimmed === '-') {
            return ''
        }
        return answer
    }

    private async promptBoolean(label: string, currentValue: boolean): Promise<boolean> {
        while (true) {
            const answer = await this.prompt(`${label} [true/false, current=${currentValue}]: `)
            const trimmed = answer.trim().toLowerCase()
            if (!trimmed) return currentValue
            if (['true', 't', '1', 'yes', 'y', 'on'].includes(trimmed)) return true
            if (['false', 'f', '0', 'no', 'n', 'off'].includes(trimmed)) return false
            console.log('Enter true or false.')
        }
    }

    private async promptInteger(label: string, currentValue: number): Promise<number> {
        while (true) {
            const answer = await this.prompt(`${label} [current=${currentValue}]: `)
            const trimmed = answer.trim()
            if (!trimmed) return currentValue
            const parsed = Number.parseInt(trimmed, 10)
            if (Number.isFinite(parsed)) return parsed
            console.log('Enter a valid integer.')
        }
    }

    private clone<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T
    }
}

async function main(): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Interactive CLI requires a TTY terminal.')
    }

    const app = new CliApp()
    await app.run()
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
