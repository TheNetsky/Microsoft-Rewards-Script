import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const srcDir = path.join(root, 'src', 'functions')
const outDir = path.join(root, 'dist', 'functions')

const assets = ['search-queries.json', 'bing-search-activity-queries.json']

fs.mkdirSync(outDir, { recursive: true })

for (const asset of assets) {
    const from = path.join(srcDir, asset)
    if (!fs.existsSync(from)) {
        throw new Error(`Required build asset is missing: ${from}`)
    }
    fs.copyFileSync(from, path.join(outDir, asset))
    console.log(`[info] Copied ${asset} -> dist/functions/`)
}
