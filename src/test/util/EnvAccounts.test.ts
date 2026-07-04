import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'

import type { Account } from '../../interface/Account'
import { parseAccountsFromEnvContent, saveAccountsToEnvFile } from '../../util/EnvAccounts'

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-envaccounts-'))
}

function buildAccount(): Account {
    return {
        email: 'new@example.com',
        password: 'new-password',
        totpSecret: 'totp-secret',
        recoveryEmail: 'recovery@example.com',
        geoLocale: 'auto',
        langCode: 'en',
        proxy: {
            proxyHttp: false,
            url: '',
            port: 0,
            username: '',
            password: ''
        },
        saveFingerprint: {
            mobile: false,
            desktop: true
        }
    }
}

test('parseAccountsFromEnvContent rejects accounts without passwords', () => {
    assert.throws(
        () => parseAccountsFromEnvContent('ACCOUNT_1_EMAIL=test@example.com'),
        /ACCOUNT_1_PASSWORD is missing in \.env\./
    )

    assert.throws(
        () => parseAccountsFromEnvContent('ACCOUNT_1_EMAIL=test@example.com\nACCOUNT_1_PASSWORD='),
        /ACCOUNT_1_PASSWORD is missing in \.env\./
    )
})

test('saveAccountsToEnvFile removes stale commented and uncommented account entries', () => {
    const tempDir = createTempDir()
    const envPath = path.join(tempDir, '.env')

    fs.writeFileSync(
        envPath,
        [
            '# Managed comment to keep',
            'GLOBAL_FLAG=true',
            '',
            '# Account 1',
            'ACCOUNT_1_EMAIL=old@example.com',
            'ACCOUNT_1_PASSWORD=old-password',
            '#ACCOUNT_1_TOTP_SECRET=',
            '#ACCOUNT_1_PROXY_PASSWORD=',
            '',
            '# Account 2',
            '#ACCOUNT_2_TOTP_SECRET=',
            'ACCOUNT_2_EMAIL=second@example.com',
            'ACCOUNT_2_PASSWORD=second-password',
            ''
        ].join('\n'),
        'utf-8'
    )

    saveAccountsToEnvFile(envPath, [buildAccount()])

    const updated = fs.readFileSync(envPath, 'utf-8')

    assert.match(updated, /# Managed comment to keep/)
    assert.match(updated, /GLOBAL_FLAG=true/)
    assert.doesNotMatch(updated, /old@example\.com/)
    assert.doesNotMatch(updated, /second@example\.com/)
    assert.doesNotMatch(updated, /#ACCOUNT_1_TOTP_SECRET=/)
    assert.doesNotMatch(updated, /#ACCOUNT_2_TOTP_SECRET=/)
    assert.equal(updated.match(/ACCOUNT_1_EMAIL=/g)?.length, 1)
    assert.match(updated, /ACCOUNT_1_PASSWORD=new-password/)
})
