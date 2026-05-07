import type { MicrosoftRewardsBot } from '../index'
import { resolveGeminiApiKeys } from '../util/geminiApiKeys'

export class GeminiQueryEngine {
    private apiKeys: string[]
    private currentKeyIndex: number = 0
    private ai: any
    private aiReady: Promise<void>

    constructor(private bot: MicrosoftRewardsBot) {
        this.apiKeys = resolveGeminiApiKeys(this.bot.config)
        this.aiReady = this.createAiClient(this.apiKeys[0] ?? '')
    }

    private async createAiClient(apiKey: string): Promise<void> {
        const mod = await import('@google/genai')
        this.ai = new mod.GoogleGenAI({ apiKey })
    }

    private async ensureAiReady(): Promise<void> {
        await this.aiReady
    }

    private async rotateApiKey(): Promise<void> {
        if (this.apiKeys.length === 0) {
            return
        }
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length
        const newKey = this.apiKeys[this.currentKeyIndex]!
        this.aiReady = this.createAiClient(newKey)
        await this.aiReady
        this.bot.logger.info(
            this.bot.isMobile,
            'GEMINI-QUERY-ENGINE',
            `Rotated to API key ${this.currentKeyIndex + 1}/${this.apiKeys.length} | key=${newKey.substring(0, 20)}...`
        )
    }

    private isRateLimitError(error: any): boolean {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return errorMessage.toLowerCase().includes('rate limit') ||
               errorMessage.toLowerCase().includes('quota exceeded') ||
               errorMessage.toLowerCase().includes('too many requests') ||
               errorMessage.toLowerCase().includes('resource has been exhausted')
    }

