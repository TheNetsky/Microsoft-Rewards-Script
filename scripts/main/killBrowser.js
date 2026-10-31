import { spawnSync } from 'node:child_process'
import { chromium } from 'patchright'
import { log } from '../lib/commandUtils.js'

const args = process.argv.slice(2)
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(
        'npm run kill-chrome-win - Windows only; close all instances of the installed Patchright Chromium executable. Other Chrome installations are left open.'
    )
} else if (args.length) {
    log('ERROR', 'kill-chrome-win does not accept arguments; use --help for usage.')
    process.exitCode = 1
} else if (process.platform !== 'win32') {
    log('ERROR', 'kill-chrome-win is available only on Windows.')
    process.exitCode = 1
} else {
    const script = `
$ErrorActionPreference = 'Stop'
$target = $env:REWARDS_BROWSER_EXECUTABLE
$browsers = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
    $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [System.StringComparison]::OrdinalIgnoreCase)
})
foreach ($browserProcess in $browsers) {
    try {
        Stop-Process -Id $browserProcess.ProcessId -Force -ErrorAction Stop
    } catch {
        if (Get-Process -Id $browserProcess.ProcessId -ErrorAction SilentlyContinue) { throw }
    }
}
Write-Output ("Closed " + $browsers.Count + " bundled Chromium process(es).")
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: 'inherit',
        env: { ...process.env, REWARDS_BROWSER_EXECUTABLE: chromium.executablePath() }
    })
    if (result.error) log('ERROR', `Could not close bundled Chromium: ${result.error.message}`)
    process.exitCode = result.status ?? 1
}
