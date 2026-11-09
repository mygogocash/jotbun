import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vite'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

export default defineConfig(
  mergeConfig(apiSeamsConfig, {
    plugins: [
      apiSeams(),
      cloudflare({
        viteEnvironment: { name: 'ssr' },
        // The background Workers, built through the same API seams.
        auxiliaryWorkers: [{ configPath: './wrangler.jobs.jsonc' }, { configPath: './wrangler.security.jsonc' }, { configPath: './wrangler.deletion.jsonc' }, { configPath: './wrangler.vault.jsonc' }],
      }),
      tanstackStart({
        // The API's Auth0 Management clients are named `*.client.ts` (an
        // Auth0 client, not browser code), so they are let through the
        // server's client-only file rule by exact path; the rule stays for
        // everything else.
        importProtection: { server: { excludeFiles: [/\/apps\/api\/src\/auth\/auth0-(profile|management)\.client\.ts$/] } },
      }),
      viteReact(),
    ],
  }),
)
