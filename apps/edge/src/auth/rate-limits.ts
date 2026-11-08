export const RATE_LIMIT_RULES: Record<string, { window: number; max: number }> = {
  '/email-otp/send-verification-otp': { window: 60, max: 10 },
  '/sign-in/email-otp': { window: 60, max: 10 },
  '/sign-in/social': { window: 60, max: 10 },
  '/token': { window: 60, max: 60 },
}
