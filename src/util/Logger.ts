export function log(title: string, message: string, type?: 'log' | 'warn' | 'error') {
    const currentTime = new Date().toISOString()

    switch (type) {
        case 'warn':
            console.warn(`[${currentTime}] [WARN] [${title}] ${message}`)
            break

        case 'error':
            console.error(`[${currentTime}] [ERROR] [${title}] ${message}`)
            break

        default:
            console.log(`[${currentTime}] [LOG] [${title}] ${message}`)
            break
    }

}