import logging from '../lib/logging.cjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
for (const folder of ['data', 'control-api']) {
    const source = path.join(root, 'src', folder)
    if (!fs.existsSync(source)) throw new Error(`Required build assets are missing: ${source}`)
    fs.cpSync(source, path.join(root, 'dist', folder), { recursive: true })
    logging.logMessage('BUILD', 'info', `Copied ${folder} -> dist/${folder}/`)
}
