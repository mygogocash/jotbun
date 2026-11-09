import { ATTACHMENT_GRANT_MINUTES } from '@gogospend/contracts'

import { AccountLifecycleService } from '@api/accounts/account-lifecycle.service'
import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'
import { AttachmentService } from '@api/attachments/attachments.service'
import { AccountLinkingService } from '@api/accounts/account-linking.service'
import { SessionRevocationService } from '@api/accounts/session-revocation.service'
import { ApplicationSessionGuard } from '@api/auth/application-session.guard'
import { AuthBootstrapService } from '@api/auth/auth-bootstrap.service'
import { Auth0AccessTokenGuard } from '@api/auth/auth0-access-token.guard'
import { eventVerifierConfigFromEnv } from '@api/auth/auth0-event-verifier'
import { SecurityEventService } from '@api/auth/auth0-events.service'
import { Auth0KeySource } from '@api/auth/auth0-key-source'
import { profileGatewayFromEnv } from '@api/auth/auth0-profile.client'
import { Auth0TokenVerifier, auth0ConfigFromEnv } from '@api/auth/auth0-token-verifier'
import { OidcProofVerifier } from '@api/auth/oidc-proof-verifier'
import { ReauthenticationService } from '@api/auth/reauthentication.service'
import { SqlSessionResolver } from '@api/auth/session.repository'
import { BudgetService } from '@api/budgets/budgets.service'
import { CategoriesService } from '@api/categories/categories.service'
import { commandDigesterFromEnv } from '@api/commands/command-digest'
import { CommandExecutor } from '@api/commands/command-executor'
import { CommandReceiptRepository } from '@api/commands/command-receipts.repository'
import { CommandRegistry } from '@api/commands/command-registry'
import { ClientVersionGuard, minimumClientVersionsFromEnv } from '@api/common/client-version.guard'
import { featureGatesFromEnv } from '@api/common/feature-gates'
import type { FeatureGates } from '@api/common/feature-gates'
import { setLogSink } from '@api/common/safe-request-logger'
import { PostgresRateLimiter, rateLimitKeyFromEnv } from '@api/common/shared-rate-limit'
import { DatabaseService } from '@api/database/database.service'
import { ExportService } from '@api/exports/export.service'
import { ConfirmationService } from '@api/imports/confirmation.service'
import { ImportRepository } from '@api/imports/import.repository'
import { PreviewQuery } from '@api/imports/preview-query'
import { UploadIntake, importIntakeConfigFromEnv } from '@api/imports/upload-intake'
import type { ImportIntakeConfig } from '@api/imports/upload-intake'
import { PolicyService } from '@api/policies/policy.service'
import { DeletionService } from '@api/privacy/deletion.service'
import type { ObjectStore } from '@api/storage/object-store'
import { ChangeWriter } from '@api/sync/change-writer'
import { SnapshotGrants } from '@api/sync/snapshot-grants'
import { SnapshotRepository } from '@api/sync/snapshot.repository'
import { SyncQuery } from '@api/sync/sync-query'
import { TransactionsService } from '@api/transactions/transactions.service'
import { WalletsService } from '@api/wallets/wallets.service'

import { AiService } from '../ai/service'
import { CashbackCatalogueSource } from '../bridge/catalogue'
import { DEFAULT_AI_MODEL, anthropicSender } from '../ai/model'
import type { SendMessage } from '../ai/model'
import { requestPool } from '../db/request-pool'
import { workerFetch } from '../http/fetch'
import { DownloadSlots } from '../http/files'
import { R2ObjectStore, UnavailableObjectStore } from '../storage/r2-object-store'
import type { R2BucketLike } from '../storage/r2-object-store'
import { flag, nodeEnvFor, settingsOf } from '../env'
import type { EdgeEnv } from '../env'

export type Container = {
  db: DatabaseService
  registry: CommandRegistry
  gates: FeatureGates
  clientVersions: ClientVersionGuard
  tokens: Auth0AccessTokenGuard
  limiter: PostgresRateLimiter
  sessions: ApplicationSessionGuard
  policies: PolicyService
  accounts: AccountLifecycleService
  revocation: SessionRevocationService
  reauth: ReauthenticationService
  proofs: OidcProofVerifier
  bootstrapper: AuthBootstrapService
  linking: AccountLinkingService
  securityEvents: SecurityEventService
  deletion: DeletionService
  store: ObjectStore
  snapshots: SnapshotRepository
  exports: ExportService
  attachments: AttachmentService
  imports: ImportRepository
  previews: PreviewQuery
  confirmation: ConfirmationService
  uploads: UploadIntake
  importIntake: ImportIntakeConfig
  /** Downloads this isolate streams at once (the API's per-process limits). */
  downloads: { exports: DownloadSlots; receipts: DownloadSlots }
  receipts: CommandReceiptRepository
  wallets: WalletsService
  categories: CategoriesService
  transactions: TransactionsService
  budgets: BudgetService
  sync: SyncQuery
  ai: AiService
  cashback: CashbackCatalogueSource
}

/** Export downloads one isolate streams at once (EXPORT_DOWNLOADS_PER_PROCESS in the API). */
export const EXPORT_DOWNLOADS_PER_ISOLATE = 4

