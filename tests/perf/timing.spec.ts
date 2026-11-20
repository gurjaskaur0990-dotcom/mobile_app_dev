import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { seedPerformanceFixture } from '../../scripts/perf-fixture.mjs'
import type {} from './client'

test('times 30 confirmed writes and their arrival in an independent browser session', async ({
  browser,
  baseURL,
}, testInfo) => {
  const run = randomUUID()
  const writer = await browser.newContext({ baseURL })
  const reader = await browser.newContext({ baseURL })
  try {
    async function login(page: Page, identity: string) {
      await page.goto('/tests/perf/client.html')
      await page.waitForFunction(() => Boolean(window.splitTripPerf))
      return page.evaluate((name) => window.splitTripPerf.login(name), identity)
    }
    const [a, b] = await Promise.all([writer.newPage(), reader.newPage()])
    const [owner, peer] = await Promise.all([
      login(a, 'timing-owner-' + run),
      login(b, 'timing-peer-' + run),
    ])
    const trips = await seedPerformanceFixture(run, owner.uid, peer.uid)
    const trip = trips[0]
    for (const page of [a, b]) {
      expect(await page.evaluate((id) => window.splitTripPerf.observe(id), trip)).toEqual({
        trips: 20,
        expenses: 25,
      })
    }

    async function write(id: string) {
      return a.evaluate(({ trip, id, other }) => window.splitTripPerf.add(trip, id, other), {
        trip,
        id,
        other: peer.uid,
      })
    }
    async function arrival(id: string) {
      const handle = await b.waitForFunction((id) => window.splitTripPerf.seen(id), id, {
        timeout: 20000,
      })
      return (await handle.jsonValue()) as number
    }
    async function sample(id: string) {
      const ack = await write(id)
      expect(ack.pending).toBe(false)
      const observed = await arrival(id)
      return {
        id,
        acknowledgementMs: ack.ackMs,
        afterAckMs: Math.max(0, observed - ack.end),
        signedAfterAckMs: observed - ack.end,
      }
    }
    const initialWrite = await sample('first-write')
    const samples = []
    for (let i = 0; i < 30; i++) samples.push(await sample('timed-' + i))

    await writer.setOffline(true)
    expect((await write('reconnect')).pending).toBe(true)
    const reconnectStart = await a.evaluate(() => window.splitTripPerf.clock())
    await writer.setOffline(false)
    const reconnectMs = (await arrival('reconnect')) - reconnectStart

    const withinFiveSeconds = {
      acknowledgements: samples.filter((row) => row.acknowledgementMs <= 5000).length,
      secondBrowser: samples.filter((row) => row.afterAckMs <= 5000).length,
    }
    const p95 = (values: number[]) =>
      values.sort((x, y) => x - y)[Math.ceil(values.length * 0.95) - 1]
    const summary = {
      environment: 'demo-splittrip-flutter emulator',
      fixture: { trips: 20, expenses: 500 },
      run,
      warmSamples: 30,
      withinFiveSeconds,
      p95AckMs: p95(samples.map((row) => row.acknowledgementMs)),
      p95SecondBrowserMs: p95(samples.map((row) => row.afterAckMs)),
      firstProfileWriteMs: owner.firstProfileWriteMs,
      firstLedgerWriteMs: initialWrite.acknowledgementMs,
      reconnectToSecondBrowserMs: reconnectMs,
    }
    console.log(JSON.stringify(summary))
    const evidence = testInfo.outputPath('timing-evidence.json')
    await writeFile(evidence, JSON.stringify({ ...summary, samples, initialWrite }, null, 2))
    await testInfo.attach('timing-evidence.json', {
      contentType: 'application/json',
      path: evidence,
    })
    expect(withinFiveSeconds.acknowledgements).toBeGreaterThanOrEqual(29)
    expect(withinFiveSeconds.secondBrowser).toBeGreaterThanOrEqual(29)
  } finally {
    await Promise.all([writer.close(), reader.close()])
  }
})
