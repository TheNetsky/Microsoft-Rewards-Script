import fs from 'fs'
import path from 'path'

export function getProjectRoot(startDir = process.cwd()): string {
    const resolvedStartDir = path.resolve(startDir)

    if (fs.existsSync(path.join(resolvedStartDir, 'package.json'))) {
        return resolvedStartDir
    }

    let dir = resolvedStartDir
    while (true) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir
        }

        const parent = path.dirname(dir)
        if (parent === dir) {
            break
        }

        dir = parent
    }

    return resolvedStartDir
}

export function resolveProjectFile(filename: string, startDir = process.cwd()): string | undefined {
    const resolvedStartDir = path.resolve(startDir)
    const root = getProjectRoot(resolvedStartDir)
    const candidates = [
        path.join(resolvedStartDir, filename),
        path.join(root, filename),
        path.join(root, 'dist', filename),
        path.join(root, 'src', filename)
    ]

    return candidates.find(candidate => fs.existsSync(candidate))
}