/** The private store: the R2 binding, or (a local run with no bucket) a store that is always unavailable. */
function objectStoreOf(bucket: unknown): ObjectStore {
  return bucket ? new R2ObjectStore(bucket as R2BucketLike) : new UnavailableObjectStore()
}


/**
 * The v1 API's object graph, wired by hand exactly as its Nest modules wire it
 * (auth.module.ts, commands.module.ts and the domain modules). Built once per
 * isolate; every database call goes through `requestPool`, so the services
 * never hold a socket across requests. A missing or invalid setting throws a
 * ConfigurationError here, as the API refuses to start without it.
 */
export function buildContainer(env: EdgeEnv, overrides: { send?: SendMessage | null; fetchCatalogue?: typeof fetch; fetchAuth0?: typeof fetch; store?: ObjectStore } = {}): Container {
  const settings = { ...settingsOf(env), NODE_ENV: nodeEnvFor(env) } as NodeJS.ProcessEnv
  setLogSink((line) => console.log(line))

  const db = new DatabaseService(requestPool)
  const registry = new CommandRegistry()
  const policies = new PolicyService(requestPool, db, 60_000)
  const digester = commandDigesterFromEnv(settings)
  const executor = new CommandExecutor(db, registry, policies, new ChangeWriter(registry), new CommandReceiptRepository(), digester)
  // Construction order matters: each service defines its entity and commands
  // (receipts report the `transaction` entity, so transactions come first).
  const wallets = new WalletsService(db, executor, registry)
  const categories = new CategoriesService(db, executor, registry)
  const transactions = new TransactionsService(db, executor, registry)
  const budgets = new BudgetService(db, executor, registry)
  const store = overrides.store ?? objectStoreOf(env.OBJECTS)
  // Grants per purpose, under keys derived for that purpose only (sync, exports and attachments modules).
  const exports = new ExportService(db, executor, registry, new SnapshotGrants(digester.deriveKeys('gogospend.export-grant.v1')))
  const attachments = new AttachmentService(db, executor, registry, transactions, store, new SnapshotGrants(digester.deriveKeys('gogospend.attachment-grant.v1'), { minutes: ATTACHMENT_GRANT_MINUTES }), { ...DEFAULT_ATTACHMENT_LIMITS })
  const confirmation = new ConfirmationService(db, executor, registry, attachments)
  const imports = new ImportRepository(db, policies)

  const auth0 = auth0ConfigFromEnv(settings)
  // One JWKS cache and outage back-off for access tokens and ID-token proofs (auth.module.ts).
  const keys = new Auth0KeySource(auth0.issuer)
  const tokens = new Auth0AccessTokenGuard(new Auth0TokenVerifier(auth0, keys))
  const proofs = new OidcProofVerifier(auth0.issuer, keys)
  // Read-profile and link client only; it never receives maintenance credentials.
  const profiles = profileGatewayFromEnv(settings, overrides.fetchAuth0 ?? workerFetch)

  // AI runs only when switched on and keyed; otherwise every AI route uses
  // its plain-facts or rules fallback.
  const send = overrides.send !== undefined ? overrides.send : flag(env.AI_ENABLED) && env.ANTHROPIC_API_KEY ? anthropicSender(env.ANTHROPIC_API_KEY, env.ANTHROPIC_BASE_URL) : null
  const ai = new AiService({ db, wallets, categories, send, model: env.AI_MODEL || DEFAULT_AI_MODEL })

  return {
    db,
    registry,
    gates: featureGatesFromEnv(settings),
    clientVersions: new ClientVersionGuard(minimumClientVersionsFromEnv(settings)),
    tokens,
    limiter: new PostgresRateLimiter(requestPool, rateLimitKeyFromEnv(settings)),
    sessions: new ApplicationSessionGuard(new SqlSessionResolver(requestPool), policies),
    policies,
    accounts: new AccountLifecycleService(db, policies),
    revocation: new SessionRevocationService(db),
    reauth: new ReauthenticationService(requestPool),
    proofs,
    bootstrapper: new AuthBootstrapService(requestPool, profiles),
    linking: new AccountLinkingService(db, proofs, profiles, policies),
    securityEvents: new SecurityEventService(requestPool, eventVerifierConfigFromEnv(settings)),
    deletion: new DeletionService(db, requestPool),
    store,
    snapshots: new SnapshotRepository(new SnapshotGrants(digester.deriveKeys('gogospend.snapshot-grant.v1'))),
    exports,
    attachments,
    imports,
    previews: new PreviewQuery(db),
    confirmation,
    uploads: new UploadIntake(imports, store),
    importIntake: importIntakeConfigFromEnv(settings),
    downloads: {
      exports: new DownloadSlots(EXPORT_DOWNLOADS_PER_ISOLATE),
      receipts: new DownloadSlots(DEFAULT_ATTACHMENT_LIMITS.downloadsPerProcess, DEFAULT_ATTACHMENT_LIMITS.downloadsPerAccount),
    },
    receipts: new CommandReceiptRepository(),
    wallets,
    categories,
    transactions,
    budgets,
    sync: new SyncQuery(registry),
    ai,
    cashback: new CashbackCatalogueSource({ enabled: flag(env.GOGOCASH_BRIDGE_ENABLED), url: env.GOGOCASH_CATALOGUE_URL || undefined, fetch: overrides.fetchCatalogue }),
  }
}
