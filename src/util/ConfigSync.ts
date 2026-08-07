/**
 * ConfigSync.ts
 *
 * 比较并合并 config.json 与 config.example.json 的唯一事实来源。
 * Docker 入口点通过 CLI 使用此模块，API 的 configEditor.js 通过动态导入使用；
 * Load.ts 不使用此模块。Load.ts/Validator.ts 每次启动时已在内存中补齐缺失键
 * （裸机和 Docker 均如此）；此模块只负责将这些默认值写回磁盘上的文件，
 * 供 config.json 位于绑定挂载卷中、需要跨镜像更新保留配置的 Docker 用户使用。
 *
 * 使用方：
 *   - entrypoint.sh -> `node dist/util/ConfigSync.js sync [--patch] --config <path> --example <path>`
 *   - configEditor.js -> dynamic import of diffKeyPaths / mergeMissingDefaults / readJson / resolveExamplePath
 */

import fs from 'fs'
import path from 'path'

export interface SyncReport {
    configPath: string
    examplePath: string
    created: boolean // config.json 不存在并已使用示例初始化时为 true
    addedKeys: string[] // 示例中存在但配置中缺失的点分隔键路径
    patched: boolean // addedKeys 已实际写入 config.json 时为 true
    backupPath?: string
}

// ── 路径辅助函数（仅 Docker 端；与 Load.ts 的搜索顺序一致，
//    但有意独立保留并重复实现，原因见上方说明）──

export function getProjectRoot(startDir: string = process.cwd()): string {
    if (fs.existsSync(path.join(startDir, 'package.json'))) return startDir
    let dir = startDir
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'package.json'))) return dir
        dir = path.dirname(dir)
    }
    return startDir
}

function resolveProjectFile(filename: string, projectRoot: string): string | undefined {
    const candidates = [
        path.join(process.cwd(), filename),
        path.join(projectRoot, filename),
        path.join(projectRoot, 'dist', filename),
        path.join(projectRoot, 'src', filename)
    ]
    return candidates.find(p => fs.existsSync(p))
}

export function resolveConfigPath(projectRoot: string = getProjectRoot()): string {
    return resolveProjectFile('config.json', projectRoot) ?? path.join(projectRoot, 'config.json')
}

export function resolveExamplePath(projectRoot: string = getProjectRoot()): string {
    return resolveProjectFile('config.example.json', projectRoot) ?? path.join(projectRoot, 'config.example.json')
}

// ── 读写 ──

