export interface WebPoints {
    desktopSearchAvailable?: boolean
    mobileSearchAvailable?: boolean
    desktopSearchPoints: number
    mobileSearchPoints: number
    dailySetPoints: number
    morePromotionsPoints: number
    totalEarnablePoints: number
}

export interface AppEarnablePoints {
    readToEarn: number | null
    checkIn: number | null
    totalEarnablePoints: number | null
}

export interface MissingSearchPoints {
    available?: boolean
    earnedPoints?: number
    counterKey?: string
    mobilePoints: number
    desktopPoints: number
    edgePoints: number
    totalPoints: number
}
