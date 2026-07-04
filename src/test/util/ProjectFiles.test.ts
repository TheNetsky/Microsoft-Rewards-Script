import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'

import { getProjectRoot } from '../../util/ProjectFiles'

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-projectfiles-'))
}

test('getProjectRoot resolves relative paths to the nearest package root', () => {
    const tempDir = createTempDir()
    const projectRoot = path.join(tempDir, 'project')
    const nestedDir = path.join(projectRoot, 'nested', 'child')

    fs.mkdirSync(nestedDir, { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf-8')

    const originalCwd = process.cwd()
    process.chdir(nestedDir)

    try {
        assert.equal(getProjectRoot('.'), projectRoot)
    } finally {
        process.chdir(originalCwd)
    }
})

test('getProjectRoot returns an absolute path for relative inputs without hanging', () => {
    const tempDir = createTempDir()
    const nestedDir = path.join(tempDir, 'no-package', 'child')

    fs.mkdirSync(nestedDir, { recursive: true })

    const originalCwd = process.cwd()
    process.chdir(nestedDir)

    try {
        const resolvedRoot = getProjectRoot('.')

        assert.equal(path.isAbsolute(resolvedRoot), true)
        assert.notEqual(resolvedRoot, '.')
    } finally {
        process.chdir(originalCwd)
    }
})
