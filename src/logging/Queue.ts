interface IdleQueue {
    onIdle(): Promise<void>
}

export async function flushQueue(queue: IdleQueue, timeoutMs = 5000): Promise<void> {
    let timer: NodeJS.Timeout | undefined

    await Promise.race([
        queue.onIdle(),
        new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeoutMs)
        })
    ])

    if (timer) clearTimeout(timer)
}
