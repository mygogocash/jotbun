import { idTokenSubject } from './nativeSignIn.ts'
import type { NativeIdToken, NativeSignIn } from './nativeSignIn.ts'

export type SignInMethod = 'apple' | 'google' | 'email'
export type SignInRequest = { method: 'apple' | 'google'; signUp: boolean } | { method: 'email'; email: string; code: string }

/** created: this sign-in created the account (the server's `created`, K23). */
export type ServerSession = { accountId: string; sessionId: string; email: string; method: SignInMethod; created: boolean }
export type DeviceDto = { id: string; current: boolean; signed_in_at: string; last_active_at: string; user_agent: string | null }

export class AuthCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.')
    this.name = 'AuthCancelled'
  }
}

export class AuthUnavailable extends Error {
  constructor() {
    super('Could not reach the sign-in service. Try again.')
    this.name = 'AuthUnavailable'
  }
}

export type RefusalCode = 'ACCOUNT_EXISTS' | 'ACCOUNT_UNAVAILABLE' | 'WRONG_CODE' | 'CODE_LIMIT' | 'RATE_LIMITED' | 'OTHER_ACCOUNT' | 'REAUTH_REQUIRED' | 'SIGNED_OUT' | 'REFUSED'

/** Fields are assigned in the body: app tests run on Node's type stripping (R53). */
export class AuthRefused extends Error {
  readonly code: RefusalCode
  readonly methods: readonly SignInMethod[]
  constructor(code: RefusalCode, methods?: readonly SignInMethod[]) {
    super(code)
    this.name = 'AuthRefused'
    this.code = code
    this.methods = methods ?? []
  }
}

export type ClientResult<T> = { data: T | null; error: { status: number; code?: string; message?: string; methods?: SignInMethod[] } | null }
export type SignInAnswer = { created: boolean }

/** True only for an object whose `created` is exactly true. */
export function createdOf(answer: unknown): boolean {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return false
  return 'created' in answer && answer.created === true
}

export type BetterAuthClientLike = {
  sendSignInCode(email: string): Promise<ClientResult<unknown>>
  signInWithCode(email: string, code: string): Promise<ClientResult<SignInAnswer>>
  signInWithIdToken(provider: 'apple' | 'google', idToken: NativeIdToken, requestSignUp: boolean): Promise<ClientResult<SignInAnswer>>
  session(): Promise<ClientResult<{ user: { id: string; email: string }; session: { id: string } } | null>>
  token(): Promise<ClientResult<{ token: string }>>
  linkedAccounts(): Promise<ClientResult<{ providerId: string; accountId: string }[]>>
  link(provider: 'apple' | 'google', idToken: NativeIdToken): Promise<ClientResult<unknown>>
  unlink(provider: 'apple' | 'google'): Promise<ClientResult<unknown>>
  signOut(): Promise<ClientResult<unknown>>
  devices(): Promise<ClientResult<{ devices: DeviceDto[] }>>
  signOutDevice(id: string): Promise<ClientResult<unknown>>
  signOutOtherDevices(): Promise<ClientResult<{ signed_out: number }>>
  signOutEverywhere(): Promise<ClientResult<unknown>>
  hasStoredSession(): boolean
}

export interface BetterAuthPort {
  readonly supported: boolean
  readonly methods: readonly SignInMethod[]
  sendEmailCode(email: string): Promise<void>
  signIn(request: SignInRequest): Promise<ServerSession>
  freshSignIn(request: SignInRequest, current: { accountId: string; email: string }): Promise<ServerSession>
  accessToken(): Promise<string | null>
  refresh(): Promise<boolean>
  hasSession(): Promise<boolean>
  signOut(): Promise<void>
  devices(): Promise<DeviceDto[]>
  signOutDevice(id: string): Promise<void>
  signOutOtherDevices(): Promise<number>
  signOutEverywhere(): Promise<void>
  linkMethod(method: 'apple' | 'google'): Promise<void>
  unlinkMethod(method: 'apple' | 'google'): Promise<void>
  linkedMethods(): Promise<SignInMethod[]>
}

