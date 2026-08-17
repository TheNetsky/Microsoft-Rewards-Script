import type { MicrosoftRewardsBot } from '../index'
import { normalizeQueryKey, QueryCore } from './QueryEngine'

export class SearchQueryQueue {
    private topics: string[] = []
    private topicIndex = 0
    private activeCluster: string[] = []
    private activeMainTopic = ''
    private activeClusterSize = 0
    private activeClusterIndex = 0
    private readonly seenTopics = new Set<string>()
    private readonly seenQueries = new Set<string>()

    constructor(
        private readonly bot: MicrosoftRewardsBot,
        private readonly queryCore = new QueryCore(bot)
    ) {}

    async prepare(): Promise<number> {
        if (!this.topics.length) await this.refillTopics()
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-QUEUE',
            `队列已准备 | 主题数=${this.topics.length} | 聚类搜索=${this.bot.config.searchSettings.clusterSearch}`
        )
        return this.topics.length
    }

    async next(): Promise<string | null> {
        while (!this.activeCluster.length) {
            if (this.activeMainTopic) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-QUEUE',
                    `聚类已用尽 | 主题="${this.activeMainTopic}" | 已发出=${this.activeClusterIndex}/${this.activeClusterSize}`
                )
            }

            const mainTopic = await this.nextMainTopic()
            if (!mainTopic) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-QUEUE',
                    `队列已耗尽 | 已见主题=${this.seenTopics.size} | 已见查询=${this.seenQueries.size}`
                )
                return null
            }

            const cluster = await this.queryCore.getSearchCluster(mainTopic)
            let skippedSeen = 0
            this.activeCluster = cluster.filter(query => {
                const key = normalizeQueryKey(query)
                if (!key || this.seenQueries.has(key)) {
                    skippedSeen++
                    return false
                }
                this.seenQueries.add(key)
                return true
            })
            this.activeMainTopic = mainTopic
            this.activeClusterSize = this.activeCluster.length
            this.activeClusterIndex = 0

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-QUEUE',
                `聚类已激活 | 主题="${mainTopic}" | 主题序号=${this.topicIndex}/${this.topics.length} | 接收=${cluster.length} | 入队=${this.activeCluster.length} | 跳过已见=${skippedSeen}`
            )
        }

        const query = this.activeCluster.shift() ?? null
        if (!query) return null

        this.activeClusterIndex++
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-QUEUE',
            `出队查询 | 主题="${this.activeMainTopic}" | 查询=${this.activeClusterIndex}/${this.activeClusterSize} | 剩余=${this.activeCluster.length} | 值="${query}"`
        )
        return query
    }

    private async nextMainTopic(): Promise<string | null> {
        while (this.topicIndex >= this.topics.length) {
            if ((await this.refillTopics()) === 0) return null
        }

        const topic = this.topics[this.topicIndex++]
        if (!topic) return null

        this.seenTopics.add(normalizeQueryKey(topic))
        return topic
    }

    private async refillTopics(): Promise<number> {
        const topics = await this.queryCore.getConfiguredSearchTopics()
        this.topics = topics.filter(topic => {
            const key = normalizeQueryKey(topic)
            return key.length > 0 && !this.seenTopics.has(key)
        })
        this.topicIndex = 0
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-QUEUE',
            `主题池已补充 | 接收=${topics.length} | 入队=${this.topics.length} | 此前已见=${this.seenTopics.size}`
        )
        return this.topics.length
    }
}
