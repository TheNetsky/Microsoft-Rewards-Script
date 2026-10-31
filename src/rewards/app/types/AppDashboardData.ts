export interface AppDashboardData {
    code: 0
    response: {
        balance: number
        promotions: Promotion[]
    }
}

export interface Promotion {
    name: string
    attributes: Record<string, string>
    priority?: number
    tags?: string[]
}
