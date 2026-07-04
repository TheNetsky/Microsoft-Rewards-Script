import readline from 'readline'

export interface MenuKeyInput {
    name?: string
    ctrl?: boolean
}

export type MenuAction =
    | { type: 'update'; selectedIndex: number }
    | { type: 'submit'; selectedIndex: number }
    | { type: 'interrupt'; selectedIndex: number }
    | { type: 'noop'; selectedIndex: number }

export function formatCurrentValueSuffix(currentValue: string): string {
    return currentValue ? ' [current set]' : ''
}

export function getNextMenuIndex(currentIndex: number, offset: number, optionCount: number): number {
    if (optionCount <= 0) {
        throw new Error('Interactive menu requires at least one option.')
    }

    return (currentIndex + offset + optionCount) % optionCount
}

export function buildInteractiveMenuLines(
    title: string,
    options: ReadonlyArray<string>,
    selectedIndex: number
): string[] {
    return [
        title,
        'Use Up/Down arrows and Enter to select.',
        ...options.map((option, index) => `${index === selectedIndex ? '>' : ' '} ${option}`)
    ]
}

export class MenuController {
    private selectedIndex: number

    constructor(
        private readonly optionCount: number,
        initialIndex = 0
    ) {
        if (!Number.isInteger(optionCount) || optionCount <= 0) {
            throw new Error('Interactive menu requires at least one option.')
        }

        this.selectedIndex =
            Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < optionCount ? initialIndex : 0
    }

    public getSelectedIndex(): number {
        return this.selectedIndex
    }

    public handleKey(key: MenuKeyInput): MenuAction {
        if (key.ctrl && key.name === 'c') {
            return { type: 'interrupt', selectedIndex: this.selectedIndex }
        }

        switch (key.name) {
            case 'up':
                this.selectedIndex = getNextMenuIndex(this.selectedIndex, -1, this.optionCount)
                return { type: 'update', selectedIndex: this.selectedIndex }
            case 'down':
                this.selectedIndex = getNextMenuIndex(this.selectedIndex, 1, this.optionCount)
                return { type: 'update', selectedIndex: this.selectedIndex }
            case 'home':
                this.selectedIndex = 0
                return { type: 'update', selectedIndex: this.selectedIndex }
            case 'end':
                this.selectedIndex = this.optionCount - 1
                return { type: 'update', selectedIndex: this.selectedIndex }
            case 'return':
            case 'enter':
                return { type: 'submit', selectedIndex: this.selectedIndex }
            default:
                return { type: 'noop', selectedIndex: this.selectedIndex }
        }
    }
}

export class InteractiveMenu {
    constructor(
        private readonly input: NodeJS.ReadStream,
        private readonly output: NodeJS.WriteStream
    ) {}

    public isSupported(): boolean {
        return Boolean(this.input.isTTY && this.output.isTTY && typeof this.input.setRawMode === 'function')
    }

    public async select(title: string, options: ReadonlyArray<string>, initialIndex = 0): Promise<number> {
        if (!this.isSupported()) {
            throw new Error('Interactive menu requires TTY raw-mode support.')
        }

        const controller = new MenuController(options.length, initialIndex)
        let renderedLineCount = 0

        const render = (): void => {
            const lines = buildInteractiveMenuLines(title, options, controller.getSelectedIndex())

            if (renderedLineCount > 0) {
                readline.moveCursor(this.output, 0, -renderedLineCount)
                readline.cursorTo(this.output, 0)
                readline.clearScreenDown(this.output)
            }

            this.output.write(`${lines.join('\n')}\n`)
            renderedLineCount = lines.length
        }

        return await new Promise<number>((resolve, reject) => {
            const wasRaw = this.input.isRaw === true
            const wasPaused = this.input.isPaused()

            const cleanup = (): void => {
                this.input.off('keypress', onKeypress)
                if (!wasRaw) {
                    this.input.setRawMode(false)
                }
                if (wasPaused) {
                    this.input.pause()
                }
            }

            const onKeypress = (_: string, key: readline.Key): void => {
                const action = controller.handleKey(key)

                if (action.type === 'update') {
                    render()
                    return
                }

                if (action.type === 'submit') {
                    cleanup()
                    resolve(action.selectedIndex)
                    return
                }

                if (action.type === 'interrupt') {
                    cleanup()
                    reject(new Error('Interactive selection interrupted.'))
                }
            }

            readline.emitKeypressEvents(this.input)
            if (!wasRaw) {
                this.input.setRawMode(true)
            }
            if (wasPaused) {
                this.input.resume()
            }

            render()
            this.input.on('keypress', onKeypress)
        })
    }
}
