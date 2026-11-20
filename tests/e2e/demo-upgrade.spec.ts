import { test, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { build, preview, type PreviewServer } from 'vite'

test('upgrades open cached demo tabs and old bookmarks to live sign-in', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Exercises the browser service worker lifecycle.',
  )
  const outDir = await mkdtemp(join(tmpdir(), 'splittrip-live-upgrade-'))
  let serveDemo = true
  let workerVersion = 1
  let server: PreviewServer | undefined
  const oldShell = '<!doctype html><h1>Local demo accounts</h1>'
  try {
    await build({ mode: 'production', logLevel: 'error', build: { outDir } })
    server = await preview({
      mode: 'production',
      logLevel: 'error',
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
      plugins: [
        {
          name: 'previous-demo-release',
          enforce: 'pre',
          configurePreviewServer(site) {
            site.middlewares.use((req, res, next) => {
              if (!serveDemo) return next()
              res.setHeader('Cache-Control', 'no-store')
              if (req.url === '/sw.js') {
                res.setHeader('Content-Type', 'application/javascript')
                // The old worker used a cached app shell and waited for a user-approved update.
                res.end(`
                // Worker version ${workerVersion}
                self.addEventListener('install', e => e.waitUntil(
                  caches.open('old-shell').then(c => c.put('/shell', new Response(
                    ${JSON.stringify(oldShell)}, {headers:{'Content-Type':'text/html'}}
                  )))
                ))
                self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
                self.addEventListener('fetch', e => {
                  if(e.request.mode === 'navigate') e.respondWith(caches.match('/shell'))
                })
              `)
              } else {
                res.setHeader('Content-Type', 'text/html')
                res.end(
                  '<!doctype html><script>navigator.serviceWorker.register("/sw.js")</script>',
                )
              }
            })
          },
        },
      ],
    })
    const { port } = server.httpServer.address() as AddressInfo
    const legacy = 'http://127.0.0.1:' + port
    const live = 'http://localhost:' + port
    const trip = '/trip/saved/expense/lunch?currency=INR#details'
    const settings = '/settings?section=appearance#theme'
    await context.route(/^https:\/\//, (route) => route.abort())
    await page.goto(legacy + trip)
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Local demo accounts' }),
    ).toBeVisible()
    const sibling = await context.newPage()
    await sibling.goto(legacy + settings)
    await expect(
      sibling.getByRole('heading', { name: 'Local demo accounts' }),
    ).toBeVisible()

    await page.evaluate(async () => {
      localStorage.setItem('old-device-data', 'keep')
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('splittrip.flutter.v1.old-user', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('drafts')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('drafts', 'readwrite')
          tx.objectStore('drafts').put('Unsubmitted train ticket', 'expense')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    })
    workerVersion++
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update()
    })
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
    )
    serveDemo = false
    await page.evaluate(() => {
      void navigator.serviceWorker.ready.then((registration) =>
        registration.update(),
      )
    })
    await expect(page).toHaveURL(live + trip)
    await expect(sibling).toHaveURL(live + settings)

    const revisit = await context.newPage()
    await revisit.goto(legacy + trip)
    await expect(revisit).toHaveURL(live + trip)
    for (const tab of [page, sibling, revisit]) {
      await expect(
        tab.getByRole('button', { name: 'Sign in with Google' }),
      ).toBeVisible()
      await expect(tab.getByText('Local demo accounts')).toHaveCount(0)
    }
    expect(
      await page.evaluate(() => localStorage.getItem('old-device-data')),
    ).toBeNull()
    const state = await context.storageState({ indexedDB: true })
    const saved = state.origins.find((entry) => entry.origin === legacy)
    expect(saved?.localStorage).toContainEqual({
      name: 'old-device-data',
      value: 'keep',
    })
    expect(saved).toMatchObject({
      indexedDB: expect.arrayContaining([
        expect.objectContaining({
          name: 'splittrip.flutter.v1.old-user',
          stores: [
            expect.objectContaining({
              name: 'drafts',
              records: [{ key: 'expense', value: 'Unsubmitted train ticket' }],
            }),
          ],
        }),
      ]),
    })
  } finally {
    await server?.close()
    await rm(outDir, { recursive: true, force: true })
  }
})
