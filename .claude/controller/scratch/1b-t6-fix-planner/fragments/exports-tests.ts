
describe('1B-T6 fix round: a HEAD gives its download slot back (R96), and the write and download guards of review m-1 and m-2', () => {
  it('an export whose write starts after the vault stopped being active reads nothing and stores nothing', async () => {
    // Review m-1: writeExport checks the vault when it reads as well as when it publishes (P5). Here the vault is
    // deleting (§6.12, deletion step 2) before the write starts: nothing is read, reserved or stored.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const exportId = (await requestExport(v1, user)).body.entity_id as string
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    let puts = 0
    const counting = spyBucket({ beforePut: () => void (puts += 1) })
    const outcome = await runInDurableObject(vaultOf(user), (vault: UserVault, state) => writeExport(writerOf(vault, state, { bucket: counting }), exportId))
    expect(puts).toBe(0)
    expect(outcome).toEqual({ outcome: 'skipped' })
    expect(await registryOf(user)).toEqual([])
    expect(await exportKeys(user)).toEqual([])
    expect(await exportsOf(user)).toEqual([{ id: exportId, status: 'pending', object_key: null, started_at: null }])
  })

  it('a download refused after it took its slot gives the slot back', async () => {
    // Review m-2: serveExportFile returns its slot when the stored object no longer matches the vault's record (404
    // before anything streams). Five refused downloads, one more than EXPORT_SLOTS, then a good one is still served.
    const { v1, money } = await setup()
    const { user } = await marchDiary(v1, money)
    const good = await readyExport(v1, user)
    const changed = await readyExport(v1, user, { from: '2026-02-01', through: '2026-03-31' })
    const [{ object_key: key }] = await vaultRows<{ object_key: string }>(user, 'SELECT object_key FROM exports WHERE id = ?', changed.export_id)
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, new TextEncoder().encode('changed'))
    const grant = (await json(await v1.as(user).get(`/v1/exports/${changed.export_id}/grant`))) as ExportGrant
    const refused: number[] = []
    for (let i = 0; i < 5; i += 1) refused.push((await v1.as(user).get(grant.url)).status)
    expect(refused).toEqual([404, 404, 404, 404, 404])
    const { bytes } = await download(v1, user, good.export_id)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(good.sha256)
  })

  it('a HEAD on a download answers its headers, reads its file to the end and gives its slot back', async () => {
    // R96: the front door serves HEAD from the GET route and finishes the body it drops, so the download returns
    // its slot. It reads that body to its end rather than cancelling it: in the Workers runtime a cancel does not
    // reach the stream behind a download's FixedLengthStream before the request ends, and the slot would stay
    // taken (the review's wrangler dev probe). The file has many chunks, since a one-chunk body drains into its
    // response by itself. Four HEADs (EXPORT_SLOTS), then the GET is still served. This case is the file's last:
    // on the old front door it keeps all four slots of the isolate.
    let read = 0
    const counting: VaultBucket = {
      ...spyBucket({}),
      get: async (key) => {
        const found = await env.OBJECTS.get(key)
        if (!found) return found
        const body = found.body as unknown as AsyncIterable<Uint8Array>
        return streamedOnly(
          found,
          (async function* () {
            for await (const chunk of body) {
              read += chunk.byteLength
              yield chunk
            }
          })(),
        )
      },
    }
    const { v1, money } = await setup({ env: { OBJECTS: counting } })
    const user = await money.member()
    const wallet = await money.wallet(user)
    await money.bulkRecords(user, Array.from({ length: 2000 }, (_, i) => ({ type: 'expense' as const, amount_minor: String(1000 + i), occurred_on: '2026-03-15', wallet_id: wallet, category_id: builtinId(user, 'food'), note: `bulk record ${i}` })))
    const dto = await readyExport(v1, user)
    expect(dto.bytes).toBeGreaterThan(200_000)
    const grant = (await json(await v1.as(user).get(`/v1/exports/${dto.export_id}/grant`))) as ExportGrant
    const heads: unknown[] = []
    for (let i = 0; i < 4; i += 1) {
      read = 0
      const head = await v1.as(user).request('HEAD', grant.url)
      heads.push([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength, read])
    }
    const file = await v1.as(user).get(grant.url)
    const body = file.status === 200 ? new Uint8Array(await file.arrayBuffer()) : null
    expect({ heads, file: [file.status, body && createHash('sha256').update(body).digest('hex')] }).toEqual({
      heads: Array.from({ length: 4 }, () => [200, String(dto.bytes), 0, dto.bytes]),
      file: [200, dto.sha256],
    })
  })
})
