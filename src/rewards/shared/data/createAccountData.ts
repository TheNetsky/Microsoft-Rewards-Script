import type { BotContext } from '../../../core/BotContext'
import { ServerActions } from '../http/ServerActions'
import { AccountData } from './AccountData'

export function createAccountData(context: BotContext) {
    const serverActions = new ServerActions(context)
    return { accountData: new AccountData(context, serverActions), serverActions }
}
