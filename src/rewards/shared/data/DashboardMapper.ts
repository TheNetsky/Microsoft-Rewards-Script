import type { ApiDashboardResponse } from './DashboardResponse'
import type { RewardsState } from '../../types/RewardsState'
import {
    normalizeAccountInfo,
    normalizeDashboard,
    normalizeProfile,
    normalizeWarnings,
    record
} from '../parsers/NormalizeRewards'
import { mapFlyoutToDashboard } from './FlyoutMapper'
import type { RewardsFlyoutData } from './FlyoutTypes'

export function mapApiDashboard(data: ApiDashboardResponse): RewardsState {
    if (!data?.dashboard) throw new Error('Rewards user data response is missing the dashboard')
    if (data.isError || data.dashboard.userStatus?.isRewardsUser === false)
        throw new Error('Rewards user data response does not contain an authenticated Rewards account')
    const dashboard = normalizeDashboard(data.dashboard)
    const primaryProfile = record(data.dashboard.userProfile)
    const fallbackProfile = record(data.profile)
    const profile = normalizeProfile({
        ...fallbackProfile,
        ...primaryProfile,
        attributes: { ...record(fallbackProfile.attributes), ...record(primaryProfile.attributes) }
    })
    dashboard.userProfile = profile
    return {
        dashboard,
        account: normalizeAccountInfo(data.dashboard.userStatus),
        profile,
        sourceInfo: {
            source: 'rewards-api',
            activities: [],
            missingSections: [
                ...(!Array.isArray(data.dashboard.userWarnings) ? ['userWarnings'] : []),
                ...(data.dashboard?.dailySetPromotions === undefined ? ['dailySetPromotions'] : []),
                ...(data.dashboard?.morePromotions === undefined ? ['morePromotions'] : []),
                ...(dashboard.userStatus.counters.pcSearch === undefined &&
                dashboard.userStatus.counters.mobileSearch === undefined
                    ? ['counters']
                    : [])
            ]
        },
        raw: { source: 'rewards-api', payload: data }
    }
}

export function mapFlyoutDashboard(data: RewardsFlyoutData): RewardsState {
    const userInfo = data?.userInfo
    const flyout = data?.flyoutResult
    const status = flyout?.userStatus
    const rawProfile = userInfo?.profile
    if (
        data?.isError ||
        userInfo?.isRewardsUser !== true ||
        status?.isRewardsUser !== true ||
        !rawProfile ||
        typeof rawProfile !== 'object' ||
        Array.isArray(rawProfile) ||
        !flyout
    )
        throw new Error(
            data?.errorMessage ?? userInfo?.errorMessage ?? 'Flyout response is missing Rewards account data'
        )

    const profile = normalizeProfile(rawProfile)
    if (!profile.attributes.country && typeof userInfo.rewardsCountry === 'string')
        profile.attributes.country = userInfo.rewardsCountry
    const warningSections = [data.userWarnings, userInfo.userWarnings, flyout.userWarnings, status.userWarnings]
    const warnings = new Map(warningSections.flatMap(normalizeWarnings).map(warning => [warning.name, warning]))
    const dashboard = normalizeDashboard({
        ...flyout,
        userStatus: {
            ...status,
            availablePoints: status.availablePoints ?? userInfo.balance,
            lifetimeGivingPoints: status.lifetimeGivingPoints ?? userInfo.lifetimeGivingPoints
        },
        userProfile: profile,
        userWarnings: [...warnings.values()],
        pointClaimBannerPromotion: flyout.pointClaimBannerPromotion ?? flyout.pointClaimCardPromotion,
        autoRedeemItem: flyout.userAutoRedeemItem ?? userInfo.autoRedeemItem
    })
    const result = mapFlyoutToDashboard(data, {
        dashboard,
        account: normalizeAccountInfo({ ...status, availablePoints: status.availablePoints ?? userInfo.balance }),
        profile,
        sourceInfo: { source: 'bing-flyout', activities: [], missingSections: [] },
        raw: { source: 'bing-flyout', payload: data }
    })
    if (!warningSections.some(Array.isArray)) result.sourceInfo.missingSections.push('userWarnings')
    return result
}