function offeredMethods(native: NativeSignIn): SignInMethod[] {
  const methods: SignInMethod[] = []
  if (native.apple) methods.push('apple')
  if (native.google) methods.push('google')
  methods.push('email')
  return methods
}

function expiry(token: string): number {
  const part = token.split('.')[1]
  if (!part) return 0
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof json !== 'object' || json === null || !('exp' in json) || typeof json.exp !== 'number') return 0
    return json.exp
  } catch {
    return 0
  }
}

type Failure = { status: number; code?: string; methods?: readonly SignInMethod[] }

function raise(error: Failure): void {
  if (error.status === 0 || error.status >= 500) throw new AuthUnavailable()
  if (error.status === 429) throw new AuthRefused(error.code === 'CODE_LIMIT' ? 'CODE_LIMIT' : 'RATE_LIMITED')
}

async function call<T>(run: () => Promise<ClientResult<T>>): Promise<ClientResult<T>> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof AuthCancelled || error instanceof AuthRefused || error instanceof AuthUnavailable) throw error
    throw new AuthUnavailable()
  }
}

function mapCode(error: Failure): never {
  raise(error)
  if (error.status === 403 && error.code === 'ACCOUNT_UNAVAILABLE') throw new AuthRefused('ACCOUNT_UNAVAILABLE')
  throw new AuthRefused('WRONG_CODE')
}

function mapIdToken(error: Failure): never {
  raise(error)
  if (error.status === 403 && error.code === 'ACCOUNT_EXISTS') throw new AuthRefused('ACCOUNT_EXISTS', error.methods ?? ['email'])
  if (error.status === 403 && error.code === 'ACCOUNT_UNAVAILABLE') throw new AuthRefused('ACCOUNT_UNAVAILABLE')
  throw new AuthRefused('REFUSED')
}

function mapSensitive<T>(result: ClientResult<T>): T {
  if (result.error) {
    raise(result.error)
    if (result.error.status === 403 && result.error.code === 'REAUTH_REQUIRED') throw new AuthRefused('REAUTH_REQUIRED')
    if (result.error.status === 401) throw new AuthRefused('SIGNED_OUT')
    throw new AuthRefused('REFUSED')
  }
  if (result.data === null) throw new AuthUnavailable()
  return result.data
}

/**
 * The app's Better Auth port. A sign-in the server accepted drops the cached
 * JWT, which named the session before it. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
 */
