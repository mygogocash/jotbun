import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// TanStack Start asks for a fresh router per request.
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true })
}
