import type { MorePromotion, PromotionalItem } from './DashboardData'
import type { Page } from 'playwright'

/**
 * Activity handler contract for solving a single dashboard activity.
 * Implementations should be stateless (or hold only a reference to the bot)
 * and perform all required steps on the provided page.
 */
export interface ActivityHandler {
  /** Optional identifier for diagnostics */
  id?: string
  /**
   * Return true if this handler knows how to process the given activity.
   */
  canHandle(activity: MorePromotion | PromotionalItem): boolean
  /**
   * Execute the activity on the provided page. The page is already
   * navigated to the activity tab/window by the caller.
   */
  run(page: Page, activity: MorePromotion | PromotionalItem): Promise<void>
}
