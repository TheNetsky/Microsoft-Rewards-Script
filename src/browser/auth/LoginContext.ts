import type { BotContext } from '../../core/BotContext'

export type LoginContext = Pick<BotContext, 'browser' | 'config' | 'http' | 'isMobile' | 'logger' | 'signal' | 'utils'>
