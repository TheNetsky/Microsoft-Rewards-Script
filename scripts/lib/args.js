/** @param {string[]} argv @param {{boolean?: string[]}} options */
export function parseArgs(argv = process.argv.slice(2), { boolean = [] } = {}) {
    /** @type {Record<string, string | boolean | string[]> & {_: string[]}} */
    const args = { _: [] }
    const booleanOptions = new Set(boolean)

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === undefined) continue
        const next = argv[i + 1]

        if (arg === '--') {
            args._.push(...argv.slice(i + 1))
            break
        }
        if (!arg.startsWith('-') || arg === '-') {
            args._.push(arg)
            continue
        }

        const option = arg.replace(/^-+/, '')
        const equalsIndex = option.indexOf('=')
        const key = equalsIndex === -1 ? option : option.slice(0, equalsIndex)

        if (!key) {
            args._.push(arg)
        } else if (equalsIndex !== -1) {
            args[key] = option.slice(equalsIndex + 1)
        } else if (booleanOptions.has(key)) {
            args[key] = true
        } else if (next !== undefined && !next.startsWith('-')) {
            args[key] = next
            i++
        } else {
            args[key] = true
        }
    }
    return args
}

export function findUnknownOptions(args, allowedOptions) {
    const allowed = new Set(allowedOptions)
    return Object.keys(args).filter(key => key !== '_' && !allowed.has(key))
}
