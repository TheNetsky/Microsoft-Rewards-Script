/**
 * Central constants file for the Microsoft Rewards Script
 * Defines timeouts, retry limits, and other magic numbers used throughout the application
 */

export const TIMEOUTS = {
  SHORT: 500,
  MEDIUM: 1500,
  MEDIUM_LONG: 2000,
  LONG: 3000,
  VERY_LONG: 5000,
  EXTRA_LONG: 10000,
  DASHBOARD_WAIT: 10000,
  LOGIN_MAX: 180000, // 3 minutes
  NETWORK_IDLE: 5000
} as const

export const RETRY_LIMITS = {
  MAX_ITERATIONS: 5,
  DASHBOARD_RELOAD: 2,
  MOBILE_SEARCH: 3,
  ABC_MAX: 15,
  POLL_MAX: 15,
  QUIZ_MAX: 15,
  QUIZ_ANSWER_TIMEOUT: 10000,
  GO_HOME_MAX: 5
} as const

export const DELAYS = {
  ACTION_MIN: 1000,
  ACTION_MAX: 3000,
  SEARCH_DEFAULT_MIN: 2000,
  SEARCH_DEFAULT_MAX: 5000,
  BROWSER_CLOSE: 2000,
  TYPING_DELAY: 20,
  SEARCH_ON_BING_WAIT: 5000,
  SEARCH_ON_BING_COMPLETE: 3000,
  SEARCH_ON_BING_FOCUS: 200,
  SEARCH_BAR_TIMEOUT: 15000,
  QUIZ_ANSWER_WAIT: 2000,
  THIS_OR_THAT_START: 2000
} as const

export const SELECTORS = {
  MORE_ACTIVITIES: '#more-activities',
  SUSPENDED_ACCOUNT: '#suspendedAccountHeader',
  QUIZ_COMPLETE: '#quizCompleteContainer',
  QUIZ_CREDITS: 'span.rqMCredits'
} as const

export const URLS = {
  REWARDS_BASE: 'https://rewards.bing.com',
  REWARDS_SIGNIN: 'https://rewards.bing.com/signin',
  APP_USER_DATA: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613'
} as const

export const DISCORD = {
  MAX_EMBED_LENGTH: 1900,
  RATE_LIMIT_DELAY: 500,
  WEBHOOK_TIMEOUT: 10000,
  DEBOUNCE_DELAY: 750,
  COLOR_RED: 0xFF0000,
  COLOR_CRIMSON: 0xDC143C,
  COLOR_ORANGE: 0xFFA500,
  COLOR_BLUE: 0x3498DB,
  COLOR_GREEN: 0x00D26A
} as const
