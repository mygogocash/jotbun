# GoGoSpend v1 release image (P6b). One image, one process per service:
#
#   API (default)     node dist/v1/main.js
#   job worker        node dist/worker.js
#   security worker   node dist/jobs/security-worker.js
#   deletion worker   node dist/privacy/deletion-worker.js --registry-fd 3
#                     (fd 3 piped from the secret manager; never an env var)
#   migration (a release step before any of the above starts; never on startup)
#                     node dist/database/migrate-cli.js   (DATABASE_DIRECT_URL)
#
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t gogospend-local .
# Prove the image (contracts load, every process fails closed, no legacy code):
#   docker run --rm gogospend-local node scripts/release-smoke.cjs
#
# The runtime stage holds only the release graph (apps/api/scripts/
# release-graph.mjs): the dist files the five entries reach, the migrations,
# the contracts TypeScript source (loaded through Node's type stripping, the
# master contracts rule) and the package closure of the reviewed runtime
# packages. Legacy /spend, internal shared-key, Salt Edge, cashback, autolog,
# Firebase and Mongo code and packages, tests and the app are not in it.
# No secret is baked in; every setting comes from the platform at run time.

# node:24-bookworm-slim (Node 24.22.0), pinned by its multi-architecture digest.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Manifests first so the dependency layer is cached. The app's manifest is
# needed only because the lockfile names the workspace; its packages are not
# installed (--workspace). Install scripts never run (--ignore-scripts).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace gogospend-api --include-workspace-root=false --ignore-scripts --no-audit --no-fund
# The lockfile records only the darwin-arm64 @swc/core binding (P6b finding):
# add the Linux one at the exact locked version, refused unless its sha512
# matches the pin. Build stage only; the compiler never reaches the runtime.
COPY scripts/ci/linux-native-bindings.mjs scripts/ci/
RUN node scripts/ci/linux-native-bindings.mjs swc
COPY packages/contracts/src packages/contracts/src
COPY apps/api/.swcrc apps/api/tsconfig.json apps/api/release-graph.json apps/api/
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/scripts/release-graph.mjs apps/api/scripts/release-smoke.cjs apps/api/scripts/
COPY apps/api/src apps/api/src
# Build, then stage only the release graph; the check fails the build if a
# legacy file, a test file or an unreviewed package is reachable.
RUN npm run build -w gogospend-api \
 && node apps/api/scripts/release-graph.mjs stage /release

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8091 \
    NODE_OPTIONS=--disable-warning=MODULE_TYPELESS_PACKAGE_JSON
# Root-owned, read-only to the process user.
COPY --from=build /release /app
WORKDIR /app/apps/api
USER node
EXPOSE 8091
# Every process stops gracefully on SIGTERM within SHUTDOWN_TIMEOUT_SECONDS
# (default 25); keep the platform's stop grace period above it.
STOPSIGNAL SIGTERM
CMD ["node", "dist/v1/main.js"]
