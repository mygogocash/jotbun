import type { AuthEnv } from './env'

export type SignInCode = { to: string; code: string; expiresAt: Date }

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>
}

export class MailerUnavailable extends Error {
  constructor() {
    super('MailerUnavailable')
    this.name = 'MailerUnavailable'
  }
}

/** Task 1: every send is refused. Task 2 chooses a transport. */
export function mailerFromEnv(_env: AuthEnv): Mailer {
  return {
    sendSignInCode() {
      return Promise.reject(new MailerUnavailable())
    },
  }
}
