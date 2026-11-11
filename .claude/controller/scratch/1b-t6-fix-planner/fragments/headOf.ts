/**
 * A HEAD request gets the status and headers of its GET, and no body. The
 * GET's body is read to its end and discarded, not just dropped, so what it
 * holds is given back before the HEAD is answered: a download returns its slot
 * and finishes its R2 read (R96). Cancelling the body is not enough: the
 * Workers runtime ends the request before a cancel reaches the stream behind
 * a download's FixedLengthStream, and the slot would stay taken. Never rejects.
 */
async function headOf(response: Response, method: string): Promise<Response> {
  if (method !== 'HEAD') return response
  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)
  return new Response(null, { status: response.status, headers: response.headers })
}