    async generateActivityQueries(title: string, description: string, count = 5): Promise<string[]> {
        const safeCount = Math.max(1, Math.min(count, 20))
        const normalizedTitle = title.trim()
        const normalizedDescription = description.trim()
        const prompt = `Generate exactly ${safeCount} realistic Bing search queries as a JSON array of strings.
Activity title: "${normalizedTitle}"
Activity description: "${normalizedDescription}"

Rules:
- Return ONLY a valid JSON array of strings.
- Keep queries relevant to the activity title/description context.
- Mix short and medium natural search phrases.
- Do not include markdown, code fences, or explanations.`

        let attempt = 0
        let consecutiveFailures = 0
        const maxConsecutiveFailures = 3

        while (true) {
            attempt++

            try {
                await this.ensureAiReady()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Attempt ${attempt}: Generating activity queries (Key ${this.currentKeyIndex + 1}/${this.apiKeys.length})`
                )

                const response = await this.ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt
                })

                if (!response.text) {
                    throw new Error('No text response from Gemini API')
                }

                const parsed = this.parseJsonResponse(response.text)
                const deduped = [...new Set(parsed.map(x => x.trim()).filter(Boolean))]
                return deduped.slice(0, safeCount)
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                consecutiveFailures++

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Activity query attempt ${attempt} failed (Key ${this.currentKeyIndex + 1}/${this.apiKeys.length}): ${errorMessage}`
                )

                if (this.isRateLimitError(error) || consecutiveFailures >= maxConsecutiveFailures) {
                    await this.rotateApiKey()
                    consecutiveFailures = 0
                    await this.bot.utils.wait(1000)
                    continue
                }

                await this.bot.utils.wait(3000)
            }
        }
    }

    async generateSearchQueries(): Promise<string[]> {
        const prompt = `You are an elite data simulation AI specializing in human search behavior and query log generation. Your task is to generate a JSON array containing exactly 120 unique, highly realistic Google search queries that reflect authentic user behavior worldwide in the year 2026.

CORE AUTHENTICITY RULES:
Real people do not always type in perfect sentences. To simulate authentic search behavior, you must incorporate the following patterns:

Varying Lengths: Mix short fragmented keywords (2-4 words), medium informational queries (5-7 words), and long-tail conversational questions (8+ words).

Natural Syntax: Use all lowercase. Omit punctuation (no question marks, commas, or apostrophes).

Human Imperfections: Include occasional common typos (e.g., "restarant", "definitly"), abbreviations (e.g., "w/", "vs", "dr"), and fragmented grammar (e.g., "best pizza chicago" instead of "where is the best pizza in chicago").

Modern Modifiers: Frequently append realistic modifiers like "near me", "reddit", "2026", "review", "for beginners", "cheap", and "step by step".

2026 Context: Seamlessly integrate 2026-appropriate technology, current events, and pop culture (e.g., iPhone 17 or 18, Samsung S26, current AI tools, 2026 tax brackets, latest car models, GTA 6).

Specifics: Include real brand names, specific locations, product models, and celebrity names.

DISTRIBUTION MATRIX (Exactly 120 Queries):
Generate exactly 6 queries for each of the 20 categories below (20 x 6 = 120 total):

Cooking, Food & Recipes: (e.g., dinner ideas, baking times, ingredient substitutes)

Home Repairs & DIY: (e.g., fixing leaks, woodworking plans, painting tips)

Shopping & Product Reviews: (e.g., budget vacuums, unboxing, vs comparisons)

Fashion & Beauty: (e.g., 2026 fashion trends, skincare routines, makeup dupes)

Movies & Television: (e.g., streaming release dates, actor names, ending explained)

Music & Live Events: (e.g., concert tickets, lyrics meaning, festival lineups)

Gaming & Esports: (e.g., gta 6 walkthrough, ps6 rumors, console specs)

Local Services (Non-Food): (e.g., mechanics near me, store hours, plumbers)

Dining & Restaurants: (e.g., best sushi near me, reservations, vegan options)

Medical & Symptoms: (e.g., headache causes, home remedies, side effects)

Fitness & Nutrition: (e.g., ab workouts, macro calculators, protein powder)

Consumer Tech & Gadgets: (e.g., iphone 18 rumors, tv sizes, smartwatch battery)

Software & IT Troubleshooting: (e.g., wifi not working, app down right now)

Personal Finance & Crypto: (e.g., 2026 tax brackets, btc price, high yield savings)

News & Current Events: (e.g., local headlines, global news, election results)

Career & Job Search: (e.g., resume templates, interview prep, remote jobs)

Education & Study Help: (e.g., calculus solver, history timelines, apa format)

Travel & Tourism: (e.g., cheap flights, packing lists, hotel reviews)

Weather & Transportation: (e.g., weekend forecast, subway delays, traffic)

Relationships, Family & Pets: (e.g., dog training, dating app advice, toddler tantrums)

EXAMPLES OF AUTHENTIC QUERIES:
"best noise cancelling earbuds under 100 reddit 2026"
"iphone 18 pro vs samsung s26 ultra camera test"
"what time does target close on sunday"
"is it normal to feel tired after eating carbs"
"how to get past bank heist mission in gta 6"
"restaurants open late near me"
"2026 tax brackets single filer"
"symptoms of strep throat without fever"
"how to train golden retriever puppy not to bite"
"how to get red wine out of white carpet"

STRICT OUTPUT CONSTRAINTS:
You must output ONLY a valid JSON array of strings.

Do NOT wrap the output in Markdown formatting (do not use \`\`\`json or \`\`\`).

Do NOT include any introductory or concluding text.

The very first character of your response must be [ and the very last character must be ].

[
"your first query here",
"your second query here",
"your third query here"
]`

        let attempt = 0
        let consecutiveFailures = 0
        const maxConsecutiveFailures = 3 // Max failures per key before rotating

        while (true) {
            attempt++

            try {
                await this.ensureAiReady()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Attempt ${attempt}: Generating search queries using Gemini API (Key ${this.currentKeyIndex + 1}/${this.apiKeys.length})`
                )

                const response = await this.ai.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: prompt,
                })

                if (!response.text) {
                    throw new Error('No text response from Gemini API')
                }

                const text = response.text

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Gemini API response received | length=${text.length}`
                )

                // Parse the JSON response
                const queries = this.parseJsonResponse(text)

                this.bot.logger.info(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `✅ Generated ${queries.length} search queries from Gemini API (attempt ${attempt}, key ${this.currentKeyIndex + 1}/${this.apiKeys.length})`
                )

                return queries

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                consecutiveFailures++

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Attempt ${attempt} failed (Key ${this.currentKeyIndex + 1}/${this.apiKeys.length}): ${errorMessage}`
                )

                // Check if this is a rate limit error
                if (this.isRateLimitError(error)) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'GEMINI-QUERY-ENGINE',
                        `Rate limit detected, rotating API key... (Consecutive failures: ${consecutiveFailures})`
                    )
                    await this.rotateApiKey()
                    consecutiveFailures = 0 // Reset consecutive failures for new key

                    // Brief wait before trying new key
                    await this.bot.utils.wait(1000)
                    continue
                }

                // For other errors, rotate key after max consecutive failures
                if (consecutiveFailures >= maxConsecutiveFailures) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'GEMINI-QUERY-ENGINE',
                        `Too many consecutive failures (${consecutiveFailures}), rotating API key...`
                    )
                    await this.rotateApiKey()
                    consecutiveFailures = 0 // Reset for new key

                    // Brief wait before trying new key
                    await this.bot.utils.wait(1000)
                    continue
                }

                // Wait before retrying with same key
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GEMINI-QUERY-ENGINE',
                    `Waiting 30 seconds before retry ${attempt + 1}...`
                )
                await this.bot.utils.wait(30000)
            }
        }
    }

    private parseJsonResponse(response: string): string[] {
        try {
            // Parse the JSON response
            const queries = JSON.parse(response)

            // Ensure it's an array
            if (!Array.isArray(queries)) {
                throw new Error(`Response is not a JSON array: ${typeof queries}`)
            }

            // Filter out any non-string items and trim
            const validQueries = queries
                .filter((query): query is string => typeof query === 'string')
                .map(query => query.trim())
                .filter(query => query.length > 0)

            if (validQueries.length === 0) {
                throw new Error('No valid string queries found in JSON response')
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'GEMINI-QUERY-ENGINE',
                `Parsed ${validQueries.length} queries from JSON response`
            )

            return validQueries
        } catch (error) {
            throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

}
