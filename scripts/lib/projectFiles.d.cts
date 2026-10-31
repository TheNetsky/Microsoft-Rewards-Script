export function getProjectRoot(startDir?: string): string
export function resolveProjectFile(filename: string, root?: string): string | undefined
export function loadEnvFile(root: string): string | null
export function writeJsonAtomic(target: string, value: unknown, options?: { backup?: boolean }): { backupPath?: string }
