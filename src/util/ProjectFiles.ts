import fs from 'fs'
import path from 'path'

export function getProjectRoot(startDir = process.cwd()): string {
    if (fs.existsSync(path.join(startDir, 'package.json'))) {
        return startDir
    }

    let dir = startDir
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir
        }
        dir = path.dirname(dir)
    }

    return startDir
}

export function resolveProjectFile(filename: string, startDir = process.cwd()): string | undefined {
    const root = getProjectRoot(startDir)
    const candidates = [
        path.join(startDir, filename),
        path.join(root, filename),
        path.join(root, 'dist', filename),
        path.join(root, 'src', filename)
    ]

    return candidates.find(candidate => fs.existsSync(candidate))
}
