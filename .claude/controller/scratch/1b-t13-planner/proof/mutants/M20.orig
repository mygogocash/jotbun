import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vite'

import { apiSeams, apiSeamsConfig } from './api-seams.ts'

export default defineConfig(
  mergeConfig(apiSeamsConfig, {
    plugins: [
      apiSeams(),
      // One Worker (C1): wrangler.jsonc, with the vault, its Workflows, its queue consumer and its container.
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
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
