// 1C-T7: native Apple and Google sign-in. createNativeSignIn on fake modules;
// the privacy rule through the real port and provider (no token, nonce or code
// reaches a log line, an analytics event or the stored session); the app
// config's native settings; and the Better Auth client's wiring.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, test } from 'node:test'

import { setConsentedTelemetrySink } from '../analytics/bus.ts'
import { AuthCancelled, AuthRefused, createBetterAuthPort } from './betterAuthPort.ts'
import { createCredentialProvider } from './credentialProvider.ts'
import { createNativeSignIn } from './nativeSignIn.ts'
import type { AppleModuleLike, GoogleModuleLike, NativeIdToken } from './nativeSignIn.ts'
import type { SessionRecordStore, StoredSession } from './sessionStore.ts'
import { createFakeAuthServer } from './testing/fakeAuthServer.ts'

type Options = Parameters<typeof createNativeSignIn>[0]
type AppleAnswer = Awaited<ReturnType<AppleModuleLike['signInAsync']>>
type GoogleAnswer = Awaited<ReturnType<GoogleModuleLike['signIn']>>

const jwtLike = (payload: object, signature: string) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`

const EMAIL_SCOPE = 1
const APPLE_TOKEN = jwtLike({ sub: 'apple-sub-1', email: 'kan@privaterelay.appleid.com' }, 'apple-signature')
const APPLE_CODE = 'apple-code-7d1e'
const NONCE = 'nonce-5b2f9c'
const GOOGLE_TOKEN = jwtLike({ sub: 'google-sub-1', email: 'kan@gmail.com' }, 'google-signature')
const WEB_ID = 'web.apps.googleusercontent.test'
const IOS_ID = 'ios.apps.googleusercontent.test'
const NONE: Options = { platform: 'ios', apple: null, google: null, googleWebClientId: '', googleIosClientId: '', randomNonce: () => NONCE }

/** A fake expo-apple-authentication that records what each sign-in asked for. */
function fakeApple(o: { available?: boolean; answer?: () => Promise<AppleAnswer> } = {}) {
  const asked: { requestedScopes: number[]; nonce: string }[] = []
  const module: AppleModuleLike = {
    isAvailableAsync: async () => o.available ?? true,
    async signInAsync(request) {
      asked.push({ requestedScopes: [...request.requestedScopes], nonce: request.nonce })
      return o.answer ? o.answer() : { identityToken: APPLE_TOKEN, authorizationCode: APPLE_CODE }
    },
    EMAIL_SCOPE,
  }
  return { module, asked }
}

/** A fake GoogleSignin that records its calls in order. */
function fakeGoogle(o: { playServices?: boolean; answer?: () => Promise<GoogleAnswer> } = {}) {
  const calls: string[] = []
  const module: GoogleModuleLike = {
    configure(settings) {
      calls.push(`configure:${JSON.stringify(settings)}`)
    },
    async hasPlayServices() {
      calls.push('hasPlayServices')
      return o.playServices ?? true
    },
    async signIn() {
      calls.push('signIn')
      return o.answer ? o.answer() : { type: 'success', data: { idToken: GOOGLE_TOKEN } }
    },
  }
  return { module, calls }
}

/** What one native sign-in came to, as one comparable value: the token, the refusal or error, or not offered at all. */
async function outcomeOf(run: (() => Promise<NativeIdToken>) | null): Promise<NativeIdToken | string> {
  if (!run) return 'not offered'
  try {
    return await run()
  } catch (error) {
    if (error instanceof AuthCancelled) return 'AuthCancelled'
    if (error instanceof AuthRefused) return `AuthRefused:${error.code}`
    return `thrown:${error instanceof Error ? error.message : String(error)}`
  }
}

const SCHEME = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
afterEach(() => {
  if (SCHEME === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME = SCHEME
})

test('Apple is offered on iOS only', () => {
  const { module } = fakeApple()
  const offered = (platform: Options['platform']) => createNativeSignIn({ ...NONE, platform, apple: module }).apple !== null
  assert.deepEqual([offered('ios'), offered('android'), offered('web'), createNativeSignIn({ ...NONE, platform: 'ios', apple: null }).apple], [true, false, false, null])
})

test('a device without Apple sign-in answers a refusal', async () => {
  const { module, asked } = fakeApple({ available: false })
  const native = createNativeSignIn({ ...NONE, apple: module })
  assert.deepEqual([await outcomeOf(native.apple), asked.length], ['AuthRefused:REFUSED', 0])
})

test('Apple sends one fresh nonce both to Apple and with the token', async () => {
  let made = 0
  const { module, asked } = fakeApple()
  const native = createNativeSignIn({ ...NONE, apple: module, randomNonce: () => `nonce-${(made += 1)}` })
  const first = await outcomeOf(native.apple)
  const second = await outcomeOf(native.apple)
  assert.deepEqual(asked.map((request) => request.nonce), ['nonce-1', 'nonce-2'])
  assert.deepEqual([first, second], [{ token: APPLE_TOKEN, nonce: 'nonce-1', authorizationCode: APPLE_CODE }, { token: APPLE_TOKEN, nonce: 'nonce-2', authorizationCode: APPLE_CODE }])
})

test("Apple's sheet asks only for the email address", async () => {
  const { module, asked } = fakeApple()
  await outcomeOf(createNativeSignIn({ ...NONE, apple: module }).apple)
  assert.deepEqual(asked, [{ requestedScopes: [EMAIL_SCOPE], nonce: NONCE }])
})

test("Apple's authorization code comes back with the token", async () => {
  const withCode = fakeApple({ answer: async () => ({ identityToken: APPLE_TOKEN, authorizationCode: APPLE_CODE }) })
  const withoutCode = fakeApple({ answer: async () => ({ identityToken: APPLE_TOKEN, authorizationCode: null }) })
  const run = (apple: AppleModuleLike) => outcomeOf(createNativeSignIn({ ...NONE, apple }).apple)
  assert.deepEqual([await run(withCode.module), await run(withoutCode.module)], [{ token: APPLE_TOKEN, nonce: NONCE, authorizationCode: APPLE_CODE }, { token: APPLE_TOKEN, nonce: NONCE }])
})

test('a cancelled Apple sheet is AuthCancelled', async () => {
  const closed = Object.assign(new Error('The user canceled the authorization attempt'), { code: 'ERR_REQUEST_CANCELED' })
  const { module } = fakeApple({ answer: async () => { throw closed } })
  assert.equal(await outcomeOf(createNativeSignIn({ ...NONE, apple: module }).apple), 'AuthCancelled')
})

test("an Apple answer without a token is a refusal, and Apple's other failures pass through as they are", async () => {
  const noToken = fakeApple({ answer: async () => ({ identityToken: null, authorizationCode: APPLE_CODE }) })
  const failed = fakeApple({ answer: async () => { throw Object.assign(new Error('The authorization attempt failed'), { code: 'ERR_REQUEST_FAILED' }) } })
  const odd = fakeApple({ answer: async () => { throw 'not an error object' } })
  const run = (apple: AppleModuleLike) => outcomeOf(createNativeSignIn({ ...NONE, apple }).apple)
  assert.deepEqual([await run(noToken.module), await run(failed.module), await run(odd.module)], ['AuthRefused:REFUSED', 'thrown:The authorization attempt failed', 'thrown:not an error object'])
})

test('Google is offered only when its client ids are configured', () => {
  const { module } = fakeGoogle()
  const offered = (platform: Options['platform'], web: string, ios: string) => createNativeSignIn({ ...NONE, platform, google: module, googleWebClientId: web, googleIosClientId: ios }).google !== null
  assert.deepEqual(
    [
      offered('android', WEB_ID, ''),
      offered('android', '', IOS_ID),
      offered('ios', WEB_ID, IOS_ID),
      offered('ios', WEB_ID, ''),
      offered('ios', '', IOS_ID),
      offered('web', WEB_ID, IOS_ID),
      createNativeSignIn({ ...NONE, platform: 'android', googleWebClientId: WEB_ID, googleIosClientId: IOS_ID }).google,
    ],
    [true, false, true, false, false, false, null],
  )
})

test('Google is configured once, at the first sign-in, and on Android Play services are checked before the sheet', async () => {
  const android = fakeGoogle()
  const onAndroid = createNativeSignIn({ ...NONE, platform: 'android', google: android.module, googleWebClientId: WEB_ID })
  const ios = fakeGoogle()
  const onIos = createNativeSignIn({ ...NONE, platform: 'ios', google: ios.module, googleWebClientId: WEB_ID, googleIosClientId: IOS_ID })
  assert.deepEqual([android.calls, ios.calls], [[], []])
  await outcomeOf(onAndroid.google)
  await outcomeOf(onAndroid.google)
  await outcomeOf(onIos.google)
  assert.deepEqual(android.calls, [`configure:${JSON.stringify({ webClientId: WEB_ID })}`, 'hasPlayServices', 'signIn', 'hasPlayServices', 'signIn'])
  assert.deepEqual(ios.calls, [`configure:${JSON.stringify({ webClientId: WEB_ID, iosClientId: IOS_ID })}`, 'signIn'])
})

test("a phone without Play services answers a refusal, and Google's sheet never opens", async () => {
  const { module, calls } = fakeGoogle({ playServices: false })
  const native = createNativeSignIn({ ...NONE, platform: 'android', google: module, googleWebClientId: WEB_ID })
  assert.deepEqual([await outcomeOf(native.google), calls.includes('signIn')], ['AuthRefused:REFUSED', false])
})

test('a cancelled Google sign-in is AuthCancelled', async () => {
  const { module } = fakeGoogle({ answer: async () => ({ type: 'cancelled' }) })
  const native = createNativeSignIn({ ...NONE, platform: 'android', google: module, googleWebClientId: WEB_ID })
  assert.equal(await outcomeOf(native.google), 'AuthCancelled')
})

test('a Google success gives the ID token', async () => {
  const { module } = fakeGoogle()
  const native = createNativeSignIn({ ...NONE, platform: 'ios', google: module, googleWebClientId: WEB_ID, googleIosClientId: IOS_ID })
  assert.deepEqual(await outcomeOf(native.google), { token: GOOGLE_TOKEN })
})

test('a Google answer without an ID token is a refusal', async () => {
  const { module } = fakeGoogle({ answer: async () => ({ type: 'success', data: { idToken: null } }) })
  const native = createNativeSignIn({ ...NONE, platform: 'android', google: module, googleWebClientId: WEB_ID })
  assert.equal(await outcomeOf(native.google), 'AuthRefused:REFUSED')
})

test('no token, nonce or code from a native sign-in reaches a log line, an analytics event or the stored session', async () => {
  const server = createFakeAuthServer()
  const sent: NativeIdToken[] = []
  const signInWithIdToken = server.client.signInWithIdToken.bind(server.client)
  server.client.signInWithIdToken = async (provider, idToken, requestSignUp) => {
    sent.push(idToken)
    return signInWithIdToken(provider, idToken, requestSignUp)
  }
  const native = createNativeSignIn({ platform: 'ios', apple: fakeApple().module, google: fakeGoogle().module, googleWebClientId: WEB_ID, googleIosClientId: IOS_ID, randomNonce: () => NONCE })
  const saved: StoredSession[] = []
  const sessions: SessionRecordStore = {
    load: async () => saved.at(-1) ?? null,
    async save(value) {
      saved.push(value)
    },
    clear: async () => undefined,
  }
  const provider = createCredentialProvider({ port: createBetterAuthPort({ client: server.client, native }), sessions })
  const events: string[] = []
  const lines: string[] = []
  const names = ['log', 'info', 'warn', 'error', 'debug'] as const
  const kept = names.map((name) => console[name])
  setConsentedTelemetrySink((event, properties) => {
    events.push(JSON.stringify([event, properties]))
  })
  for (const name of names) console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  const outcomes: string[] = []
  try {
    outcomes.push((await provider.signIn({ method: 'apple', signUp: true })).outcome)
    await provider.signOut()
    outcomes.push((await provider.signIn({ method: 'google', signUp: true })).outcome)
  } finally {
    names.forEach((name, index) => {
      console[name] = kept[index]
    })
    setConsentedTelemetrySink(null)
  }
  // Both sign-ins went through: each token went to the server once, Apple's with its nonce.
  assert.deepEqual([outcomes, sent, saved.length], [['active', 'active'], [{ token: APPLE_TOKEN, nonce: NONCE, authorizationCode: APPLE_CODE }, { token: GOOGLE_TOKEN }], 2])
  // And nowhere else: not in a log line, an analytics event or the stored session.
  const secrets = [APPLE_TOKEN, NONCE, APPLE_CODE, GOOGLE_TOKEN]
  const places = [...lines, ...events, ...saved.map((record) => JSON.stringify(record))]
  assert.deepEqual(places.filter((text) => secrets.some((secret) => text.includes(secret))), [])
})

type AppConfig = Record<string, unknown> & { ios?: Record<string, unknown>; plugins?: unknown[] }
const appConfig: (request: { config: AppConfig }) => AppConfig = createRequire(import.meta.url)('../../app.config.js')
const appJson = (): AppConfig => JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')).expo

test("the app config adds Sign in with Apple after app.json's own plugins, and nothing of Google's without its URL scheme", () => {
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
  const base = appJson()
  assert.deepEqual(appConfig({ config: appJson() }), { ...base, ios: { ...base.ios, usesAppleSignIn: true }, plugins: [...(base.plugins ?? []), 'expo-apple-authentication'] })
})

test("with Google's URL scheme set, Google's config plugin comes last, with that scheme", () => {
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME = ' com.googleusercontent.apps.test-ios '
  const base = appJson()
  const config = appConfig({ config: appJson() })
  assert.deepEqual(config.plugins, [...(base.plugins ?? []), 'expo-apple-authentication', ['@react-native-google-signin/google-signin', { iosUrlScheme: 'com.googleusercontent.apps.test-ios' }]])
})

test("the app's Better Auth client takes its native sign-in from nativeModules, which the web build never loads", () => {
  const client = readFileSync(new URL('./betterAuthClient.ts', import.meta.url), 'utf8')
  const web = readFileSync(new URL('./betterAuthClient.web.ts', import.meta.url), 'utf8')
  assert.deepEqual(
    [client.includes("import { appNativeSignIn } from './nativeModules';"), client.includes('    native: appNativeSignIn(),'), client.includes('NO_NATIVE_SIGN_IN'), web.includes('nativeModules')],
    [true, true, false, false],
  )
})