export function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function writeConfigAtomic(
    targetPath: string,
    cfg: unknown,
    opts: { backup?: boolean } = {}
): { backupPath?: string } {
    const backup = opts.backup ?? true
    let backupPath: string | undefined
    if (backup && fs.existsSync(targetPath)) {
        backupPath = `${targetPath}.bak`
        try {
            fs.copyFileSync(targetPath, backupPath)
        } catch {
            backupPath = undefined // 尽力备份；不要因备份失败而中止同步
        }
    }
    const tmp = `${targetPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n')
    fs.renameSync(tmp, targetPath)
    return { backupPath }
}

// ── 差异/合并 ──

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 返回 `example` 中存在但 `config` 中缺失的点分隔键路径。数组视为叶节点，
 * 不比较其内容，只检查对应键是否存在。
 */
export function diffKeyPaths(config: unknown, example: unknown, prefix = ''): string[] {
    if (!isPlainObject(example)) return []
    const cfgObj = isPlainObject(config) ? config : {}
    const missing: string[] = []

    for (const [key, exampleVal] of Object.entries(example)) {
        const keyPath = prefix ? `${prefix}.${key}` : key
        if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
            missing.push(keyPath)
            continue
        }
        if (isPlainObject(exampleVal)) {
            missing.push(...diffKeyPaths(cfgObj[key], exampleVal, keyPath))
        }
    }
    return missing
}

/**
 * 深拷贝 `config`，并使用示例值补齐 `example` 中存在但 `config` 中缺失的键。
 * 绝不覆盖用户已有值。返回合并后的配置以及新增的点分隔路径。
 */
export function mergeMissingDefaults<T = unknown>(config: unknown, example: T): { merged: T; addedKeys: string[] } {
    const addedKeys: string[] = []

    function walk(cfg: unknown, ex: unknown, prefix: string): unknown {
        if (!isPlainObject(ex)) return cfg === undefined ? ex : cfg
        const cfgObj = isPlainObject(cfg) ? { ...cfg } : {}
        for (const [key, exVal] of Object.entries(ex)) {
            const keyPath = prefix ? `${prefix}.${key}` : key
            if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
                cfgObj[key] = exVal
                addedKeys.push(keyPath)
            } else if (isPlainObject(exVal)) {
                cfgObj[key] = walk(cfgObj[key], exVal, keyPath)
            }
        }
        return cfgObj
    }

    return { merged: walk(config, example, '') as T, addedKeys }
}

// ── 编排（Docker CLI 路径）──

export interface SyncOptions {
    projectRoot?: string
    configPath?: string
    examplePath?: string
    /** 为 true 时将缺失键写入 config.json（并创建 .bak 备份）；为 false 时仅报告。 */
    patch?: boolean
}

export function syncConfig(opts: SyncOptions = {}): SyncReport {
    const projectRoot = opts.projectRoot ?? getProjectRoot()
    const configPath = opts.configPath ?? resolveConfigPath(projectRoot)
    const examplePath = opts.examplePath ?? resolveExamplePath(projectRoot)

    if (!fs.existsSync(examplePath)) {
        throw new Error(`config.example.json not found at ${examplePath} - image may be corrupt.`)
    }
    const example = readJson(examplePath)

    // 尚无 config.json（或只有空占位文件）时，使用示例初始化。
    if (!fs.existsSync(configPath) || fs.statSync(configPath).size < 10) {
        writeConfigAtomic(configPath, example)
        return { configPath, examplePath, created: true, addedKeys: [], patched: true }
    }

    // 对现有文件：解析错误会以异常形式暴露，而不是静默覆盖；
    // 这样损坏的用户文件会明确失败，而不会被直接破坏。
    const config = readJson(configPath)
    const addedKeys = diffKeyPaths(config, example)

    if (addedKeys.length === 0) {
        return { configPath, examplePath, created: false, addedKeys: [], patched: false }
    }
    if (!opts.patch) {
        return { configPath, examplePath, created: false, addedKeys, patched: false }
    }

    const { merged } = mergeMissingDefaults(config, example)
    const { backupPath } = writeConfigAtomic(configPath, merged)
    return { configPath, examplePath, created: false, addedKeys, patched: true, backupPath }
}

// ── entrypoint.sh 使用的 CLI 入口点 ──
// node dist/util/ConfigSync.js sync [--patch] [--config <path>] [--example <path>]
if (require.main === module) {
    const args = process.argv.slice(2)
    const patch = args.includes('--patch')
    const getArg = (flag: string) => {
        const i = args.indexOf(flag)
        return i !== -1 ? args[i + 1] : undefined
    }

    try {
        const report = syncConfig({
            configPath: getArg('--config'),
            examplePath: getArg('--example'),
            patch
        })

        if (report.created) {
            console.log(`[config-sync] No config.json found - generated from ${path.basename(report.examplePath)}.`)
        } else if (report.addedKeys.length === 0) {
            console.log('[config-sync] config.json is up to date.')
        } else if (report.patched) {
            console.log(`[config-sync] Added ${report.addedKeys.length} missing key(s) to config.json:`)
            report.addedKeys.forEach(k => console.log(`[config-sync]   + ${k}`))
            if (report.backupPath) console.log(`[config-sync] Backup saved to ${report.backupPath}`)
        } else {
            console.warn('')
            console.warn('┌──────────────────────────────────────────────────────────┐')
            console.warn('│  ⚠  CONFIG UPDATE AVAILABLE                              │')
            console.warn('│  Missing keys (see config.example.json for defaults):    │')
            report.addedKeys.forEach(k => console.warn(('│    + ' + k).padEnd(60) + '│'))
            console.warn('│  Set CONFIG_AUTO_SYNC=true to patch automatically, or    │')
            console.warn('│  delete config.json to regenerate it from scratch.       │')
            console.warn('└──────────────────────────────────────────────────────────┘')
            console.warn('')
        }
        process.exit(0)
    } catch (err) {
        console.error(`[config-sync] ERROR: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
