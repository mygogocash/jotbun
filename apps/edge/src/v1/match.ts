/**
 * Matches a request against a route table like Express's default router: a
 * literal segment ignores case, a `:name` segment takes one non-empty segment
 * (URL-decoded), a trailing slash is optional, and HEAD is served by the GET
 * route. Shared by the PostgreSQL edge's table and the vault Worker's.
 */
export type RouteMatch<R> = { route: R; params: Record<string, string> }

function segments(path: string): string[] {
  // Express is not strict about a trailing slash.
  return path.replace(/\/+$/, '').split('/').slice(1)
}

export function matchRoute<R extends { method: string; path: string }>(routes: readonly R[], method: string, pathname: string): RouteMatch<R> | null {
  const wanted = method === 'HEAD' ? 'GET' : method
  const actual = segments(pathname)
  for (const candidate of routes) {
    if (candidate.method !== wanted) continue
    const pattern = segments(candidate.path)
    if (pattern.length !== actual.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < pattern.length && ok; i += 1) {
      const part = pattern[i]
      if (part.startsWith(':')) {
        if (actual[i] === '') ok = false
        else {
          try {
            params[part.slice(1)] = decodeURIComponent(actual[i])
          } catch {
            ok = false
          }
        }
      } else if (part.toLowerCase() !== actual[i].toLowerCase()) ok = false
    }
    if (ok) return { route: candidate, params }
  }
  return null
}
