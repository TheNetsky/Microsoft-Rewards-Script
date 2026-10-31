import { z } from 'zod'
import type { AppDashboardData } from './types/AppDashboardData'

const PromotionSchema = z.object({
    name: z.string(),
    attributes: z.record(z.string(), z.string()),
    priority: z.number().finite().optional(),
    tags: z.array(z.string()).optional()
})

const DashboardSchema = z.object({
    code: z.literal(0),
    response: z.object({
        balance: z.number().finite().nonnegative(),
        promotions: z.array(PromotionSchema)
    })
})

const ActivitySchema = z.object({
    code: z.literal(0),
    response: z.object({ balance: z.number().finite().nonnegative().optional() }).nullish()
})

export type AppActivityResponse = z.infer<typeof ActivitySchema>

function parseResponse<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
    const result = schema.safeParse(payload)
    if (result.success) return result.data
    const fields = result.error.issues
        .slice(0, 5)
        .map(issue => issue.path.join('.') || '<root>')
        .join(', ')
    throw Object.assign(new Error(`Invalid ${operation} response | fields=${fields}`), { code: 'APP_RESPONSE_INVALID' })
}

export function parseAppDashboard(payload: unknown): AppDashboardData {
    return parseResponse(DashboardSchema, payload, 'app dashboard')
}

export function parseAppActivity(payload: unknown): AppActivityResponse {
    return parseResponse(ActivitySchema, payload, 'app activity')
}
