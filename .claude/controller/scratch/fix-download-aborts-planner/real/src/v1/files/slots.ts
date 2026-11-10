import type { WorkerContext } from '../worker-routes'

// Ruling R97 (fix-download-aborts): a slot the Worker takes for a request keeps
// that request alive until the slot is back. Every vault download takes its
// slot this way (downloads.ts), as do the receipt copy (receipts.ts) and the
// upload (uploads.ts).

/**
 * `release` (the return of a slot just taken), which now also ends a promise
 * handed to `w.waitUntil`, so the request stays alive until the slot is back.
 * When a client goes away, the Workers runtime ends its request: a download's
 * cancel then never reaches the stream behind FixedLengthStream (proved under
 * `wrangler dev`), and work still outstanding may be cancelled unless it was
 * passed to waitUntil (Cloudflare's Workers limits). Either way the code that
 * returns the slot would never run, and the isolate would lose the slot for
 * good. While a waitUntil promise is pending, the request runs on until the
 * slot comes back: the cancel reaches the body, or the handler reaches its
 * `finally`. Call it with the slot just taken (`untilReturned(w, SLOTS.take())`),
 * so a request turned away for want of a slot hands over nothing. Call the
 * function it returns once: the upload's count counts every call, though a
 * DownloadSlots slot is given back only once.
 */
export function untilReturned(w: Pick<WorkerContext, 'waitUntil'>, release: () => void): () => void {
  let returned: () => void = () => undefined
  w.waitUntil(
    new Promise<void>((resolve) => {
      returned = resolve
    }),
  )
  return () => {
    release()
    returned()
  }
}
