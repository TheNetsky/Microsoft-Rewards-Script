import type { BotContext } from './BotContext'
import type { WorkflowFactory } from './AccountWorkflow'
import { RunCoordinator } from './RunCoordinator'

export class BotRunner {
    private readonly coordinator: RunCoordinator

    protected constructor(
        readonly context: BotContext,
        createWorkflow: WorkflowFactory
    ) {
        this.coordinator = new RunCoordinator(context, createWorkflow)
    }

    initialize(): Promise<void> {
        return this.coordinator.initialize()
    }

    run(): Promise<void> {
        return this.coordinator.run()
    }
}