export function createBetterAuthPort(deps: { client: BetterAuthClientLike; native: NativeSignIn; now?: () => number }): BetterAuthPort {
  const now = () => deps.now?.() ?? Date.now()
  let cached: { token: string; exp: number } | null = null

  async function finish(answer: SignInAnswer, method: SignInMethod): Promise<ServerSession> {
    const result = await call(() => deps.client.session())
    if (result.error) {
      raise(result.error)
      throw new AuthRefused('REFUSED')
    }
    const data = result.data
    if (!data) throw new AuthUnavailable()
    return { accountId: data.user.id, sessionId: data.session.id, email: data.user.email, method, created: createdOf(answer) }
  }

  async function emailSignIn(email: string, code: string): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithCode(email.trim().toLowerCase(), code))
    if (result.error) mapCode(result.error)
    cached = null
    return finish(result.data ?? { created: false }, 'email')
  }

  async function socialSignIn(method: 'apple' | 'google', requestSignUp: boolean, token: NativeIdToken): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithIdToken(method, token, requestSignUp))
    if (result.error) mapIdToken(result.error)
    cached = null
    return finish(result.data ?? { created: false }, method)
  }

  async function linked(): Promise<{ providerId: string; accountId: string }[]> {
    const result = await call(() => deps.client.linkedAccounts())
    if (result.error) {
      raise(result.error)
      throw new AuthRefused('REFUSED')
    }
    return result.data ?? []
  }

  async function signOut(): Promise<void> {
    try {
      await deps.client.signOut()
    } catch {
      // The server's answer does not decide whether this device is signed out.
    }
    cached = null
  }

  return {
    supported: true,
    methods: offeredMethods(deps.native),
    async sendEmailCode(email) {
      const result = await call(() => deps.client.sendSignInCode(email))
      if (result.error) {
        raise(result.error)
        throw new AuthRefused('REFUSED')
      }
    },
    async signIn(request) {
      if (request.method === 'email') return emailSignIn(request.email, request.code)
      const fn = deps.native[request.method]
      if (!fn) throw new AuthRefused('REFUSED')
      return socialSignIn(request.method, request.signUp, await fn())
    },
    async freshSignIn(request, current) {
      if (request.method === 'email') {
        const email = request.email.trim().toLowerCase()
        if (email !== current.email) throw new AuthRefused('OTHER_ACCOUNT')
        const session = await emailSignIn(email, request.code)
        if (session.accountId !== current.accountId) {
          await signOut()
          throw new AuthRefused('OTHER_ACCOUNT')
        }
        return session
      }
      const fn = deps.native[request.method]
      if (!fn) throw new AuthRefused('REFUSED')
      const token = await fn()
      const sub = idTokenSubject(token.token)
      const links = await linked()
      if (!links.some((item) => item.providerId === request.method && item.accountId === sub)) throw new AuthRefused('OTHER_ACCOUNT')
      const session = await socialSignIn(request.method, false, token)
      if (session.accountId !== current.accountId) {
        await signOut()
        throw new AuthRefused('OTHER_ACCOUNT')
      }
      return session
    },
    async accessToken() {
      if (cached && cached.exp * 1000 - now() > 60_000) return cached.token
      const result = await call(() => deps.client.token())
      if (result.error) {
        raise(result.error)
        if (result.error.status === 401 || result.error.status === 403) {
          cached = null
          return null
        }
        throw new AuthRefused('REFUSED')
      }
      const token = result.data?.token
      if (!token) return null
      cached = { token, exp: expiry(token) }
      return token
    },
    async refresh() {
      const result = await call(() => deps.client.token())
      if (result.error) {
        raise(result.error)
        if (result.error.status === 401 || result.error.status === 403) return false
        throw new AuthRefused('REFUSED')
      }
      const token = result.data?.token
      if (!token) return false
      cached = { token, exp: expiry(token) }
      return true
    },
    hasSession: async () => deps.client.hasStoredSession(),
    signOut,
    async devices() {
      return mapSensitive(await call(() => deps.client.devices())).devices
    },
    async signOutDevice(id) {
      mapSensitive(await call(() => deps.client.signOutDevice(id)))
    },
    async signOutOtherDevices() {
      return mapSensitive(await call(() => deps.client.signOutOtherDevices())).signed_out
    },
    async signOutEverywhere() {
      mapSensitive(await call(() => deps.client.signOutEverywhere()))
    },
    async linkMethod(method) {
      const fn = deps.native[method]
      if (!fn) throw new AuthRefused('REFUSED')
      const token = await fn()
      mapSensitive(await call(() => deps.client.link(method, token)))
    },
    async unlinkMethod(method) {
      mapSensitive(await call(() => deps.client.unlink(method)))
    },
    async linkedMethods() {
      const links = await linked()
      const methods: SignInMethod[] = []
      if (links.some((item) => item.providerId === 'apple')) methods.push('apple')
      if (links.some((item) => item.providerId === 'google')) methods.push('google')
      methods.push('email')
      return methods
    },
  }
}

export function unsupportedBetterAuthPort(message: string): BetterAuthPort {
  const unsupported = async (): Promise<never> => {
    throw new Error(message)
  }
  return {
    supported: false,
    methods: [],
    sendEmailCode: unsupported,
    signIn: unsupported,
    freshSignIn: unsupported,
    accessToken: async () => null,
    refresh: async () => false,
    hasSession: async () => false,
    signOut: unsupported,
    devices: unsupported,
    signOutDevice: unsupported,
    signOutOtherDevices: unsupported,
    signOutEverywhere: unsupported,
    linkMethod: unsupported,
    unlinkMethod: unsupported,
    linkedMethods: unsupported,
  }
}
