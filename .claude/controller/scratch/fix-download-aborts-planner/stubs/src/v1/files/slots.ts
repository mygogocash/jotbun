import type { WorkerContext } from '../worker-routes'

// RED stub (fix-download-aborts): the slot's return as given, with nothing
// handed to waitUntil. The real untilReturned keeps the request alive until the
// slot is back (ruling R97).

export function untilReturned(_w: Pick<WorkerContext, 'waitUntil'>, release: () => void): () => void {
  return release
}
